import type { Request, Response, NextFunction } from 'express';
import { Error } from 'mongoose';
import Page from '../models/Page';
import { ERROR_CODES, HTTP_STATUS } from '../utils/constants';
import { newAppError } from '../utils/error';
import { sendResponse } from '../utils/response';
import type { AuthenticatedRequest, IPage, IUser } from '../types';

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

type ProjectedPage = Omit<IPage, 'updatedBy'> & {
  _id: string;
  updatedBy: ProjectedUser | null;
};

function projectPage(doc: IPage & { _id: unknown }): ProjectedPage {
  return {
    _id: String(doc._id),
    slug: doc.slug,
    title: doc.title,
    content: doc.content,
    metaDescription: doc.metaDescription,
    metaKeywords: doc.metaKeywords,
    published: doc.published,
    publishedAt: doc.publishedAt,
    updatedBy: projectUser(doc.updatedBy),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function getPageBySlug(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { slug } = req.params;

    if (typeof slug !== 'string' || slug.trim().length === 0) {
      return next(
        validationAppError([
          { field: 'slug', message: 'slug parameter is required' },
        ]),
      );
    }

    const page = await Page.findOne({
      slug: slug.trim().toLowerCase(),
      published: true,
    }).exec();

    if (!page) {
      return next(
        newAppError(
          'Page not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }

    const data = projectPage(page);
    sendResponse(res, { page: data }, 'Page retrieved successfully.', HTTP_STATUS.OK);
    return;
  } catch (err) {
    return next(err);
  }
}

export async function getAllPages(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const docs = await Page.find({})
      .populate<{ updatedBy: IUser }>('updatedBy')
      .sort({ updatedAt: -1 })
      .exec();

    const pages = docs.map(projectPage);
    sendResponse(
      res,
      { pages, count: pages.length },
      'All pages retrieved successfully.',
      HTTP_STATUS.OK,
      { count: pages.length },
    );
    return;
  } catch (err) {
    return next(err);
  }
}

export async function createPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const body = req.body as {
      slug?: unknown;
      title?: unknown;
      content?: unknown;
      metaDescription?: unknown;
      metaKeywords?: unknown;
      published?: unknown;
    };
    const errors: Array<{ field: string; message: string }> = [];

    if (typeof body.slug !== 'string' || body.slug.trim().length === 0) {
      errors.push({ field: 'slug', message: 'slug is required' });
    }

    if (typeof body.title !== 'string' || body.title.trim().length === 0) {
      errors.push({ field: 'title', message: 'title is required' });
    }

    if (typeof body.content !== 'string') {
      errors.push({ field: 'content', message: 'content must be a string' });
    }

    if (body.metaDescription !== undefined && typeof body.metaDescription !== 'string') {
      errors.push({
        field: 'metaDescription',
        message: 'metaDescription must be a string when provided',
      });
    }

    if (body.metaKeywords !== undefined && typeof body.metaKeywords !== 'string') {
      errors.push({
        field: 'metaKeywords',
        message: 'metaKeywords must be a string when provided',
      });
    }

    if (body.published !== undefined && typeof body.published !== 'boolean') {
      errors.push({
        field: 'published',
        message: 'published must be a boolean when provided',
      });
    }

    if (errors.length > 0) {
      return next(validationAppError(errors));
    }

    const isPublished = typeof body.published === 'boolean' ? body.published : false;

    const created = await Page.create({
      slug: (body.slug as string).trim().toLowerCase(),
      title: (body.title as string).trim(),
      content: body.content as string,
      metaDescription:
        typeof body.metaDescription === 'string'
          ? body.metaDescription.trim() || undefined
          : undefined,
      metaKeywords:
        typeof body.metaKeywords === 'string'
          ? body.metaKeywords.trim() || undefined
          : undefined,
      published: isPublished,
      publishedAt: isPublished ? new Date() : null,
      updatedBy: userId,
    } as IPage);

    const fresh = await Page.findById(created._id)
      .populate<{ updatedBy: IUser }>('updatedBy')
      .exec();

    const page = projectPage((fresh ?? created) as any);

    sendResponse(
      res,
      { page },
      'Page created successfully.',
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
          'A page with this slug already exists.',
          HTTP_STATUS.CONFLICT,
          ERROR_CODES.RESOURCE_EXISTS,
        ),
      );
    }
    if (err instanceof Error.ValidationError) return next(err);
    return next(err);
  }
}

