import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import type { IStockAlert, AlertType, AlertStatus } from '../types';

export type StockAlertDocument = HydratedDocument<IStockAlert>;

const ALERT_TYPES: AlertType[] = [
  'low-stock',
  'overstock',
  'expiring-soon',
];

const ALERT_STATUSES: AlertStatus[] = [
  'active',
  'resolved',
];

const stockAlertSchema = new Schema<IStockAlert, Model<IStockAlert>, IStockAlert>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
      index: true,
    },
    alertType: {
      type: String,
      required: [true, 'Alert type is required'],
      enum: {
        values: ALERT_TYPES,
        message: "Alert type must be one of: 'low-stock', 'overstock', 'expiring-soon'",
      },
      index: true,
    },
    threshold: {
      type: Number,
      min: [0, 'Threshold cannot be negative'],
    },
    currentValue: {
      type: Number,
      required: [true, 'Current value is required'],
      min: [0, 'Current value cannot be negative'],
    },
    status: {
      type: String,
      required: [true, 'Alert status is required'],
      enum: {
        values: ALERT_STATUSES,
        message: "Alert status must be one of: 'active', 'resolved'",
      },
      default: 'active',
      index: true,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
  },
  {
    timestamps: true,
  },
);

stockAlertSchema.index({ productId: 1, alertType: 1, status: 1 }, { unique: false });
stockAlertSchema.index({ createdAt: -1 });

const StockAlert = model<IStockAlert>('StockAlert', stockAlertSchema);

export default StockAlert;
export { stockAlertSchema };
