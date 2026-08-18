import type { Request, Response, NextFunction } from 'express';
import { Error } from 'mongoose';
import User, { type UserLike } from '../models/User';
import Role from '../models/Role';
import { ERROR_CODES, HTTP_STATUS } from '../utils/constants';
import { newAppError } from '../utils/error';
import { sendResponse } from '../utils/response';
import type { IRole } from '../types';

/**
 * Project a Mongoose User document into a safe, serializable envelope shape.
 * Always excludes the password hash and always returns a populated role POJO
 * (loading it from Mongo if the document was returned without a populate).
 *
 * Accepts the loose {@link UserLike} structural shape so callers can pass
 * the widened generic types Mongoose 9 returns from `.populate()` queries.
 */
async function projectUser(
  doc: UserLike,
): Promise<{
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: IRole & { _id: string };
  isVerified: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}> {
  let role = doc.role as unknown;
  if (
    !role ||
    typeof role !== 'object' ||
    !('name' in (role as object)) ||
    !Array.isArray((role as IRole).permissions)
  ) {
    const roleId = String(role);
    const found = await Role.findById(roleId).lean<IRole | null>().exec();
    role = found ?? {
      _id: roleId,
      name: 'unknown',
      permissions: [] as string[],
      isSystem: false,
    };
  }
  const roleTyped = role as IRole & { _id: unknown };
  return {
    _id: String(doc._id),
    name: doc.name,
    email: doc.email,
    phone: doc.phone,
    role: {
      ...roleTyped,
      _id: String(roleTyped._id),
    },
    isVerified: doc.isVerified,
    createdAt: doc.createdAt ?? undefined,
    updatedAt: doc.updatedAt ?? undefined,
  };
}

/**
 * GET /api/v1/users
 *
 * Returns every user (pageless; a pagination upgrade can land in a later
 * commit). Each user has their role populated. Caller must hold the
 * `users:manage` permission.
 */
export async function getAllUsers(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const docs = await User.find().populate<{ role: IRole }>('role').exec();
    const users = await Promise.all(docs.map((d) => projectUser(d as unknown as UserLike)));
    sendResponse(
      res,
      { users, count: users.length },
      'Users retrieved successfully.',
      HTTP_STATUS.OK,
      { count: users.length },
    );
    return;
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/v1/users/:id
 *
 * Returns a single user record identified by the `:id` path parameter.
 * Throws 400 (CAST_ERROR) for bad ObjectIds and 404 when no record exists.
 */
export async function getUserById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const doc = await User.findById(id)
      .populate<{ role: IRole }>('role')
      .exec();
    if (!doc) {
      return next(
        newAppError('User not found.', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND),
      );
    }
    const user = await projectUser(doc as unknown as UserLike);
    sendResponse(res, { user }, 'User retrieved successfully.', HTTP_STATUS.OK);
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}

/**
 * DELETE /api/v1/users/:id
 *
 * Deletes a user record. Requires the `users:manage` permission (guarded
 * by the route-level `requirePermission` middleware). Returns 404 if the
 * id has no matching record.
 */
export async function deleteUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const deleted = await User.findByIdAndDelete(id).exec();
    if (!deleted) {
      return next(
        newAppError('User not found.', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND),
      );
    }
    sendResponse(res, null, 'User deleted successfully.', HTTP_STATUS.OK);
    return;
  } catch (err) {
    if (err instanceof Error.CastError) return next(err);
    return next(err);
  }
}
