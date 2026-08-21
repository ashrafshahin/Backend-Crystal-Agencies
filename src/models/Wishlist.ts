import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import type { IWishlist } from '../types';

export type WishlistDocument = HydratedDocument<IWishlist>;

const wishlistSchema = new Schema<IWishlist, Model<IWishlist>, IWishlist>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

wishlistSchema.index({ userId: 1, productId: 1 }, { unique: true });

const Wishlist = model<IWishlist>('Wishlist', wishlistSchema);

export default Wishlist;
export { wishlistSchema };
