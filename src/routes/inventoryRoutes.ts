import { Router } from 'express';
import { protect, requirePermission } from '../middleware/auth';
import {
  getInventory,
  getAllInventory,
  adjustStock,
  setThreshold,
  getLowStockItems,
  getInventoryHistory,
} from '../controllers/inventoryController';

const inventoryRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Inventory
 *   description: Warehouse inventory tracking, stock adjustments and history
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ProductRef:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         name: { type: string, example: "Widget Pro 500" }
 *         sku: { type: string, example: "WIDGET-PRO-500" }
 *         slug: { type: string, example: "widget-pro-500" }
 *         isActive: { type: boolean }
 *     InventoryStatus:
 *       type: string
 *       enum: [in-stock, low-stock, out-of-stock, discontinued]
 *     AdjustmentType:
 *       type: string
 *       enum: [add, remove, correction, return]
 *     Inventory:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         productId:
 *           oneOf:
 *             - $ref: '#/components/schemas/ProductRef'
 *             - type: string
 *             - type: 'null'
 *         warehouseLocation: { type: string, nullable: true, example: "Aisle 3 / Bin 12" }
 *         quantity: { type: number, example: 120, description: "Current on-hand quantity" }
 *         minimumThreshold: { type: number, nullable: true, example: 20 }
 *         maximumCapacity: { type: number, nullable: true, example: 500 }
 *         reorderLevel: { type: number, nullable: true, example: 15 }
 *         reorderQuantity: { type: number, nullable: true, example: 100 }
 *         lastRestocked: { type: string, format: date-time, nullable: true }
 *         expirationDate: { type: string, format: date-time, nullable: true }
 *         status: { $ref: '#/components/schemas/InventoryStatus' }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *     InventoryAdjustment:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         productId:
 *           oneOf:
 *             - $ref: '#/components/schemas/ProductRef'
 *             - type: string
 *             - type: 'null'
 *         adjustmentType: { $ref: '#/components/schemas/AdjustmentType' }
 *         quantity: { type: number, example: 20, description: "Magnitude of the adjustment (positive, sign implied by type)" }
 *         reason: { type: string, nullable: true, example: "Weekly delivery restock" }
 *         reference: { type: string, nullable: true, example: "PO-2026-142" }
 *         adjustedBy:
 *           oneOf:
 *             - type: object
 *               properties:
 *                 _id: { type: string }
 *                 name: { type: string }
 *                 email: { type: string, format: email }
 *             - type: string
 *             - type: 'null'
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *     AdjustStockBody:
 *       type: object
 *       required: [adjustmentType, quantity]
 *       properties:
 *         adjustmentType: { $ref: '#/components/schemas/AdjustmentType' }
 *         quantity: { type: number, minimum: 1, example: 20 }
 *         reason: { type: string, nullable: true }
 *         reference: { type: string, nullable: true }
 *     SetThresholdBody:
 *       type: object
 *       properties:
 *         minimumThreshold: { type: number, minimum: 0, example: 20 }
 *         maximumCapacity: { type: number, minimum: 0, example: 500 }
 */

/**
 * @swagger
 * /api/v1/inventory:
 *   get:
 *     tags: [Inventory]
 *     summary: List all inventory records (requires auth)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of inventory rows with product summary populated }
 *       401: { description: Missing / invalid bearer token }
 */
inventoryRouter.get('/', protect, getAllInventory);

/**
 * @swagger
 * /api/v1/inventory/low-stock:
 *   get:
 *     tags: [Inventory]
 *     summary: List inventory items below minimum threshold (requires auth)
 *     description: Returns rows with status `low-stock` or `out-of-stock`, sorted by ascending quantity.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of low/out-of-stock inventory rows }
 *       401: { description: Missing / invalid bearer token }
 */
inventoryRouter.get('/low-stock', protect, getLowStockItems);

/**
 * @swagger
 * /api/v1/inventory/{id}:
 *   get:
 *     tags: [Inventory]
 *     summary: Fetch a single inventory record by inventory id or product id (requires auth)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Either the Inventory document id or a Product document id (looked up via productId index)
 *         schema: { type: string }
 *     responses:
 *       200: { description: Inventory row with product summary populated }
 *       400: { description: Invalid ObjectId format }
 *       401: { description: Missing / invalid bearer token }
 *       404: { description: Inventory record not found }
 */
inventoryRouter.get('/:id', protect, getInventory);

/**
 * @swagger
 * /api/v1/inventory/{id}/adjust:
 *   post:
 *     tags: [Inventory]
 *     summary: Adjust stock quantity for a product / inventory row (requires `inventory:update`)
 *     description: |
 *       Accepts `add`, `remove`, `correction`, or `return` adjustments.
 *       Automatically derives `status` (in-stock / low-stock / out-of-stock) from quantity vs minimumThreshold,
 *       writes an InventoryAdjustment audit row, and syncs `Product.stock` across all inventory rows for the product.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Inventory document id or Product document id (auto-creates an inventory row if only product exists)
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AdjustStockBody' }
 *     responses:
 *       200: { description: Stock adjusted, updated inventory returned }
 *       400: { description: Validation failure (bad type, qty, negative result, invalid ObjectId) }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Caller lacks `inventory:update` permission }
 *       404: { description: Inventory or Product record not found }
 */
inventoryRouter.post(
  '/:id/adjust',
  protect,
  requirePermission('inventory:update'),
  adjustStock,
);

/**
 * @swagger
 * /api/v1/inventory/{id}/threshold:
 *   post:
 *     tags: [Inventory]
 *     summary: Update minimum / maximum thresholds for an inventory row (requires `inventory:update`)
 *     description: Also re-derives the inventory status based on the new minimumThreshold vs current quantity.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Inventory document id or Product document id
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/SetThresholdBody' }
 *     responses:
 *       200: { description: Thresholds updated, inventory row returned }
 *       400: { description: Validation failure (negative values, max < min, invalid ObjectId) }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Caller lacks `inventory:update` permission }
 *       404: { description: Inventory record not found }
 */
inventoryRouter.post(
  '/:id/threshold',
  protect,
  requirePermission('inventory:update'),
  setThreshold,
);

/**
 * @swagger
 * /api/v1/inventory/{id}/history:
 *   get:
 *     tags: [Inventory]
 *     summary: Retrieve adjustment history for an inventory row / product (requires auth)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Inventory document id or Product document id
 *         schema: { type: string }
 *     responses:
 *       200: { description: Chronological adjustment history (newest first) with product + adjustedBy populated }
 *       400: { description: Invalid ObjectId format }
 *       401: { description: Missing / invalid bearer token }
 *       404: { description: Inventory or Product record not found }
 */
inventoryRouter.get('/:id/history', protect, getInventoryHistory);

export default inventoryRouter;
