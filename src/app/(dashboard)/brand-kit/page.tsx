import { requirePageAuth } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { BrandKitClient, DEFAULT_KIT } from './BrandKitClient';

export const dynamic = 'force-dynamic';

/**
 * Brand Kit.
 *
 * Loads the caller's saved kit from the database — a brand-new account sees
 * the starter palette, and every save in the client persists through
 * PUT /api/me/brand-kit. No mock state anywhere on this page.
 */
export default async function BrandKitPage() {
  const authCtx = await requirePageAuth();

  const user = await prisma.user.findUnique({
    where: { id: authCtx.dbUserId },
    select: { brandKit: true },
  });

  const saved = (user?.brandKit ?? null) as
    | { colors?: unknown; headingFont?: unknown; bodyFont?: unknown; tones?: unknown; description?: unknown; banned?: unknown }
    | null;

  const initialKit = {
    colors: Array.isArray(saved?.colors) && saved.colors.length > 0 ? saved.colors : DEFAULT_KIT.colors,
    headingFont: typeof saved?.headingFont === 'string' ? saved.headingFont : DEFAULT_KIT.headingFont,
    bodyFont: typeof saved?.bodyFont === 'string' ? saved.bodyFont : DEFAULT_KIT.bodyFont,
    tones: Array.isArray(saved?.tones) && saved.tones.length > 0 ? saved.tones : DEFAULT_KIT.tones,
    description: typeof saved?.description === 'string' ? saved.description : DEFAULT_KIT.description,
    banned: Array.isArray(saved?.banned) && saved.banned.length > 0 ? saved.banned : DEFAULT_KIT.banned,
  };

  return <BrandKitClient initialKit={initialKit} />;
}
