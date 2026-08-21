import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import type {
  IOrder,
  IOrderItem,
  IShippingAddress,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  ShippingMethod,
} from '../types';

export type OrderDocument = HydratedDocument<IOrder>;

const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
];

const PAYMENT_STATUSES: PaymentStatus[] = ['unpaid', 'paid', 'failed'];

const PAYMENT_METHODS: PaymentMethod[] = [
  'cod',
  'card',
  'wallet',
  'bank_transfer',
];

const SHIPPING_METHODS: ShippingMethod[] = ['standard', 'express', 'pickup'];

const shippingAddressSchema = new Schema<IShippingAddress>(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required for shipping'],
      trim: true,
      maxlength: [200, 'Full name cannot exceed 200 characters'],
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [30, 'Phone number cannot exceed 30 characters'],
    },
    addressLine1: {
      type: String,
      required: [true, 'Address line 1 is required'],
      trim: true,
      maxlength: [500, 'Address line 1 cannot exceed 500 characters'],
    },
    addressLine2: {
      type: String,
      trim: true,
      maxlength: [500, 'Address line 2 cannot exceed 500 characters'],
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
      maxlength: [100, 'City cannot exceed 100 characters'],
    },
    state: {
      type: String,
      trim: true,
      maxlength: [100, 'State cannot exceed 100 characters'],
    },
    postalCode: {
      type: String,
      required: [true, 'Postal code is required'],
      trim: true,
      maxlength: [20, 'Postal code cannot exceed 20 characters'],
    },
    country: {
      type: String,
      required: [true, 'Country is required'],
      trim: true,
      maxlength: [100, 'Country cannot exceed 100 characters'],
    },
  },
  { _id: false },
);

const orderItemSchema = new Schema<IOrderItem>(
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
    price: {
      type: Number,
      required: [true, 'Unit price is required'],
      min: [0, 'Price cannot be negative'],
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
      min: [0, 'Subtotal cannot be negative'],
    },
  },
  { _id: true, id: true },
);

orderItemSchema.pre('save', function () {
  const item = this as unknown as IOrderItem & { price: number; quantity: number; subtotal?: number };
  if (item.subtotal === undefined || item.subtotal === null) {
    item.subtotal = item.price * item.quantity;
  }
});

const orderSchema = new Schema<IOrder, Model<IOrder>, IOrder>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    orderNumber: {
      type: String,
      required: [true, 'Order number is required'],
      unique: true,
      // index: true,
      trim: true,
      uppercase: true,
      maxlength: [50, 'Order number cannot exceed 50 characters'],
    },
    items: {
      type: [orderItemSchema],
      required: [true, 'Order must contain at least one item'],
      validate: {
        validator: (v: unknown[]) => Array.isArray(v) && v.length > 0,
        message: 'Order must contain at least one item',
      },
    },
    shippingAddress: {
      type: shippingAddressSchema,
      required: [true, 'Shipping address is required'],
    },
    shippingMethod: {
      type: String,
      required: [true, 'Shipping method is required'],
      enum: {
        values: SHIPPING_METHODS,
        message: 'Shipping method must be one of: standard, express, pickup',
      },
      default: 'standard',
    },
    status: {
      type: String,
      required: [true, 'Order status is required'],
      enum: {
        values: ORDER_STATUSES,
        message:
          'Order status must be one of: pending, confirmed, shipped, delivered, cancelled',
      },
      default: 'pending',
      index: true,
    },
    paymentMethod: {
      type: String,
      required: [true, 'Payment method is required'],
      enum: {
        values: PAYMENT_METHODS,
        message:
          'Payment method must be one of: cod, card, wallet, bank_transfer',
      },
      default: 'cod',
    },
    paymentStatus: {
      type: String,
      required: [true, 'Payment status is required'],
      enum: {
        values: PAYMENT_STATUSES,
        message: 'Payment status must be one of: unpaid, paid, failed',
      },
      default: 'unpaid',
      index: true,
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'],
      min: [0, 'Total amount cannot be negative'],
    },
    discount: {
      type: Number,
      required: [true, 'Discount amount is required'],
      min: [0, 'Discount cannot be negative'],
      default: 0,
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
    cancelledAt: {
      type: Date,
      default: null,
    },
    confirmedAt: {
      type: Date,
      default: null,
    },
    shippedAt: {
      type: Date,
      default: null,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [2000, 'Order notes cannot exceed 2000 characters'],
    },
  },
  {
    timestamps: true,
  },
);

orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
// orderSchema.index({ orderNumber: 1 }, { unique: true });

const Order = model<IOrder>('Order', orderSchema);

export default Order;
export { orderSchema, orderItemSchema, shippingAddressSchema };
