import { Schema, model, type Document, type HydratedDocument, type Model } from 'mongoose';
import type { IInventory, InventoryStatus } from '../types';

export type InventoryDocument = HydratedDocument<IInventory>;

const INVENTORY_STATUSES: InventoryStatus[] = [
  'in-stock',
  'low-stock',
  'out-of-stock',
  'discontinued',
];

const inventorySchema = new Schema<IInventory, Model<IInventory>, IInventory>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
      index: true,
    },
    warehouseLocation: {
      type: String,
      trim: true,
      maxlength: [100, 'Warehouse location cannot exceed 100 characters'],
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      default: 0,
      min: [0, 'Quantity cannot be negative'],
    },
    minimumThreshold: {
      type: Number,
      min: [0, 'Minimum threshold cannot be negative'],
    },
    maximumCapacity: {
      type: Number,
      min: [0, 'Maximum capacity cannot be negative'],
      validate: {
        validator: function (
          this: IInventory & Document,
          value: unknown,
        ) {
          if (value === undefined || value === null) return true;
          if (typeof value !== 'number') return false;
          if (typeof this.minimumThreshold !== 'number') return true;
          return value >= this.minimumThreshold;
        },
        message:
          'Maximum capacity must be greater than or equal to the minimum threshold',
      },
    },
    reorderLevel: {
      type: Number,
      min: [0, 'Reorder level cannot be negative'],
    },
    reorderQuantity: {
      type: Number,
      min: [0, 'Reorder quantity cannot be negative'],
    },
    lastRestocked: {
      type: Date,
      default: null,
    },
    expirationDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      required: [true, 'Inventory status is required'],
      enum: {
        values: INVENTORY_STATUSES,
        message:
          "Inventory status must be one of: 'in-stock', 'low-stock', 'out-of-stock', 'discontinued'",
      },
      default: 'in-stock',
    },
  },
  {
    timestamps: true,
  },
);

inventorySchema.index({ status: 1 });
inventorySchema.index({ productId: 1, warehouseLocation: 1 }, { unique: false });

export function deriveInventoryStatus(
  quantity: number,
  minimumThreshold: number | undefined | null,
): InventoryStatus {
  if (quantity <= 0) return 'out-of-stock';
  if (
    typeof minimumThreshold === 'number' &&
    minimumThreshold > 0 &&
    quantity <= minimumThreshold
  ) {
    return 'low-stock';
  }
  return 'in-stock';
}

const Inventory = model<IInventory>('Inventory', inventorySchema);

export default Inventory;
export { inventorySchema };
