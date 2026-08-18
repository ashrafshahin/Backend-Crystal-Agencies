import type { Request, Response, NextFunction } from 'express';
import type { Types } from 'mongoose';
import User, { type UserLike } from '../models/User';
import Role from '../models/Role';
import type { AuthenticatedRequest, IRole, UserWithoutPassword } from '../types';
import {
  hashPassword,
  comparePassword,
  generateTokens,
  verifyRefreshToken,
  generateVerificationToken,
  generateResetToken,
} from '../utils/auth';
import { ERROR_CODES, HTTP_STATUS } from '../utils/constants';
import { sendVerificationEmail, sendResetEmail } from '../utils/email';
import { newAppError } from '../utils/error';
import { sendResponse } from '../utils/response';

/**
 * Shape of the successful auth payload returned by register / login / refresh.
 */
interface AuthPayload {
  user: UserWithoutPassword & { role: { _id: string; name: string; description?: string; permissions: string[]; isSystem: boolean } };
  accessToken: string;
  refreshToken: string;
}

/**
 * Helper to sanitise a User document for outbound responses.
 * Removes the password hash, and projects the role to a safe plain-object
 * whether the role was populated or still an ObjectId reference.
 *
 * Accepts the loose {@link UserLike} structural shape so callers can pass
 * the widened generic types Mongoose 9 returns from `.populate()` queries.
 */
async function sanitizeUser(
  user: UserLike,
): Promise<AuthPayload['user']> {
  let role: AuthPayload['user']['role'];
  const roleVal = user.role as unknown;
  if (roleVal && typeof roleVal === 'object' && 'name' in (roleVal as object)) {
    const r = roleVal as IRole & { _id: Types.ObjectId | string };
    role = {
      _id: String(r._id),
      name: r.name,
      description: r.description,
      permissions: Array.isArray(r.permissions) ? r.permissions : [],
      isSystem: Boolean(r.isSystem),
    };
  } else {
    const roleId = String(roleVal);
    const found = await Role.findById(roleId).lean<IRole | null>().exec();
    role = {
      _id: found?._id ? String(found._id) : roleId,
      name: found?.name ?? 'unknown',
      description: found?.description,
      permissions: found?.permissions ?? [],
      isSystem: Boolean(found?.isSystem),
    };
  }
  return {
    _id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role,
    isVerified: user.isVerified,
    verificationToken: user.verificationToken ?? null,
    resetToken: user.resetToken ?? null,
    createdAt: user.createdAt ?? undefined,
    updatedAt: user.updatedAt ?? undefined,
  };
}

/**
 * Given a list of validation errors detected inside the controller layer
 * (before Mongoose), return a consistent AppError with a 400 status.
 */
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

/**
 * POST /api/v1/auth/register
 *
 * Registers a new customer user. Always assigns the "customer" role.
 * Emits a verification-token email (stub currently logs).
 * Returns the created user (sans password) + a fresh token pair.
 */
