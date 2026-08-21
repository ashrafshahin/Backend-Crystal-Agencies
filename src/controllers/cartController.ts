import type { Request, Response, NextFunction } from 'express';
import { Error, type Types } from 'mongoose';
import Cart from '../models/Cart';
import Product from '../models/Product';
import Inventory from '../models/Inventory';
import { ERROR_CODES, HTTP_STATUS } from '../utils/constants';
import { newAppError } from '../utils/error';
import { sendResponse } from '../utils/response';
import type {
  AuthenticatedRequest,
  ICart,
  ICartItem,
  IProduct,
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

type ProjectedProduct = {
  _id: string;
  name: string;
  sku: string;
  slug: string;
  isActive: boolean;
  basePrice?: number;
  discountedPrice?: number;
  stock?: number;
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
    stock: r.stock,
  };
}

function unitPriceOf(product: ProjectedProduct | null): number {
  if (!product) return 0;
  if (typeof product.discountedPrice === 'number') {
    return product.discountedPrice;
  }
  if (typeof product.basePrice === 'number') {
    return product.basePrice;
  }
  return 0;
}

type ProjectedCartItem = {
  _id: string;
  product: ProjectedProduct | null;
  productId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  addedAt?: Date;
};

function projectCartItem(
  item: ICartItem & { _id: unknown },
): ProjectedCartItem {
  const product = projectProduct(item.productId);
  const unitPrice = unitPriceOf(product);
  return {
    _id: String(item._id),
    product,
    productId: String(item.productId),
    quantity: item.quantity,
    unitPrice,
    subtotal: unitPrice * item.quantity,
    addedAt: item.addedAt,
  };
}

type ProjectedCart = {
  _id: string;
  userId: string;
  items: ProjectedCartItem[];
  count: number;
  subtotal: number;
  total: number;
  createdAt?: Date;
  updatedAt?: Date;
};

function projectCart(
  doc: ICart & { _id: unknown },
): ProjectedCart {
  const items = doc.items.map((i) =>
    projectCartItem(i as ICartItem & { _id: unknown }),
  );
  const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  return {
    _id: String(doc._id),
    userId: String(doc.userId),
    items,
    count,
    subtotal,
    total: subtotal,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function findOrCreateCart(userId: string) {
  let doc = await Cart.findOne({ userId }).exec();
  if (!doc) {
    doc = await Cart.create({ userId, items: [] } as ICart);
  }
  return doc;
}

export async function getCart(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);

    let doc = await Cart.findOne({ userId })
      .populate<{ items: Array<{ productId: IProduct } & ICartItem> }>(
        'items.productId',
      )
      .exec();
    if (!doc) {
      const doc = (await Cart.create({ userId, items: [] })) as any;
    }

    const cart = projectCart(doc as any);
    sendResponse(
      res,
      { cart },
      'Cart retrieved successfully.',
      HTTP_STATUS.OK,
      { count: cart.count },
    );
    return;
  } catch (err) {
    return next(err);
  }
}

type AddPayload = { productId?: unknown; quantity?: unknown };

