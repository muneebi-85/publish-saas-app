import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/pricing',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/legal(.*)',
  '/robots.txt',
  '/sitemap.xml',
  '/api/billing/webhook',
  '/api/billing/success',
  '/api/webhooks/clerk',
  '/api/analyze/worker',
  // Authenticates itself with a constant-time CRON_SECRET bearer check, and
  // refuses to run at all when that secret is unset.
  '/api/cron/(.*)',
  '/api/health',
  '/restore',
]);

/**
 * SECURITY MODEL
 * ──────────────
 * The middleware only enforces AUTHENTICATION. It deliberately performs NO
 * plan/quota gating, because the Edge runtime cannot read the database and any
 * signal it could read here (cookies, headers) is attacker-controllable.
 *
 * Plan and quota are authoritative in the database and enforced inside each
 * gated route handler (Node runtime) via requireAuth()/requirePaidPlan() and
 * incrementAuditsInTx(). That is the single choke point a forged request cannot
 * bypass. See src/lib/api-guards.ts and src/lib/session.ts.
 *
 * Public routes above are either marketing pages or machine endpoints that
 * verify their own signatures (Lemon Squeezy HMAC, Clerk svix, QStash).
 * There is NO development bypass — auth behaves identically in every env.
 */
export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return NextResponse.next();

  const { userId } = await auth();
  if (!userId) {
    const isApi = req.nextUrl.pathname.startsWith('/api/');
    if (isApi) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/sign-in';
    url.search = `redirect_url=${encodeURIComponent(req.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|otf|map)).*)',
    '/(api|trpc)(.*)',
  ],
};
