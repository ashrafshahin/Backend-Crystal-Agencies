import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import type { ICart } from '../types';

export type CartDocument = HydratedDocument<ICart>;

const cartItemSchema = new Schema<ICart['items'][number]>(
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
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true, id: true },
);

const cartSchema = new Schema<ICart, Model<ICart>, ICart>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      unique: true,
      index: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

cartSchema.index({ updatedAt: -1 });

const Cart = model<ICart>('Cart', cartSchema);

export default Cart;
export { cartSchema, cartItemSchema };
