import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import type { IReview, ReviewStatus } from '../types';

export type ReviewDocument = HydratedDocument<IReview>;

const REVIEW_STATUSES: ReviewStatus[] = ['pending', 'approved', 'rejected'];

const reviewSchema = new Schema<IReview, Model<IReview>, IReview>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating cannot exceed 5'],
    },
    title: {
      type: String,
      trim: true,
      maxlength: [200, 'Review title cannot exceed 200 characters'],
    },
    content: {
      type: String,
      trim: true,
      maxlength: [2000, 'Review content cannot exceed 2000 characters'],
    },
    helpful: {
      type: Number,
      default: 0,
      min: [0, 'Helpful count cannot be negative'],
    },
    status: {
      type: String,
      required: [true, 'Review status is required'],
      enum: {
        values: REVIEW_STATUSES,
        message: 'Status must be one of: pending, approved, rejected',
      },
      default: 'pending',
      index: true,
    },
    moderationNote: {
      type: String,
      trim: true,
      maxlength: [500, 'Moderation note cannot exceed 500 characters'],
    },
  },
  {
    timestamps: true,
  },
);

reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });
reviewSchema.index({ productId: 1, status: 1, helpful: -1 });

const Review = model<IReview>('Review', reviewSchema);

export default Review;
export { reviewSchema };
