import type { Types } from 'mongoose';
import Inventory from '../models/Inventory';
import StockAlert from '../models/StockAlert';
import Product from '../models/Product';
import type { IProduct, AlertType } from '../types';

const EXPIRING_SOON_DAYS = 30;

async function resolveIfNoLongerApplicable(
  productId: string | Types.ObjectId,
  alertType: AlertType,
  conditionStillActive: boolean,
): Promise<void> {
  if (conditionStillActive) return;
  await StockAlert.updateMany(
    { productId, alertType, status: 'active' },
    { $set: { status: 'resolved', resolvedAt: new Date() } },
  ).exec();
}

export async function checkAndCreateAlerts(
  productId: string | Types.ObjectId,
): Promise<void> {
  const rows = await Inventory.find({ productId }).exec();
  if (rows.length === 0) {
    await StockAlert.updateMany(
      { productId, status: 'active' },
      { $set: { status: 'resolved', resolvedAt: new Date() } },
    ).exec();
    return;
  }

  const totalQty = rows.reduce((sum, r) => sum + r.quantity, 0);
  const minThreshold = rows.reduce(
    (min, r) =>
      typeof r.minimumThreshold === 'number'
        ? min === null
          ? r.minimumThreshold
          : Math.min(min, r.minimumThreshold)
        : min,
    null as number | null,
  );
  const maxCapacity = rows.reduce(
    (max, r) =>
      typeof r.maximumCapacity === 'number'
        ? max === null
          ? r.maximumCapacity
          : Math.max(max, r.maximumCapacity)
        : max,
    null as number | null,
  );
  const soonestExpiry = rows.reduce<Date | null>((earliest, r) => {
    if (!(r.expirationDate instanceof Date)) return earliest;
    if (earliest === null || r.expirationDate < earliest) return r.expirationDate;
    return earliest;
  }, null);

  // --- low-stock ---------------------------------------------------------------
  const isLowStock =
    typeof minThreshold === 'number' &&
    minThreshold > 0 &&
    totalQty <= minThreshold;

  if (isLowStock && minThreshold !== null) {
    const existing = await StockAlert.findOne({
      productId,
      alertType: 'low-stock',
      status: 'active',
    }).exec();
    if (!existing) {
      await StockAlert.create({
        productId,
        alertType: 'low-stock',
        threshold: minThreshold,
        currentValue: totalQty,
        status: 'active',
      });
    } else {
      existing.currentValue = totalQty;
      existing.threshold = minThreshold;
      await existing.save();
    }
  }
  await resolveIfNoLongerApplicable(productId, 'low-stock', isLowStock);

  // --- overstock ---------------------------------------------------------------
  const isOverstock =
    typeof maxCapacity === 'number' &&
    maxCapacity > 0 &&
    totalQty > maxCapacity;

  if (isOverstock && maxCapacity !== null) {
    const existing = await StockAlert.findOne({
      productId,
      alertType: 'overstock',
      status: 'active',
    }).exec();
    if (!existing) {
      await StockAlert.create({
        productId,
        alertType: 'overstock',
        threshold: maxCapacity,
        currentValue: totalQty,
        status: 'active',
      });
    } else {
      existing.currentValue = totalQty;
      existing.threshold = maxCapacity;
      await existing.save();
    }
  }
  await resolveIfNoLongerApplicable(productId, 'overstock', isOverstock);

  // --- expiring-soon -----------------------------------------------------------
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + EXPIRING_SOON_DAYS);
  const isExpiringSoon = soonestExpiry !== null && soonestExpiry <= cutoff;

  if (isExpiringSoon && soonestExpiry !== null) {
    const daysRemaining = Math.ceil(
      (soonestExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    const existing = await StockAlert.findOne({
      productId,
      alertType: 'expiring-soon',
      status: 'active',
    }).exec();
    if (!existing) {
      await StockAlert.create({
        productId,
        alertType: 'expiring-soon',
        threshold: EXPIRING_SOON_DAYS,
        currentValue: daysRemaining,
        status: 'active',
      });
    } else {
      existing.currentValue = daysRemaining;
      existing.threshold = EXPIRING_SOON_DAYS;
      await existing.save();
    }
  }
  await resolveIfNoLongerApplicable(productId, 'expiring-soon', isExpiringSoon);
}

export async function updateProductStatus(
  productId: string | Types.ObjectId,
): Promise<void> {
  const product = await Product.findById(productId).exec();
  if (!product) return;

  const rows = await Inventory.find({ productId }).exec();
  const totalQty = rows.reduce((sum, r) => sum + r.quantity, 0);

  const p = product as unknown as IProduct & {
    save: () => Promise<unknown>;
  };
  p.stock = totalQty;
  if (totalQty <= 0) {
    p.isActive = p.isActive && false;
  }
  await p.save();
}
