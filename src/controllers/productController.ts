import type { Request, Response, NextFunction } from 'express';
import { Error, type Types } from 'mongoose';
import Product from '../models/Product';
import Category from '../models/Category';
import Brand from '../models/Brand';
import { ERROR_CODES, HTTP_STATUS } from '../utils/constants';
import { newAppError } from '../utils/error';
import { sendResponse } from '../utils/response';
import type {
  ICategory,
  IBrand,
  IProduct,
  IBulkPriceTier,
  IProductRating,
  AuthenticatedRequest,
} from '../types';

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

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

function projectCategoryRef(ref: unknown): (ICategory & { _id: string }) | null {
  if (!ref || typeof ref !== 'object') return null;
  const r = ref as ICategory & { _id: unknown };
  if (!('name' in r) || typeof r.name !== 'string') return null;
  return {
    _id: String(r._id),
    name: r.name,
    slug: r.slug,
    description: r.description,
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function projectBrandRef(ref: unknown): (IBrand & { _id: string }) | null {
  if (!ref || typeof ref !== 'object') return null;
  const r = ref as IBrand & { _id: unknown };
  if (!('name' in r) || typeof r.name !== 'string') return null;
  return {
    _id: String(r._id),
    name: r.name,
    slug: r.slug,
    logo: r.logo,
    description: r.description,
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function projectRating(r: IProductRating & { _id?: unknown }) {
  return {
    _id: String(r._id),
    user: r.user && typeof r.user === 'object' && 'name' in r.user
      ? { _id: String((r.user as { _id: unknown })._id), name: (r.user as { name: string }).name }
      : r.user ? String(r.user) : null,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt,
  };
}

type ProjectedProduct = IProduct & {
  _id: string;
  category: (ICategory & { _id: string }) | null;  // Allow null
  brand: (IBrand & { _id: string }) | null;  // Allow null
  bulkPrices?: Array<Omit<IBulkPriceTier, '_id'> & { _id: string }>;
  ratings?: Array<{
    _id: string;
    user: string | { _id: string; name: string } | null;  // Allow null
    rating: number;
    comment?: string;
    createdAt?: Date;
  }>;
  createdBy?: string;
  updatedBy?: string;
};

function projectProduct(doc: IProduct & { _id: unknown; ratings?: unknown[]; bulkPrices?: unknown[] }): ProjectedProduct {
  return {
    _id: String(doc._id),
    name: doc.name,
    sku: doc.sku,
    description: doc.description,
    slug: doc.slug,
    category: projectCategoryRef(doc.category),
    brand: projectBrandRef(doc.brand),
    basePrice: doc.basePrice,
    discountedPrice: doc.discountedPrice,
    discountPercent: doc.discountPercent,
    images: Array.isArray(doc.images) ? doc.images : [],
    attributes: doc.attributes ?? {},
    stock: doc.stock,
    isActive: doc.isActive,
    ratings: Array.isArray(doc.ratings) ? (doc.ratings as (IProductRating & { _id?: unknown })[]).map(projectRating) : [],
    createdBy: doc.createdBy ? String(doc.createdBy) : undefined,
    updatedBy: doc.updatedBy ? String(doc.updatedBy) : undefined,
    type: doc.type,
    moq: doc.moq,
    bulkPrices: Array.isArray(doc.bulkPrices)
      ? (doc.bulkPrices as (IBulkPriceTier & { _id?: unknown })[]).map((bp) => ({
          _id: String(bp._id),
          quantity: bp.quantity,
          price: bp.price,
        }))
      : [],
    leadTime: doc.leadTime,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function parseBulkPrices(value: unknown): Array<{ quantity: number; price: number }> | null {
  if (!Array.isArray(value)) return null;
  const result: Array<{ quantity: number; price: number }> = [];
  for (const item of value) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof (item as { quantity?: unknown }).quantity !== 'number' ||
      typeof (item as { price?: unknown }).price !== 'number'
    ) {
      return null;
    }
    result.push({
      quantity: (item as { quantity: number }).quantity,
      price: (item as { price: number }).price,
    });
  }
  return result;
}

type CreatePayload = {
  name?: unknown;
  sku?: unknown;
  description?: unknown;
  category?: unknown;
  brand?: unknown;
  basePrice?: unknown;
  discountedPrice?: unknown;
  discountPercent?: unknown;
  images?: unknown;
  attributes?: unknown;
  stock?: unknown;
  isActive?: unknown;
  type?: unknown;
  moq?: unknown;
  bulkPrices?: unknown;
  leadTime?: unknown;
};

export async function createProduct(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as CreatePayload;
    const fieldErrors: Array<{ field: string; message: string }> = [];

    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      fieldErrors.push({ field: 'name', message: 'Name is required' });
    }
    if (typeof body.sku !== 'string' || body.sku.trim().length === 0) {
      fieldErrors.push({ field: 'sku', message: 'SKU is required' });
    }
    if (typeof body.category !== 'string' || body.category.length === 0) {
      fieldErrors.push({ field: 'category', message: 'Category is required' });
    }
    if (typeof body.brand !== 'string' || body.brand.length === 0) {
      fieldErrors.push({ field: 'brand', message: 'Brand is required' });
    }
    if (typeof body.basePrice !== 'number' || body.basePrice < 0 || Number.isNaN(body.basePrice)) {
      fieldErrors.push({ field: 'basePrice', message: 'Base price must be a non-negative number' });
    }
    if (body.discountedPrice !== undefined && (typeof body.discountedPrice !== 'number' || body.discountedPrice < 0)) {
      fieldErrors.push({ field: 'discountedPrice', message: 'Discounted price must be a non-negative number' });
    }
    if (body.discountPercent !== undefined && (typeof body.discountPercent !== 'number' || body.discountPercent < 0 || body.discountPercent > 100)) {
      fieldErrors.push({ field: 'discountPercent', message: 'Discount percent must be between 0 and 100' });
    }
    if (body.stock !== undefined && (typeof body.stock !== 'number' || body.stock < 0 || Number.isNaN(body.stock))) {
      fieldErrors.push({ field: 'stock', message: 'Stock must be a non-negative integer' });
    }
    if (body.type !== undefined && !['b2b', 'b2c', 'both'].includes(body.type as string)) {
      fieldErrors.push({ field: 'type', message: 'Type must be one of: b2b, b2c, both' });
    }
    if (body.moq !== undefined && (typeof body.moq !== 'number' || body.moq < 1 || !Number.isFinite(body.moq))) {
      fieldErrors.push({ field: 'moq', message: 'MOQ must be a positive integer' });
    }
    if (body.leadTime !== undefined && (typeof body.leadTime !== 'number' || body.leadTime < 0 || !Number.isFinite(body.leadTime))) {
      fieldErrors.push({ field: 'leadTime', message: 'Lead time must be a non-negative number' });
    }
    if (body.bulkPrices !== undefined && parseBulkPrices(body.bulkPrices) === null) {
      fieldErrors.push({ field: 'bulkPrices', message: 'Bulk prices must be an array of { quantity: number, price: number } entries' });
    }

    if (fieldErrors.length > 0) {
      return next(validationAppError(fieldErrors));
    }

    const categoryId = body.category as string;
    const brandId = body.brand as string;
    const [categoryDoc, brandDoc] = await Promise.all([
      Category.findById(categoryId).exec(),
      Brand.findById(brandId).exec(),
    ]);
    if (!categoryDoc) {
      fieldErrors.push({ field: 'category', message: 'Category does not exist' });
    }
    if (!brandDoc) {
      fieldErrors.push({ field: 'brand', message: 'Brand does not exist' });
    }
    if (fieldErrors.length > 0) {
      return next(validationAppError(fieldErrors));
    }

    const trimmedName = (body.name as string).trim();
    const slug = slugify(trimmedName);

    const authReq = req as AuthenticatedRequest;
    const createdBy = authReq.user?._id;

    const created = await Product.create({
      name: trimmedName,
      sku: (body.sku as string).trim(),
      description: typeof body.description === 'string' ? body.description.trim() || undefined : undefined,
      slug,
      category: categoryId as unknown as Types.ObjectId,
      brand: brandId as unknown as Types.ObjectId,
      basePrice: body.basePrice as number,
      discountedPrice: body.discountedPrice as number | undefined,
      discountPercent: body.discountPercent as number | undefined,
      images: Array.isArray(body.images) ? (body.images as unknown[]).filter((x): x is string => typeof x === 'string') : [],
      attributes: body.attributes && typeof body.attributes === 'object' && !Array.isArray(body.attributes) ? (body.attributes as Record<string, unknown>) : {},
      stock: typeof body.stock === 'number' ? Math.floor(body.stock) : 0,
      isActive: typeof body.isActive === 'boolean' ? body.isActive : true,
      ratings: [],
      createdBy: createdBy as unknown as Types.ObjectId | undefined,
      type: (body.type ?? 'both') as 'b2b' | 'b2c' | 'both',
      moq: body.moq as number | undefined,
      bulkPrices: parseBulkPrices(body.bulkPrices) ?? [],
      leadTime: body.leadTime as number | undefined,
    });

    const populated = await Product.findById(created._id).populate<{ category: ICategory; brand: IBrand }>('category brand').exec();
    const product = projectProduct(populated ?? created);
    sendResponse(
      _res,
      { product },
      'Product created successfully.',
      HTTP_STATUS.CREATED,
    );
    return;
  } catch (err) {
    return next(err);
  }
}

function buildFilterFromQuery(q: Request['query']) {
  const filter: Record<string, unknown> = {};
  if (typeof q.category === 'string' && q.category.length > 0) {
    filter.category = q.category;
  }
  if (typeof q.brand === 'string' && q.brand.length > 0) {
    filter.brand = q.brand;
  }
  if (q.isActive !== undefined) {
    filter.isActive = q.isActive === 'true';
  } else {
    filter.isActive = true;
  }
  if (typeof q.type === 'string' && ['b2b', 'b2c', 'both'].includes(q.type)) {
    filter.type = q.type;
  }
  if (typeof q.search === 'string' && q.search.length > 0) {
    filter.$or = [
      { name: { $regex: q.search, $options: 'i' } },
      { description: { $regex: q.search, $options: 'i' } },
    ];
  }
  if (typeof q.minPrice === 'string' || typeof q.maxPrice === 'string') {
    const priceFilter: Record<string, number> = {};
    if (typeof q.minPrice === 'string' && !Number.isNaN(Number(q.minPrice))) {
      priceFilter.$gte = Number(q.minPrice);
    }
    if (typeof q.maxPrice === 'string' && !Number.isNaN(Number(q.maxPrice))) {
      priceFilter.$lte = Number(q.maxPrice);
    }
    if (Object.keys(priceFilter).length > 0) {
      filter.$or = [
        { discountedPrice: priceFilter },
        { discountedPrice: { $exists: false }, basePrice: priceFilter },
      ];
    }
  }
  return filter;
}

export async function getAllProducts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const filter = buildFilterFromQuery(req.query);

    const page = typeof req.query.page === 'string' && !Number.isNaN(Number(req.query.page)) ? Math.max(1, Number(req.query.page)) : undefined;
    const limit = typeof req.query.limit === 'string' && !Number.isNaN(Number(req.query.limit)) ? Math.max(1, Number(req.query.limit)) : undefined;

    const query = Product.find(filter).populate<{ category: ICategory; brand: IBrand }>('category brand');
    if (page && limit) {
      query.skip((page - 1) * limit).limit(limit);
    }

    const [docs, total] = await Promise.all([
      query.exec(),
      Product.countDocuments(filter).exec(),
    ]);

    const products = docs.map(projectProduct);
    const meta: Record<string, unknown> = {
      count: products.length,
      total,
    };
    if (page && limit) {
      meta.page = page;
      meta.limit = limit;
      meta.pages = Math.ceil(total / limit);
    }

    sendResponse(
      res,
      { products, count: products.length },
      'Products retrieved successfully.',
      HTTP_STATUS.OK,
      meta,
    );
    return;
  } catch (err) {
    return next(err);
  }
}