export async function updatePage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const { id } = req.params;
    const body = req.body as {
      title?: unknown;
      content?: unknown;
      metaDescription?: unknown;
      metaKeywords?: unknown;
      published?: unknown;
    };
    const errors: Array<{ field: string; message: string }> = [];

    const page = await Page.findById(id).exec();
    if (!page) {
      return next(
        newAppError(
          'Page not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }

    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || body.title.trim().length === 0) {
        errors.push({ field: 'title', message: 'title must be a non-empty string' });
      }
    }

    if (body.content !== undefined && typeof body.content !== 'string') {
      errors.push({ field: 'content', message: 'content must be a string' });
    }

    if (body.metaDescription !== undefined && typeof body.metaDescription !== 'string') {
      errors.push({
        field: 'metaDescription',
        message: 'metaDescription must be a string when provided',
      });
    }

    if (body.metaKeywords !== undefined && typeof body.metaKeywords !== 'string') {
      errors.push({
        field: 'metaKeywords',
        message: 'metaKeywords must be a string when provided',
      });
    }

    if (body.published !== undefined && typeof body.published !== 'boolean') {
      errors.push({
        field: 'published',
        message: 'published must be a boolean when provided',
      });
    }

    if (errors.length > 0) {
      return next(validationAppError(errors));
    }

    const wasPublished = page.published;

    if (typeof body.title === 'string') {
      page.title = body.title.trim();
    }
    if (typeof body.content === 'string') {
      page.content = body.content;
    }
    if (typeof body.metaDescription === 'string') {
      page.metaDescription = body.metaDescription.trim() || undefined;
    }
    if (typeof body.metaKeywords === 'string') {
      page.metaKeywords = body.metaKeywords.trim() || undefined;
    }
    if (typeof body.published === 'boolean') {
      page.published = body.published;
      if (body.published && !wasPublished) {
        page.publishedAt = new Date();
      } else if (!body.published) {
        page.publishedAt = null;
      }
    }
    page.updatedBy = userId as any;

    const saved = await page.save();
    const fresh = await Page.findById(saved._id)
      .populate<{ updatedBy: IUser }>('updatedBy')
      .exec();

    const data = projectPage((fresh ?? saved) as any);

    sendResponse(
      res,
      { page: data },
      'Page updated successfully.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    if (err instanceof Error.ValidationError) return next(err);
    if (
      err &&
      typeof err === 'object' &&
      (err as { code?: number }).code === 11000
    ) {
      return next(
        newAppError(
          'A page with this slug already exists.',
          HTTP_STATUS.CONFLICT,
          ERROR_CODES.RESOURCE_EXISTS,
        ),
      );
    }
    return next(err);
  }
}

export async function deletePage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

    const removed = await Page.findByIdAndDelete(id).exec();
    if (!removed) {
      return next(
        newAppError(
          'Page not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }

    sendResponse(
      res,
      { removed: true, _id: id },
      'Page deleted successfully.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

export async function publishPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.user._id);
    const { id } = req.params;

    const page = await Page.findById(id).exec();
    if (!page) {
      return next(
        newAppError(
          'Page not found.',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
        ),
      );
    }

    const wasPublished = page.published;
    page.published = !wasPublished;
    page.publishedAt = page.published ? new Date() : null;
    page.updatedBy = userId as any;

    const saved = await page.save();
    const fresh = await Page.findById(saved._id)
      .populate<{ updatedBy: IUser }>('updatedBy')
      .exec();

    const data = projectPage((fresh ?? saved) as any);

    sendResponse(
      res,
      { page: data },
      page.published ? 'Page published successfully.' : 'Page unpublished successfully.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    if (err instanceof Error.ValidationError) return next(err);
    return next(err);
  }
}
