/**
 * Prisma client singleton.
 *
 * Next.js dev hot-reloads modules on every request, which without this guard
 * would leak a new PrismaClient per reload and eventually exhaust DB pool.
 * We cache the instance on globalThis so the same client is reused.
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
