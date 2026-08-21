import type { Request, Response, NextFunction } from 'express';
import { Error } from 'mongoose';
import Wishlist from '../models/Wishlist';
import Product from '../models/Product';
import { ERROR_CODES, HTTP_STATUS } from '../utils/constants';
import { newAppError } from '../utils/error';
import { sendResponse } from '../utils/response';
import type {
  AuthenticatedRequest,
  IWishlist,
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

type ProjectedWishlist = Omit<IWishlist, 'userId' | 'productId'> & {
  _id: string;
  userId: string;
  product: ProjectedProduct | null;
};

function projectWishlist(
  doc: IWishlist & { _id: unknown },
): ProjectedWishlist {
  return {
    _id: String(doc._id),
    userId: String(doc.userId),
    product: projectProduct(doc.productId),
    createdAt: doc.createdAt,
  };
}

export async function addToWishlist(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const body = req.body as { productId?: unknown };
    const errors: Array<{ field: string; message: string }> = [];

    if (
      typeof body.productId !== 'string' ||
      body.productId.trim().length === 0
    ) {
      errors.push({
        field: 'productId',
        message: 'productId is required (ObjectId string)',
      });
      return next(validationAppError(errors));
    }

    const product = await Product.findById(body.productId).exec();
    if (!product) {
      errors.push({
        field: 'productId',
        message: 'Product does not exist',
      });
      return next(validationAppError(errors));
    }

    const existing = await Wishlist.findOne({
      userId,
      productId: body.productId,
    }).exec();

    if (existing) {
      const fresh = await Wishlist.findById(existing._id)
        .populate<{ productId: IProduct }>('productId')
        .exec();
      const item = projectWishlist((fresh ?? existing) as any);
      sendResponse(
        res,
        { item, added: false },
        'Product is already in your wishlist.',
        HTTP_STATUS.OK,
      );
      return;
    }

    const created = await Wishlist.create({
      userId,
      productId: body.productId,
    } as IWishlist);
    const fresh = await Wishlist.findById(created._id)
      .populate<{ productId: IProduct }>('productId')
      .exec();
    const item = projectWishlist((fresh ?? created) as any);
    sendResponse(
      res,
      { item, added: true },
      'Product added to wishlist successfully.',
      HTTP_STATUS.CREATED,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    if (
      err &&
      typeof err === 'object' &&
      (err as { code?: number }).code === 11000
    ) {
      return next(
        newAppError(
          'Product is already in your wishlist.',
          HTTP_STATUS.CONFLICT,
          ERROR_CODES.RESOURCE_EXISTS,
        ),
      );
    }
    return next(err);
  }
}

export async function removeFromWishlist(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const { id } = req.params;

    const removed = await Wishlist.findOneAndDelete({
      userId,
      $or: [{ _id: id }, { productId: id }],
    }).exec();

    if (!removed) {
      return next(
        newAppError(
          'Wishlist item not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }

    sendResponse(
      res,
      {
        removed: true,
        _id: String(removed._id),
        productId: String((removed as any).productId),
      },
      'Product removed from wishlist successfully.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function getWishlist(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);

    const docs = await Wishlist.find({ userId })
      .populate<{ productId: IProduct }>('productId')
      .sort({ createdAt: -1 })
      .exec();

    const items = docs.map(projectWishlist);
    sendResponse(
      res,
      { items, count: items.length },
      'Wishlist retrieved successfully.',
      HTTP_STATUS.OK,
      { count: items.length },
    );
    return;
  } catch (err) {
    return next(err);
  }
}

export async function isInWishlist(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const { id } = req.params;

    const exists = await Wishlist.exists({ userId, productId: id }).exec();
    sendResponse(
      res,
      {
        productId: id,
        inWishlist: !!exists,
      },
      exists ? 'Product is in wishlist.' : 'Product is not in wishlist.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}
