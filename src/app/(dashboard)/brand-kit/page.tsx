import { requirePageAuth } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { BrandKitClient } from './BrandKitClient';
import { parseBrandKit } from '@/lib/brand-kit';

export const dynamic = 'force-dynamic';

/**
 * Brand Kit.
 *
 * Loads the caller's saved kit from the database. Every field falls back to the
 * empty default, so a new account starts blank rather than pre-filled with
 * choices it never made, and every save persists through PUT /api/me/brand-kit.
 * The parser is shared with the rewrite path (`/api/optimize`), which reads the
 * same record to apply the creator's tone and banned words.
 */
export default async function BrandKitPage() {
  const authCtx = await requirePageAuth();

  const user = await prisma.user.findUnique({
    where: { id: authCtx.dbUserId },
    select: { brandKit: true },
  });

  return <BrandKitClient initialKit={parseBrandKit(user?.brandKit ?? null)} />;
}