export async function searchProducts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const filter = buildFilterFromQuery(req.query);
    if (filter.$or === undefined && typeof req.query.q === 'string' && req.query.q.length > 0) {
      filter.$or = [
        { name: { $regex: req.query.q, $options: 'i' } },
        { description: { $regex: req.query.q, $options: 'i' } },
      ];
    }

    const page = typeof req.query.page === 'string' && !Number.isNaN(Number(req.query.page)) ? Math.max(1, Number(req.query.page)) : undefined;
    const limit = typeof req.query.limit === 'string' && !Number.isNaN(Number(req.query.limit)) ? Math.max(1, Number(req.query.limit)) : undefined;

    const query = Product.find(filter).populate<{ category: ICategory; brand: IBrand }>('category brand');
    if (page && limit) {
      query.skip((page - 1) * limit).limit(limit);
    }

    const [docs, total] = await Promise.all([
      query.exec(),
      Product.countDocuments(filter).exec(),
    ]);

    const products = docs.map(projectProduct);
    const meta: Record<string, unknown> = {
      count: products.length,
      total,
    };
    if (page && limit) {
      meta.page = page;
      meta.limit = limit;
      meta.pages = Math.ceil(total / limit);
    }

    sendResponse(
      res,
      { products, count: products.length },
      'Product search completed.',
      HTTP_STATUS.OK,
      meta,
    );
    return;
  } catch (err) {
    return next(err);
  }
}

