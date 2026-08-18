import type { Request, Response, NextFunction } from 'express';
import { Error } from 'mongoose';
import Brand from '../models/Brand';
import { ERROR_CODES, HTTP_STATUS } from '../utils/constants';
import { newAppError } from '../utils/error';
import { sendResponse } from '../utils/response';
import type { IBrand } from '../types';

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

function projectBrand(doc: IBrand & { _id: unknown }): IBrand & { _id: string } {
  return {
    _id: String(doc._id),
    name: doc.name,
    slug: doc.slug,
    logo: doc.logo,
    description: doc.description,
    isActive: doc.isActive,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function createBrand(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { name, logo, description, isActive } = req.body as {
      name?: unknown;
      logo?: unknown;
      description?: unknown;
      isActive?: unknown;
    };

    const fieldErrors: Array<{ field: string; message: string }> = [];
    if (typeof name !== 'string' || name.trim().length === 0) {
      fieldErrors.push({ field: 'name', message: 'Name is required' });
    }
    if (fieldErrors.length > 0) {
      return next(validationAppError(fieldErrors));
    }

    const trimmedName = (name as string).trim();
    const slug = slugify(trimmedName);

    const created = await Brand.create({
      name: trimmedName,
      slug,
      logo: typeof logo === 'string' ? logo.trim() || undefined : undefined,
      description: typeof description === 'string' ? description.trim() || undefined : undefined,
      isActive: typeof isActive === 'boolean' ? isActive : true,
    });

    const brand = projectBrand(created);
    sendResponse(
      _res,
      { brand },
      'Brand created successfully.',
      HTTP_STATUS.CREATED,
    );
    return;
  } catch (err) {
    return next(err);
  }
}

export async function getAllBrands(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const docs = await Brand.find({ isActive: true }).exec();
    const brands = docs.map((d) => projectBrand(d));
    sendResponse(
      res,
      { brands, count: brands.length },
      'Brands retrieved successfully.',
      HTTP_STATUS.OK,
      { count: brands.length },
    );
    return;
  } catch (err) {
    return next(err);
  }
}

export async function getBrandById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const doc = await Brand.findById(id).exec();
    if (!doc) {
      return next(
        newAppError('Brand not found.', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND),
      );
    }
    const brand = projectBrand(doc);
    sendResponse(res, { brand }, 'Brand retrieved successfully.', HTTP_STATUS.OK);
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function updateBrand(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const { name, logo, description, isActive } = req.body as {
      name?: unknown;
      logo?: unknown;
      description?: unknown;
      isActive?: unknown;
    };

    const fieldErrors: Array<{ field: string; message: string }> = [];
    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
      fieldErrors.push({ field: 'name', message: 'Name must be a non-empty string' });
    }
    if (fieldErrors.length > 0) {
      return next(validationAppError(fieldErrors));
    }

    const doc = await Brand.findById(id).exec();
    if (!doc) {
      return next(
        newAppError('Brand not found.', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND),
      );
    }

    if (typeof name === 'string') {
      const trimmedName = name.trim();
      doc.name = trimmedName;
      doc.slug = slugify(trimmedName);
    }
    if (typeof logo === 'string') {
      doc.logo = logo.trim() || undefined;
    }
    if (typeof description === 'string') {
      doc.description = description.trim() || undefined;
    }
    if (typeof isActive === 'boolean') {
      doc.isActive = isActive;
    }

    const updated = await doc.save();
    const brand = projectBrand(updated);
    sendResponse(res, { brand }, 'Brand updated successfully.', HTTP_STATUS.OK);
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function deleteBrand(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const deleted = await Brand.findByIdAndDelete(id).exec();
    if (!deleted) {
      return next(
        newAppError('Brand not found.', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND),
      );
    }
    sendResponse(res, null, 'Brand deleted successfully.', HTTP_STATUS.OK);
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}
