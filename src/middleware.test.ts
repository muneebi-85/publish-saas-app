/**
 * Guards the `isKnownPage` list in `middleware.ts`.
 *
 * That list is what lets an unrecognised path 404 instead of redirecting to
 * sign-in, and it works by enumeration. The failure mode it introduces is a new
 * page added under `app/(dashboard)/` and not added to the list: the middleware
 * would treat it as "not a page", skip the session check, and render it to
 * anyone — no dashboard page authenticates on its own, so nothing downstream
 * would catch it.
 *
 * So this test does not test the matcher. It walks `src/app`, derives the real
 * page routes from the filesystem, and fails if the list has fallen behind. The
 * list is read as text rather than imported because `middleware.ts` pulls in
 * `@clerk/nextjs/server`, which expects an Edge request context.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('.', import.meta.url));
const APP = join(SRC, 'app');

/**
 * Every URL path served by a `page.tsx`, derived the way Next.js derives it:
 * `(group)` and `_private` segments drop out of the URL, and `[param]` /
 * `[[...catchall]]` segments are replaced by a stand-in value below.
 */
function pageRoutes(dir: string, segments: string[] = []): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      const next =
        entry.startsWith('(') || entry.startsWith('_') ? segments : [...segments, entry];
      found.push(...pageRoutes(full, next));
    } else if (entry === 'page.tsx' || entry === 'page.ts') {
      found.push('/' + segments.join('/'));
    }
  }
  return found;
}

/** The literal patterns inside `createRouteMatcher([...])` for `isKnownPage`. */
function knownPagePatterns(): string[] {
  const source = readFileSync(join(SRC, 'middleware.ts'), 'utf8');
  const block = source.match(/const isKnownPage = createRouteMatcher\(\[([\s\S]*?)\]\);/);
  expect(block, 'isKnownPage was renamed or restructured — update this test').toBeTruthy();
  return Array.from(block![1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
}

/**
 * Does a pattern cover a route?
 *
 * Both sides come from this repo, so this handles only the two forms actually
 * used: an exact path, and a trailing `(.*)`. Anything else would need a real
 * path-to-regexp, and the assertion below fails loudly if one appears.
 */
function covers(pattern: string, route: string): boolean {
  const wildcard = pattern.indexOf('(.*)');
  if (wildcard === -1) return pattern === route;
  expect(
    pattern.slice(wildcard),
    `"${pattern}" has a wildcard that is not at the end; this test cannot reason about it`,
  ).toBe('(.*)');
  return route.startsWith(pattern.slice(0, wildcard));
}

/** A dynamic segment matches any value, so compare against a concrete stand-in. */
function concrete(route: string): string {
  return route.replace(/\[\[?\.\.\.[^\]]+\]?\]/g, 'x').replace(/\[[^\]]+\]/g, 'x');
}

describe('isKnownPage', () => {
  const routes = Array.from(new Set(pageRoutes(APP).map(concrete))).sort();
  const patterns = knownPagePatterns();

  it('finds the app directory', () => {
    // A silent zero here would make every assertion below vacuous.
    expect(routes.length).toBeGreaterThan(20);
    expect(patterns.length).toBeGreaterThan(10);
  });

  it('covers every page route in src/app', () => {
    const missing = routes.filter((route) => !patterns.some((p) => covers(p, route)));
    expect(
      missing,
      'These pages exist but isKnownPage does not list them, so the middleware ' +
        'will treat them as non-routes and skip the session check. Add them to ' +
        'src/middleware.ts.',
    ).toEqual([]);
  });

  it('lists no pattern that matches nothing', () => {
    // A stale entry is not a security problem, but it does mean a deleted page
    // still redirects to sign-in instead of 404ing.
    const dead = patterns.filter((p) => !routes.some((route) => covers(p, route)));
    expect(dead, 'These isKnownPage patterns match no page in src/app').toEqual([]);
  });
});
