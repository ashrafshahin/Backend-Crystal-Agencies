import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import type { IRFQ, IRFQItem, RFQStatus } from '../types';

export type RFQDocument = HydratedDocument<IRFQ>;

const RFQ_STATUSES: RFQStatus[] = [
  'pending',
  'quoted',
  'accepted',
  'rejected',
  'expired',
];

const rfqItemSchema = new Schema<IRFQItem>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, 'Line notes cannot exceed 500 characters'],
    },
  },
  { _id: true, id: true },
);

const rfqSchema = new Schema<IRFQ, Model<IRFQ>, IRFQ>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    rfqNumber: {
      type: String,
      required: [true, 'RFQ number is required'],
      unique: true,
      // index: true,
      trim: true,
      uppercase: true,
      maxlength: [50, 'RFQ number cannot exceed 50 characters'],
    },
    items: {
      type: [rfqItemSchema],
      required: [true, 'RFQ must contain at least one item'],
      validate: {
        validator: (v: unknown[]) => Array.isArray(v) && v.length > 0,
        message: 'RFQ must contain at least one item',
      },
    },
    companyName: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
      maxlength: [200, 'Company name cannot exceed 200 characters'],
      index: true,
    },
    contactPerson: {
      type: String,
      required: [true, 'Contact person is required'],
      trim: true,
      maxlength: [200, 'Contact person name cannot exceed 200 characters'],
    },
    email: {
      type: String,
      required: [true, 'Contact email is required'],
      trim: true,
      lowercase: true,
      maxlength: [254, 'Email cannot exceed 254 characters'],
      match: [
        /^\S+@\S+\.\S+$/,
        'Please provide a valid email address',
      ],
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [30, 'Phone number cannot exceed 30 characters'],
    },
    requiredDate: {
      type: Date,
      default: null,
    },
    deliveryLocation: {
      type: String,
      trim: true,
      maxlength: [1000, 'Delivery location cannot exceed 1000 characters'],
    },
    specialRequirements: {
      type: String,
      trim: true,
      maxlength: [3000, 'Special requirements cannot exceed 3000 characters'],
    },
    status: {
      type: String,
      required: [true, 'RFQ status is required'],
      enum: {
        values: RFQ_STATUSES,
        message:
          'RFQ status must be one of: pending, quoted, accepted, rejected, expired',
      },
      default: 'pending',
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

rfqSchema.index({ userId: 1, createdAt: -1 });
rfqSchema.index({ status: 1, createdAt: -1 });
// rfqSchema.index({ rfqNumber: 1 }, { unique: true });

const RFQ = model<IRFQ>('RFQ', rfqSchema);

export default RFQ;
export { rfqSchema, rfqItemSchema };
