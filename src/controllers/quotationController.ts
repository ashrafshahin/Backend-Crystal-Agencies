import type { Request, Response, NextFunction } from 'express';
import { Error, type Types } from 'mongoose';
import Quotation from '../models/Quotation';
import RFQ from '../models/RFQ';
import Order from '../models/Order';
import Product from '../models/Product';
import User from '../models/User';
import { ERROR_CODES, HTTP_STATUS } from '../utils/constants';
import { newAppError } from '../utils/error';
import { sendResponse } from '../utils/response';
import {
  calculateQuotation,
  ensureUniqueQuotationNumber,
  isQuotationExpired,
  defaultValidUntil,
} from '../utils/quotationHelper';
import { sendQuotationEmail } from '../utils/email';
import { ensureUniqueOrderNumber } from '../utils/orderHelper';
import type {
  AuthenticatedRequest,
  IOrder,
  IOrderItem,
  IProduct,
  IQuotation,
  IQuotationItem,
  IRFQ,
  IShippingAddress,
  IUser,
  QuotationStatus,
} from '../types';

const VALID_QUOTATION_STATUSES: QuotationStatus[] = [
  'draft',
  'sent',
  'accepted',
  'rejected',
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

type ProjectedQuotationItem = {
  _id: string;
  productId: string;
  product: ProjectedProduct | null;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
};

function projectQuotationItem(
  item: IQuotationItem & { _id: unknown },
): ProjectedQuotationItem {
  const product = projectProduct(item.productId);
  const unitPrice = item.unitPrice;
  const lineDiscount =
    typeof item.discount === 'number' && item.discount > 0 ? item.discount : 0;
  return {
    _id: String(item._id),
    productId: String(item.productId),
    product,
    productName: item.productName ?? product?.name ?? 'Unknown Product',
    productSku: item.productSku ?? product?.sku ?? 'UNKNOWN',
    quantity: item.quantity,
    unitPrice,
    discount: lineDiscount,
    subtotal:
      typeof item.subtotal === 'number'
        ? item.subtotal
        : Math.max(0, unitPrice * item.quantity - lineDiscount),
  };
}

type ProjectedQuotation = {
  _id: string;
  rfqId: string;
  userId: string;
  quotationNumber: string;
  items: ProjectedQuotationItem[];
  totalAmount: number;
  tax: number;
  finalAmount: number;
  validUntil: Date;
  status: QuotationStatus;
  notes?: string;
  attachmentUrl?: string;
  createdBy: string;
  sentAt?: Date | null;
  acceptedAt?: Date | null;
  rejectedAt?: Date | null;
  orderId?: string | null;
  isExpired: boolean;
  itemCount: number;
  totalQuantity: number;
  createdAt?: Date;
  updatedAt?: Date;
};

function projectQuotation(doc: IQuotation & { _id: unknown }): ProjectedQuotation {
  const items = doc.items.map((i) =>
    projectQuotationItem(i as IQuotationItem & { _id: unknown }),
  );
  const itemCount = items.length;
  const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
  const isExpired = isQuotationExpired(doc.validUntil);
  return {
    _id: String(doc._id),
    rfqId: String(doc.rfqId),
    userId: String(doc.userId),
    quotationNumber: doc.quotationNumber,
    items,
    totalAmount: doc.totalAmount,
    tax: doc.tax,
    finalAmount: doc.finalAmount,
    validUntil: doc.validUntil,
    status: doc.status,
    notes: doc.notes,
    attachmentUrl: doc.attachmentUrl,
    createdBy: String(doc.createdBy),
    sentAt: doc.sentAt,
    acceptedAt: doc.acceptedAt,
    rejectedAt: doc.rejectedAt,
    orderId: doc.orderId ? String(doc.orderId) : null,
    isExpired,
    itemCount,
    totalQuantity,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

type CreateQuotationBody = {
  rfqId?: unknown;
  items?: unknown;
  tax?: unknown;
  validUntil?: unknown;
  notes?: unknown;
  attachmentUrl?: unknown;
  userId?: unknown;
};

export async function createQuotation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const createdBy = String(authReq.user._id);
    const body = req.body as CreateQuotationBody;
    const errors: Array<{ field: string; message: string }> = [];

    if (
      typeof body.rfqId !== 'string' ||
      body.rfqId.trim().length === 0
    ) {
      errors.push({
        field: 'rfqId',
        message: 'rfqId (ObjectId string) is required',
      });
    }

    const itemsInput = body.items;
    const rawItems: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      discount?: number;
    }> = [];
    if (!Array.isArray(itemsInput) || itemsInput.length === 0) {
      errors.push({
        field: 'items',
        message:
          'items array is required. Each item needs { productId, quantity, unitPrice }.',
      });
    } else {
      for (let idx = 0; idx < itemsInput.length; idx++) {
        const it = itemsInput[idx] as {
          productId?: unknown;
          quantity?: unknown;
          unitPrice?: unknown;
          discount?: unknown;
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
        if (
          typeof it.unitPrice !== 'number' ||
          !Number.isFinite(it.unitPrice) ||
          it.unitPrice < 0
        ) {
          errors.push({
            field: `items[${idx}].unitPrice`,
            message: 'unitPrice must be a non-negative number',
          });
        }
        if (it.discount !== undefined) {
          if (
            typeof it.discount !== 'number' ||
            !Number.isFinite(it.discount) ||
            it.discount < 0
          ) {
            errors.push({
              field: `items[${idx}].discount`,
              message: 'discount must be a non-negative number',
            });
          }
        }
        if (
          typeof it.productId === 'string' &&
          typeof it.quantity === 'number' &&
          typeof it.unitPrice === 'number'
        ) {
          rawItems.push({
            productId: it.productId,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            discount:
              typeof it.discount === 'number' ? it.discount : undefined,
          });
        }
      }
    }

    let tax = 0;
    if (body.tax !== undefined) {
      if (
        typeof body.tax !== 'number' ||
        !Number.isFinite(body.tax) ||
        body.tax < 0
      ) {
        errors.push({
          field: 'tax',
          message: 'tax must be a non-negative number',
        });
      } else {
        tax = body.tax;
      }
    }

    let validUntil: Date = defaultValidUntil(30);
    if (body.validUntil !== undefined && body.validUntil !== null) {
      const d = new Date(body.validUntil as string);
      if (Number.isNaN(d.getTime())) {
        errors.push({
          field: 'validUntil',
          message: 'validUntil must be a valid ISO date',
        });
      } else {
        d.setHours(23, 59, 59, 999);
        validUntil = d;
      }
    }
    if (body.notes !== undefined && typeof body.notes !== 'string') {
      errors.push({
        field: 'notes',
        message: 'notes must be a string',
      });
    }
    if (
      body.attachmentUrl !== undefined &&
      typeof body.attachmentUrl !== 'string'
    ) {
      errors.push({
        field: 'attachmentUrl',
        message: 'attachmentUrl must be a string',
      });
    }

    if (errors.length > 0) return next(validationAppError(errors));

    const rfq = await RFQ.findById(body.rfqId).exec();
    if (!rfq) {
      errors.push({
        field: 'rfqId',
        message: 'RFQ does not exist',
      });
      return next(validationAppError(errors));
    }

    let userIdForQuotation = String(rfq.userId);
    if (typeof body.userId === 'string' && body.userId.trim().length > 0) {
      const userOverride = await User.findById(body.userId).exec();
      if (!userOverride) {
        errors.push({
          field: 'userId',
          message: 'userId override does not reference an existing user',
        });
        return next(validationAppError(errors));
      }
      userIdForQuotation = body.userId;
    }

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

    const totals = await calculateQuotation(rawItems, tax);
    const quotationNumber = await ensureUniqueQuotationNumber();

    const itemsForSave = totals.itemsWithSnapshots.map((snap) => ({
      productId: snap.productId as unknown as Types.ObjectId,
      quantity: snap.quantity,
      unitPrice: snap.unitPrice,
      discount: snap.discount,
      productName: snap.productName,
      productSku: snap.productSku,
      subtotal: snap.subtotal,
    }));

    const created = await Quotation.create({
      rfqId: String(body.rfqId) as unknown as Types.ObjectId,
      userId: userIdForQuotation as unknown as Types.ObjectId,
      quotationNumber,
      items: itemsForSave,
      totalAmount: totals.totalAmount,
      tax: totals.tax,
      finalAmount: totals.finalAmount,
      validUntil,
      status: 'draft',
      notes: typeof body.notes === 'string' ? body.notes : undefined,
      attachmentUrl:
        typeof body.attachmentUrl === 'string'
          ? body.attachmentUrl
          : undefined,
      createdBy: createdBy as unknown as Types.ObjectId,
      sentAt: null,
      acceptedAt: null,
      rejectedAt: null,
      orderId: null,
    } as unknown as IQuotation);

    if (rfq.status === 'pending') {
      const castRFQ = rfq as unknown as IRFQ & {
        status: IRFQ['status'];
        save: () => Promise<unknown>;
      };
      castRFQ.status = 'quoted';
      await castRFQ.save();
    }

    const fresh = await Quotation.findById(created._id)
      .populate<{ items: Array<{ productId: IProduct } & IQuotationItem> }>(
        'items.productId',
      )
      .exec();
    const projected = projectQuotation((fresh ?? created) as any);

    sendResponse(
      res,
      { quotation: projected },
      'Quotation created successfully.',
      HTTP_STATUS.CREATED,
      {
        quotationNumber: projected.quotationNumber,
        finalAmount: projected.finalAmount,
        itemCount: projected.itemCount,
      },
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function getQuotation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const { id } = req.params;

    const doc = await Quotation.findById(id)
      .populate<{ items: Array<{ productId: IProduct } & IQuotationItem> }>(
        'items.productId',
      )
      .exec();
    if (!doc) {
      return next(
        newAppError(
          'Quotation not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }

    if (String(doc.userId) !== userId && String(doc.createdBy) !== userId) {
      return next(
        newAppError(
          'You are not authorized to view this quotation.',
          HTTP_STATUS.FORBIDDEN,
          ERROR_CODES.PERMISSION_DENIED,
        ),
      );
    }

    const projected = projectQuotation(doc as any);
    sendResponse(
      res,
      { quotation: projected },
      'Quotation retrieved successfully.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function listQuotations(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const { rfqId, status } = req.query;

    const filter: Record<string, unknown> = {};

    if (typeof rfqId === 'string' && rfqId.length > 0) {
      filter.rfqId = rfqId;
    }

    if (typeof status === 'string' && status.length > 0) {
      const list = status.split(',').map((s) => s.trim());
      const valid = list.filter((s) =>
        VALID_QUOTATION_STATUSES.includes(s as QuotationStatus),
      );
      if (valid.length > 0) {
        filter.status = { $in: valid };
      }
    }

    if (!filter.rfqId) {
      filter.$or = [
        { userId },
        { createdBy: userId },
      ];
    }

    const docs = await Quotation.find(filter)
      .sort({ createdAt: -1 })
      .populate<{ items: Array<{ productId: IProduct } & IQuotationItem> }>(
        'items.productId',
      )
      .exec();

    const quotations = docs.map((d) => projectQuotation(d as any));
    const totalQuotations = quotations.length;
    const totalValue = quotations.reduce((sum, q) => sum + q.finalAmount, 0);
    const statusCounts = quotations.reduce<Record<string, number>>((acc, q) => {
      acc[q.status] = (acc[q.status] ?? 0) + 1;
      return acc;
    }, {});

    sendResponse(
      res,
      { quotations },
      totalQuotations > 0
        ? 'Quotations retrieved successfully.'
        : 'No quotations found matching the criteria.',
      HTTP_STATUS.OK,
      { count: totalQuotations, totalValue, statusCounts },
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

type UpdateQuotationBody = {
  items?: unknown;
  tax?: unknown;
  validUntil?: unknown;
  notes?: unknown;
  attachmentUrl?: unknown;
};

export async function updateQuotation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const { id } = req.params;
    const body = req.body as UpdateQuotationBody;
    const errors: Array<{ field: string; message: string }> = [];

    const doc = await Quotation.findById(id).exec();
    if (!doc) {
      return next(
        newAppError(
          'Quotation not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }

    if (String(doc.createdBy) !== userId) {
      return next(
        newAppError(
          'You are not authorized to edit this quotation.',
          HTTP_STATUS.FORBIDDEN,
          ERROR_CODES.PERMISSION_DENIED,
        ),
      );
    }

    if (doc.status !== 'draft') {
      return next(
        newAppError(
          `Only draft quotations can be edited. Current status: '${doc.status}'.`,
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.VALIDATION_ERROR,
        ),
      );
    }

    const itemsInput = body.items;
    const rawItems: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      discount?: number;
    }> = [];
    let itemsChanged = false;
    if (itemsInput !== undefined) {
      itemsChanged = true;
      if (!Array.isArray(itemsInput) || itemsInput.length === 0) {
        errors.push({
          field: 'items',
          message:
            'items array must contain at least one entry with { productId, quantity, unitPrice }.',
        });
      } else {
        for (let idx = 0; idx < itemsInput.length; idx++) {
          const it = itemsInput[idx] as {
            productId?: unknown;
            quantity?: unknown;
            unitPrice?: unknown;
            discount?: unknown;
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
          if (
            typeof it.unitPrice !== 'number' ||
            !Number.isFinite(it.unitPrice) ||
            it.unitPrice < 0
          ) {
            errors.push({
              field: `items[${idx}].unitPrice`,
              message: 'unitPrice must be a non-negative number',
            });
          }
          if (it.discount !== undefined) {
            if (
              typeof it.discount !== 'number' ||
              !Number.isFinite(it.discount) ||
              it.discount < 0
            ) {
              errors.push({
                field: `items[${idx}].discount`,
                message: 'discount must be a non-negative number',
              });
            }
          }
          if (
            typeof it.productId === 'string' &&
            typeof it.quantity === 'number' &&
            typeof it.unitPrice === 'number'
          ) {
            rawItems.push({
              productId: it.productId,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              discount:
                typeof it.discount === 'number' ? it.discount : undefined,
            });
          }
        }
      }
    }

    let tax: number | undefined;
    if (body.tax !== undefined) {
      if (
        typeof body.tax !== 'number' ||
        !Number.isFinite(body.tax) ||
        body.tax < 0
      ) {
        errors.push({
          field: 'tax',
          message: 'tax must be a non-negative number',
        });
      } else {
        tax = body.tax;
      }
    }

    let validUntil: Date | undefined;
    if (body.validUntil !== undefined && body.validUntil !== null) {
      const d = new Date(body.validUntil as string);
      if (Number.isNaN(d.getTime())) {
        errors.push({
          field: 'validUntil',
          message: 'validUntil must be a valid ISO date',
        });
      } else {
        d.setHours(23, 59, 59, 999);
        validUntil = d;
      }
    }
    if (body.notes !== undefined && typeof body.notes !== 'string') {
      errors.push({
        field: 'notes',
        message: 'notes must be a string',
      });
    }
    if (
      body.attachmentUrl !== undefined &&
      typeof body.attachmentUrl !== 'string'
    ) {
      errors.push({
        field: 'attachmentUrl',
        message: 'attachmentUrl must be a string',
      });
    }

    if (errors.length > 0) return next(validationAppError(errors));

    if (itemsChanged) {
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
    }

    const cast = doc as unknown as IQuotation & {
      items: IQuotationItem[];
      totalAmount: number;
      tax: number;
      finalAmount: number;
      validUntil: Date;
      notes?: string;
      attachmentUrl?: string;
      save: () => Promise<unknown>;
    };

    if (itemsChanged || tax !== undefined) {
      const itemsForCalc =
        itemsChanged && rawItems.length > 0
          ? rawItems
          : cast.items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              discount: i.discount,
            }));
      const taxToUse = tax !== undefined ? tax : cast.tax;
      const totals = await calculateQuotation(itemsForCalc, taxToUse);

      const itemsForSave = totals.itemsWithSnapshots.map((snap) => ({
        productId: snap.productId as unknown as Types.ObjectId,
        quantity: snap.quantity,
        unitPrice: snap.unitPrice,
        discount: snap.discount,
        productName: snap.productName,
        productSku: snap.productSku,
        subtotal: snap.subtotal,
      }));
      cast.items = itemsForSave as unknown as IQuotationItem[];
      cast.totalAmount = totals.totalAmount;
      cast.tax = totals.tax;
      cast.finalAmount = totals.finalAmount;
    }

    if (validUntil !== undefined) cast.validUntil = validUntil;
    if (body.notes !== undefined) cast.notes = (body.notes as string) || undefined;
    if (body.attachmentUrl !== undefined) {
      cast.attachmentUrl = (body.attachmentUrl as string) || undefined;
    }

    await cast.save();

    const fresh = await Quotation.findById(doc._id)
      .populate<{ items: Array<{ productId: IProduct } & IQuotationItem> }>(
        'items.productId',
      )
      .exec();
    const projected = projectQuotation((fresh ?? doc) as any);

    sendResponse(
      res,
      { quotation: projected },
      'Quotation updated successfully.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function sendQuotation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const { id } = req.params;

    const doc = await Quotation.findById(id).exec();
    if (!doc) {
      return next(
        newAppError(
          'Quotation not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }

    if (String(doc.createdBy) !== userId) {
      return next(
        newAppError(
          'You are not authorized to send this quotation.',
          HTTP_STATUS.FORBIDDEN,
          ERROR_CODES.PERMISSION_DENIED,
        ),
      );
    }

    if (doc.status === 'accepted' || doc.status === 'rejected') {
      return next(
        newAppError(
          `Cannot send a quotation that is already '${doc.status}'.`,
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.VALIDATION_ERROR,
        ),
      );
    }

    if (isQuotationExpired(doc.validUntil)) {
      return next(
        newAppError(
          'This quotation has expired. Update validUntil before sending.',
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.VALIDATION_ERROR,
        ),
      );
    }

    const buyer = await User.findById(doc.userId).exec();
    if (!buyer) {
      return next(
        newAppError(
          'Quotation recipient user no longer exists.',
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }
    const buyerCast = buyer as unknown as IUser & { name: string; email: string };

    let rfqNumber: string | undefined;
    if (doc.rfqId) {
      const rfq = await RFQ.findById(doc.rfqId).select('rfqNumber').exec();
      if (rfq) rfqNumber = rfq.rfqNumber;
    }

    sendQuotationEmail({
      quotationNumber: doc.quotationNumber,
      buyerEmail: buyerCast.email,
      buyerName: buyerCast.name,
      validUntil: doc.validUntil,
      finalAmount: doc.finalAmount,
      itemCount: doc.items.length,
      rfqNumber,
      notes: doc.notes,
    });

    const cast = doc as unknown as IQuotation & {
      status: QuotationStatus;
      sentAt?: Date | null;
      save: () => Promise<unknown>;
    };
    if (cast.status === 'draft') cast.status = 'sent';
    cast.sentAt = cast.sentAt ?? new Date();
    await cast.save();

    const fresh = await Quotation.findById(doc._id)
      .populate<{ items: Array<{ productId: IProduct } & IQuotationItem> }>(
        'items.productId',
      )
      .exec();
    const projected = projectQuotation((fresh ?? doc) as any);

    sendResponse(
      res,
      { quotation: projected, emailed: true, recipient: buyerCast.email },
      'Quotation sent successfully.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function acceptQuotation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const { id } = req.params;
    const errors: Array<{ field: string; message: string }> = [];

    const doc = await Quotation.findById(id).exec();
    if (!doc) {
      return next(
        newAppError(
          'Quotation not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }

    if (String(doc.userId) !== userId) {
      return next(
        newAppError(
          'You are not authorized to accept this quotation.',
          HTTP_STATUS.FORBIDDEN,
          ERROR_CODES.PERMISSION_DENIED,
        ),
      );
    }

    if (doc.status === 'accepted') {
      return next(
        newAppError(
          'Quotation is already accepted.',
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.VALIDATION_ERROR,
        ),
      );
    }
    if (doc.status === 'rejected') {
      return next(
        newAppError(
          'Cannot accept a rejected quotation.',
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.VALIDATION_ERROR,
        ),
      );
    }
    if (doc.status === 'draft') {
      return next(
        newAppError(
          'Cannot accept a draft quotation — it must be sent first.',
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.VALIDATION_ERROR,
        ),
      );
    }

    if (isQuotationExpired(doc.validUntil)) {
      return next(
        newAppError(
          'This quotation has expired and can no longer be accepted.',
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.VALIDATION_ERROR,
        ),
      );
    }

    const rfq = await RFQ.findById(doc.rfqId).exec();
    const buyer = await User.findById(doc.userId).exec();
    if (!buyer) {
      return next(
        newAppError(
          'Account no longer exists — cannot accept quotation.',
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }
    const buyerCast = buyer as unknown as IUser & {
      name: string;
      email: string;
      phone?: string;
    };

    const body = req.body as {
      shippingAddress?: unknown;
      shippingMethod?: unknown;
      paymentMethod?: unknown;
    };

    const shippingAddress = body.shippingAddress as
      | Partial<IShippingAddress>
      | undefined;

    let shippingMethod = 'standard' as 'standard' | 'express' | 'pickup';
    if (body.shippingMethod !== undefined) {
      const sm = String(body.shippingMethod);
      if (['standard', 'express', 'pickup'].includes(sm)) {
        shippingMethod = sm as 'standard' | 'express' | 'pickup';
      } else {
        errors.push({
          field: 'shippingMethod',
          message:
            'shippingMethod must be one of: standard, express, pickup',
        });
      }
    }

    let paymentMethod = 'bank_transfer' as
      | 'cod'
      | 'card'
      | 'wallet'
      | 'bank_transfer';
    if (body.paymentMethod !== undefined) {
      const pm = String(body.paymentMethod);
      if (['cod', 'card', 'wallet', 'bank_transfer'].includes(pm)) {
        paymentMethod = pm as 'cod' | 'card' | 'wallet' | 'bank_transfer';
      } else {
        errors.push({
          field: 'paymentMethod',
          message:
            'paymentMethod must be one of: cod, card, wallet, bank_transfer',
        });
      }
    }

    if (!shippingAddress || typeof shippingAddress !== 'object') {
      if (rfq) {
        const fallback: Partial<IShippingAddress> = {
          fullName: buyerCast.name,
          phone: buyerCast.phone,
          addressLine1: rfq.deliveryLocation ?? 'Pending confirmation',
          city: rfq.deliveryLocation ?? 'Pending confirmation',
          postalCode: '00000',
          country: 'Unknown',
        };
        Object.assign(shippingAddress ?? ({} as Partial<IShippingAddress>), fallback);
      } else {
        errors.push({
          field: 'shippingAddress',
          message:
            'shippingAddress object is required when quotation has no linked RFQ',
        });
      }
    } else {
      if (
        typeof shippingAddress.fullName !== 'string' ||
        shippingAddress.fullName.trim().length === 0
      ) {
        errors.push({
          field: 'shippingAddress.fullName',
          message: 'Full name is required',
        });
      }
      if (
        typeof shippingAddress.addressLine1 !== 'string' ||
        shippingAddress.addressLine1.trim().length === 0
      ) {
        errors.push({
          field: 'shippingAddress.addressLine1',
          message: 'Address line 1 is required',
        });
      }
      if (
        typeof shippingAddress.city !== 'string' ||
        shippingAddress.city.trim().length === 0
      ) {
        errors.push({
          field: 'shippingAddress.city',
          message: 'City is required',
        });
      }
      if (
        typeof shippingAddress.postalCode !== 'string' ||
        shippingAddress.postalCode.trim().length === 0
      ) {
        errors.push({
          field: 'shippingAddress.postalCode',
          message: 'Postal code is required',
        });
      }
      if (
        typeof shippingAddress.country !== 'string' ||
        shippingAddress.country.trim().length === 0
      ) {
        errors.push({
          field: 'shippingAddress.country',
          message: 'Country is required',
        });
      }
    }

    if (errors.length > 0) return next(validationAppError(errors));

    const orderNumber = await ensureUniqueOrderNumber();

    const orderItems: Array<{
      productId: Types.ObjectId;
      quantity: number;
      price: number;
      productName: string;
      productSku: string;
      subtotal: number;
    }> = [];
    let totalAmount = 0;
    for (const qi of doc.items) {
      const lineDiscount =
        typeof qi.discount === 'number' && qi.discount > 0 ? qi.discount : 0;
      const subtotal = Math.max(
        0,
        qi.unitPrice * qi.quantity - lineDiscount,
      );
      totalAmount += subtotal;
      orderItems.push({
        productId: String(qi.productId) as unknown as Types.ObjectId,
        quantity: qi.quantity,
        price: qi.unitPrice,
        productName: qi.productName ?? 'Unknown Product',
        productSku: qi.productSku ?? 'UNKNOWN',
        subtotal,
      });
    }

    const safeDiscount = 0;
    const finalAmount = totalAmount - safeDiscount + doc.tax;

    const createdOrder = await Order.create({
      userId: userId as unknown as Types.ObjectId,
      orderNumber,
      items: orderItems as unknown as IOrderItem[],
      shippingAddress: shippingAddress as IShippingAddress,
      shippingMethod,
      status: 'pending',
      paymentMethod,
      paymentStatus: 'unpaid',
      totalAmount,
      discount: safeDiscount,
      tax: doc.tax,
      finalAmount,
      notes: `Generated from Quotation #${doc.quotationNumber}${rfq ? ` (RFQ #${rfq.rfqNumber})` : ''}`,
      confirmedAt: null,
      cancelledAt: null,
      shippedAt: null,
      deliveredAt: null,
    } as unknown as IOrder);

    const castQuotation = doc as unknown as IQuotation & {
      status: QuotationStatus;
      acceptedAt?: Date | null;
      orderId?: Types.ObjectId | null;
      save: () => Promise<unknown>;
    };
    castQuotation.status = 'accepted';
    castQuotation.acceptedAt = new Date();
    castQuotation.orderId = createdOrder._id as unknown as Types.ObjectId;
    await castQuotation.save();

    if (rfq && rfq.status !== 'accepted') {
      const castRFQ = rfq as unknown as IRFQ & {
        status: IRFQ['status'];
        save: () => Promise<unknown>;
      };
      castRFQ.status = 'accepted';
      await castRFQ.save();
    }

    const fresh = await Quotation.findById(doc._id)
      .populate<{ items: Array<{ productId: IProduct } & IQuotationItem> }>(
        'items.productId',
      )
      .exec();
    const projected = projectQuotation((fresh ?? doc) as any);

    sendResponse(
      res,
      {
        quotation: projected,
        order: {
          _id: String(createdOrder._id),
          orderNumber: createdOrder.orderNumber,
          status: createdOrder.status,
          totalAmount: createdOrder.totalAmount,
          tax: createdOrder.tax,
          finalAmount: createdOrder.finalAmount,
          shippingMethod: createdOrder.shippingMethod,
          paymentMethod: createdOrder.paymentMethod,
          paymentStatus: createdOrder.paymentStatus,
        },
      },
      'Quotation accepted and converted to an order successfully.',
      HTTP_STATUS.OK,
      {
        quotationNumber: projected.quotationNumber,
        orderNumber: createdOrder.orderNumber,
        finalAmount: createdOrder.finalAmount,
      },
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function rejectQuotation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const { id } = req.params;

    const doc = await Quotation.findById(id).exec();
    if (!doc) {
      return next(
        newAppError(
          'Quotation not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }

    if (String(doc.userId) !== userId && String(doc.createdBy) !== userId) {
      return next(
        newAppError(
          'You are not authorized to reject this quotation.',
          HTTP_STATUS.FORBIDDEN,
          ERROR_CODES.PERMISSION_DENIED,
        ),
      );
    }

    if (doc.status === 'rejected') {
      return next(
        newAppError(
          'Quotation is already rejected.',
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.VALIDATION_ERROR,
        ),
      );
    }

    if (doc.status === 'accepted') {
      return next(
        newAppError(
          'Cannot reject an already accepted quotation.',
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.VALIDATION_ERROR,
        ),
      );
    }

    const cast = doc as unknown as IQuotation & {
      status: QuotationStatus;
      rejectedAt?: Date | null;
      save: () => Promise<unknown>;
    };
    cast.status = 'rejected';
    cast.rejectedAt = new Date();
    await cast.save();

    const fresh = await Quotation.findById(doc._id)
      .populate<{ items: Array<{ productId: IProduct } & IQuotationItem> }>(
        'items.productId',
      )
      .exec();
    const projected = projectQuotation((fresh ?? doc) as any);

    sendResponse(
      res,
      { quotation: projected, rejected: true },
      'Quotation rejected successfully.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}
