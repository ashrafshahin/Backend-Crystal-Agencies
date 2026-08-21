import type { Request, Response, NextFunction } from 'express';
import { Error, type Types } from 'mongoose';
import ProductRelationship from '../models/ProductRelationship';
import Product from '../models/Product';
import { ERROR_CODES, HTTP_STATUS } from '../utils/constants';
import { newAppError } from '../utils/error';
import { sendResponse } from '../utils/response';
import type {
  IProduct,
  IProductRelationship,
  RelationshipType,
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

const VALID_TYPES: RelationshipType[] = [
  'complementary',
  'compatible',
  'frequently_bought_together',
];

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

type ProjectedRelationship = Omit<
  IProductRelationship,
  'sourceProductId' | 'relatedProductId'
> & {
  _id: string;
  sourceProductId: ProjectedProduct | null | string;
  relatedProductId: ProjectedProduct | null | string;
};

function projectRelationship(
  doc: IProductRelationship & { _id: unknown },
  opts: { source?: boolean; related?: boolean } = {},
): ProjectedRelationship {
  return {
    _id: String(doc._id),
    sourceProductId:
      opts.source === false
        ? doc.sourceProductId
          ? String(doc.sourceProductId)
          : null
        : projectProduct(doc.sourceProductId) ??
          (doc.sourceProductId ? String(doc.sourceProductId) : null),
    relatedProductId:
      opts.related === false
        ? doc.relatedProductId
          ? String(doc.relatedProductId)
          : null
        : projectProduct(doc.relatedProductId) ??
          (doc.relatedProductId ? String(doc.relatedProductId) : null),
    type: doc.type,
    score: doc.score,
    isActive: doc.isActive,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function projectRecommendation(
  doc: IProductRelationship & { _id: unknown },
): {
  relationshipId: string;
  type: RelationshipType;
  score: number;
  product: ProjectedProduct | null;
} {
  return {
    relationshipId: String(doc._id),
    type: doc.type,
    score: doc.score,
    product: projectProduct(doc.relatedProductId),
  };
}

export async function getRelatedProducts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const typeRaw = req.query.type;
    const limitRaw = req.query.limit;

    let type: RelationshipType | undefined;
    if (typeRaw !== undefined) {
      if (
        typeof typeRaw !== 'string' ||
        !VALID_TYPES.includes(typeRaw as RelationshipType)
      ) {
        return next(
          validationAppError([
            {
              field: 'type',
              message:
                "type must be one of: 'complementary', 'compatible', 'frequently_bought_together'",
            },
          ]),
        );
      }
      type = typeRaw as RelationshipType;
    }
    let limit = 20;
    if (limitRaw !== undefined) {
      const parsed = parseInt(String(limitRaw), 10);
      if (Number.isNaN(parsed) || parsed < 1) {
        return next(
          validationAppError([
            { field: 'limit', message: 'limit must be a positive integer' },
          ]),
        );
      }
      limit = Math.min(parsed, 100);
    }

    const query: Record<string, unknown> = {
      sourceProductId: id,
      isActive: true,
    };
    if (type) query.type = type;

    const docs = await ProductRelationship.find(query)
      .populate<{ relatedProductId: IProduct }>('relatedProductId')
      .sort({ score: -1, createdAt: -1 })
      .limit(limit)
      .exec();

    const relationships = docs.map((d) => projectRelationship(d, { source: false }));
    sendResponse(
      res,
      { relationships, count: relationships.length },
      'Related products retrieved successfully.',
      HTTP_STATUS.OK,
      { count: relationships.length },
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function getAllRelationships(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const docs = await ProductRelationship.find()
      .populate<{ sourceProductId: IProduct }>('sourceProductId')
      .populate<{ relatedProductId: IProduct }>('relatedProductId')
      .sort({ createdAt: -1 })
      .limit(500)
      .exec();

    const relationships = docs.map((d) => projectRelationship(d));
    sendResponse(
      res,
      { relationships, count: relationships.length },
      'All product relationships retrieved successfully.',
      HTTP_STATUS.OK,
      { count: relationships.length },
    );
    return;
  } catch (err) {
    return next(err);
  }
}

type CreatePayload = {
  sourceProductId?: unknown;
  relatedProductId?: unknown;
  type?: unknown;
  score?: unknown;
  isActive?: unknown;
};

export async function createRelationship(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as CreatePayload;
    const errors: Array<{ field: string; message: string }> = [];

    if (
      typeof body.sourceProductId !== 'string' ||
      body.sourceProductId.trim().length === 0
    ) {
      errors.push({
        field: 'sourceProductId',
        message: 'sourceProductId is required (ObjectId string)',
      });
    }
    if (
      typeof body.relatedProductId !== 'string' ||
      body.relatedProductId.trim().length === 0
    ) {
      errors.push({
        field: 'relatedProductId',
        message: 'relatedProductId is required (ObjectId string)',
      });
    }
    if (
      typeof body.sourceProductId === 'string' &&
      typeof body.relatedProductId === 'string' &&
      body.sourceProductId === body.relatedProductId
    ) {
      errors.push({
        field: 'relatedProductId',
        message: 'relatedProductId must be different from sourceProductId',
      });
    }
    if (
      typeof body.type !== 'string' ||
      !VALID_TYPES.includes(body.type as RelationshipType)
    ) {
      errors.push({
        field: 'type',
        message:
          "type is required and must be one of: 'complementary', 'compatible', 'frequently_bought_together'",
      });
    }
    let score = 50;
    if (body.score !== undefined) {
      if (typeof body.score !== 'number' || Number.isNaN(body.score)) {
        errors.push({
          field: 'score',
          message: 'score must be a number between 0 and 100',
        });
      } else if (body.score < 0 || body.score > 100) {
        errors.push({
          field: 'score',
          message: 'score must be between 0 and 100',
        });
      } else {
        score = body.score;
      }
    }
    if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
      errors.push({
        field: 'isActive',
        message: 'isActive must be a boolean when provided',
      });
    }

    if (errors.length > 0) return next(validationAppError(errors));

    const [source, related] = await Promise.all([
      Product.findById(body.sourceProductId).exec(),
      Product.findById(body.relatedProductId).exec(),
    ]);
    if (!source) {
      errors.push({
        field: 'sourceProductId',
        message: 'Source product does not exist',
      });
    }
    if (!related) {
      errors.push({
        field: 'relatedProductId',
        message: 'Related product does not exist',
      });
    }
    if (errors.length > 0) return next(validationAppError(errors));

    const data: IProductRelationship = {
      sourceProductId: body.sourceProductId! as string,
      relatedProductId: body.relatedProductId! as string,
      type: body.type as RelationshipType,
      score,
      isActive: typeof body.isActive === 'boolean' ? body.isActive : true,
    };

    const created = await ProductRelationship.create(data);
    const fresh = await ProductRelationship.findById(created._id)
      .populate<{ sourceProductId: IProduct }>('sourceProductId')
      .populate<{ relatedProductId: IProduct }>('relatedProductId')
      .exec();

    const relationship = projectRelationship((fresh ?? created) as any);
    sendResponse(
      res,
      { relationship },
      'Product relationship created successfully.',
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
          'A relationship with the same source/type/related product already exists.',
          HTTP_STATUS.CONFLICT,
          ERROR_CODES.RESOURCE_EXISTS,
          
        ),
      );
    }
    return next(err);
  }
}

