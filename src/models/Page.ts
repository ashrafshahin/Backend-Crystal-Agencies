import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import type { IPage } from '../types';

export type PageDocument = HydratedDocument<IPage>;

const pageSchema = new Schema<IPage, Model<IPage>, IPage>(
  {
    slug: {
      type: String,
      required: [true, 'Page slug is required'],
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
      maxlength: [200, 'Page slug cannot exceed 200 characters'],
      match: [
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Page slug must use lowercase letters, numbers, and hyphens only',
      ],
    },
    title: {
      type: String,
      required: [true, 'Page title is required'],
      trim: true,
      maxlength: [500, 'Page title cannot exceed 500 characters'],
    },
    content: {
      type: String,
      required: [true, 'Page content is required'],
    },
    metaDescription: {
      type: String,
      trim: true,
      maxlength: [320, 'Meta description cannot exceed 320 characters'],
    },
    metaKeywords: {
      type: String,
      trim: true,
      maxlength: [500, 'Meta keywords cannot exceed 500 characters'],
    },
    published: {
      type: Boolean,
      default: false,
      index: true,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
  },
  {
    timestamps: true,
  },
);

pageSchema.index({ published: 1, slug: 1 });

const Page = model<IPage>('Page', pageSchema);

export default Page;
export { pageSchema };
