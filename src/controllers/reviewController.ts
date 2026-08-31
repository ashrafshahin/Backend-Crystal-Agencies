import type { Request, Response, NextFunction } from 'express';
import { Error, Types } from 'mongoose';
import Review from '../models/Review';
import Product from '../models/Product';
import { ERROR_CODES, HTTP_STATUS } from '../utils/constants';
import { newAppError } from '../utils/error';
import { sendResponse } from '../utils/response';
import type {
  AuthenticatedRequest,
  IReview,
  IProduct,
  IUser,
  ReviewStatus,
} from '../types';

const VALID_REVIEW_STATUSES: ReviewStatus[] = ['pending', 'approved', 'rejected'];

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

type ProjectedUser = {
  _id: string;
  name: string;
};

function projectUser(ref: unknown): ProjectedUser | null {
  if (!ref || typeof ref !== 'object') return null;
  const r = ref as IUser & { _id: unknown };
  if (!('name' in r) || typeof r.name !== 'string') return null;
  return {
    _id: String(r._id),
    name: r.name,
  };
}

type ProjectedProduct = {
  _id: string;
  name: string;
  sku: string;
  slug: string;
  isActive: boolean;
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
  };
}

type ProjectedReview = Omit<IReview, 'productId' | 'userId'> & {
  _id: string;
  product: ProjectedProduct | null;
  user: ProjectedUser | null;
};

function projectReview(
  doc: IReview & { _id: unknown },
): ProjectedReview {
  return {
    _id: String(doc._id),
    product: projectProduct(doc.productId),
    user: projectUser(doc.userId),
    rating: doc.rating,
    title: doc.title,
    content: doc.content,
    helpful: doc.helpful,
    status: doc.status,
    moderationNote: doc.moderationNote,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function recalcProductRating(productId: string): Promise<void> {
  const stats = await Review.aggregate([
    { $match: { productId: new Types.ObjectId(productId), status: 'approved' as ReviewStatus } },
    {
      $group: {
        _id: '$productId',
        avgRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 },
      },
    },
  ]).exec();

  const avgRating = stats.length > 0 ? Math.round(stats[0].avgRating * 100) / 100 : 0;
  const totalReviews = stats.length > 0 ? stats[0].totalReviews : 0;

  await Product.findByIdAndUpdate(
    productId,
    { avgRating, totalReviews },
    { new: false },
  ).exec();
}

export async function createReview(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const body = req.body as {
      productId?: unknown;
      rating?: unknown;
      title?: unknown;
      content?: unknown;
    };
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

    if (typeof body.rating !== 'number' || !Number.isFinite(body.rating)) {
      errors.push({
        field: 'rating',
        message: 'rating is required (number 1-5)',
      });
    } else if (body.rating < 1 || body.rating > 5) {
      errors.push({
        field: 'rating',
        message: 'rating must be between 1 and 5',
      });
    }

    if (body.title !== undefined && typeof body.title !== 'string') {
      errors.push({
        field: 'title',
        message: 'title must be a string when provided',
      });
    }

    if (body.content !== undefined && typeof body.content !== 'string') {
      errors.push({
        field: 'content',
        message: 'content must be a string when provided',
      });
    }

    if (errors.length > 0) {
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

    const existing = await Review.findOne({
      productId: body.productId as string,
      userId,
    }).exec();

    if (existing) {
      return next(
        newAppError(
          'You have already reviewed this product.',
          HTTP_STATUS.CONFLICT,
          ERROR_CODES.RESOURCE_EXISTS,
        ),
      );
    }

    const created = await Review.create({
      productId: body.productId as string,
      userId,
      rating: body.rating,
      title: body.title as string | undefined,
      content: body.content as string | undefined,
      helpful: 0,
      status: 'pending',
    } as IReview);

    const fresh = await Review.findById(created._id)
      .populate<{ productId: IProduct }>('productId')
      .populate<{ userId: IUser }>('userId')
      .exec();

    const item = projectReview((fresh ?? created) as any);

    sendResponse(
      res,
      { item },
      'Review submitted successfully and is pending moderation.',
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
          'You have already reviewed this product.',
          HTTP_STATUS.CONFLICT,
          ERROR_CODES.RESOURCE_EXISTS,
        ),
      );
    }
    return next(err);
  }
}

