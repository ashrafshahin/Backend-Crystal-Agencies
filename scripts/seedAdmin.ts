import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User';
import Role from '../src/models/Role';
import { hashPassword } from '../src/utils/auth';
import type { IUser } from '../src/types';

/**
 * Seeds default super-admin users for first-time setup.
 *
 * Creates one or more users with the `super_admin` role so operators can
 * immediately log into a freshly-deployed instance and begin managing
 * the system. The script is **safe to re-run**: any email that already
 * exists is skipped with a warning instead of duplicated.
 *
 * Default users (all role = super_admin, isVerified = true):
 *   1.  email:    admin@crystalagencies.com
 *       password: AdminPass123!
 *   2.  email:    liontechuk@gmail.com
 *       password: Asdf123@
 *
 * NOTE: You MUST run `npm run seed` (seedRoles.ts) BEFORE this script,
 * otherwise the `super_admin` role will not exist and this script aborts.
 *
 * Run with: `npm run seed:admin`
 */

type AdminSeed = {
  name: string;
  email: string;
  password: string;
};

const ADMIN_USERS: AdminSeed[] = [
  {
    name: 'Crystal Agencies Admin',
    email: 'admin@crystalagencies.com',
    password: 'AdminPass123!',
  },
  {
    name: 'Liontech Admin',
    email: 'liontechuk@gmail.com',
    password: 'Asdf123@',
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
  console.log(`[SEED-ADMIN] Connected to MongoDB — ${mongoose.connection.host}`);

  const superAdminRole = await Role.findOne({ name: 'super_admin' }).exec();
  if (!superAdminRole) {
    console.error(
      '[SEED-ADMIN] ERROR: Could not find role "super_admin". ' +
        'Run `npm run seed` (seedRoles) first, then re-run this script.',
    );
    try {
      await mongoose.disconnect();
    } catch {
      /* ignore */
    }
    process.exit(1);
  }
  console.log(
    `[SEED-ADMIN] Found "super_admin" role (id: ${superAdminRole._id}).`,
  );

  const createdList: Array<AdminSeed & { userId: string }> = [];
  const skippedList: string[] = [];

  for (const seed of ADMIN_USERS) {
    const normalizedEmail = seed.email.toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail }).exec();
    if (existing) {
      console.warn(
        `[SEED-ADMIN] SKIP: A user with email "${seed.email}" already exists ` +
          `(id: ${existing._id}). No changes made.`,
      );
      skippedList.push(seed.email);
      continue;
    }

    console.log(
      `[SEED-ADMIN] No existing user for "${seed.email}" — creating admin user...`,
    );
    const hashed = await hashPassword(seed.password);

    const created = await User.create({
      name: seed.name,
      email: seed.email,
      password: hashed,
      role: superAdminRole._id,
      isVerified: true,
      verificationToken: null,
      resetToken: null,
    } as IUser);

    console.log(`[SEED-ADMIN] Admin created: ${seed.email}`);
    console.log(`[SEED-ADMIN]   User id : ${created._id}`);
    console.log(`[SEED-ADMIN]   Role    : super_admin (${superAdminRole._id})`);
    console.log(`[SEED-ADMIN]   Verified: true`);

    createdList.push({ ...seed, userId: String(created._id) });
  }

  console.log('');
  console.log(
    `[SEED-ADMIN] Summary: ${createdList.length} created, ${skippedList.length} skipped.`,
  );

  if (createdList.length > 0) {
    console.log('');
    console.log('============================================================');
    console.log('  ADMIN CREDENTIALS — SAVE THESE SECURELY AND DELETE AFTER ');
    console.log('  FIRST LOGIN OR CHANGE THE PASSWORD IMMEDIATELY.');
    console.log('============================================================');
    for (const u of createdList) {
      console.log(`  Email    : ${u.email}`);
      console.log(`  Password : ${u.password}`);
      console.log('------------------------------------------------------------');
    }
    console.log('============================================================');
    console.log('');
    console.warn(
      '[SEED-ADMIN] REMINDER: Default passwords are NOT suitable for ' +
        'production environments. Update them via the user profile or ' +
        'auth endpoints as soon as you log in.',
    );
  } else if (skippedList.length > 0) {
    console.warn(
      '[SEED-ADMIN] All target admin users already existed. If you need ' +
        'to reset a password, use the password reset flow or modify the ' +
        'user directly in the database.',
    );
  }

  await mongoose.disconnect();
  console.log('[SEED-ADMIN] Done. Disconnected from MongoDB.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[SEED-ADMIN] Fatal error while seeding admin users:', err);
  try {
    mongoose.disconnect().catch(() => void 0);
  } catch {
    /* ignore */
  }
  process.exit(1);
});
