import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import type { IQuotation, IQuotationItem, QuotationStatus } from '../types';

export type QuotationDocument = HydratedDocument<IQuotation>;

const QUOTATION_STATUSES: QuotationStatus[] = [
  'draft',
  'sent',
  'accepted',
  'rejected',
];

const quotationItemSchema = new Schema<IQuotationItem>(
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
    unitPrice: {
      type: Number,
      required: [true, 'Unit price is required'],
      min: [0, 'Unit price cannot be negative'],
    },
    discount: {
      type: Number,
      min: [0, 'Line discount cannot be negative'],
      default: 0,
    },
    productName: {
      type: String,
      trim: true,
      maxlength: [200, 'Product name snapshot cannot exceed 200 characters'],
    },
    productSku: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [100, 'Product SKU snapshot cannot exceed 100 characters'],
    },
    subtotal: {
      type: Number,
      min: [0, 'Line subtotal cannot be negative'],
    },
  },
  { _id: true, id: true },
);

quotationItemSchema.pre('save', async function () {
  const it = this as unknown as IQuotationItem & {
    unitPrice: number;
    quantity: number;
    discount?: number;
    subtotal?: number;
  };
  if (it.subtotal === undefined || it.subtotal === null) {
    const lineDiscount =
      typeof it.discount === 'number' && it.discount > 0 ? it.discount : 0;
    const raw = it.unitPrice * it.quantity - lineDiscount;
    it.subtotal = Math.max(0, raw);
  }
});

const quotationSchema = new Schema<IQuotation, Model<IQuotation>, IQuotation>(
  {
    rfqId: {
      type: Schema.Types.ObjectId,
      ref: 'RFQ',
      required: [true, 'RFQ reference is required'],
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    quotationNumber: {
      type: String,
      required: [true, 'Quotation number is required'],
      unique: true,
      // index: true,
      trim: true,
      uppercase: true,
      maxlength: [50, 'Quotation number cannot exceed 50 characters'],
    },
    items: {
      type: [quotationItemSchema],
      required: [true, 'Quotation must contain at least one item'],
      validate: {
        validator: (v: unknown[]) => Array.isArray(v) && v.length > 0,
        message: 'Quotation must contain at least one item',
      },
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'],
      min: [0, 'Total amount cannot be negative'],
    },
    tax: {
      type: Number,
      required: [true, 'Tax amount is required'],
      min: [0, 'Tax cannot be negative'],
      default: 0,
    },
    finalAmount: {
      type: Number,
      required: [true, 'Final amount is required'],
      min: [0, 'Final amount cannot be negative'],
    },
    validUntil: {
      type: Date,
      required: [true, 'Quotation validity date is required'],
      index: true,
    },
    status: {
      type: String,
      required: [true, 'Quotation status is required'],
      enum: {
        values: QUOTATION_STATUSES,
        message:
          'Quotation status must be one of: draft, sent, accepted, rejected',
      },
      default: 'draft',
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [3000, 'Quotation notes cannot exceed 3000 characters'],
    },
    attachmentUrl: {
      type: String,
      trim: true,
      maxlength: [1000, 'Attachment URL cannot exceed 1000 characters'],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Created-by user reference is required'],
    },
    sentAt: {
      type: Date,
      default: null,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

quotationSchema.index({ rfqId: 1, createdAt: -1 });
quotationSchema.index({ userId: 1, createdAt: -1 });
quotationSchema.index({ status: 1, createdAt: -1 });
// quotationSchema.index({ quotationNumber: 1 }, { unique: true });
quotationSchema.index({ validUntil: 1, status: 1 });

const Quotation = model<IQuotation>('Quotation', quotationSchema);

export default Quotation;
export { quotationSchema, quotationItemSchema };
