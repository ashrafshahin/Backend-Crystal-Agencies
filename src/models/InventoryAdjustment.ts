import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import type { IInventoryAdjustment, AdjustmentType } from '../types';

export type InventoryAdjustmentDocument = HydratedDocument<IInventoryAdjustment>;

const ADJUSTMENT_TYPES: AdjustmentType[] = [
  'add',
  'remove',
  'correction',
  'return',
];

const inventoryAdjustmentSchema = new Schema<
  IInventoryAdjustment,
  Model<IInventoryAdjustment>,
  IInventoryAdjustment
>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
      index: true,
    },
    adjustmentType: {
      type: String,
      required: [true, 'Adjustment type is required'],
      enum: {
        values: ADJUSTMENT_TYPES,
        message:
          "Adjustment type must be one of: 'add', 'remove', 'correction', 'return'",
      },
    },
    quantity: {
      type: Number,
      required: [true, 'Adjustment quantity is required'],
      min: [1, 'Adjustment quantity must be at least 1'],
    },
    reason: {
      type: String,
      trim: true,
      maxlength: [500, 'Reason cannot exceed 500 characters'],
    },
    reference: {
      type: String,
      trim: true,
      maxlength: [200, 'Reference cannot exceed 200 characters'],
    },
    adjustedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
  },
  {
    timestamps: true,
  },
);

inventoryAdjustmentSchema.index({ adjustmentType: 1 });
inventoryAdjustmentSchema.index({ adjustedBy: 1 });
inventoryAdjustmentSchema.index({ createdAt: -1 });

const InventoryAdjustment = model<IInventoryAdjustment>(
  'InventoryAdjustment',
  inventoryAdjustmentSchema,
);

export default InventoryAdjustment;
export { inventoryAdjustmentSchema };
