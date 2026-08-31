import type { Request, Response, NextFunction } from 'express';
import { Error, type Types } from 'mongoose';
import RFQ from '../models/RFQ';
import Product from '../models/Product';
import { ERROR_CODES, HTTP_STATUS } from '../utils/constants';
import { newAppError } from '../utils/error';
import { sendResponse } from '../utils/response';
import { ensureUniqueRFQNumber } from '../utils/quotationHelper';
import type {
  AuthenticatedRequest,
  IProduct,
  IRFQ,
  IRFQItem,
  RFQStatus,
} from '../types';

const VALID_RFQ_STATUSES: RFQStatus[] = [
  'pending',
  'quoted',
  'accepted',
  'rejected',
  'expired',
];

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

type ProjectedProduct = {
  _id: string;
  name: string;
  sku: string;
  slug: string;
  isActive: boolean;
  basePrice?: number;
  discountedPrice?: number;
};

function projectProduct(ref: unknown): ProjectedProduct | null {
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
    basePrice: r.basePrice,
    discountedPrice: r.discountedPrice,
  };
}

type ProjectedRFQItem = {
  _id: string;
  productId: string;
  product: ProjectedProduct | null;
  quantity: number;
  notes?: string;
};

function projectRFQItem(
  item: IRFQItem & { _id: unknown },
): ProjectedRFQItem {
  return {
    _id: String(item._id),
    productId: String(item.productId),
    product: projectProduct(item.productId),
    quantity: item.quantity,
    notes: item.notes,
  };
}

type ProjectedRFQ = {
  _id: string;
  userId: string;
  rfqNumber: string;
  items: ProjectedRFQItem[];
  companyName: string;
  contactPerson: string;
  email: string;
  phone?: string;
  requiredDate?: Date | null;
  deliveryLocation?: string;
  specialRequirements?: string;
  status: RFQStatus;
  itemCount: number;
  totalQuantity: number;
  createdAt?: Date;
  updatedAt?: Date;
};

