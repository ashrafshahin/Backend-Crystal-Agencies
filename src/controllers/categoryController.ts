import type { Request, Response, NextFunction } from 'express';
import { Error } from 'mongoose';
import Category from '../models/Category';
import { ERROR_CODES, HTTP_STATUS } from '../utils/constants';
import { newAppError } from '../utils/error';
import { sendResponse } from '../utils/response';
import type { ICategory } from '../types';

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

function projectCategory(doc: ICategory & { _id: unknown }): ICategory & { _id: string } {
  return {
    _id: String(doc._id),
    name: doc.name,
    slug: doc.slug,
    description: doc.description,
    isActive: doc.isActive,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function createCategory(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { name, description, isActive } = req.body as {
      name?: unknown;
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

    const created = await Category.create({
      name: trimmedName,
      slug,
      description: typeof description === 'string' ? description.trim() || undefined : undefined,
      isActive: typeof isActive === 'boolean' ? isActive : true,
    });

    const category = projectCategory(created);
    sendResponse(
      _res,
      { category },
      'Category created successfully.',
      HTTP_STATUS.CREATED,
    );
    return;
  } catch (err) {
    return next(err);
  }
}

export async function getAllCategories(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const docs = await Category.find({ isActive: true }).exec();
    const categories = docs.map((d) => projectCategory(d));
    sendResponse(
      res,
      { categories, count: categories.length },
      'Categories retrieved successfully.',
      HTTP_STATUS.OK,
      { count: categories.length },
    );
    return;
  } catch (err) {
    return next(err);
  }
}

export async function getCategoryById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const doc = await Category.findById(id).exec();
    if (!doc) {
      return next(
        newAppError('Category not found.', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND),
      );
    }
    const category = projectCategory(doc);
    sendResponse(res, { category }, 'Category retrieved successfully.', HTTP_STATUS.OK);
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function updateCategory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const { name, description, isActive } = req.body as {
      name?: unknown;
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

    const doc = await Category.findById(id).exec();
    if (!doc) {
      return next(
        newAppError('Category not found.', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND),
      );
    }

    if (typeof name === 'string') {
      const trimmedName = name.trim();
      doc.name = trimmedName;
      doc.slug = slugify(trimmedName);
    }
    if (typeof description === 'string') {
      doc.description = description.trim() || undefined;
    }
    if (typeof isActive === 'boolean') {
      doc.isActive = isActive;
    }

    const updated = await doc.save();
    const category = projectCategory(updated);
    sendResponse(res, { category }, 'Category updated successfully.', HTTP_STATUS.OK);
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function deleteCategory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const deleted = await Category.findByIdAndDelete(id).exec();
    if (!deleted) {
      return next(
        newAppError('Category not found.', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND),
      );
    }
    sendResponse(res, null, 'Category deleted successfully.', HTTP_STATUS.OK);
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}
