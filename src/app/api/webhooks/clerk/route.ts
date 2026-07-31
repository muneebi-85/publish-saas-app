import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

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
    const { id, email_addresses } = evt.data;
    const primaryEmail = email_addresses?.length > 0 ? email_addresses[0].email_address : '';

    await prisma.user.upsert({
      where: { clerkId: id },
      update: {
        email: primaryEmail,
      },
      create: {
        clerkId: id,
        email: primaryEmail,
      },
    });
  }

  if (eventType === 'user.deleted') {
    const { id } = evt.data;
    if (id) {
      // Find user to ensure we can clean up their subscription if needed
      const dbUser = await prisma.user.findUnique({
        where: { clerkId: id },
        include: { subscriptions: true }
      });

      if (dbUser) {
        // Only cancel in LS if it is an active subscription
        const activeSub = dbUser.subscriptions?.find(sub => sub.status !== 'cancelled');
        if (activeSub) {
          // Normally we would cancel it here, but we need LemonSqueezy secret.
          // The /api/account/delete route already handles it, but in case it's deleted from Clerk directly:
          try {
             const { cancelSubscription } = await import('@/lib/billing/lemonsqueezy');
             await cancelSubscription(activeSub.lsSubscriptionId);
          } catch (e) {
             console.error('[Clerk Webhook] Failed to cancel subscription:', e);
          }
        }

        await prisma.user.delete({
          where: { clerkId: id },
        });
      }
    }
  }

  return NextResponse.json({ success: true });
}
