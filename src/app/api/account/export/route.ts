import { NextResponse } from 'next/server';
import { rateLimit, clientKey } from '@/lib/ratelimit';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const rl = await rateLimit(clientKey(req, 'export'), 3, 60 * 60 * 1000);
  if (!rl.success) {
    return NextResponse.json({ error: 'Export limit reached — try again in an hour.' }, { status: 429 });
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    format: 'v1',
    account: {
      email: 'demo@example.com',
      displayName: 'Demo Creator',
      plan: 'Pro',
      createdAt: '2025-01-15T00:00:00Z',
    },
    projects: [],
    reports: [],
    supportTickets: [],
    billing: {
      note: 'Full invoice history available in your Lemon Squeezy customer portal.',
    },
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="publish-data-export-${Date.now()}.json"`,
    },
  });
}
