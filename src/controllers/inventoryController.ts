import type { Request, Response, NextFunction } from 'express';
import { Error, type Types } from 'mongoose';
import Inventory, { deriveInventoryStatus } from '../models/Inventory';
import InventoryAdjustment from '../models/InventoryAdjustment';
import Product from '../models/Product';
import { ERROR_CODES, HTTP_STATUS } from '../utils/constants';
import { newAppError } from '../utils/error';
import { sendResponse } from '../utils/response';
import type {
  AuthenticatedRequest,
  IInventory,
  IInventoryAdjustment,
  IProduct,
  AdjustmentType,
} from '../types';
import { string } from 'zod';

function validationAppError(
  errors: Array<{ field: string; message: string }>,
) {
  return newAppError(
    'Validation failed. Please review the submitted data.',
    HTTP_STATUS.BAD_REQUEST,
    ERROR_CODES.VALIDATION_ERROR,
    errors.map((e) => ({ field: e.field, message: e.message })),
  );
}

function projectProductRef(ref: unknown): {
  _id: string;
  name: string;
  sku: string;
  slug: string;
  isActive: boolean;
} | null {
  if (!ref || typeof ref !== 'object') return null;
  const r = ref as IProduct & { _id: unknown };
  if (
    !('name' in r) ||
    typeof r.name !== 'string' ||
    !('sku' in r) ||
    typeof r.sku !== 'string'
  ) {
    return null;
  }
  return {
    _id: String(r._id),
    name: r.name,
    sku: r.sku,
    slug: r.slug,
    isActive: r.isActive,
  };
}

type ProjectedInventory = Omit<IInventory, 'productId' | 'status'> & {
  _id: string;
  productId:
    | { _id: string; name: string; sku: string; slug: string; isActive: boolean }
    | null
    | string;
  status: IInventory['status'];
};

