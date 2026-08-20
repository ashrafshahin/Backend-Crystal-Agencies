import { Router } from 'express';
import { protect, requirePermission } from '../middleware/auth';
import {
  getActiveAlerts,
  resolveAlert,
  createAlert,
  getDashboardSummary,
} from '../controllers/alertController';

const alertRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Alerts
 *   description: Stock alerts (low-stock / overstock / expiring-soon) and inventory dashboard
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     AlertType:
 *       type: string
 *       enum: [low-stock, overstock, expiring-soon]
 *     AlertStatus:
 *       type: string
 *       enum: [active, resolved]
 *     StockAlert:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         productId:
 *           oneOf:
 *             - $ref: '#/components/schemas/ProductRef'
 *             - type: string
 *             - type: 'null'
 *         alertType:
 *           $ref: '#/components/schemas/AlertType'
 *         threshold:
 *           type: number
 *           nullable: true
 *           example: 20
 *         currentValue:
 *           type: number
 *           example: 8
 *         status:
 *           $ref: '#/components/schemas/AlertStatus'
 *         resolvedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         resolvedBy:
 *           oneOf:
 *             - type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 email:
 *                   type: string
 *                   format: email
 *             - type: string
 *             - type: 'null'
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     StockAlertBody:
 *       type: object
 *       required: [productId, alertType, currentValue]
 *       properties:
 *         productId:
 *           type: string
 *         alertType:
 *           $ref: '#/components/schemas/AlertType'
 *         threshold:
 *           type: number
 *           nullable: true
 *           minimum: 0
 *         currentValue:
 *           type: number
 *           minimum: 0
 *     DashboardSummary:
 *       type: object
 *       properties:
 *         lowStockCount:
 *           type: number
 *         overstockCount:
 *           type: number
 *         expiringSoonCount:
 *           type: number
 *         activeAlertCount:
 *           type: number
 *         inventoryValue:
 *           type: number
 *         totalUnits:
 *           type: number
 *         distinctProductsInStock:
 *           type: number
 *         outOfStockProductCount:
 *           type: number
 */


/**
 * @swagger
 * /api/v1/alerts/dashboard:
 *   get:
 *     tags: [Alerts]
 *     summary: Inventory dashboard summary (requires auth)
 *     description: |
 *       Returns aggregate counts and values useful as KPIs:
 *       - low / over / expiring-soon alert counts
 *       - total active alerts
 *       - inventory value (sum of unit price * qty across all rows)
 *       - total units in stock, distinct products stocked
 *       - count of products that have zero inventory
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Dashboard KPI summary }
 *       401: { description: Missing / invalid bearer token }
 */
alertRouter.get('/dashboard', protect, getDashboardSummary);

/**
 * @swagger
 * /api/v1/alerts:
 *   get:
 *     tags: [Alerts]
 *     summary: List active stock alerts (requires auth)
 *     description: Returns all alerts with status = active, newest first, with product summary populated.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of active stock alerts }
 *       401: { description: Missing / invalid bearer token }
 */
alertRouter.get('/', protect, getActiveAlerts);

/**
 * @swagger
 * /api/v1/alerts:
 *   post:
 *     tags: [Alerts]
 *     summary: Manually create a stock alert (requires `inventory:update`)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/StockAlertBody' }
 *     responses:
 *       201: { description: Alert created, with product summary populated }
 *       400: { description: Validation failure (bad productId, alertType, or numeric fields) }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Caller lacks `inventory:update` permission }
 *       404: { description: Product not found }
 */
alertRouter.post(
  '/',
  protect,
  requirePermission('inventory:update'),
  createAlert,
);

/**
 * @swagger
 * /api/v1/alerts/{id}/resolve:
 *   put:
 *     tags: [Alerts]
 *     summary: Mark a stock alert as resolved (requires `inventory:update`)
 *     description: Sets `status = resolved`, fills `resolvedAt` and records `resolvedBy` as the caller.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: StockAlert ObjectId
 *         schema: { type: string }
 *     responses:
 *       200: { description: Alert resolved, populated record returned }
 *       400: { description: Invalid ObjectId format }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Caller lacks `inventory:update` permission }
 *       404: { description: StockAlert not found }
 */
alertRouter.put(
  '/:id/resolve',
  protect,
  requirePermission('inventory:update'),
  resolveAlert,
);

export default alertRouter;
