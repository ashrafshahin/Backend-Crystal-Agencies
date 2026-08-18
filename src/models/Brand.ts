import { Schema, model, type HydratedDocument } from 'mongoose';
import type { IBrand } from '../types';

export type BrandDocument = HydratedDocument<IBrand>;

const brandSchema = new Schema<IBrand>(
  {
    name: {
      type: String,
      required: [true, 'Brand name is required'],
      unique: true,
      trim: true,
      index: true,
      maxlength: [100, 'Brand name cannot exceed 100 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Brand slug is required'],
      unique: true,
      trim: true,
      index: true,
      lowercase: true,
      maxlength: [150, 'Brand slug cannot exceed 150 characters'],
    },
    logo: {
      type: String,
      trim: true,
      maxlength: [500, 'Brand logo URL cannot exceed 500 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Brand description cannot exceed 500 characters'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

const Brand = model<IBrand>('Brand', brandSchema);

export default Brand;
export { brandSchema };