function projectInventory(
  doc: IInventory & { _id: unknown },
): ProjectedInventory {
  const productRef = projectProductRef(doc.productId);
  return {
    _id: String(doc._id),
    productId:
      productRef ?? (doc.productId ? String(doc.productId) : null),
    warehouseLocation: doc.warehouseLocation,
    quantity: doc.quantity,
    minimumThreshold: doc.minimumThreshold,
    maximumCapacity: doc.maximumCapacity,
    reorderLevel: doc.reorderLevel,
    reorderQuantity: doc.reorderQuantity,
    lastRestocked: doc.lastRestocked ?? null,
    expirationDate: doc.expirationDate ?? null,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

type ProjectedAdjustment = Omit<
  IInventoryAdjustment,
  'productId' | 'adjustedBy'
> & {
  _id: string;
  productId:
    | { _id: string; name: string; sku: string; slug: string; isActive: boolean }
    | null
    | string;
  adjustedBy: string | { _id: string; name: string; email: string } | null;
};

function projectAdjustment(
  doc: IInventoryAdjustment & { _id: unknown },
): ProjectedAdjustment {
  const productRef = projectProductRef(doc.productId);
  const userVal = doc.adjustedBy as unknown;
  let adjustedBy: ProjectedAdjustment['adjustedBy'] = null;
  if (
    userVal &&
    typeof userVal === 'object' &&
    'name' in (userVal as object) &&
    'email' in (userVal as object)
  ) {
    const user = userVal as { _id: unknown; name: string; email: string };
    adjustedBy = {
      _id: String(user._id),
      name: user.name,
      email: user.email,
    };
  } else if (userVal) {
    adjustedBy = String(userVal);
  }
  return {
    _id: String(doc._id),
    productId:
      productRef ?? (doc.productId ? String(doc.productId) : null),
    adjustmentType: doc.adjustmentType,
    quantity: doc.quantity,
    reason: doc.reason,
    reference: doc.reference,
    adjustedBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function applyAdjustmentDelta(
  currentQuantity: number,
  type: AdjustmentType,
  amount: number,
): number {
  switch (type) {
    case 'add':
    case 'return':
      return currentQuantity + amount;
    case 'remove':
      return currentQuantity - amount;
    case 'correction':
      return amount;
    default:
      return currentQuantity;
  }
}

const VALID_ADJUSTMENT_TYPES: AdjustmentType[] = [
  'add',
  'remove',
  'correction',
  'return',
];

function findInventoryByProductOrId(
  id: string,
): Promise<(IInventory & { _id: Types.ObjectId }) | null> {
  return (
    (Inventory.findById(id)
      .populate<{ productId: IProduct }>('productId')
      .exec() as Promise<(IInventory & { _id: Types.ObjectId }) | null>)
      .then((result) => {
        if (result) return result;
        return Inventory.findOne({ productId: id })
          .populate<{ productId: IProduct }>('productId')
          .exec() as Promise<(IInventory & { _id: Types.ObjectId }) | null>;
      })
  );
}

export async function getInventory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const doc = await findInventoryByProductOrId(id as string);
    if (!doc) {
      return next(
        newAppError(
          'Inventory record not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }
    const inventory = projectInventory(doc);
    sendResponse(
      res,
      { inventory },
      'Inventory retrieved successfully.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function getAllInventory(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const docs = await Inventory.find()
      .populate<{ productId: IProduct }>('productId')
      .sort({ updatedAt: -1 })
      .exec();
    const inventoryList = docs.map(projectInventory);
    sendResponse(
      res,
      { inventory: inventoryList, count: inventoryList.length },
      'Inventory list retrieved successfully.',
      HTTP_STATUS.OK,
      { count: inventoryList.length },
    );
    return;
  } catch (err) {
    return next(err);
  }
}

type AdjustPayload = {
  adjustmentType?: unknown;
  type?: unknown;
  quantity?: unknown;
  reason?: unknown;
  reference?: unknown;
};

export async function adjustStock(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const body = req.body as AdjustPayload;
    const fieldErrors: Array<{ field: string; message: string }> = [];

    const adjTypeRaw = (body.adjustmentType ?? body.type) as unknown;
    let adjType: AdjustmentType | undefined;
    if (
      typeof adjTypeRaw !== 'string' ||
      !VALID_ADJUSTMENT_TYPES.includes(adjTypeRaw as AdjustmentType)
    ) {
      fieldErrors.push({
        field: 'adjustmentType',
        message:
          "adjustmentType is required and must be one of: 'add', 'remove', 'correction', 'return'",
      });
    } else {
      adjType = adjTypeRaw as AdjustmentType;
    }
    if (
      typeof body.quantity !== 'number' ||
      body.quantity < 1 ||
      Number.isNaN(body.quantity) ||
      !Number.isFinite(body.quantity)
    ) {
      fieldErrors.push({
        field: 'quantity',
        message: 'Quantity must be a positive number',
      });
    }

    if (fieldErrors.length > 0) {
      return next(validationAppError(fieldErrors));
    }

    const doc = await findInventoryByProductOrId(id as string);
    let productIdForRef: Types.ObjectId | string | undefined;
    let newDocRequired = false;

    if (!doc) {
      const product = await Product.findById(id).exec();
      if (!product) {
        return next(
          newAppError(
            'Inventory or Product record not found.',
            HTTP_STATUS.NOT_FOUND,
            ERROR_CODES.NOT_FOUND,
          ),
        );
      }
      productIdForRef = product._id;
      newDocRequired = true;
    } else {
      const rawProductId = doc.productId as unknown;
      productIdForRef =
        typeof rawProductId === 'object' && rawProductId !== null && '_id' in rawProductId
          ? String((rawProductId as { _id: Types.ObjectId })._id)
          : String(rawProductId);
    }

    const authReq = req as AuthenticatedRequest;
    const adjustedBy = authReq.user?._id as unknown as Types.ObjectId | undefined;

    let newQuantity: number;
    let newStatus: IInventory['status'];
    let lastRestocked = doc?.lastRestocked ?? null;
    let minimumThreshold = doc?.minimumThreshold;

    if (newDocRequired) {
      const initialQty = adjType === 'correction'
        ? (body.quantity as number)
        : adjType === 'add' || adjType === 'return'
        ? (body.quantity as number)
        : 0;
      newQuantity = initialQty;
      newStatus = deriveInventoryStatus(newQuantity, 0);
      if (adjType === 'add' || adjType === 'return' || adjType === 'correction') {
        lastRestocked = new Date();
      }
      const created = await Inventory.create({
        productId: productIdForRef,
        quantity: newQuantity,
        status: newStatus,
        lastRestocked,
      } as IInventory);
      minimumThreshold = created.minimumThreshold;
      newStatus = deriveInventoryStatus(newQuantity, minimumThreshold ?? 0);
      created.status = newStatus;
      await created.save();

      await InventoryAdjustment.create({
        productId: productIdForRef,
        adjustmentType: adjType,
        quantity: body.quantity as number,
        reason: typeof body.reason === 'string' ? body.reason.trim() : undefined,
        reference: typeof body.reference === 'string' ? body.reference.trim() : undefined,
        adjustedBy,
      });

      const totalQty = newQuantity;
      await Product.updateOne(
        { _id: productIdForRef },
        {
          $set: {
            stock: totalQty,
            isActive: totalQty > 0 ? true : undefined,
          },
        },
      );

      const fresh = await Inventory.findById(created._id)
        .populate<{ productId: IProduct }>('productId')
        .exec();
      const inventory = projectInventory(fresh ?? created);
      sendResponse(
        res,
        { inventory },
        'Inventory adjusted successfully.',
        HTTP_STATUS.OK,
      );
      return;
    }

    const workingDoc = doc as unknown as (IInventory & {
      _id: Types.ObjectId;
      save: () => Promise<unknown>;
    });
    const deltaQty = applyAdjustmentDelta(
      workingDoc.quantity,
      adjType!,
      body.quantity as number,
    );
    if (deltaQty < 0) {
      fieldErrors.push({
        field: 'quantity',
        message:
          'Removing this quantity would result in negative stock. Current available: ' +
          String(workingDoc.quantity),
      });
      return next(validationAppError(fieldErrors));
    }
    workingDoc.quantity = deltaQty;
    workingDoc.status = deriveInventoryStatus(
      deltaQty,
      workingDoc.minimumThreshold,
    );
    if (adjType === 'add' || adjType === 'return') {
      workingDoc.lastRestocked = new Date();
    }
    await workingDoc.save();

    await InventoryAdjustment.create({
      productId: productIdForRef,
      adjustmentType: adjType,
      quantity: body.quantity as number,
      reason: typeof body.reason === 'string' ? body.reason.trim() : undefined,
      reference: typeof body.reference === 'string' ? body.reference.trim() : undefined,
      adjustedBy,
    });

    const allRows = await Inventory.find({ productId: productIdForRef }).exec();
    const totalQty = allRows.reduce((sum, r) => sum + r.quantity, 0);
    await Product.updateOne(
      { _id: productIdForRef },
      { $set: { stock: totalQty } },
    );

    const fresh = await Inventory.findById(workingDoc._id)
      .populate<{ productId: IProduct }>('productId')
      .exec();
    const inventory = projectInventory(fresh ?? workingDoc);
    sendResponse(
      res,
      { inventory },
      'Inventory adjusted successfully.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

type ThresholdPayload = {
  minimumThreshold?: unknown;
  min?: unknown;
  maximumCapacity?: unknown;
  max?: unknown;
};

export async function setThreshold(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const body = req.body as ThresholdPayload;
    const fieldErrors: Array<{ field: string; message: string }> = [];

    const minRaw = (body.minimumThreshold ?? body.min) as unknown;
    const maxRaw = (body.maximumCapacity ?? body.max) as unknown;

    let minVal: number | undefined;
    let maxVal: number | undefined;

    if (minRaw !== undefined) {
      if (
        typeof minRaw !== 'number' ||
        minRaw < 0 ||
        Number.isNaN(minRaw) ||
        !Number.isFinite(minRaw)
      ) {
        fieldErrors.push({
          field: 'minimumThreshold',
          message: 'minimumThreshold must be a non-negative number',
        });
      } else {
        minVal = minRaw;
      }
    }
    if (maxRaw !== undefined) {
      if (
        typeof maxRaw !== 'number' ||
        maxRaw < 0 ||
        Number.isNaN(maxRaw) ||
        !Number.isFinite(maxRaw)
      ) {
        fieldErrors.push({
          field: 'maximumCapacity',
          message: 'maximumCapacity must be a non-negative number',
        });
      } else {
        maxVal = maxRaw;
      }
    }
    if (
      minVal !== undefined &&
      maxVal !== undefined &&
      maxVal < minVal
    ) {
      fieldErrors.push({
        field: 'maximumCapacity',
        message:
          'maximumCapacity must be greater than or equal to minimumThreshold',
      });
    }
    if (fieldErrors.length > 0) {
      return next(validationAppError(fieldErrors));
    }

    const doc = await findInventoryByProductOrId(id as string);
    if (!doc) {
      return next(
        newAppError(
          'Inventory record not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }

    const workingDoc = doc as unknown as (IInventory & {
      _id: Types.ObjectId;
      save: () => Promise<unknown>;
    });

    if (minVal !== undefined) workingDoc.minimumThreshold = minVal;
    if (maxVal !== undefined) workingDoc.maximumCapacity = maxVal;
    workingDoc.status = deriveInventoryStatus(
      workingDoc.quantity,
      workingDoc.minimumThreshold,
    );
    await workingDoc.save();

    const fresh = await Inventory.findById(workingDoc._id)
      .populate<{ productId: IProduct }>('productId')
      .exec();
    const inventory = projectInventory(fresh ?? workingDoc);
    sendResponse(
      res,
      { inventory },
      'Inventory thresholds updated successfully.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function getLowStockItems(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const docs = await Inventory.find({
      $or: [{ status: 'low-stock' }, { status: 'out-of-stock' }],
    })
      .populate<{ productId: IProduct }>('productId')
      .sort({ quantity: 1 })
      .exec();
    const inventory = docs.map(projectInventory);
    sendResponse(
      res,
      { inventory, count: inventory.length },
      'Low/out-of-stock inventory items retrieved successfully.',
      HTTP_STATUS.OK,
      { count: inventory.length },
    );
    return;
  } catch (err) {
    return next(err);
  }
}

export async function getInventoryHistory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

    const inventory = await Inventory.findById(id).exec();
    let productId: string | undefined;
    if (inventory) {
      productId = String(inventory.productId);
    } else {
      const product = await Product.findById(id).exec();
      if (product) {
        productId = String(product._id);
      }
    }
    if (!productId) {
      return next(
        newAppError(
          'Inventory or Product record not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }

    const docs = await InventoryAdjustment.find({ productId })
      .populate<{ productId: IProduct }>('productId')
      .populate<{ adjustedBy: { _id: Types.ObjectId; name: string; email: string } }>(
        'adjustedBy',
        '_id name email',
      )
      .sort({ createdAt: -1 })
      .exec();

    const history = docs.map((doc: any) => projectAdjustment(doc as any));
    sendResponse(
      res,
      { history, count: history.length },
      'Inventory adjustment history retrieved successfully.',
      HTTP_STATUS.OK,
      { count: history.length },
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}
