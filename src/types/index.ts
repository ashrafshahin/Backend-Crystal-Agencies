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

/**
 * Shape of a persisted product category in the database.
 * Categories are used to group and filter products.
 */
export interface ICategory {
  _id?: Types.ObjectId | string;
  /** Unique human-readable category name. */
  name: string;
  /** Unique URL-friendly slug derived from the name. */
  slug: string;
  /** Optional free-text description of the category. */
  description?: string;
  /** Whether the category is visible/active for products. */
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Shape of a persisted product brand in the database.
 * Brands represent the manufacturer/maker of products.
 */
export interface IBrand {
  _id?: Types.ObjectId | string;
  /** Unique human-readable brand name. */
  name: string;
  /** Unique URL-friendly slug derived from the name. */
  slug: string;
  /** Optional URL or path to the brand's logo image. */
  logo?: string;
  /** Optional free-text description of the brand. */
  description?: string;
  /** Whether the brand is visible/active for products. */
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ProductType = 'b2b' | 'b2c' | 'both';

export interface IBulkPriceTier {
  _id?: Types.ObjectId | string;
  /** Minimum quantity that triggers this tier. */
  quantity: number;
  /** Per-unit price at this tier. */
  price: number;
}

export interface IProductRating {
  _id?: Types.ObjectId | string;
  /** User who created the rating. */
  user?: Types.ObjectId | string | IUser | null;
  /** Numeric rating, typically 1–5. */
  rating: number;
  /** Optional free-text review. */
  comment?: string;
  createdAt?: Date;
}

export interface IProduct {
  _id?: Types.ObjectId | string;
  /** Display name of the product. */
  name: string;
  /** Unique stock-keeping unit code. */
  sku: string;
  /** Marketing / detail description. */
  description?: string;
  /** URL-friendly slug derived from the name. */
  slug: string;
  /** Reference to the product category. Populates to {@link ICategory}. */
  category: Types.ObjectId | string | ICategory | null;
  /** Reference to the product brand. Populates to {@link IBrand}. */
  brand: Types.ObjectId | string | IBrand | null;
  /** Base list price before discounts. */
  basePrice: number;
  /** Optional reduced price (promotional / sale price). */
  discountedPrice?: number;
  /** Computed / stored discount percentage (0-100). */
  discountPercent?: number;
  /** Gallery of product image URLs/paths. */
  images?: string[];
  /** Flexible attribute bag (size, colour, material, etc.). */
  attributes?: Record<string, unknown>;
  /** Available stock quantity. Defaults to 0. */
  stock: number;
  /** Whether the product is visible to shoppers. */
  isActive: boolean;
  /** User ratings and reviews. */
  ratings?: Array<{
  _id: string;
  user: string | { _id: string; name: string } | null;
  rating: number;
  comment?: string;
  createdAt?: Date;
}>;
  /** User who created the product record. */
  createdBy?: Types.ObjectId | string | IUser;
  /** Last user who edited the product record. */
  updatedBy?: Types.ObjectId | string | IUser;
  /** Sales channel the product is listed for. */
  type: ProductType;
  /** Minimum order quantity (B2B only). */
  moq?: number;
  /** Tiered bulk pricing (B2B only). */
  bulkPrices?: IBulkPriceTier[];
  /** Typical lead time in days (B2B only). */
  leadTime?: number;
  createdAt?: Date;
  updatedAt?: Date;
}