export async function register(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { name, email, password } = req.body as { name?: unknown; email?: unknown; password?: unknown };

    const fieldErrors: Array<{ field: string; message: string }> = [];
    if (typeof name !== 'string' || name.trim().length === 0) {
      fieldErrors.push({ field: 'name', message: 'Name is required' });
    }
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fieldErrors.push({ field: 'email', message: 'A valid email is required' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      fieldErrors.push({ field: 'password', message: 'Password must be at least 8 characters long' });
    }
    if (fieldErrors.length > 0) {
      return next(validationAppError(fieldErrors));
    }

    const customerRole = await Role.findOne({ name: 'customer' }).lean<IRole | null>().exec();
    if (!customerRole || !customerRole._id) {
      return next(
        newAppError(
          'System roles have not been initialised. Please run the role seed script first.',
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_CODES.INTERNAL_ERROR,
        ),
      );
    }

    const hashed = await hashPassword(password as string);
    const verificationToken = generateVerificationToken();

    const created = await User.create({
      name: (name as string).trim(),
      email: (email as string).trim().toLowerCase(),
      password: hashed,
      role: customerRole._id,
      verificationToken,
      isVerified: false,
    });

    sendVerificationEmail(created.email, verificationToken);

    const sanitized = await sanitizeUser(created as unknown as UserLike);
    const tokens = generateTokens(
      String(created._id),
      String(customerRole._id),
    );
    const payload: AuthPayload = {
      user: sanitized,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
    sendResponse(_res as Response, payload, 'User registered successfully.', HTTP_STATUS.CREATED);
    return;
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/v1/auth/login
 *
 * Authenticates using email + password. Returns the user (with populated role)
 * and a token pair. Refuses unverified users with a specific error code.
 */
export async function login(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password } = req.body as { email?: unknown; password?: unknown };
    const fieldErrors: Array<{ field: string; message: string }> = [];
    if (typeof email !== 'string' || email.trim().length === 0) {
      fieldErrors.push({ field: 'email', message: 'Email is required' });
    }
    if (typeof password !== 'string' || password.length === 0) {
      fieldErrors.push({ field: 'password', message: 'Password is required' });
    }
    if (fieldErrors.length > 0) {
      return next(validationAppError(fieldErrors));
    }

    const user = await User.findOne({
      email: (email as string).trim().toLowerCase(),
    })
      .select('+password')
      .populate<{ role: IRole }>('role')
      .exec();

    if (!user) {
      return next(
        newAppError(
          'Invalid email or password.',
          HTTP_STATUS.UNAUTHORIZED,
          ERROR_CODES.INVALID_CREDENTIALS,
        ),
      );
    }

    const ok = await comparePassword(password as string, user.password);
    if (!ok) {
      return next(
        newAppError(
          'Invalid email or password.',
          HTTP_STATUS.UNAUTHORIZED,
          ERROR_CODES.INVALID_CREDENTIALS,
        ),
      );
    }

    if (!user.isVerified) {
      return next(
        newAppError(
          'Please verify your email address before logging in.',
          HTTP_STATUS.UNAUTHORIZED,
          ERROR_CODES.EMAIL_NOT_VERIFIED,
        ),
      );
    }

    const roleObj = user.role as unknown as IRole & { _id: Types.ObjectId };
    const roleId = roleObj?._id ? String(roleObj._id) : String(user.role);
    const tokens = generateTokens(String(user._id), roleId);
    const sanitized = await sanitizeUser(user as unknown as UserLike);
    const payload: AuthPayload = {
      user: sanitized,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
    sendResponse(_res as Response, payload, 'Login successful.', HTTP_STATUS.OK);
    return;
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/v1/auth/verify-email
 *
 * Body: { token } — matches a pending `verificationToken` on a user.
 * Sets `isVerified = true` and clears the token.
 */
export async function verifyEmail(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { token } = req.body as { token?: unknown };
    if (typeof token !== 'string' || token.length === 0) {
      return next(
        validationAppError([{ field: 'token', message: 'Verification token is required' }]),
      );
    }
    const user = await User.findOne({ verificationToken: token }).exec();
    if (!user) {
      return next(
        newAppError(
          'Invalid or expired verification token.',
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.TOKEN_INVALID,
        ),
      );
    }
    user.isVerified = true;
    user.verificationToken = null;
    await user.save();
    const sanitized = await sanitizeUser(user as unknown as UserLike);
    sendResponse(_res as Response, { user: sanitized }, 'Email verified successfully.', HTTP_STATUS.OK);
    return;
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/v1/auth/forgot-password
 *
 * Body: { email } — looks up user, generates and persists a reset token,
 * then invokes the email transport stub. Always returns a generic success
 * message to avoid leaking account existence.
 */
export async function forgotPassword(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email } = req.body as { email?: unknown };
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return next(
        validationAppError([{ field: 'email', message: 'A valid email is required' }]),
      );
    }
    const user = await User.findOne({ email: email.trim().toLowerCase() }).exec();
    if (user) {
      const resetToken = generateResetToken();
      user.resetToken = resetToken;
      await user.save();
      sendResetEmail(user.email, resetToken);
    }
    // Always respond the same — do not leak whether an account exists.
    sendResponse(
      _res as Response,
      null,
      'If an account with that email exists, a password reset link has been sent.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/v1/auth/reset-password
 *
 * Body: { token, password } — verifies the reset token, hashes the new
 * password, persists it, and clears the reset token.
 */
export async function resetPassword(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { token, password } = req.body as { token?: unknown; password?: unknown };
    const fieldErrors: Array<{ field: string; message: string }> = [];
    if (typeof token !== 'string' || token.length === 0) {
      fieldErrors.push({ field: 'token', message: 'Reset token is required' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      fieldErrors.push({ field: 'password', message: 'Password must be at least 8 characters long' });
    }
    if (fieldErrors.length > 0) {
      return next(validationAppError(fieldErrors));
    }
    const user = await User.findOne({ resetToken: token as string }).exec();
    if (!user) {
      return next(
        newAppError(
          'Invalid or expired password reset token.',
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.TOKEN_INVALID,
        ),
      );
    }
    user.password = await hashPassword(password as string);
    user.resetToken = null;
    await user.save();
    sendResponse(_res as Response, null, 'Password has been reset successfully.', HTTP_STATUS.OK);
    return;
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/v1/auth/refresh-token
 *
 * Body: { refreshToken } — validates the refresh token, then issues a fresh
 * short-lived access token. Does NOT rotate the refresh token (rotation
 * policy can be added in a later commit).
 */
export async function refreshToken(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { refreshToken: bodyRefreshToken } = req.body as { refreshToken?: unknown };
    if (typeof bodyRefreshToken !== 'string' || bodyRefreshToken.length === 0) {
      return next(
        validationAppError([
          { field: 'refreshToken', message: 'Refresh token is required' },
        ]),
      );
    }
    let claims;
    try {
      claims = verifyRefreshToken(bodyRefreshToken);
    } catch (jwtErr) {
      const code =
        (jwtErr as { name?: string }).name === 'TokenExpiredError'
          ? ERROR_CODES.TOKEN_EXPIRED
          : ERROR_CODES.TOKEN_INVALID;
      return next(
        newAppError('Refresh token is invalid or expired.', HTTP_STATUS.UNAUTHORIZED, code),
      );
    }
    const user = await User.findById(claims.sub)
      .populate<{ role: IRole }>('role')
      .exec();
    if (!user || !user.isVerified) {
      return next(
        newAppError(
          'Refresh token is no longer linked to a valid verified user.',
          HTTP_STATUS.UNAUTHORIZED,
          ERROR_CODES.TOKEN_INVALID,
        ),
      );
    }
    const roleObj = user.role as unknown as IRole & { _id: Types.ObjectId };
    const roleId = roleObj?._id ? String(roleObj._id) : String(user.role);
    const { accessToken } = generateTokens(String(user._id), roleId);
    sendResponse(
      _res as Response,
      { accessToken },
      'New access token issued.',
      HTTP_STATUS.OK,
    );
    return;
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/v1/auth/me  (protected)
 *
 * Returns the authenticated user's profile already loaded on `req.user`.
 */
export function getProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  try {
    const authReq = req as AuthenticatedRequest;
    sendResponse(res, { user: authReq.user }, 'Profile retrieved successfully.', HTTP_STATUS.OK);
    return;
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/auth/me  (protected)
 *
 * Allows the caller to update `name` and `phone` only. Other fields
 * (email, password, role, isVerified, tokens) are ignored — each has its
 * own dedicated endpoint for safety.
 */
export async function updateProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const body = req.body as { name?: unknown; phone?: unknown };
    const fieldErrors: Array<{ field: string; message: string }> = [];
    if (body.name !== undefined && (typeof body.name !== 'string' || body.name.trim().length === 0)) {
      fieldErrors.push({ field: 'name', message: 'Name cannot be empty' });
    }
    if (body.phone !== undefined && typeof body.phone !== 'string') {
      fieldErrors.push({ field: 'phone', message: 'Phone must be a string' });
    }
    if (fieldErrors.length > 0) {
      return next(validationAppError(fieldErrors));
    }

    const updates: { name?: string; phone?: string } = {};
    if (typeof body.name === 'string') updates.name = body.name.trim();
    if (typeof body.phone === 'string') updates.phone = body.phone.trim().length > 0 ? body.phone.trim() : undefined;

    const updated = await User.findByIdAndUpdate(authReq.user._id, updates, {
      new: true,
      runValidators: true,
    })
      .populate<{ role: IRole }>('role')
      .exec();
    if (!updated) {
      return next(
        newAppError('User not found.', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND),
      );
    }
    const sanitized = await sanitizeUser(updated as unknown as UserLike);
    sendResponse(res, { user: sanitized }, 'Profile updated successfully.', HTTP_STATUS.OK);
    return;
  } catch (err) {
    return next(err);
  }
}
