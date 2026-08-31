import { Router } from 'express';
import { protect, requirePermission } from '../middleware/auth';
import {
  getPageBySlug,
  getAllPages,
  createPage,
  updatePage,
  deletePage,
  publishPage,
} from '../controllers/pageController';

const pageRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Pages (CMS)
 *   description: Content Management System — static pages for website content
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Page:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         slug: { type: string, example: "about", description: "URL-safe unique slug" }
 *         title: { type: string, example: "About Crystal Agencies" }
 *         content: { type: string, description: "Rich text / HTML body content" }
 *         metaDescription: { type: string, nullable: true, example: "Learn about Crystal Agencies' history and mission." }
 *         metaKeywords: { type: string, nullable: true, example: "crystal, agencies, about, company" }
 *         published: { type: boolean, example: true }
 *         publishedAt: { type: string, format: 'date-time', nullable: true }
 *         updatedBy:
 *           type: object
 *           nullable: true
 *           properties:
 *             _id: { type: string }
 *             name: { type: string }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *     PageList:
 *       type: object
 *       properties:
 *         pages:
 *           type: array
 *           items: { $ref: '#/components/schemas/Page' }
 *         count: { type: integer }
 *     CreatePageBody:
 *       type: object
 *       required: [slug, title, content]
 *       properties:
 *         slug: { type: string, example: "about", description: "Lowercase letters, numbers, hyphens" }
 *         title: { type: string, example: "About Crystal Agencies" }
 *         content: { type: string, description: "Rich text / HTML body" }
 *         metaDescription: { type: string, nullable: true }
 *         metaKeywords: { type: string, nullable: true }
 *         published: { type: boolean, default: false }
 *     UpdatePageBody:
 *       type: object
 *       properties:
 *         title: { type: string }
 *         content: { type: string }
 *         metaDescription: { type: string, nullable: true }
 *         metaKeywords: { type: string, nullable: true }
 *         published: { type: boolean }
 */

/**
 * @swagger
 * /api/v1/pages:
 *   get:
 *     tags: [Pages (CMS)]
 *     summary: List all CMS pages (requires `cms:manage`)
 *     description: Admin/staff view showing every page with its publish status, newest-first.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: All pages with count metadata
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/PageList' }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Missing `cms:manage` permission }
 */
pageRouter.get('/', protect, requirePermission('cms:manage'), getAllPages);

/**
 * @swagger
 * /api/v1/pages:
 *   post:
 *     tags: [Pages (CMS)]
 *     summary: Create a new CMS page (requires `cms:manage`)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreatePageBody' }
 *     responses:
 *       201: { description: Page created, with updatedBy populated }
 *       400: { description: Validation failure (slug format, required fields, etc.) }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Missing `cms:manage` permission }
 *       409: { description: Slug already exists (duplicate unique index) }
 */
pageRouter.post('/', protect, requirePermission('cms:manage'), createPage);

/**
 * @swagger
 * /api/v1/pages/{slug}:
 *   get:
 *     tags: [Pages (CMS)]
 *     summary: Fetch a single published page by slug (public)
 *     description: Only returns pages where `published: true`. Use for rendering public pages like /about, /privacy, etc.
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         description: Page slug (e.g. "about", "privacy-policy")
 *         schema: { type: string }
 *     responses:
 *       200: { description: Published page body + SEO meta }
 *       400: { description: Slug parameter missing or invalid }
 *       404: { description: Page not found or not published }
 */
pageRouter.get('/:slug', getPageBySlug);

/**
 * @swagger
 * /api/v1/pages/{id}/publish:
 *   put:
 *     tags: [Pages (CMS)]
 *     summary: Toggle publish status of a page (requires `cms:manage`)
 *     description: Flips `published` boolean and manages `publishedAt` timestamp accordingly.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Page ObjectId
 *         schema: { type: string }
 *     responses:
 *       200: { description: Page publish status toggled successfully }
 *       400: { description: Invalid ObjectId format }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Missing `cms:manage` permission }
 *       404: { description: Page not found }
 */
pageRouter.put('/:id/publish', protect, requirePermission('cms:manage'), publishPage);

/**
 * @swagger
 * /api/v1/pages/{id}:
 *   put:
 *     tags: [Pages (CMS)]
 *     summary: Update a CMS page (requires `cms:manage`)
 *     description: Updates title/content/meta and optionally toggles `published` (which also manages `publishedAt`).
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Page ObjectId
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdatePageBody' }
 *     responses:
 *       200: { description: Page updated successfully }
 *       400: { description: Validation failure or bad ObjectId }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Missing `cms:manage` permission }
 *       404: { description: Page not found }
 *       409: { description: Slug collision if slug was changed }
 */
pageRouter.put('/:id', protect, requirePermission('cms:manage'), updatePage);

/**
 * @swagger
 * /api/v1/pages/{id}:
 *   delete:
 *     tags: [Pages (CMS)]
 *     summary: Delete a CMS page (requires `cms:manage`)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Page ObjectId to delete
 *         schema: { type: string }
 *     responses:
 *       200: { description: Page deleted }
 *       400: { description: Invalid ObjectId format }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Missing `cms:manage` permission }
 *       404: { description: Page not found }
 */
pageRouter.delete('/:id', protect, requirePermission('cms:manage'), deletePage);

export default pageRouter;
