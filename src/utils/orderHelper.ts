import Order from '../models/Order';
import Inventory from '../models/Inventory';
import Product from '../models/Product';
import type { IProduct } from '../types';

export function generateOrderNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(100000 + Math.random() * 900000).toString();
  return `ORD-${year}${month}${day}-${random}`;
}

export async function ensureUniqueOrderNumber(): Promise<string> {
  let orderNumber: string;
  let exists: boolean;
  let attempts = 0;
  do {
    orderNumber = generateOrderNumber();
    const found = await Order.findOne({ orderNumber }).select('_id').exec();
    exists = found !== null;
    attempts++;
    if (attempts > 10) {
      const suffix = Math.floor(1000000 + Math.random() * 9000000).toString();
      orderNumber = `ORD-${Date.now().toString()}-${suffix}`;
      break;
    }
  } while (exists);
  return orderNumber;
}

type PriceResolverProduct = {
  _id: unknown;
  name: string;
  sku: string;
  isActive: boolean;
  basePrice?: number;
  discountedPrice?: number;
};

export function resolveUnitPrice(product: PriceResolverProduct | null): number {
  if (!product) return 0;
  if (typeof product.discountedPrice === 'number') {
    return product.discountedPrice;
  }
  if (typeof product.basePrice === 'number') {
    return product.basePrice;
  }
  return 0;
}

export interface TotalsResult {
  totalAmount: number;
  discount: number;
  tax: number;
  finalAmount: number;
  itemsWithSnapshots: Array<{
    productId: string;
    quantity: number;
    price: number;
    productName: string;
    productSku: string;
    subtotal: number;
  }>;
}

export async function calculateTotals(
  cartItems: Array<{ productId: unknown; quantity: number }>,
  discount: number = 0,
  tax: number = 0,
): Promise<TotalsResult> {
  const productIds = cartItems
    .map((i) => String(i.productId))
    .filter((id) => id && id.length > 0);

  const products = await Product.find({ _id: { $in: productIds } }).exec();
  const productMap = new Map<string, PriceResolverProduct>();
  for (const p of products) {
    const cast = p as unknown as PriceResolverProduct & { _id: unknown };
    productMap.set(String(cast._id), cast);
  }

  const itemsWithSnapshots: TotalsResult['itemsWithSnapshots'] = [];
  let totalAmount = 0;

  for (const item of cartItems) {
    const pid = String(item.productId);
    const product = productMap.get(pid) ?? null;
    const unitPrice = resolveUnitPrice(product);
    const subtotal = unitPrice * item.quantity;
    totalAmount += subtotal;

    itemsWithSnapshots.push({
      productId: pid,
      quantity: item.quantity,
      price: unitPrice,
      productName: product?.name ?? 'Unknown Product',
      productSku: product?.sku ?? 'UNKNOWN',
      subtotal,
    });
  }

  const safeDiscount = typeof discount === 'number' && discount > 0 ? discount : 0;
  const cappedDiscount = Math.min(safeDiscount, totalAmount);
  const safeTax = typeof tax === 'number' && tax > 0 ? tax : 0;
  const afterDiscount = Math.max(0, totalAmount - cappedDiscount);
  const finalAmount = afterDiscount + safeTax;

  return {
    totalAmount,
    discount: cappedDiscount,
    tax: safeTax,
    finalAmount,
    itemsWithSnapshots,
  };
}

export interface OrderValidationIssue {
  productId: string;
  type: 'out-of-stock' | 'insufficient-stock' | 'inactive' | 'not-found';
  message: string;
  available: number;
  requested: number;
}

export interface OrderValidationResult {
  valid: boolean;
  issues: OrderValidationIssue[];
}

export async function validateOrderCart(
  items: Array<{ productId: unknown; quantity: number }>,
): Promise<OrderValidationResult> {
  const issues: OrderValidationIssue[] = [];
  let valid = true;

  if (!Array.isArray(items) || items.length === 0) {
    return {
      valid: false,
      issues: [
        {
          productId: '',
          type: 'out-of-stock',
          message: 'Cart is empty — nothing to order.',
          available: 0,
          requested: 0,
        },
      ],
    };
  }

  const productIds = items
    .map((i) => String(i.productId))
    .filter((id) => id && id.length > 0);

  const products = await Product.find({ _id: { $in: productIds } }).exec();
  const productMap = new Map<string, IProduct & { _id: unknown }>();
  for (const p of products) {
    const cast = p as unknown as IProduct & { _id: unknown };
    productMap.set(String(cast._id), cast);
  }

  const inventoryRows = await Inventory.find({
    productId: { $in: productIds },
  }).exec();
  const stockByProduct = new Map<string, number>();
  for (const row of inventoryRows) {
    const key = String(row.productId);
    stockByProduct.set(key, (stockByProduct.get(key) ?? 0) + row.quantity);
  }

  for (const item of items) {
    const pid = String(item.productId);
    const qty = typeof item.quantity === 'number' ? item.quantity : 0;

    if (qty < 1) {
      valid = false;
      issues.push({
        productId: pid,
        type: 'insufficient-stock',
        message: `Quantity must be at least 1 (got ${qty}).`,
        available: 0,
        requested: qty,
      });
      continue;
    }

    const product = productMap.get(pid);
    if (!product) {
      valid = false;
      issues.push({
        productId: pid,
        type: 'not-found',
        message: 'Product does not exist.',
        available: 0,
        requested: qty,
      });
      continue;
    }

    if (!product.isActive) {
      valid = false;
      issues.push({
        productId: pid,
        type: 'inactive',
        message: 'Product is currently inactive and cannot be ordered.',
        available: 0,
        requested: qty,
      });
      continue;
    }

    const available = stockByProduct.get(pid) ?? 0;
    if (available <= 0) {
      valid = false;
      issues.push({
        productId: pid,
        type: 'out-of-stock',
        message: 'Product is out of stock.',
        available,
        requested: qty,
      });
    } else if (available < qty) {
      valid = false;
      issues.push({
        productId: pid,
        type: 'insufficient-stock',
        message: `Only ${available} units in stock (requested ${qty}).`,
        available,
        requested: qty,
      });
    }
  }

  return { valid, issues };
}
