import type { Types } from 'mongoose';
import type { Request } from 'express';

/**
 * Shape of a persisted role in the database.
 * Roles define a named set of permissions that can be assigned to users.
 */
export interface IRole {
  _id?: Types.ObjectId | string;
  /** Unique, human-readable role name (e.g. "admin", "customer"). */
  name: string;
  /** Optional free-text description of what the role is intended for. */
  description?: string;
  /** List of permission strings granted to holders of this role. */
  permissions: string[];
  /** True for built-in roles that must not be deleted or renamed. */
  isSystem: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Shape of a persisted user account in the database.
 * Note: the `password` field is deliberately included on the interface so
 * Mongoose can type the document correctly; the Mongoose schema marks it
 * as `select: false` to avoid leaking it into ordinary queries.
 */
export interface IUser {
  _id?: Types.ObjectId | string;
  /** Full display name of the user. */
  name: string;
  /** Unique email address used as the login identifier. */
  email: string;
  /** Bcrypt(js) hash of the user's password. Never returned in responses. */
  password: string;
  /** Optional contact phone number. */
  phone?: string;
  /** Reference to the user's assigned role. Populates to an {@link IRole}. */
  role: Types.ObjectId | string | IRole;
  /** True once the user has verified their email address. */
  isVerified: boolean;
  /** Opaque token used to verify email ownership; cleared after use. */
  verificationToken?: string | null;
  /** Opaque token used to authorize a password reset; cleared after use. */
  resetToken?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * A {@link IUser} projected for safe outbound usage.
 * Specifically omits the sensitive `password` hash.
 */
export type UserWithoutPassword = Omit<IUser, 'password'>;

/**
 * Inbound payload accepted by the registration endpoint.
 */
export interface RegisterDTO {
  name: string;
  email: string;
  password: string;
}

/**
 * Inbound payload accepted by the login endpoint.
 */
export interface LoginDTO {
  email: string;
  password: string;
}

/**
 * View-model populated on `req.user` by the `protect` middleware.
 *
 * Always has:
 *   - the user's identity and safe profile fields
 *   - the user's role populated (name, description, permissions, isSystem)
 *   - a flat `permissions` string array for fast `hasPermission` checks
 */
export interface IAuthUser extends UserWithoutPassword {
  role: IRole;
  /** Denormalised copy of `role.permissions` for convenience. */
  permissions: string[];
}

/**
 * Standard Express.Request extension used across the application.
 * After `protect` runs, `req.user` is guaranteed to be an {@link IAuthUser}.
 */
export interface AuthenticatedRequest extends Request {
  user: IAuthUser;
}
