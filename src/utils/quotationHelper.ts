import Quotation from '../models/Quotation';
import RFQ from '../models/RFQ';
import Product from '../models/Product';
import type { IProduct, IQuotationItem } from '../types';

export function generateRFQNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(100000 + Math.random() * 900000).toString();
  return `RFQ-${year}${month}${day}-${random}`;
}

export async function ensureUniqueRFQNumber(): Promise<string> {
  let rfqNumber: string;
  let exists: boolean;
  let attempts = 0;
  do {
    rfqNumber = generateRFQNumber();
    const found = await RFQ.findOne({ rfqNumber }).select('_id').exec();
    exists = found !== null;
    attempts++;
    if (attempts > 10) {
      const suffix = Math.floor(1000000 + Math.random() * 9000000).toString();
      rfqNumber = `RFQ-${Date.now().toString()}-${suffix}`;
      break;
    }
  } while (exists);
  return rfqNumber;
}

export function generateQuotationNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(100000 + Math.random() * 900000).toString();
  return `QUO-${year}${month}${day}-${random}`;
}

export async function ensureUniqueQuotationNumber(): Promise<string> {
  let quotationNumber: string;
  let exists: boolean;
  let attempts = 0;
  do {
    quotationNumber = generateQuotationNumber();
    const found = await Quotation.findOne({ quotationNumber })
      .select('_id')
      .exec();
    exists = found !== null;
    attempts++;
    if (attempts > 10) {
      const suffix = Math.floor(1000000 + Math.random() * 9000000).toString();
      quotationNumber = `QUO-${Date.now().toString()}-${suffix}`;
      break;
    }
  } while (exists);
  return quotationNumber;
}

type PriceProduct = {
  _id: unknown;
  name: string;
  sku: string;
};

export interface QuotationTotalsResult {
  totalAmount: number;
  tax: number;
  finalAmount: number;
  itemsWithSnapshots: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    subtotal: number;
    productName: string;
    productSku: string;
  }>;
}

export async function calculateQuotation(
  items: Array<{
    productId: unknown;
    quantity: number;
    unitPrice: number;
    discount?: number;
  }>,
  tax: number = 0,
): Promise<QuotationTotalsResult> {
  const productIds = items
    .map((i) => String(i.productId))
    .filter((id) => id && id.length > 0);

  const products = await Product.find({ _id: { $in: productIds } }).exec();
  const productMap = new Map<string, PriceProduct>();
  for (const p of products) {
    const cast = p as unknown as PriceProduct & { _id: unknown };
    productMap.set(String(cast._id), cast);
  }

  const itemsWithSnapshots: QuotationTotalsResult['itemsWithSnapshots'] = [];
  let totalAmount = 0;

  for (const item of items) {
    const pid = String(item.productId);
    const product = productMap.get(pid) ?? null;
    const quantity =
      typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 0;
    const unitPrice =
      typeof item.unitPrice === 'number' && item.unitPrice >= 0
        ? item.unitPrice
        : 0;
    const lineDiscount =
      typeof item.discount === 'number' && item.discount > 0 ? item.discount : 0;
    const rawLine = unitPrice * quantity - lineDiscount;
    const subtotal = Math.max(0, rawLine);
    totalAmount += subtotal;

    itemsWithSnapshots.push({
      productId: pid,
      quantity,
      unitPrice,
      discount: lineDiscount,
      subtotal,
      productName: product?.name ?? 'Unknown Product',
      productSku: product?.sku ?? 'UNKNOWN',
    });
  }

  const safeTax = typeof tax === 'number' && tax > 0 ? tax : 0;
  const finalAmount = totalAmount + safeTax;

  return {
    totalAmount,
    tax: safeTax,
    finalAmount,
    itemsWithSnapshots,
  };
}

export function isQuotationExpired(validUntil: Date): boolean {
  const now = new Date();
  const cutoff = new Date(validUntil);
  cutoff.setHours(23, 59, 59, 999);
  return now.getTime() > cutoff.getTime();
}

export function defaultValidUntil(days: number = 30): Date {
  const d = new Date();
  d.setDate(d.getDate() + Math.max(1, days));
  d.setHours(23, 59, 59, 999);
  return d;
}
