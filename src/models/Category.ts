import { Schema, model, type HydratedDocument } from 'mongoose';
import type { ICategory } from '../types';

export type CategoryDocument = HydratedDocument<ICategory>;

const categorySchema = new Schema<ICategory>(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      unique: true,
      trim: true,
      index: true,
      maxlength: [100, 'Category name cannot exceed 100 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Category slug is required'],
      unique: true,
      trim: true,
      index: true,
      lowercase: true,
      maxlength: [150, 'Category slug cannot exceed 150 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Category description cannot exceed 500 characters'],
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

const Category = model<ICategory>('Category', categorySchema);

export default Category;
export { categorySchema };
