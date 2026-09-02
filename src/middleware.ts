import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextFetchEvent, NextRequest } from 'next/server';

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
  // Plan/quota read for signed-out visitors. The route's own unauthenticated
  // branch answers a lean {plan:'free', authenticated:false} shape keyed by
  // IP-rate-limit; leaving it gated made that branch unreachable — every
  // signed-out poll got the middleware's 401 instead of the designed graceful
  // answer. It reads no user data and writes nothing.
  '/api/me/plan',
  // Client crash beacon. Public by necessity: global-error.tsx renders for
  // errors that happen before sign-in (and for auth failures themselves), so
  // requiring a session here would silently drop the reports worth having. The
  // route is IP-rate-limited, body-capped, and writes only to the log.
  '/api/telemetry',
  '/restore',
  // Public score cards. A share page renders ONLY the score, title, and
  // platform — the creator explicitly copied the link to publish it. The
  // report id is an unguessable cuid, so nothing is discoverable by walking.
  // /api/share/[id] feeds the OG image and exposes the same four fields.
  '/share/(.*)',
  '/api/share/(.*)',
  // Public community leaderboard (opt-in scores only).
  '/community',
  '/api/community',
  // The landing-page newsletter form. Its whole audience is people who do not
  // have an account yet, so requiring a session here would make the form answer
  // 401 to every visitor it exists for. Rate-limited by IP, body-capped, and it
  // writes exactly one column it was given.
  '/api/newsletter',
  // The embeddable SVG badge — same exposure as the share page it points at.
  '/api/badge/(.*)',
]);

/**
 * Every page path this app actually serves — public ones included.
 *
 * This list exists to answer /nonexistent-page with a 404 instead of a redirect
 * to sign-in. Deny-by-default is still the rule: a path in this list that is not
 * public requires a session, exactly as before. A path in NEITHER list is not a
 * page at all, so there is nothing to protect and nothing to sign in for — it
 * falls through to Next.js, which renders `app/not-found.tsx`. That also fixes
 * bare `/share` (only `/share/[id]` exists), which used to 307 to sign-in.
 *
 * The obvious hazard is a new signed-in page added to `app/(dashboard)/` and
 * forgotten here: it would fall through and render without a session, because no
 * dashboard page authenticates on its own. `src/middleware.test.ts` walks the app
 * directory and fails if any page route is missing from this list, so the hazard
 * is caught by the test suite rather than in production.
 */
const isKnownPage = createRouteMatcher([
  '/',
  '/community',
  '/legal(.*)',
  '/restore',
  '/share/(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/sso-callback',
  // app/(dashboard)/* — the route group is not part of the URL.
  '/ai-coach',
  '/ai-humanizer',
  '/analyses',
  '/analysis/(.*)',
  '/brand-kit',
  '/channel-analytics',
  '/connected-channels',
  '/dashboard',
  '/help',
  '/notifications',
  '/pricing',
  '/projects',
  '/reports',
  '/seo',
  '/settings',
  '/templates',
  '/upload',
]);

/**
 * Clerk's debug headers, appended to every response by `withDebugHeaders` in
 * @clerk/backend. They report internal auth state — `x-clerk-auth-status:
 * signed-out`, `x-clerk-auth-reason: dev-browser-missing` — to anyone who looks,
 * which is information the client has no use for.
 *
 * They are stripped in the wrapper below rather than in the handler, because
 * clerkMiddleware appends them to whatever the handler returns; there is nothing
 * to delete until after it runs. Deleting them is safe: the state that RSC
 * `auth()` reads travels separately, as `x-middleware-request-x-clerk-*` written
 * by `decorateRequest` after this point, and those names are untouched here.
 */
const CLERK_DEBUG_HEADERS = [
  'x-clerk-auth-status',
  'x-clerk-auth-reason',
  'x-clerk-auth-message',
] as const;

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
const withClerk = clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return NextResponse.next();

  const isApi = req.nextUrl.pathname.startsWith('/api/');

  // A page path that matches nothing in the app. Sending someone to sign in for
  // a page that does not exist is a dead end — they authenticate and land on a
  // 404 anyway — so hand it to Next.js and let not-found.tsx answer. Unknown
  // /api/* paths deliberately keep the 401: an unauthenticated caller learns
  // nothing about which endpoints exist.
  if (!isApi && !isKnownPage(req)) return NextResponse.next();

  const { userId } = await auth();
  if (!userId) {
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

export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  const res = await withClerk(req, event);
  if (res instanceof Response) {
    for (const header of CLERK_DEBUG_HEADERS) res.headers.delete(header);
  }
  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|otf|map)).*)',
    '/(api|trpc)(.*)',
  ],
};
