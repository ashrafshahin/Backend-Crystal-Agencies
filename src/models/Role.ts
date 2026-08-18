import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import type { IRole } from '../types';

/**
 * Leaned document type returned by queries that populate or project the
 * role. Extends the base {@link IRole} interface with the Mongoose
 * HydratedDocument helpers that callers can rely on when they receive a
 * hydrated instance.
 *
 * Uses `HydratedDocument` for Mongoose 7+/9+ compatibility.
 */
export type RoleDocument = HydratedDocument<IRole>;

const roleSchema = new Schema<IRole, Model<IRole>, IRole>(
  {
    name: {
      type: String,
      required: [true, 'Role name is required'],
      unique: true,
      trim: true,
      index: true,
      lowercase: true,
      maxlength: [50, 'Role name cannot exceed 50 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [255, 'Role description cannot exceed 255 characters'],
    },
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator: (value: string[]) => Array.isArray(value),
        message: 'Permissions must be an array of strings',
      },
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

/**
 * Mongoose model for the `roles` collection.
 *
 * Roles are shared across tenants and define the permission sets that can
 * be assigned to users via `User.role`. System roles (`isSystem: true`)
 * should be treated as immutable at the application level.
 */
const Role = model<IRole>('Role', roleSchema);

export default Role;
export { roleSchema };
