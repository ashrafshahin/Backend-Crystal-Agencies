import type { Request, Response, NextFunction } from 'express';
import { Error, type Types } from 'mongoose';
import Order from '../models/Order';
import Cart from '../models/Cart';
import Product from '../models/Product';
import { ERROR_CODES, HTTP_STATUS } from '../utils/constants';
import { newAppError } from '../utils/error';
import { sendResponse } from '../utils/response';
import {
  calculateTotals,
  ensureUniqueOrderNumber,
  validateOrderCart,
  type OrderValidationIssue,
} from '../utils/orderHelper';
import {
  fireAndForget,
  sendOrderConfirmation,
  sendOrderStatusUpdate,
} from '../utils/emailService';
import type {
  AuthenticatedRequest,
  IOrder,
  IOrderItem,
  IProduct,
  IShippingAddress,
  OrderStatus,
  PaymentMethod,
  ShippingMethod,
} from '../types';

const VALID_ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
];

const VALID_PAYMENT_METHODS: PaymentMethod[] = [
  'cod',
  'card',
  'wallet',
  'bank_transfer',
];

const VALID_SHIPPING_METHODS: ShippingMethod[] = [
  'standard',
  'express',
  'pickup',
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

type ProjectedOrderItem = {
  _id: string;
  productId: string;
  product: ProjectedProduct | null;
  productName: string;
  productSku: string;
  quantity: number;
  price: number;
  subtotal: number;
};

function projectOrderItem(
  item: IOrderItem & { _id: unknown },
): ProjectedOrderItem {
  const product = projectProduct(item.productId);
  return {
    _id: String(item._id),
    productId: String(item.productId),
    product,
    productName: item.productName ?? product?.name ?? 'Unknown Product',
    productSku: item.productSku ?? product?.sku ?? 'UNKNOWN',
    quantity: item.quantity,
    price: item.price,
    subtotal:
      typeof item.subtotal === 'number'
        ? item.subtotal
        : item.price * item.quantity,
  };
}

type ProjectedOrder = {
  _id: string;
  userId: string;
  orderNumber: string;
  items: ProjectedOrderItem[];
  shippingAddress: IShippingAddress;
  shippingMethod: ShippingMethod;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: 'unpaid' | 'paid' | 'failed';
  totalAmount: number;
  discount: number;
  tax: number;
  finalAmount: number;
  itemCount: number;
  cancelledAt?: Date | null;
  confirmedAt?: Date | null;
  shippedAt?: Date | null;
  deliveredAt?: Date | null;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

function projectOrder(doc: IOrder & { _id: unknown }): ProjectedOrder {
  const items = doc.items.map((i) =>
    projectOrderItem(i as IOrderItem & { _id: unknown }),
  );
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  return {
    _id: String(doc._id),
    userId: String(doc.userId),
    orderNumber: doc.orderNumber,
    items,
    shippingAddress: doc.shippingAddress,
    shippingMethod: doc.shippingMethod,
    status: doc.status,
    paymentMethod: doc.paymentMethod,
    paymentStatus: doc.paymentStatus,
    totalAmount: doc.totalAmount,
    discount: doc.discount,
    tax: doc.tax,
    finalAmount: doc.finalAmount,
    itemCount,
    cancelledAt: doc.cancelledAt,
    confirmedAt: doc.confirmedAt,
    shippedAt: doc.shippedAt,
    deliveredAt: doc.deliveredAt,
    notes: doc.notes,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function clearUserCart(userId: string): Promise<number> {
  const cart = await Cart.findOne({ userId }).exec();
  if (!cart) return 0;
  const count = (cart.items ?? []).reduce((s, i) => s + i.quantity, 0);
  const cast = cart as unknown as {
    items: unknown[];
    save: () => Promise<unknown>;
  };
  cast.items = [];
  await cast.save();
  return count;
}

type CreateOrderBody = {
  shippingAddress?: unknown;
  shippingMethod?: unknown;
  paymentMethod?: unknown;
  discount?: unknown;
  tax?: unknown;
  notes?: unknown;
  useCart?: unknown;
  items?: unknown;
};

export async function createOrder(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const body = req.body as CreateOrderBody;
    const errors: Array<{ field: string; message: string }> = [];

    const shippingAddress = body.shippingAddress as
      | Partial<IShippingAddress>
      | undefined;
    if (!shippingAddress || typeof shippingAddress !== 'object') {
      errors.push({
        field: 'shippingAddress',
        message: 'shippingAddress object is required',
      });
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

    if (
      typeof body.shippingMethod !== 'string' ||
      !VALID_SHIPPING_METHODS.includes(body.shippingMethod as ShippingMethod)
    ) {
      errors.push({
        field: 'shippingMethod',
        message: `shippingMethod must be one of: ${VALID_SHIPPING_METHODS.join(', ')}`,
      });
    }

    if (
      typeof body.paymentMethod !== 'string' ||
      !VALID_PAYMENT_METHODS.includes(body.paymentMethod as PaymentMethod)
    ) {
      errors.push({
        field: 'paymentMethod',
        message: `paymentMethod must be one of: ${VALID_PAYMENT_METHODS.join(', ')}`,
      });
    }

    let discount = 0;
    if (body.discount !== undefined) {
      if (
        typeof body.discount !== 'number' ||
        !Number.isFinite(body.discount) ||
        body.discount < 0
      ) {
        errors.push({
          field: 'discount',
          message: 'discount must be a non-negative number',
        });
      } else {
        discount = body.discount;
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

    if (body.notes !== undefined && typeof body.notes !== 'string') {
      errors.push({
        field: 'notes',
        message: 'notes must be a string',
      });
    }

    const useCart = body.useCart !== false;
    let rawItems: Array<{ productId: unknown; quantity: number }> = [];

    if (useCart) {
      const cart = await Cart.findOne({ userId }).exec();
      if (!cart || !cart.items || cart.items.length === 0) {
        errors.push({
          field: 'items',
          message: 'Cart is empty. Add items to cart or provide explicit items.',
        });
      } else {
        rawItems = cart.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
        }));
      }
    } else {
      const itemsInput = body.items;
      if (!Array.isArray(itemsInput) || itemsInput.length === 0) {
        errors.push({
          field: 'items',
          message:
            'items array is required when useCart=false. Each item needs { productId, quantity }.',
        });
      } else {
        for (let idx = 0; idx < itemsInput.length; idx++) {
          const it = itemsInput[idx] as {
            productId?: unknown;
            quantity?: unknown;
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
            typeof it.productId === 'string' &&
            typeof it.quantity === 'number'
          ) {
            rawItems.push({
              productId: it.productId,
              quantity: it.quantity,
            });
          }
        }
      }
    }

    if (errors.length > 0) return next(validationAppError(errors));

    const validation = await validateOrderCart(rawItems);
    if (!validation.valid) {
      for (const issue of validation.issues as OrderValidationIssue[]) {
        errors.push({
          field: issue.productId
            ? `items.${issue.productId}`
            : 'items',
          message: issue.message,
        });
      }
      return next(validationAppError(errors));
    }

    const totals = await calculateTotals(rawItems, discount, tax);
    const orderNumber = await ensureUniqueOrderNumber();

    const itemsForSave = totals.itemsWithSnapshots.map((snap) => ({
      productId: snap.productId as unknown as Types.ObjectId,
      quantity: snap.quantity,
      price: snap.price,
      productName: snap.productName,
      productSku: snap.productSku,
      subtotal: snap.subtotal,
    }));

    const created = await Order.create({
      userId: userId as unknown as Types.ObjectId,
      orderNumber,
      items: itemsForSave,
      shippingAddress: shippingAddress as IShippingAddress,
      shippingMethod: body.shippingMethod as ShippingMethod,
      status: 'pending',
      paymentMethod: body.paymentMethod as PaymentMethod,
      paymentStatus: 'unpaid',
      totalAmount: totals.totalAmount,
      discount: totals.discount,
      tax: totals.tax,
      finalAmount: totals.finalAmount,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
      confirmedAt: null,
      cancelledAt: null,
      shippedAt: null,
      deliveredAt: null,
    } as unknown as IOrder);

    let cartClearedCount = 0;
    if (useCart) {
      cartClearedCount = await clearUserCart(userId);
    }

    const fresh = await Order.findById(created._id)
      .populate<{ items: Array<{ productId: IProduct } & IOrderItem> }>(
        'items.productId',
      )
      .exec();
    const projected = projectOrder((fresh ?? created) as any);

    const authUser = authReq.user;
    fireAndForget(
      () =>
        sendOrderConfirmation((fresh ?? created) as any, {
          name: authUser.name,
          email: authUser.email,
        }),
      `sendOrderConfirmation order=${projected.orderNumber}`,
    );

    sendResponse(
      res,
      {
        order: projected,
        cartCleared: useCart,
        itemsRemovedFromCart: cartClearedCount,
      },
      'Order created successfully.',
      HTTP_STATUS.CREATED,
      {
        orderNumber: projected.orderNumber,
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

export async function getOrder(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const { id } = req.params;

    const doc = await Order.findById(id)
      .populate<{ items: Array<{ productId: IProduct } & IOrderItem> }>(
        'items.productId',
      )
      .exec();
    if (!doc) {
      return next(
        newAppError(
          'Order not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }

    if (String(doc.userId) !== userId) {
      return next(
        newAppError(
          'You are not authorized to view this order.',
          HTTP_STATUS.FORBIDDEN,
          ERROR_CODES.PERMISSION_DENIED,
        ),
      );
    }

    const projected = projectOrder(doc as any);
    sendResponse(
      res,
      { order: projected },
      'Order retrieved successfully.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function getUserOrders(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);

    const docs = await Order.find({ userId })
      .sort({ createdAt: -1 })
      .populate<{ items: Array<{ productId: IProduct } & IOrderItem> }>(
        'items.productId',
      )
      .exec();

    const orders = docs.map((d) => projectOrder(d as any));
    const totalOrders = orders.length;
    const totalSpent = orders.reduce((sum, o) => sum + o.finalAmount, 0);

    sendResponse(
      res,
      { orders },
      'User orders retrieved successfully.',
      HTTP_STATUS.OK,
      { count: totalOrders, totalSpent },
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

type UpdateStatusBody = { status?: unknown };

export async function updateOrderStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const { id } = req.params;
    const body = req.body as UpdateStatusBody;
    const errors: Array<{ field: string; message: string }> = [];

    if (
      typeof body.status !== 'string' ||
      !VALID_ORDER_STATUSES.includes(body.status as OrderStatus)
    ) {
      errors.push({
        field: 'status',
        message: `status must be one of: ${VALID_ORDER_STATUSES.join(', ')}`,
      });
    }
    if (errors.length > 0) return next(validationAppError(errors));

    const doc = await Order.findById(id).exec();
    if (!doc) {
      return next(
        newAppError(
          'Order not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }

    if (String(doc.userId) !== userId) {
      return next(
        newAppError(
          'You are not authorized to modify this order.',
          HTTP_STATUS.FORBIDDEN,
          ERROR_CODES.PERMISSION_DENIED,
        ),
      );
    }

    if (doc.status === 'cancelled') {
      return next(
        newAppError(
          'Cannot change status of a cancelled order.',
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.VALIDATION_ERROR,
        ),
      );
    }

    if (doc.status === 'delivered') {
      return next(
        newAppError(
          'Cannot change status of a delivered order.',
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.VALIDATION_ERROR,
        ),
      );
    }

    const newStatus = body.status as OrderStatus;
    const cast = doc as unknown as IOrder & {
      status: OrderStatus;
      confirmedAt?: Date | null;
      shippedAt?: Date | null;
      deliveredAt?: Date | null;
      cancelledAt?: Date | null;
      save: () => Promise<unknown>;
    };

    cast.status = newStatus;
    const now = new Date();
    if (newStatus === 'confirmed' && !cast.confirmedAt) cast.confirmedAt = now;
    if (newStatus === 'shipped' && !cast.shippedAt) cast.shippedAt = now;
    if (newStatus === 'delivered' && !cast.deliveredAt) cast.deliveredAt = now;
    if (newStatus === 'cancelled' && !cast.cancelledAt) cast.cancelledAt = now;

    await cast.save();

    const fresh = await Order.findById(doc._id)
      .populate<{ items: Array<{ productId: IProduct } & IOrderItem> }>(
        'items.productId',
      )
      .exec();
    const projected = projectOrder((fresh ?? doc) as any);

    const authUser = authReq.user;
    fireAndForget(
      () =>
        sendOrderStatusUpdate(
          {
            orderNumber: projected.orderNumber,
            status: newStatus,
            updatedAt: new Date(),
          },
          { name: authUser.name, email: authUser.email },
          `Your order #${projected.orderNumber} is now ${newStatus}.`,
        ),
      `sendOrderStatusUpdate order=${projected.orderNumber}->${newStatus}`,
    );

    sendResponse(
      res,
      { order: projected },
      `Order status updated to '${newStatus}' successfully.`,
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function cancelOrder(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const { id } = req.params;

    const doc = await Order.findById(id).exec();
    if (!doc) {
      return next(
        newAppError(
          'Order not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }

    if (String(doc.userId) !== userId) {
      return next(
        newAppError(
          'You are not authorized to cancel this order.',
          HTTP_STATUS.FORBIDDEN,
          ERROR_CODES.PERMISSION_DENIED,
        ),
      );
    }

    if (doc.status !== 'pending') {
      return next(
        newAppError(
          `Only pending orders can be cancelled. Current status: '${doc.status}'.`,
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.VALIDATION_ERROR,
        ),
      );
    }

    const cast = doc as unknown as IOrder & {
      status: OrderStatus;
      cancelledAt?: Date | null;
      save: () => Promise<unknown>;
    };
    cast.status = 'cancelled';
    cast.cancelledAt = new Date();
    await cast.save();

    const fresh = await Order.findById(doc._id)
      .populate<{ items: Array<{ productId: IProduct } & IOrderItem> }>(
        'items.productId',
      )
      .exec();
    const projected = projectOrder((fresh ?? doc) as any);

    const authUser = authReq.user;
    fireAndForget(
      () =>
        sendOrderStatusUpdate(
          {
            orderNumber: projected.orderNumber,
            status: 'cancelled',
            updatedAt: cast.cancelledAt,
          },
          { name: authUser.name, email: authUser.email },
          `Your order #${projected.orderNumber} has been cancelled.`,
        ),
      `sendOrderStatusUpdate order=${projected.orderNumber}->cancelled`,
    );

    sendResponse(
      res,
      { order: projected, cancelled: true },
      'Order cancelled successfully.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function getOrderHistory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const { status, startDate, endDate, minAmount, maxAmount } = req.query;

    const filter: Record<string, unknown> = { userId };

    if (typeof status === 'string' && status.length > 0) {
      const list = status.split(',').map((s) => s.trim());
      const valid = list.filter((s) =>
        VALID_ORDER_STATUSES.includes(s as OrderStatus),
      );
      if (valid.length > 0) {
        filter.status = { $in: valid };
      }
    }

    const dateFilter: Record<string, unknown> = {};
    if (typeof startDate === 'string' && startDate.length > 0) {
      const d = new Date(startDate);
      if (!Number.isNaN(d.getTime())) dateFilter.$gte = d;
    }
    if (typeof endDate === 'string' && endDate.length > 0) {
      const d = new Date(endDate);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        dateFilter.$lte = d;
      }
    }
    if (Object.keys(dateFilter).length > 0) {
      filter.createdAt = dateFilter;
    }

    const amountFilter: Record<string, unknown> = {};
    if (typeof minAmount === 'string' && minAmount.length > 0) {
      const n = Number(minAmount);
      if (Number.isFinite(n) && n >= 0) amountFilter.$gte = n;
    }
    if (typeof maxAmount === 'string' && maxAmount.length > 0) {
      const n = Number(maxAmount);
      if (Number.isFinite(n) && n >= 0) amountFilter.$lte = n;
    }
    if (Object.keys(amountFilter).length > 0) {
      filter.finalAmount = amountFilter;
    }

    const docs = await Order.find(filter)
      .sort({ createdAt: -1 })
      .populate<{ items: Array<{ productId: IProduct } & IOrderItem> }>(
        'items.productId',
      )
      .exec();

    const orders = docs.map((d) => projectOrder(d as any));
    const totalOrders = orders.length;
    const totalSpent = orders.reduce((sum, o) => sum + o.finalAmount, 0);
    const statusCounts = orders.reduce<Record<string, number>>((acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    }, {});

    sendResponse(
      res,
      { orders, filters: { status, startDate, endDate, minAmount, maxAmount } },
      totalOrders > 0
        ? 'Order history retrieved successfully.'
        : 'No orders match the specified filters.',
      HTTP_STATUS.OK,
      {
        count: totalOrders,
        totalSpent,
        statusCounts,
      },
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}
