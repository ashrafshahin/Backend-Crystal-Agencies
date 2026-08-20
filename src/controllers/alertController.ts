import type { Request, Response, NextFunction } from 'express';
import { Error, type Types } from 'mongoose';
import StockAlert from '../models/StockAlert';
import Product from '../models/Product';
import Inventory from '../models/Inventory';
import { ERROR_CODES, HTTP_STATUS } from '../utils/constants';
import { newAppError } from '../utils/error';
import { sendResponse } from '../utils/response';
import { checkAndCreateAlerts } from '../utils/alertHelper';
import type {
  AuthenticatedRequest,
  IStockAlert,
  IProduct,
  AlertType,
} from '../types';

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

type ProjectedAlert = Omit<IStockAlert, 'productId' | 'resolvedBy'> & {
  _id: string;
  productId:
    | { _id: string; name: string; sku: string; slug: string; isActive: boolean }
    | null
    | string;
  resolvedBy: string | { _id: string; name: string; email: string } | null;
};

function projectAlert(
  doc: IStockAlert & { _id: unknown },
): ProjectedAlert {
  const productRef = projectProductRef(doc.productId);
  const userVal = doc.resolvedBy as unknown;
  let resolvedBy: ProjectedAlert['resolvedBy'] = null;
  if (
    userVal &&
    typeof userVal === 'object' &&
    'name' in (userVal as object) &&
    'email' in (userVal as object)
  ) {
    resolvedBy = {
      _id: String((userVal as { _id: unknown })._id),
      name: (userVal as { name: string }).name,
      email: (userVal as { email: string }).email,
    };
  } else if (userVal) {
    resolvedBy = String(userVal);
  }
  return {
    _id: String(doc._id),
    productId:
      productRef ?? (doc.productId ? String(doc.productId) : null),
    alertType: doc.alertType,
    threshold: doc.threshold,
    currentValue: doc.currentValue,
    status: doc.status,
    resolvedAt: doc.resolvedAt ?? null,
    resolvedBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

const VALID_ALERT_TYPES: AlertType[] = [
  'low-stock',
  'overstock',
  'expiring-soon',
];

export async function getActiveAlerts(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const docs = await StockAlert.find({ status: 'active' })
      .populate<{ productId: IProduct }>('productId')
      .sort({ createdAt: -1 })
      .exec();
    const alerts = docs.map(projectAlert);
    sendResponse(
      res,
      { alerts, count: alerts.length },
      'Active stock alerts retrieved successfully.',
      HTTP_STATUS.OK,
      { count: alerts.length },
    );
    return;
  } catch (err) {
    return next(err);
  }
}

export async function resolveAlert(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const doc = await StockAlert.findById(id).exec();
    if (!doc) {
      return next(
        newAppError(
          'Stock alert not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }
    const authReq = req as AuthenticatedRequest;
    const resolvedBy = authReq.user?._id as unknown as Types.ObjectId | undefined;

    const working = doc as unknown as IStockAlert & {
      _id: Types.ObjectId;
      save: () => Promise<unknown>;
    };
    working.status = 'resolved';
    working.resolvedAt = new Date();
    if (resolvedBy) working.resolvedBy = resolvedBy;
    await working.save();

    const fresh = await StockAlert.findById(working._id)
      .populate<{ productId: IProduct }>('productId')
      .populate<{ resolvedBy: { _id: Types.ObjectId; name: string; email: string } }>(
        'resolvedBy',
        '_id name email',
      )
      .exec();
    const alert = projectAlert((fresh ?? working) as any);
    sendResponse(
      res,
      { alert },
      'Stock alert resolved successfully.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

type CreateAlertPayload = {
  productId?: unknown;
  alertType?: unknown;
  threshold?: unknown;
  currentValue?: unknown;
};

export async function createAlert(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as CreateAlertPayload;
    const fieldErrors: Array<{ field: string; message: string }> = [];

    if (
      typeof body.productId !== 'string' ||
      body.productId.trim().length === 0
    ) {
      fieldErrors.push({
        field: 'productId',
        message: 'productId is required (ObjectId string)',
      });
    }
    const typeRaw = body.alertType as unknown;
    if (
      typeof typeRaw !== 'string' ||
      !VALID_ALERT_TYPES.includes(typeRaw as AlertType)
    ) {
      fieldErrors.push({
        field: 'alertType',
        message:
          "alertType is required and must be one of: 'low-stock', 'overstock', 'expiring-soon'",
      });
    }
    if (body.threshold !== undefined && (typeof body.threshold !== 'number' || Number.isNaN(body.threshold))) {
      fieldErrors.push({
        field: 'threshold',
        message: 'threshold must be a number when provided',
      });
    }
    let currentValue: number | undefined;
    if (body.currentValue === undefined) {
      fieldErrors.push({
        field: 'currentValue',
        message: 'currentValue is required',
      });
    } else if (
      typeof body.currentValue !== 'number' ||
      Number.isNaN(body.currentValue)
    ) {
      fieldErrors.push({
        field: 'currentValue',
        message: 'currentValue must be a number',
      });
    } else {
      currentValue = body.currentValue;
    }

    if (fieldErrors.length > 0) {
      return next(validationAppError(fieldErrors));
    }

    const product = await Product.findById(body.productId).exec();
    if (!product) {
      fieldErrors.push({
        field: 'productId',
        message: 'Product does not exist',
      });
      return next(validationAppError(fieldErrors));
    }

    const created = await StockAlert.create({
      productId: product._id,
      alertType: typeRaw as AlertType,
      threshold:
        typeof body.threshold === 'number' ? body.threshold : undefined,
      currentValue: currentValue!,
      status: 'active',
    } as IStockAlert);

    const fresh = await StockAlert.findById(created._id)
      .populate<{ productId: IProduct }>('productId')
      .exec();
    const alert = projectAlert((fresh ?? created) as any);
    sendResponse(
      res,
      { alert },
      'Stock alert created successfully.',
      HTTP_STATUS.CREATED,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function getDashboardSummary(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const [
      activeAlerts,
      inventoryDocs,
      productDocs,
      totalProductCount,
    ] = await Promise.all([
      StockAlert.find({ status: 'active' })
        .select('alertType productId currentValue threshold createdAt')
        .exec(),
      Inventory.find().select('productId quantity lastRestocked expirationDate').exec(),
      Product.find().select('_id basePrice discountedPrice isActive name').exec(),
      Product.countDocuments().exec(),
    ]);

    const lowStockCount = activeAlerts.filter(
      (a) => a.alertType === 'low-stock',
    ).length;
    const overstockCount = activeAlerts.filter(
      (a) => a.alertType === 'overstock',
    ).length;
    const expiringSoonCount = activeAlerts.filter(
      (a) => a.alertType === 'expiring-soon',
    ).length;

    const priceMap = new Map<string, number>();
    for (const p of productDocs) {
      const price =
        typeof (p as any).discountedPrice === 'number'
          ? (p as any).discountedPrice
          : typeof (p as any).basePrice === 'number'
          ? (p as any).basePrice
          : 0;
      priceMap.set(String(p._id), price);
    }

    let inventoryValue = 0;
    let totalUnits = 0;
    const activeInventoryProductIds = new Set<string>();
    for (const row of inventoryDocs) {
      inventoryValue += (priceMap.get(String(row.productId)) ?? 0) * row.quantity;
      totalUnits += row.quantity;
      if (row.quantity > 0) activeInventoryProductIds.add(String(row.productId));
    }

    const outOfStockProductCount = Math.max(
      0,
      totalProductCount - activeInventoryProductIds.size,
    );

    sendResponse(
      res,
      {
        summary: {
          lowStockCount,
          overstockCount,
          expiringSoonCount,
          activeAlertCount: activeAlerts.length,
          inventoryValue,
          totalUnits,
          distinctProductsInStock: activeInventoryProductIds.size,
          outOfStockProductCount,
        },
      },
      'Inventory dashboard summary retrieved successfully.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    return next(err);
  }
}

void checkAndCreateAlerts;
