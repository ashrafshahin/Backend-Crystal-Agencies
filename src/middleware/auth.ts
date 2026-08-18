import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';
import User from '../models/User';
import Role from '../models/Role';
import { verifyAccessToken } from '../utils/auth';
import { ERROR_CODES, HTTP_STATUS } from '../utils/constants';
import { newAppError } from '../utils/error';
import type { IAuthUser, AuthenticatedRequest, IRole } from '../types';

/**
 * Extracts the bearer token from the `Authorization: Bearer <token>` header.
 *
 * @returns The raw token string, or null when the header is missing / malformed.
 */
function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;
  return parts[1].trim().length > 0 ? parts[1].trim() : null;
}

/**
 * Authentication middleware.
 *
 * 1. Reads the `Authorization: Bearer <token>` header.
 * 2. Verifies the JWT signature / expiry.
 * 3. Loads the user from MongoDB and populates their assigned role.
 * 4. Attaches a fully-typed {@link IAuthUser} to `req.user` including the
 *    flattened `permissions` array so downstream handlers can inspect it.
 *
 * Any failure path results in a 401 handed off to the global error handler
 * with a stable machine-readable error code.
 */
export async function protect(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return next(
        newAppError(
          'Authentication required. Please provide a valid Bearer token.',
          HTTP_STATUS.UNAUTHORIZED,
          ERROR_CODES.UNAUTHORIZED,
        ),
      );
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (jwtErr) {
      if (jwtErr instanceof TokenExpiredError) {
        return next(
          newAppError(
            'Your access token has expired. Please refresh or re-login.',
            HTTP_STATUS.UNAUTHORIZED,
            ERROR_CODES.TOKEN_EXPIRED,
          ),
        );
      }
      if (jwtErr instanceof JsonWebTokenError) {
        return next(
          newAppError(
            'Access token is invalid or malformed.',
            HTTP_STATUS.UNAUTHORIZED,
            ERROR_CODES.TOKEN_INVALID,
          ),
        );
      }
      throw jwtErr;
    }

    const userDoc = await User.findById(decoded.sub)
      .populate<{ role: IRole }>('role')
      .exec();

    if (!userDoc) {
      return next(
        newAppError(
          'The user associated with this token no longer exists.',
          HTTP_STATUS.UNAUTHORIZED,
          ERROR_CODES.UNAUTHORIZED,
        ),
      );
    }

    if (!userDoc.isVerified) {
      return next(
        newAppError(
          'Your email address has not been verified yet.',
          HTTP_STATUS.UNAUTHORIZED,
          ERROR_CODES.EMAIL_NOT_VERIFIED,
        ),
      );
    }

    const role = userDoc.role as unknown as IRole & { _id: unknown };
    if (!role || typeof role !== 'object' || !Array.isArray(role.permissions)) {
      return next(
        newAppError(
          'Your assigned role could not be loaded. Please contact support.',
          HTTP_STATUS.UNAUTHORIZED,
          ERROR_CODES.UNAUTHORIZED,
        ),
      );
    }

    const authUser: IAuthUser = {
      _id: String(userDoc._id),
      name: userDoc.name,
      email: userDoc.email,
      phone: userDoc.phone,
      role: {
        _id: String(role._id),
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        isSystem: role.isSystem,
      },
      isVerified: userDoc.isVerified,
      verificationToken: userDoc.verificationToken ?? null,
      resetToken: userDoc.resetToken ?? null,
      createdAt: userDoc.createdAt ?? undefined,
      updatedAt: userDoc.updatedAt ?? undefined,
      permissions: role.permissions.slice(),
    };

    (req as AuthenticatedRequest).user = authUser;
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Authorization middleware factory.
 *
 * Returns a RequestHandler that only continues to the next handler when the
 * caller (established by the prior `protect` middleware) has the supplied
 * permission string listed on their role.
 *
 * Usage:
 *   router.get('/users', protect, requirePermission('users:manage'), getAllUsers);
 *
 * @param permission - Permission string required to proceed (e.g. `"users:manage"`).
 */
export function requirePermission(permission: string): RequestHandler {
  return function requirePermissionHandler(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): void {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user;
    if (!user) {
      return next(
        newAppError(
          'Authentication required before checking permissions.',
          HTTP_STATUS.UNAUTHORIZED,
          ERROR_CODES.UNAUTHORIZED,
        ),
      );
    }
    const perms: string[] = Array.isArray(user.permissions)
      ? user.permissions
      : [];
    // The wildcard `"*"` grants everything (used by super_admin in the seed).
    const hasWildcard = perms.includes('*');
    if (hasWildcard || perms.includes(permission)) {
      return next();
    }
    return next(
      newAppError(
        `You do not have the required permission "${permission}".`,
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.FORBIDDEN,
      ),
    );
  };
}

// Silence unused import warnings when this file is built on its own in some
// TS mode combinations. Role is referenced above via populate, so keep it.
void Role;