export async function getProductById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const doc = await Product.findById(id)
      .populate<{ category: ICategory; brand: IBrand }>('category brand')
      .populate<{ ratings: (IProductRating & { user: { _id: string; name: string } })[] }>('ratings.user', '_id name')
      .exec();
    if (!doc) {
      return next(
        newAppError('Product not found.', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND),
      );
    }
    const product = projectProduct(doc as any);
    sendResponse(res, { product }, 'Product retrieved successfully.', HTTP_STATUS.OK);
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function updateProduct(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const body = req.body as CreatePayload & {
      slug?: unknown;
      attributes?: unknown;
    };
    const fieldErrors: Array<{ field: string; message: string }> = [];

    if (body.name !== undefined && (typeof body.name !== 'string' || body.name.trim().length === 0)) {
      fieldErrors.push({ field: 'name', message: 'Name must be a non-empty string' });
    }
    if (body.sku !== undefined && (typeof body.sku !== 'string' || body.sku.trim().length === 0)) {
      fieldErrors.push({ field: 'sku', message: 'SKU must be a non-empty string' });
    }
    if (body.basePrice !== undefined && (typeof body.basePrice !== 'number' || body.basePrice < 0 || Number.isNaN(body.basePrice))) {
      fieldErrors.push({ field: 'basePrice', message: 'Base price must be a non-negative number' });
    }
    if (body.discountedPrice !== undefined && (typeof body.discountedPrice !== 'number' || body.discountedPrice < 0)) {
      fieldErrors.push({ field: 'discountedPrice', message: 'Discounted price must be a non-negative number' });
    }
    if (body.discountPercent !== undefined && (typeof body.discountPercent !== 'number' || body.discountPercent < 0 || body.discountPercent > 100)) {
      fieldErrors.push({ field: 'discountPercent', message: 'Discount percent must be between 0 and 100' });
    }
    if (body.stock !== undefined && (typeof body.stock !== 'number' || body.stock < 0 || Number.isNaN(body.stock))) {
      fieldErrors.push({ field: 'stock', message: 'Stock must be a non-negative integer' });
    }
    if (body.type !== undefined && !['b2b', 'b2c', 'both'].includes(body.type as string)) {
      fieldErrors.push({ field: 'type', message: 'Type must be one of: b2b, b2c, both' });
    }
    if (body.moq !== undefined && (typeof body.moq !== 'number' || body.moq < 1 || !Number.isFinite(body.moq))) {
      fieldErrors.push({ field: 'moq', message: 'MOQ must be a positive integer' });
    }
    if (body.leadTime !== undefined && (typeof body.leadTime !== 'number' || body.leadTime < 0 || !Number.isFinite(body.leadTime))) {
      fieldErrors.push({ field: 'leadTime', message: 'Lead time must be a non-negative number' });
    }
    if (body.bulkPrices !== undefined && parseBulkPrices(body.bulkPrices) === null) {
      fieldErrors.push({ field: 'bulkPrices', message: 'Bulk prices must be an array of { quantity: number, price: number } entries' });
    }

    if (fieldErrors.length > 0) {
      return next(validationAppError(fieldErrors));
    }

    const doc = await Product.findById(id).exec();
    if (!doc) {
      return next(
        newAppError('Product not found.', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND),
      );
    }

    if (typeof body.name === 'string') {
      const trimmedName = body.name.trim();
      doc.name = trimmedName;
      doc.slug = slugify(trimmedName);
    }
    if (typeof body.sku === 'string') {
      doc.sku = body.sku.trim();
    }
    if (typeof body.description === 'string') {
      doc.description = body.description.trim() || undefined;
    }
    if (typeof body.basePrice === 'number') {
      doc.basePrice = body.basePrice;
    }
    if (body.discountedPrice === null || body.discountedPrice === undefined) {
      if (body.discountedPrice !== undefined) doc.discountedPrice = undefined;
    } else if (typeof body.discountedPrice === 'number') {
      doc.discountedPrice = body.discountedPrice;
    }
    if (body.discountPercent === null || body.discountPercent === undefined) {
      if (body.discountPercent !== undefined) doc.discountPercent = undefined;
    } else if (typeof body.discountPercent === 'number') {
      doc.discountPercent = body.discountPercent;
    }
    if (Array.isArray(body.images)) {
      doc.images = (body.images as unknown[]).filter((x): x is string => typeof x === 'string');
    }
    if (body.attributes && typeof body.attributes === 'object' && !Array.isArray(body.attributes)) {
      doc.attributes = body.attributes as Record<string, unknown>;
    }
    if (typeof body.stock === 'number') {
      doc.stock = Math.floor(body.stock);
    }
    if (typeof body.isActive === 'boolean') {
      doc.isActive = body.isActive;
    }
    if (body.type !== undefined && ['b2b', 'b2c', 'both'].includes(body.type as string)) {
      doc.type = body.type as 'b2b' | 'b2c' | 'both';
    }
    if (body.moq === null || body.moq === undefined) {
      if (body.moq !== undefined) doc.moq = undefined;
    } else if (typeof body.moq === 'number') {
      doc.moq = body.moq;
    }
    const parsedBulk = parseBulkPrices(body.bulkPrices);
    if (parsedBulk !== null) {
      doc.bulkPrices = parsedBulk as unknown as typeof doc.bulkPrices;
    }
    if (body.leadTime === null || body.leadTime === undefined) {
      if (body.leadTime !== undefined) doc.leadTime = undefined;
    } else if (typeof body.leadTime === 'number') {
      doc.leadTime = body.leadTime;
    }

    const authReq = req as AuthenticatedRequest;
    if (authReq.user?._id) {
      doc.updatedBy = authReq.user._id as unknown as Types.ObjectId;
    }

    const updated = await doc.save();
    const populated = await Product.findById(updated._id)
      .populate<{ category: ICategory; brand: IBrand }>('category brand')
      .populate<{ ratings: (IProductRating & { user: { _id: string; name: string } })[] }>('ratings.user', '_id name')
      .exec();

    const product = projectProduct((populated ?? updated) as any);
    sendResponse(res, { product }, 'Product updated successfully.', HTTP_STATUS.OK);
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function deleteProduct(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const deleted = await Product.findByIdAndDelete(id).exec();
    if (!deleted) {
      return next(
        newAppError('Product not found.', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND),
      );
    }
    sendResponse(res, null, 'Product deleted successfully.', HTTP_STATUS.OK);
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}
