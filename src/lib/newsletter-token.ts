import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signed unsubscribe tokens for the newsletter list.
 *
 * CAN-SPAM/GDPR require every non-transactional mail to carry a working
 * opt-out. The list is anonymous (subscriber rows carry no Clerk identity),
 * so the only safe credential is an unguessable token bound to the email and
 * derived from a server secret — the same HMAC discipline the billing webhook
 * applies to Lemon Squeezy signatures.
 *
 * Tokens are perpetual on purpose: a "your link expired, log in" dead end for
 * a mailing-list member who has no account is exactly the broken opt-out the
 * regulations exist to prevent. The email itself IS the identity.
 */

/** 28-byte base64url token body — 168 bits of entropy before the signature. */
function tokenSecret(): string {
  // Every deployment already needs a server secret for cron; reusing it means
  // no new configuration for an existing operator. Rotating CRON_SECRET also
  // rotates unsubscribe tokens, which is acceptable (see above for why
  // expiry-permanence is not the property we rely on — the DB row is the
  // record of truth, the token is only the key to it).
  return process.env.CRON_SECRET || process.env.DATABASE_URL || 'publish-unsub-fallback';
}

/** Email part of the canonical form — same normalization as the subscribe route. */
function canonicalEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function signUnsubscribeToken(email: string): string {
  const payload = Buffer.from(canonicalEmail(email)).toString('base64url');
  const sig = createHmac('sha256', tokenSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/**
 * Verify a token and return the bound email, or null on any mismatch.
 * Constant-time compare, and the payload is re-signed rather than parsed
 * first, so a forged email never even reaches the DB.
 */
export function verifyUnsubscribeToken(token: string): string | null {
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', tokenSecret()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const email = Buffer.from(payload, 'base64url').toString('utf8');
  // A token that does not round-trip was tampered with or truncated.
  if (canonicalEmail(email) !== email) return null;
  // Defensive shape check before this string ever becomes a DB lookup.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
