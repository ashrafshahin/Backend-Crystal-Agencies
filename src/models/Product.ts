import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import type { IProduct, ProductType, IBulkPriceTier, IProductRating } from '../types';

export type ProductDocument = HydratedDocument<IProduct>;

const PRODUCT_TYPES: ProductType[] = ['b2b', 'b2c', 'both'];

const bulkPriceTierSchema = new Schema<IBulkPriceTier>(
  {
    quantity: {
      type: Number,
      required: [true, 'Bulk price quantity is required'],
      min: [1, 'Quantity must be at least 1'],
    },
    price: {
      type: Number,
      required: [true, 'Bulk price is required'],
      min: [0, 'Bulk price cannot be negative'],
    },
  },
  { _id: true },
);

const productRatingSchema = new Schema<IProductRating>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating cannot exceed 5'],
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [1000, 'Review comment cannot exceed 1000 characters'],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true },
);

const productSchema = new Schema<IProduct, Model<IProduct>, IProduct>(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [200, 'Product name cannot exceed 200 characters'],
      index: true,
    },
    sku: {
      type: String,
      required: [true, 'SKU is required'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
      maxlength: [100, 'SKU cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [5000, 'Product description cannot exceed 5000 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Product slug is required'],
      trim: true,
      lowercase: true,
      index: true,
      maxlength: [250, 'Product slug cannot exceed 250 characters'],
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'A product must be assigned to a category'],
      index: true,
    },
    brand: {
      type: Schema.Types.ObjectId,
      ref: 'Brand',
      required: [true, 'A product must be assigned to a brand'],
      index: true,
    },
    basePrice: {
      type: Number,
      required: [true, 'Base price is required'],
      min: [0, 'Base price cannot be negative'],
    },
    discountedPrice: {
      type: Number,
      min: [0, 'Discounted price cannot be negative'],
      validate: {
        validator: function (this: Document & { basePrice?: number; discountedPrice?: number }, value: unknown) {
          if (value === undefined || value === null) return true;
          if (typeof value !== 'number') return false;
          return this.basePrice === undefined || value <= this.basePrice;
        },
        message: 'Discounted price must be less than or equal to the base price',
      },
    },
    discountPercent: {
      type: Number,
      min: [0, 'Discount percentage cannot be negative'],
      max: [100, 'Discount percentage cannot exceed 100'],
    },
    images: {
      type: [String],
      default: [],
      validate: {
        validator: (value: string[]) => Array.isArray(value),
        message: 'Images must be an array of strings',
      },
    },
    attributes: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
    stock: {
      type: Number,
      default: 0,
      min: [0, 'Stock cannot be negative'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    ratings: {
      type: [productRatingSchema],
      default: [],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    type: {
      type: String,
      required: [true, 'Product type is required'],
      enum: {
        values: PRODUCT_TYPES,
        message: 'Product type must be one of: b2b, b2c, both',
      },
      default: 'both',
      index: true,
    },
    moq: {
      type: Number,
      min: [1, 'Minimum order quantity must be at least 1'],
    },
    bulkPrices: {
      type: [bulkPriceTierSchema],
      default: [],
    },
    leadTime: {
      type: Number,
      min: [0, 'Lead time cannot be negative'],
    },
    avgRating: {
      type: Number,
      min: [0, 'Average rating cannot be negative'],
      max: [5, 'Average rating cannot exceed 5'],
      default: 0,
    },
    totalReviews: {
      type: Number,
      min: [0, 'Total reviews cannot be negative'],
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

productSchema.index({ name: 'text', description: 'text' });

const Product = model<IProduct>('Product', productSchema);

export default Product;
export { productSchema, bulkPriceTierSchema, productRatingSchema };
