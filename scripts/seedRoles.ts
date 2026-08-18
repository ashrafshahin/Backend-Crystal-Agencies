import 'dotenv/config';
import mongoose from 'mongoose';
import Role from '../src/models/Role';
import type { IRole } from '../src/types';

/**
 * Initialises the six out-of-the-box system roles.
 *
 *   - super_admin       (`*`)       — full access to every permission
 *   - sales_staff                   — sales, quotes, orders, customers
 *   - inventory_staff               — products, stock movements, catalog
 *   - support_staff                 — customers, tickets, RFQs, orders(read)
 *   - marketing_staff               — products(read), catalog, analytics(read)
 *   - customer                      — self-service only (profile, orders, etc.)
 *
 * Every role is marked `isSystem: true` so application-level code can
 * refuse to delete them later. The script is **destructive**: it first
 * deletes any existing roles, then inserts the canonical set above, so
 * re-running it at any time resets the role definitions back to baseline.
 *
 * Run with: `npm run seed`
 */
const SYSTEM_ROLES: Array<Omit<IRole, '_id' | 'createdAt' | 'updatedAt'>> = [
  {
    name: 'super_admin',
    description:
      'Full unrestricted system access. Reserved for platform owners/engineers.',
    permissions: ['*'],
    isSystem: true,
  },
  {
    name: 'sales_staff',
    description:
      'Sales team: manage customers, orders, quotations and RFQ responses.',
    permissions: [
      'users:manage',
      'user:read',
      'user:write',
      'product:read',
      'order:read',
      'order:write',
      'order:delete',
      'rfq:read',
      'rfq:write',
      'rfq:delete',
      'inventory:read',
    ],
    isSystem: true,
  },
  {
    name: 'inventory_staff',
    description:
      'Inventory / warehouse staff: manage the product catalogue and stock levels.',
    permissions: [
      'product:read',
      'product:write',
      'product:delete',
      'inventory:read',
      'inventory:write',
      'order:read',
    ],
    isSystem: true,
  },
  {
    name: 'support_staff',
    description:
      'Customer support staff: handle tickets, respond to RFQs, assist customers.',
    permissions: [
      'user:read',
      'user:write',
      'order:read',
      'rfq:read',
      'rfq:write',
      'product:read',
    ],
    isSystem: true,
  },
  {
    name: 'marketing_staff',
    description:
      'Marketing team: view products / analytics, manage catalog presentation.',
    permissions: [
      'product:read',
      'product:write',
      'order:read',
      'rfq:read',
      'user:read',
    ],
    isSystem: true,
  },
  {
    name: 'customer',
    description:
      'Default role for self-registered B2C and B2B customers (self-service only).',
    permissions: [
      'profile:read',
      'profile:write',
      'product:read',
      'order:read',
      'order:write',
      'rfq:read',
      'rfq:write',
      'cart:read',
      'cart:write',
    ],
    isSystem: true,
  },
];

async function main(): Promise<void> {
  const defaultDevUri = 'mongodb://localhost:27017/crystal-agencies';
  const uri =
    process.env.MONGODB_URI ??
    process.env.MONGO_URI ??
    (process.env.NODE_ENV !== 'production' ? defaultDevUri : undefined);
  if (!uri) {
    throw new Error(
      'MONGODB_URI environment variable must be set to run the seed script.',
    );
  }

  await mongoose.connect(uri);
  console.log(`[SEED] Connected to MongoDB — ${mongoose.connection.host}`);

  const deleted = await Role.deleteMany({});
  console.log(`[SEED] Deleted ${deleted.deletedCount} existing role documents.`);

  const inserted = await Role.insertMany(SYSTEM_ROLES as unknown as IRole[]);
  console.log(
    `[SEED] Inserted ${inserted.length} system roles: ${inserted
      .map((r) => (r as unknown as { name: string }).name)
      .join(', ')}.`,
  );

  await mongoose.disconnect();
  console.log('[SEED] Done. Disconnected from MongoDB.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[SEED] Fatal error while seeding roles:', err);
  try {
    mongoose.disconnect().catch(() => void 0);
  } catch {
    /* ignore */
  }
  process.exit(1);
});
