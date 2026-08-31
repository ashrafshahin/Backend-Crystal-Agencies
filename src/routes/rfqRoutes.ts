import { Router } from 'express';
import { protect } from '../middleware/auth';
import {
  createRFQ,
  getRFQ,
  getUserRFQs,
  updateRFQStatus,
} from '../controllers/rfqController';

const rfqRouter = Router();

/**
 * @swagger
 * tags:
 *   name: RFQs
 *   description: Customer Requests for Quotation — buyers submit bulk RFQ lines with contact & delivery info, staff respond via Quotations
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     RFQStatus:
 *       type: string
 *       enum: [pending, quoted, accepted, rejected, expired]
 *       example: pending
 *     RFQLine:
 *       type: object
 *       required: [productId, quantity]
 *       properties:
 *         _id: { type: string, description: "RFQ-line ObjectId" }
 *         productId: { type: string, description: "Product ObjectId" }
 *         product: { $ref: '#/components/schemas/ProductRef' }
 *         quantity: { type: integer, minimum: 1, example: 50 }
 *         notes: { type: string, example: "Palletised packaging preferred" }
 *     RFQ:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         userId: { type: string }
 *         rfqNumber: { type: string, example: "RFQ-20260821-123456" }
 *         items: { type: array, items: { $ref: '#/components/schemas/RFQLine' } }
 *         itemCount: { type: integer, description: "Unique lines in this RFQ" }
 *         totalQuantity: { type: integer, description: "Sum of line quantities" }
 *         companyName: { type: string, example: "Acme Imports Ltd." }
 *         contactPerson: { type: string, example: "Jane Doe" }
 *         email: { type: string, format: email, example: "jane@acme.example" }
 *         phone: { type: string, example: "+1 555-0199" }
 *         requiredDate: { type: string, format: 'date-time', nullable: true, description: "Target date goods are needed by" }
 *         deliveryLocation: { type: string, example: "Dock #7, San Francisco" }
 *         specialRequirements: { type: string, example: "Forklift-ready, temperature controlled" }
 *         status: { $ref: '#/components/schemas/RFQStatus' }
 *         createdAt: { type: string, format: 'date-time' }
 *         updatedAt: { type: string, format: 'date-time' }
 *     CreateRFQBody:
 *       type: object
 *       required: [items, companyName, contactPerson, email]
 *       properties:
 *         items:
 *           type: array
 *           items:
 *             type: object
 *             required: [productId, quantity]
 *             properties:
 *               productId: { type: string }
 *               quantity: { type: integer, minimum: 1 }
 *               notes: { type: string }
 *         companyName: { type: string }
 *         contactPerson: { type: string }
 *         email: { type: string, format: email }
 *         phone: { type: string }
 *         requiredDate: { type: string, format: date }
 *         deliveryLocation: { type: string }
 *         specialRequirements: { type: string }
 *     UpdateRFQStatusBody:
 *       type: object
 *       required: [status]
 *       properties:
 *         status: { $ref: '#/components/schemas/RFQStatus' }
 */

rfqRouter.use(protect);

/**
 * @swagger
 * /api/v1/rfqs:
 *   post:
 *     tags: [RFQs]
 *     summary: Submit a new RFQ (requires auth)
 *     description: "Validates each product exists and that quantities are positive. Generates a unique rfqNumber. Initial status is 'pending'."
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateRFQBody' }
 *     responses:
 *       201: { description: RFQ created, includes lines with populated products }
 *       400: { description: Validation errors (missing fields, invalid email, non-existent product, bad quantities) }
 *       401: { description: Missing / invalid bearer token }
 */
rfqRouter.post('/', createRFQ);

/**
 * @swagger
 * /api/v1/rfqs/{id}:
 *   get:
 *     tags: [RFQs]
 *     summary: Get a single RFQ by id (requires auth)
 *     description: Returns the RFQ with product refs populated. The RFQ must belong to the authenticated user.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: RFQ ObjectId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Single RFQ with populated product lines
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rfq: { $ref: '#/components/schemas/RFQ' }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: RFQ does not belong to the requesting user }
 *       404: { description: RFQ not found }
 */
rfqRouter.get('/:id', getRFQ);

/**
 * @swagger
 * /api/v1/rfqs:
 *   get:
 *     tags: [RFQs]
 *     summary: List all RFQs for the current user (requires auth)
 *     description: "Returns RFQs sorted newest first. Supports ?status=pending,quoted comma-separated filter; includes summary counts in meta."
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *         description: "Comma-separated RFQStatus values, e.g. pending,quoted"
 *         required: false
 *     responses:
 *       200:
 *         description: List of RFQs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rfqs:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/RFQ' }
 *       401: { description: Missing / invalid bearer token }
 */
rfqRouter.get('/', getUserRFQs);

/**
 * @swagger
 * /api/v1/rfqs/{id}/status:
 *   put:
 *     tags: [RFQs]
 *     summary: Update the lifecycle status of an RFQ (requires auth)
 *     description: "Allows transitions between any statuses: pending → quoted → accepted → rejected / expired. Must own the RFQ."
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: RFQ ObjectId
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateRFQStatusBody' }
 *     responses:
 *       200: { description: Status updated, returns the refreshed RFQ }
 *       400: { description: Invalid status value }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: RFQ does not belong to the requesting user }
 *       404: { description: RFQ not found }
 */
rfqRouter.put('/:id/status', updateRFQStatus);

export default rfqRouter;
