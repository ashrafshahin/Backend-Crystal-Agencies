import { Schema, model, type HydratedDocument } from 'mongoose';
import type { IUser } from '../types';

/**
 * Hydrated Mongoose document type for a User.
 *
 * Use this when you are working with a document returned from a query
 * (e.g. `user.save()`, instance methods) rather than a plain POJO payload.
 *
 * Note: Uses `HydratedDocument` (available since Mongoose 7) which is the
 *        canonical way to express an instance produced by `Model.findById`,
 *        `Model.findOne`, etc. and correctly carries the generic `_id` type
 *        used by Mongoose 9+.
 */
export type UserDocument = HydratedDocument<IUser>;

/**
 * Looser structural shape accepted by helpers like `sanitizeUser`.
 * Matches both a full `UserDocument` and the return of `.populate('role')`
 * queries whose TS generics Mongoose 9 widens substantially.
 */
export type UserLike = {
  _id: unknown;
  name: string;
  email: string;
  phone?: string;
  role: unknown;
  isVerified: boolean;
  verificationToken?: string | null;
  resetToken?: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
};

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please provide a valid email address',
      ],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      select: false,
      minlength: [8, 'Password must be at least 8 characters long'],
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [20, 'Phone number cannot exceed 20 characters'],
    },
    role: {
      type: Schema.Types.ObjectId,
      ref: 'Role',
      required: [true, 'A user must be assigned a role'],
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: {
      type: String,
      default: null,
    },
    resetToken: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

/**
 * Mongoose model for the `users` collection.
 *
 * Query tip: because `password` uses `select: false`, it will not be
 * returned by `find*` calls unless you explicitly chain `.select('+password')`
 * (e.g. during login when we need to compare the hash).
 */
const User = model<IUser>('User', userSchema);

export default User;
export { userSchema };