function projectRFQ(doc: IRFQ & { _id: unknown }): ProjectedRFQ {
  const items = doc.items.map((i) =>
    projectRFQItem(i as IRFQItem & { _id: unknown }),
  );
  const itemCount = items.length;
  const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
  return {
    _id: String(doc._id),
    userId: String(doc.userId),
    rfqNumber: doc.rfqNumber,
    items,
    companyName: doc.companyName,
    contactPerson: doc.contactPerson,
    email: doc.email,
    phone: doc.phone,
    requiredDate: doc.requiredDate,
    deliveryLocation: doc.deliveryLocation,
    specialRequirements: doc.specialRequirements,
    status: doc.status,
    itemCount,
    totalQuantity,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

type CreateRFQBody = {
  items?: unknown;
  companyName?: unknown;
  contactPerson?: unknown;
  email?: unknown;
  phone?: unknown;
  requiredDate?: unknown;
  deliveryLocation?: unknown;
  specialRequirements?: unknown;
};

export async function createRFQ(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const body = req.body as CreateRFQBody;
    const errors: Array<{ field: string; message: string }> = [];

    const itemsInput = body.items;
    const rawItems: Array<{
      productId: string;
      quantity: number;
      notes?: string;
    }> = [];
    if (!Array.isArray(itemsInput) || itemsInput.length === 0) {
      errors.push({
        field: 'items',
        message:
          'items array is required. Each item needs { productId, quantity }.',
      });
    } else {
      for (let idx = 0; idx < itemsInput.length; idx++) {
        const it = itemsInput[idx] as {
          productId?: unknown;
          quantity?: unknown;
          notes?: unknown;
        };
        if (
          typeof it.productId !== 'string' ||
          it.productId.trim().length === 0
        ) {
          errors.push({
            field: `items[${idx}].productId`,
            message: 'productId (ObjectId string) is required',
          });
        }
        if (
          typeof it.quantity !== 'number' ||
          !Number.isFinite(it.quantity) ||
          !Number.isInteger(it.quantity) ||
          it.quantity < 1
        ) {
          errors.push({
            field: `items[${idx}].quantity`,
            message: 'quantity must be a positive integer',
          });
        }
        if (it.notes !== undefined && typeof it.notes !== 'string') {
          errors.push({
            field: `items[${idx}].notes`,
            message: 'notes must be a string',
          });
        }
        if (
          typeof it.productId === 'string' &&
          typeof it.quantity === 'number'
        ) {
          rawItems.push({
            productId: it.productId,
            quantity: it.quantity,
            notes: typeof it.notes === 'string' ? it.notes : undefined,
          });
        }
      }
    }

    if (
      typeof body.companyName !== 'string' ||
      body.companyName.trim().length === 0
    ) {
      errors.push({
        field: 'companyName',
        message: 'companyName is required',
      });
    }
    if (
      typeof body.contactPerson !== 'string' ||
      body.contactPerson.trim().length === 0
    ) {
      errors.push({
        field: 'contactPerson',
        message: 'contactPerson is required',
      });
    }
    if (
      typeof body.email !== 'string' ||
      body.email.trim().length === 0 ||
      !/^\S+@\S+\.\S+$/.test(body.email)
    ) {
      errors.push({
        field: 'email',
        message: 'A valid email address is required',
      });
    }
    if (body.phone !== undefined && typeof body.phone !== 'string') {
      errors.push({
        field: 'phone',
        message: 'phone must be a string',
      });
    }

    let requiredDate: Date | null = null;
    if (body.requiredDate !== undefined && body.requiredDate !== null) {
      const d = new Date(body.requiredDate as string);
      if (Number.isNaN(d.getTime())) {
        errors.push({
          field: 'requiredDate',
          message: 'requiredDate must be a valid ISO date',
        });
      } else {
        requiredDate = d;
      }
    }
    if (
      body.deliveryLocation !== undefined &&
      typeof body.deliveryLocation !== 'string'
    ) {
      errors.push({
        field: 'deliveryLocation',
        message: 'deliveryLocation must be a string',
      });
    }
    if (
      body.specialRequirements !== undefined &&
      typeof body.specialRequirements !== 'string'
    ) {
      errors.push({
        field: 'specialRequirements',
        message: 'specialRequirements must be a string',
      });
    }

    if (errors.length > 0) return next(validationAppError(errors));

    const productIds = rawItems.map((i) => i.productId);
    const products = await Product.find({ _id: { $in: productIds } }).exec();
    const existingIds = new Set(products.map((p) => String(p._id)));
    for (const it of rawItems) {
      if (!existingIds.has(it.productId)) {
        errors.push({
          field: `items`,
          message: `Product ${it.productId} does not exist`,
        });
      }
    }
    if (errors.length > 0) return next(validationAppError(errors));

    const rfqNumber = await ensureUniqueRFQNumber();

    const itemsForSave = rawItems.map((it) => ({
      productId: it.productId as unknown as Types.ObjectId,
      quantity: it.quantity,
      notes: it.notes,
    }));

    const created = await RFQ.create({
      userId: userId as unknown as Types.ObjectId,
      rfqNumber,
      items: itemsForSave,
      companyName: body.companyName,
      contactPerson: body.contactPerson,
      email: body.email,
      phone: typeof body.phone === 'string' ? body.phone : undefined,
      requiredDate,
      deliveryLocation:
        typeof body.deliveryLocation === 'string'
          ? body.deliveryLocation
          : undefined,
      specialRequirements:
        typeof body.specialRequirements === 'string'
          ? body.specialRequirements
          : undefined,
      status: 'pending',
    } as unknown as IRFQ);

    const fresh = await RFQ.findById(created._id)
      .populate<{ items: Array<{ productId: IProduct } & IRFQItem> }>(
        'items.productId',
      )
      .exec();
    const projected = projectRFQ((fresh ?? created) as any);

    sendResponse(
      res,
      { rfq: projected },
      'RFQ created successfully.',
      HTTP_STATUS.CREATED,
      {
        rfqNumber: projected.rfqNumber,
        itemCount: projected.itemCount,
        totalQuantity: projected.totalQuantity,
      },
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function getRFQ(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const { id } = req.params;

    const doc = await RFQ.findById(id)
      .populate<{ items: Array<{ productId: IProduct } & IRFQItem> }>(
        'items.productId',
      )
      .exec();
    if (!doc) {
      return next(
        newAppError(
          'RFQ not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }

    if (String(doc.userId) !== userId) {
      return next(
        newAppError(
          'You are not authorized to view this RFQ.',
          HTTP_STATUS.FORBIDDEN,
          ERROR_CODES.PERMISSION_DENIED,
        ),
      );
    }

    const projected = projectRFQ(doc as any);
    sendResponse(
      res,
      { rfq: projected },
      'RFQ retrieved successfully.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function getUserRFQs(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const { status } = req.query;

    const filter: Record<string, unknown> = { userId };
    if (typeof status === 'string' && status.length > 0) {
      const list = status.split(',').map((s) => s.trim());
      const valid = list.filter((s) =>
        VALID_RFQ_STATUSES.includes(s as RFQStatus),
      );
      if (valid.length > 0) {
        filter.status = { $in: valid };
      }
    }

    const docs = await RFQ.find(filter)
      .sort({ createdAt: -1 })
      .populate<{ items: Array<{ productId: IProduct } & IRFQItem> }>(
        'items.productId',
      )
      .exec();

    const rfqs = docs.map((d) => projectRFQ(d as any));
    const totalRFQs = rfqs.length;
    const statusCounts = rfqs.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});

    sendResponse(
      res,
      { rfqs },
      totalRFQs > 0
        ? 'User RFQs retrieved successfully.'
        : 'No RFQs found for this user.',
      HTTP_STATUS.OK,
      { count: totalRFQs, statusCounts },
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

type UpdateRFQStatusBody = { status?: unknown };

export async function updateRFQStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const { id } = req.params;
    const body = req.body as UpdateRFQStatusBody;
    const errors: Array<{ field: string; message: string }> = [];

    if (
      typeof body.status !== 'string' ||
      !VALID_RFQ_STATUSES.includes(body.status as RFQStatus)
    ) {
      errors.push({
        field: 'status',
        message: `status must be one of: ${VALID_RFQ_STATUSES.join(', ')}`,
      });
    }
    if (errors.length > 0) return next(validationAppError(errors));

    const doc = await RFQ.findById(id).exec();
    if (!doc) {
      return next(
        newAppError(
          'RFQ not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }

    if (String(doc.userId) !== userId) {
      return next(
        newAppError(
          'You are not authorized to modify this RFQ.',
          HTTP_STATUS.FORBIDDEN,
          ERROR_CODES.PERMISSION_DENIED,
        ),
      );
    }

    const newStatus = body.status as RFQStatus;
    const cast = doc as unknown as IRFQ & {
      status: RFQStatus;
      save: () => Promise<unknown>;
    };
    cast.status = newStatus;
    await cast.save();

    const fresh = await RFQ.findById(doc._id)
      .populate<{ items: Array<{ productId: IProduct } & IRFQItem> }>(
        'items.productId',
      )
      .exec();
    const projected = projectRFQ((fresh ?? doc) as any);

    sendResponse(
      res,
      { rfq: projected },
      `RFQ status updated to '${newStatus}' successfully.`,
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}