type UpdatePayload = {
  type?: unknown;
  score?: unknown;
  isActive?: unknown;
};

export async function updateRelationship(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const doc = await ProductRelationship.findById(id).exec();
    if (!doc) {
      return next(
        newAppError(
          'Product relationship not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }
    const body = req.body as UpdatePayload;
    const errors: Array<{ field: string; message: string }> = [];

    if (body.type !== undefined) {
      if (
        typeof body.type !== 'string' ||
        !VALID_TYPES.includes(body.type as RelationshipType)
      ) {
        errors.push({
          field: 'type',
          message:
            "type must be one of: 'complementary', 'compatible', 'frequently_bought_together'",
        });
      } else {
        doc.type = body.type as RelationshipType;
      }
    }
    if (body.score !== undefined) {
      if (typeof body.score !== 'number' || Number.isNaN(body.score)) {
        errors.push({
          field: 'score',
          message: 'score must be a number between 0 and 100',
        });
      } else if (body.score < 0 || body.score > 100) {
        errors.push({
          field: 'score',
          message: 'score must be between 0 and 100',
        });
      } else {
        doc.score = body.score;
      }
    }
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') {
        errors.push({
          field: 'isActive',
          message: 'isActive must be a boolean when provided',
        });
      } else {
        doc.isActive = body.isActive;
      }
    }
    if (errors.length > 0) return next(validationAppError(errors));

    const working = doc as unknown as IProductRelationship & {
      _id: Types.ObjectId;
      save: () => Promise<unknown>;
    };
    await working.save();

    const fresh = await ProductRelationship.findById(working._id)
      .populate<{ sourceProductId: IProduct }>('sourceProductId')
      .populate<{ relatedProductId: IProduct }>('relatedProductId')
      .exec();
    const relationship = projectRelationship((fresh ?? working) as any);
    sendResponse(
      res,
      { relationship },
      'Product relationship updated successfully.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function deleteRelationship(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const mode = (req.query.soft === 'false') ? 'hard' : 'soft';

    const doc = await ProductRelationship.findById(id).exec();
    if (!doc) {
      return next(
        newAppError(
          'Product relationship not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }

    if (mode === 'soft') {
      const working = doc as unknown as {
        isActive: boolean;
        save: () => Promise<unknown>;
      };
      working.isActive = false;
      await working.save();
      sendResponse(
        res,
        {
          deleted: true,
          mode: 'soft',
          _id: id,
        },
        'Product relationship soft-deactivated successfully.',
        HTTP_STATUS.OK,
      );
      return;
    }

    await ProductRelationship.deleteOne({ _id: id }).exec();
    sendResponse(
      res,
      {
        deleted: true,
        mode: 'hard',
        _id: id,
      },
      'Product relationship permanently deleted.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function getRecommendations(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const limitRaw = req.query.limit;
    let limit = 12;
    if (limitRaw !== undefined) {
      const parsed = parseInt(String(limitRaw), 10);
      if (Number.isNaN(parsed) || parsed < 1) {
        return next(
          validationAppError([
            { field: 'limit', message: 'limit must be a positive integer' },
          ]),
        );
      }
      limit = Math.min(parsed, 50);
    }

    const docs = await ProductRelationship.find({
      sourceProductId: id,
      isActive: true,
    })
      .populate<{ relatedProductId: IProduct }>('relatedProductId')
      .sort({ score: -1, createdAt: -1 })
      .limit(limit)
      .exec();

    const recommendations = docs.map(projectRecommendation);
    sendResponse(
      res,
      {
        productId: id,
        recommendations,
        count: recommendations.length,
      },
      'Product recommendations retrieved successfully.',
      HTTP_STATUS.OK,
      { count: recommendations.length },
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}
