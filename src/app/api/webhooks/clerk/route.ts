/**
 * Clerk user lifecycle webhook.
 *
 * Mirrors identity into the local `User` row so the rest of the app can join on
 * a database id instead of calling Clerk on every request. Every branch is
 * signature-verified through svix before it touches the database.
 *
 * The interesting decision is `user.deleted`: it is the one event that destroys
 * data, so cancelling billing has to succeed before the row goes away. See the
 * comment on that branch.
 */
import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';
import { primaryEmailOf } from '@/lib/clerk-identity';

export const runtime = 'nodejs';

/**
 * Subscription states that still bill a card. Kept identical to the set in
 * /api/account/delete — the two erasure paths must agree on what "still costs
 * the customer money" means, or one of them leaves a live subscription behind.
 */
const BILLABLE = new Set(['active', 'on_trial', 'past_due', 'unpaid']);

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    // A deployment without the secret can never verify a webhook. Return a
    // clean 503 instead of letting the throw become a raw 500.
    return NextResponse.json(
      { error: 'Webhook verification is not configured on this deployment.' },
      { status: 503 },
    );
  }

  const headerPayload = headers();
  const svix_id = headerPayload.get('svix-id');
  const svix_timestamp = headerPayload.get('svix-timestamp');
  const svix_signature = headerPayload.get('svix-signature');

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error occured -- no svix headers', {
      status: 400,
    });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('Error verifying webhook:', err);
    return new Response('Error occured', {
      status: 400,
    });
  }

  const eventType = evt.type;

  if (eventType === 'user.created' || eventType === 'user.updated') {
    const { id, email_addresses, primary_email_address_id, image_url } = evt.data;

    // Resolve the address Clerk marks PRIMARY rather than whichever one sits
    // first in the array — the order is not guaranteed, and this column is what
    // deletion notices and billing mail are sent to. Taking [0] silently mails
    // a stale secondary address for anyone with more than one on file.
    //
    // `email` is nullable in the schema, so null is the honest value for "Clerk
    // sent us no usable address". Writing '' instead would pass every
    // truthiness check downstream and be handed to the mailer as a recipient.
    const primaryEmail = primaryEmailOf({
      primaryEmailAddressId: primary_email_address_id,
      emailAddresses: (email_addresses ?? []).map((e) => ({
        id: e.id,
        emailAddress: e.email_address,
      })),
    });

    // Clerk's hosted avatar. Settings renders `user.avatarUrl` and falls back to
    // an initial when it is null — but nothing ever wrote this column, so the
    // fallback was the only branch that could run. Clerk serves these from
    // img.clerk.com, which is already allowlisted in the CSP img-src and in
    // next.config.js remotePatterns.
    const avatarUrl = typeof image_url === 'string' && image_url.trim() ? image_url : null;

    await prisma.user.upsert({
      where: { clerkId: id },
      // On update, only overwrite fields we actually resolved. A `user.updated`
      // event that arrives without an address must not blank out the one we
      // already hold — same for the avatar.
      update: {
        ...(primaryEmail ? { email: primaryEmail } : {}),
        ...(avatarUrl ? { avatarUrl } : {}),
      },
      create: {
        clerkId: id,
        email: primaryEmail,
        avatarUrl,
      },
    });
  }

  if (eventType === 'user.deleted') {
    const { id } = evt.data;
    if (id) {
      const dbUser = await prisma.user.findUnique({
        where: { clerkId: id },
        select: {
          id: true,
          subscriptions: { select: { lsSubscriptionId: true, status: true } },
        },
      });

      if (dbUser) {
        // Deleting the user row cascades away the subscription records, which is
        // the only thing that remembers what to cancel. So billing must be
        // stopped FIRST, and the row is kept if it could not be — a customer
        // still being charged for an account that no longer exists is the worst
        // outcome available here, and it is unrecoverable once the row is gone.
        //
        // `status !== 'cancelled'` is too loose: an already-expired or refunded
        // subscription is not billable, and treating it as such would block the
        // delete forever on a cancel call the provider will always refuse.
        const billable = dbUser.subscriptions.filter((s) => BILLABLE.has(s.status));

        let allCancelled = true;
        for (const sub of billable) {
          try {
            const { cancelSubscription } = await import('@/lib/billing/lemonsqueezy');
            const ok = await cancelSubscription(sub.lsSubscriptionId);
            if (!ok) {
              allCancelled = false;
              console.error('[webhooks/clerk] provider refused cancellation', {
                userId: dbUser.id,
                subscriptionId: sub.lsSubscriptionId,
              });
            }
          } catch (e) {
            allCancelled = false;
            console.error('[webhooks/clerk] cancellation threw', {
              userId: dbUser.id,
              subscriptionId: sub.lsSubscriptionId,
            }, e);
          }
        }

        if (!allCancelled) {
          // 500 makes svix retry with backoff, which is exactly what we want: a
          // transient Lemon Squeezy outage resolves on a later attempt. Keeping
          // the row means the retry still knows which subscription to cancel.
          console.error('[webhooks/clerk] retaining user row — billing not fully cancelled', {
            userId: dbUser.id,
          });
          return NextResponse.json(
            { error: 'Could not cancel billing; retry scheduled.' },
            { status: 500 },
          );
        }

        await prisma.user.delete({ where: { clerkId: id } });
        console.warn('[webhooks/clerk] user deleted via Clerk', { userId: dbUser.id });
      }
    }
  }

  return NextResponse.json({ success: true });
}
