import { Router } from 'express';
import { protect, requirePermission } from '../middleware/auth';
import {
  getRelatedProducts,
  getAllRelationships,
  createRelationship,
  updateRelationship,
  deleteRelationship,
  getRecommendations,
} from '../controllers/relationshipController';

const relationshipRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Relationships
 *   description: Product-to-product relationships (complementary / compatible / frequently bought together)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     RelationshipType:
 *       type: string
 *       enum: [complementary, compatible, frequently_bought_together]
 *     ProductRelationship:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         sourceProductId:
 *           oneOf:
 *             - $ref: '#/components/schemas/ProductRef'
 *             - type: string
 *             - type: 'null'
 *         relatedProductId:
 *           oneOf:
 *             - $ref: '#/components/schemas/ProductRef'
 *             - type: string
 *             - type: 'null'
 *         type: { $ref: '#/components/schemas/RelationshipType' }
 *         score: { type: number, minimum: 0, maximum: 100, example: 72 }
 *         isActive: { type: boolean, example: true }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *     ProductRecommendation:
 *       type: object
 *       properties:
 *         relationshipId: { type: string }
 *         type: { $ref: '#/components/schemas/RelationshipType' }
 *         score: { type: number, example: 88 }
 *         product: { $ref: '#/components/schemas/ProductRef' }
 *     RelationshipBody:
 *       type: object
 *       required: [sourceProductId, relatedProductId, type]
 *       properties:
 *         sourceProductId: { type: string, description: "Source Product ObjectId" }
 *         relatedProductId: { type: string, description: "Related Product ObjectId" }
 *         type: { $ref: '#/components/schemas/RelationshipType' }
 *         score: { type: number, minimum: 0, maximum: 100, example: 50 }
 *         isActive: { type: boolean, example: true }
 *     RelationshipUpdateBody:
 *       type: object
 *       properties:
 *         type: { $ref: '#/components/schemas/RelationshipType' }
 *         score: { type: number, minimum: 0, maximum: 100, example: 75 }
 *         isActive: { type: boolean, example: true }
 */

/**
 * @swagger
 * /api/v1/products/{id}/recommendations:
 *   get:
 *     tags: [Relationships]
 *     summary: Public product recommendations (no auth required)
 *     description: Returns active relationships for a product ordered by score (desc), with related product summary.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Source Product ObjectId
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         required: false
 *         description: Max recommendations (default 12, max 50)
 *         schema: { type: integer, minimum: 1, example: 12 }
 *     responses:
 *       200: { description: Recommendations, ordered by score }
 *       400: { description: Invalid ObjectId format or bad limit }
 */
relationshipRouter.get('/products/:id/recommendations', getRecommendations);

/**
 * @swagger
 * /api/v1/relationships:
 *   get:
 *     tags: [Relationships]
 *     summary: List all product relationships (requires auth)
 *     description: Management list that populates both source and related product summaries. Capped at 500 rows.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: All product relationships }
 *       401: { description: Missing / invalid bearer token }
 */
relationshipRouter.get('/', protect, getAllRelationships);

/**
 * @swagger
 * /api/v1/relationships/{id}:
 *   get:
 *     tags: [Relationships]
 *     summary: List related products for a source product (requires auth)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Source Product ObjectId
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         required: false
 *         schema: { $ref: '#/components/schemas/RelationshipType' }
 *         description: Optional relationship type filter
 *       - in: query
 *         name: limit
 *         required: false
 *         description: Max results (default 20, max 100)
 *         schema: { type: integer, minimum: 1, example: 20 }
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Active related products, score-ordered }
 *       400: { description: Invalid ObjectId or bad query params }
 *       401: { description: Missing / invalid bearer token }
 */
relationshipRouter.get('/:id', protect, getRelatedProducts);

/**
 * @swagger
 * /api/v1/relationships:
 *   post:
 *     tags: [Relationships]
 *     summary: Create a product relationship (requires `product:write`)
 *     description: Validates that both products exist and prevents duplicates via the (source, related, type) unique index.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RelationshipBody' }
 *     responses:
 *       201: { description: Relationship created }
 *       400: { description: Validation failure (bad ids / type / score or self-reference) }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Caller lacks `product:write` permission }
 *       409: { description: Duplicate relationship with same source/type/related already exists }
 */
relationshipRouter.post(
  '/',
  protect,
  requirePermission('product:write'),
  createRelationship,
);

/**
 * @swagger
 * /api/v1/relationships/{id}:
 *   put:
 *     tags: [Relationships]
 *     summary: Update a product relationship (requires `product:write`)
 *     description: Partial update of `type`, `score`, and/or `isActive`. Validates range and enums.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ProductRelationship ObjectId
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RelationshipUpdateBody' }
 *     responses:
 *       200: { description: Relationship updated, populated record returned }
 *       400: { description: Validation failure }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Caller lacks `product:write` permission }
 *       404: { description: Relationship not found }
 */
relationshipRouter.put(
  '/:id',
  protect,
  requirePermission('product:write'),
  updateRelationship,
);

/**
 * @swagger
 * /api/v1/relationships/{id}:
 *   delete:
 *     tags: [Relationships]
 *     summary: Delete / deactivate a product relationship (requires `product:write`)
 *     description: |
 *       Default is **soft delete** (`isActive = false`).
 *       To permanently remove, append `?soft=false`.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ProductRelationship ObjectId
 *         schema: { type: string }
 *       - in: query
 *         name: soft
 *         required: false
 *         description: "Omit for soft-deactivate; pass `false` to permanently delete"
 *         schema: { type: boolean, example: true }
 *     responses:
 *       200: { description: Deleted / deactivated successfully, includes mode ("soft" or "hard") }
 *       400: { description: Invalid ObjectId format }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Caller lacks `product:write` permission }
 *       404: { description: Relationship not found }
 */
relationshipRouter.delete(
  '/:id',
  protect,
  requirePermission('product:write'),
  deleteRelationship,
);

export default relationshipRouter;
