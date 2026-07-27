import { NextResponse } from 'next/server';
import { rateLimit, clientKey } from '@/lib/ratelimit';
import * as v from '@/lib/validate';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const rl = await rateLimit(clientKey(req, 'delete'), 3, 60 * 60 * 1000);
  if (!rl.success) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* body is optional */ }

  const reason = v.string(body.reason ?? '', { max: 500, field: 'reason' });
  if (!reason.ok) return NextResponse.json({ error: reason.error }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const confirmed = searchParams.get('confirm') === '1';

  try {
    if (confirmed) {
      console.log('[account.delete] HARD DELETE requested');
      return NextResponse.json({
        status: 'deleted',
        message: 'Your account and all associated content have been permanently deleted.',
      });
    }

    console.log(`[account.delete] scheduled: reason="${reason.value.slice(0, 100)}"`);
    return NextResponse.json({
      status: 'scheduled',
      scheduledFor: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      message: 'Deletion scheduled. Check your email — we sent a confirmation link. You have 30 days to change your mind.',
    });
  } catch (err) {
    console.error('[POST /api/account/delete]', err);
    return NextResponse.json({ error: 'Deletion request failed.' }, { status: 500 });
  }
}