export async function getProductReviews(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

    const docs = await Review.find({
      productId: id,
      status: 'approved',
    })
      .populate<{ productId: IProduct }>('productId')
      .populate<{ userId: IUser }>('userId')
      .sort({ helpful: -1, createdAt: -1 })
      .exec();

    const items = docs.map(projectReview);
    sendResponse(
      res,
      { items, count: items.length },
      'Approved product reviews retrieved successfully.',
      HTTP_STATUS.OK,
      { count: items.length },
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function updateReview(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const { id } = req.params;
    const body = req.body as {
      rating?: unknown;
      title?: unknown;
      content?: unknown;
    };
    const errors: Array<{ field: string; message: string }> = [];

    const review = await Review.findById(id).exec();
    if (!review) {
      return next(
        newAppError(
          'Review not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }

    if (String(review.userId) !== userId) {
      return next(
        newAppError(
          'You are not authorized to update this review.',
          HTTP_STATUS.FORBIDDEN,
          ERROR_CODES.FORBIDDEN,
        ),
      );
    }

    const updateData: Partial<IReview> = {};

    if (body.rating !== undefined) {
      if (typeof body.rating !== 'number' || !Number.isFinite(body.rating)) {
        errors.push({
          field: 'rating',
          message: 'rating must be a number 1-5 when provided',
        });
      } else if (body.rating < 1 || body.rating > 5) {
        errors.push({
          field: 'rating',
          message: 'rating must be between 1 and 5',
        });
      } else {
        updateData.rating = body.rating;
      }
    }

    if (body.title !== undefined) {
      if (typeof body.title !== 'string') {
        errors.push({
          field: 'title',
          message: 'title must be a string when provided',
        });
      } else {
        updateData.title = body.title;
      }
    }

    if (body.content !== undefined) {
      if (typeof body.content !== 'string') {
        errors.push({
          field: 'content',
          message: 'content must be a string when provided',
        });
      } else {
        updateData.content = body.content;
      }
    }

    if (errors.length > 0) {
      return next(validationAppError(errors));
    }

    if (Object.keys(updateData).length > 0) {
      updateData.status = 'pending';
      Object.assign(review, updateData);
      await review.save();
    }

    const fresh = await Review.findById(review._id)
      .populate<{ productId: IProduct }>('productId')
      .populate<{ userId: IUser }>('userId')
      .exec();

    const item = projectReview((fresh ?? review) as any);

    if (Object.keys(updateData).length > 0 && updateData.status === 'pending') {
      await recalcProductRating(String(review.productId));
    }

    sendResponse(
      res,
      { item },
      'Review updated successfully and is pending re-moderation.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    if (err instanceof Error.ValidationError) return next(err);
    return next(err);
  }
}

export async function deleteReview(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const userPerms: string[] = Array.isArray(authReq.user.permissions)
      ? authReq.user.permissions
      : [];
    const isAdmin =
      userPerms.includes('*') || userPerms.includes('products:manage');
    const { id } = req.params;

    const review = await Review.findById(id).exec();
    if (!review) {
      return next(
        newAppError(
          'Review not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }

    const isAuthor = String(review.userId) === userId;
    if (!isAuthor && !isAdmin) {
      return next(
        newAppError(
          'You are not authorized to delete this review.',
          HTTP_STATUS.FORBIDDEN,
          ERROR_CODES.FORBIDDEN,
        ),
      );
    }

    const productId = String(review.productId);
    const wasApproved = review.status === 'approved';

    await Review.findByIdAndDelete(id).exec();

    if (wasApproved) {
      await recalcProductRating(productId);
    }

    sendResponse(
      res,
      { removed: true, _id: id },
      'Review deleted successfully.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function approveReview(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

    const review = await Review.findById(id).exec();
    if (!review) {
      return next(
        newAppError(
          'Review not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }

    review.status = 'approved';
    review.moderationNote = undefined;
    await review.save();

    await recalcProductRating(String(review.productId));

    const fresh = await Review.findById(review._id)
      .populate<{ productId: IProduct }>('productId')
      .populate<{ userId: IUser }>('userId')
      .exec();

    const item = projectReview((fresh ?? review) as any);

    sendResponse(
      res,
      { item },
      'Review approved successfully.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    if (err instanceof Error.ValidationError) return next(err);
    return next(err);
  }
}

export async function rejectReview(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const body = req.body as { reason?: unknown };
    const errors: Array<{ field: string; message: string }> = [];

    if (body.reason !== undefined && typeof body.reason !== 'string') {
      errors.push({
        field: 'reason',
        message: 'reason must be a string when provided',
      });
      return next(validationAppError(errors));
    }

    const review = await Review.findById(id).exec();
    if (!review) {
      return next(
        newAppError(
          'Review not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }

    const wasApproved = review.status === 'approved';
    review.status = 'rejected';
    if (typeof body.reason === 'string' && body.reason.trim().length > 0) {
      review.moderationNote = body.reason;
    }
    await review.save();

    if (wasApproved) {
      await recalcProductRating(String(review.productId));
    }

    const fresh = await Review.findById(review._id)
      .populate<{ productId: IProduct }>('productId')
      .populate<{ userId: IUser }>('userId')
      .exec();

    const item = projectReview((fresh ?? review) as any);

    sendResponse(
      res,
      { item },
      'Review rejected successfully.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    if (err instanceof Error.ValidationError) return next(err);
    return next(err);
  }
}

export async function markHelpful(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

    const review = await Review.findById(id).exec();
    if (!review) {
      return next(
        newAppError(
          'Review not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }

    review.helpful = (review.helpful || 0) + 1;
    await review.save();

    const fresh = await Review.findById(review._id)
      .populate<{ productId: IProduct }>('productId')
      .populate<{ userId: IUser }>('userId')
      .exec();

    const item = projectReview((fresh ?? review) as any);

    sendResponse(
      res,
      { item, helpful: review.helpful },
      'Review marked as helpful.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}
