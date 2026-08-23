/**
 * Clerk identity helpers that carry no framework dependencies.
 *
 * Split from `api-guards.ts` so this logic can be tested in a plain Node
 * process: that module imports `next/server` and the Clerk server runtime at
 * module scope, which pulls in a request context that does not exist outside a
 * server render.
 */

/**
 * The subset of a Clerk user this module needs. Structural rather than imported
 * so the helper stays independent of the Clerk SDK's own types — and so a null
 * user (no session) is representable, which is the case that matters most.
 */
export type ClerkUserLike = {
  primaryEmailAddressId?: string | null;
  emailAddresses?: { id: string; emailAddress: string }[];
} | null;

/**
 * Resolve the address Clerk considers primary, not whichever one happens to sit
 * first in the array. Order is not guaranteed, and billing receipts plus every
 * transactional mail key off this — sending a payment failure to a stale
 * secondary address is a real, silent failure. Falls back to the first entry
 * only when no primary id is set.
 */
export function primaryEmailOf(user: ClerkUserLike): string | null {
  // Blank entries are discarded up front. The return type promises an address or
  // nothing, and an empty string is neither — it would sail through a truthiness
  // check downstream and be handed to the mailer as a recipient.
  const addresses = (user?.emailAddresses ?? []).filter((a) => a?.emailAddress?.trim());
  if (addresses.length === 0) return null;
  const primaryId = user?.primaryEmailAddressId;
  if (primaryId) {
    const match = addresses.find((a) => a.id === primaryId);
    if (match) return match.emailAddress;
  }
  return addresses[0].emailAddress;
}