export async function addToCart(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const body = req.body as AddPayload;
    const errors: Array<{ field: string; message: string }> = [];

    if (
      typeof body.productId !== 'string' ||
      body.productId.trim().length === 0
    ) {
      errors.push({
        field: 'productId',
        message: 'productId is required (ObjectId string)',
      });
    }
    let quantity = 1;
    if (body.quantity !== undefined) {
      if (
        typeof body.quantity !== 'number' ||
        !Number.isFinite(body.quantity) ||
        !Number.isInteger(body.quantity) ||
        body.quantity < 1
      ) {
        errors.push({
          field: 'quantity',
          message: 'quantity must be a positive integer',
        });
      } else {
        quantity = body.quantity;
      }
    }
    if (errors.length > 0) return next(validationAppError(errors));

    const product = await Product.findById(body.productId).exec();
    if (!product) {
      errors.push({
        field: 'productId',
        message: 'Product does not exist',
      });
      return next(validationAppError(errors));
    }
    if (!product.isActive) {
      errors.push({
        field: 'productId',
        message: 'Product is not active and cannot be added to cart',
      });
      return next(validationAppError(errors));
    }

    const cart = await findOrCreateCart(userId);
    const existing = cart.items.find(
      (i) => String(i.productId) === body.productId,
    );
    if (existing) {
      existing.quantity += quantity;
    } else {
      const cast = cart as unknown as {
        items: ICartItem[];
        save: () => Promise<unknown>;
      };
      cast.items.push({
        productId: product._id as unknown as Types.ObjectId,
        quantity,
        addedAt: new Date(),
      });
    }
    await cart.save();

    const fresh = await Cart.findById(cart._id)
      .populate<{ items: Array<{ productId: IProduct } & ICartItem> }>(
        'items.productId',
      )
      .exec();
    const projected = projectCart((fresh ?? cart) as any);
    sendResponse(
      res,
      { cart: projected },
      existing
        ? 'Cart item quantity updated successfully.'
        : 'Product added to cart successfully.',
      HTTP_STATUS.OK,
      { count: projected.count },
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

type UpdateQtyPayload = { quantity?: unknown };

export async function updateQuantity(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const { id } = req.params;
    const body = req.body as UpdateQtyPayload;
    const errors: Array<{ field: string; message: string }> = [];

    let quantity: number | undefined;
    if (
      typeof body.quantity !== 'number' ||
      !Number.isFinite(body.quantity) ||
      !Number.isInteger(body.quantity) ||
      body.quantity < 0
    ) {
      errors.push({
        field: 'quantity',
        message: 'quantity must be a non-negative integer (use 0 to remove)',
      });
      return next(validationAppError(errors));
    }
    quantity = body.quantity;

    const cart = await findOrCreateCart(userId);
    const target = cart.items.find(
      (i) => String(i.productId) === id || String(i._id) === id,
    );
    if (!target) {
      return next(
        newAppError(
          'Cart item not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }
    if (quantity === 0) {
      const cast = cart as unknown as {
        items: ICartItem[];
        save: () => Promise<unknown>;
      };
      cast.items = cast.items.filter(
        (i) => String(i._id) !== String(target._id),
      );
    } else {
      target.quantity = quantity;
    }
    await cart.save();

    const fresh = await Cart.findById(cart._id)
      .populate<{ items: Array<{ productId: IProduct } & ICartItem> }>(
        'items.productId',
      )
      .exec();
    const projected = projectCart((fresh ?? cart) as any);
    sendResponse(
      res,
      { cart: projected },
      'Cart item quantity updated successfully.',
      HTTP_STATUS.OK,
      { count: projected.count },
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function removeFromCart(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const { id } = req.params;

    const cart = await findOrCreateCart(userId);
    const match = cart.items.find(
      (i) => String(i.productId) === id || String(i._id) === id,
    );
    if (!match) {
      return next(
        newAppError(
          'Cart item not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }
    const cast = cart as unknown as {
      items: ICartItem[];
      save: () => Promise<unknown>;
    };
    cast.items = cast.items.filter(
      (i) => String(i._id) !== String(match._id),
    );
    await cart.save();

    const fresh = await Cart.findById(cart._id)
      .populate<{ items: Array<{ productId: IProduct } & ICartItem> }>(
        'items.productId',
      )
      .exec();
    const projected = projectCart((fresh ?? cart) as any);
    sendResponse(
      res,
      {
        cart: projected,
        removed: true,
        productId: String(match.productId),
      },
      'Product removed from cart successfully.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function clearCart(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);

    const cart = await findOrCreateCart(userId);
    const cast = cart as unknown as {
      items: ICartItem[];
      save: () => Promise<unknown>;
    };
    const count = cast.items.reduce((s, i) => s + i.quantity, 0);
    cast.items = [];
    await cart.save();

    const fresh = await Cart.findById(cart._id)
      .populate<{ items: Array<{ productId: IProduct } & ICartItem> }>(
        'items.productId',
      )
      .exec();
    const projected = projectCart((fresh ?? cart) as any);
    sendResponse(
      res,
      { cart: projected, cleared: true, itemsRemoved: count },
      'Cart cleared successfully.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    return next(err);
  }
}

export async function validateCart(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);

    const cart = await Cart.findOne({ userId })
      .populate<{ items: Array<{ productId: IProduct } & ICartItem> }>(
        'items.productId',
      )
      .exec();
    if (!cart || cart.items.length === 0) {
      sendResponse(
        res,
        {
          valid: true,
          issues: [],
          summary: { count: 0, value: 0 },
        },
        'Cart is empty — nothing to validate.',
        HTTP_STATUS.OK,
      );
      return;
    }

    const productIds = cart.items.map((i) => String(i.productId));
    const inventoryRows = await Inventory.find({
      productId: { $in: productIds },
    }).exec();
    const stockByProduct = new Map<string, number>();
    for (const row of inventoryRows) {
      const key = String(row.productId);
      stockByProduct.set(
        key,
        (stockByProduct.get(key) ?? 0) + row.quantity,
      );
    }

    type Issue = {
      itemId: string;
      productId: string;
      type: 'out-of-stock' | 'insufficient-stock' | 'inactive';
      message: string;
      available: number;
      requested: number;
    };
    const issues: Issue[] = [];
    let valid = true;
    let value = 0;
    let count = 0;

    for (const item of cart.items as Array<{ productId: IProduct } & ICartItem>) {
      const prod = projectProduct(item.productId);
      const unitPrice = unitPriceOf(prod);
      value += unitPrice * item.quantity;
      count += item.quantity;

      const available = stockByProduct.get(String(item.productId)) ?? 0;
      if (prod && !prod.isActive) {
        valid = false;
        issues.push({
          itemId: String(item._id),
          productId: String(item.productId),
          type: 'inactive',
          message: 'Product is currently inactive.',
          available,
          requested: item.quantity,
        });
        continue;
      }
      if (available <= 0) {
        valid = false;
        issues.push({
          itemId: String(item._id),
          productId: String(item.productId),
          type: 'out-of-stock',
          message: 'Product is out of stock.',
          available,
          requested: item.quantity,
        });
      } else if (available < item.quantity) {
        valid = false;
        issues.push({
          itemId: String(item._id),
          productId: String(item.productId),
          type: 'insufficient-stock',
          message: `Only ${available} units in stock (requested ${item.quantity}).`,
          available,
          requested: item.quantity,
        });
      }
    }

    sendResponse(
      res,
      {
        valid,
        issues,
        summary: { count, value },
      },
      valid
        ? 'Cart validation passed — all items are in stock.'
        : 'Cart validation found issues that must be resolved before checkout.',
      HTTP_STATUS.OK,
      { valid, issues: issues.length },
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}
