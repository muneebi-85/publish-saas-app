import { NextResponse } from 'next/server';

/**
 * Lightweight health probe.
 * Used by uptime monitors and deploy smoke tests.
 * Deliberately does NOT touch downstream services (that would create cascading
 * failures during outages). It reports which subsystems appear configured.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    time: new Date().toISOString(),
    configured: {
      nvidia:       !!process.env.NVIDIA_API_KEY,
      database:     !!process.env.DATABASE_URL,
      lemonSqueezy: !!process.env.LEMONSQUEEZY_API_KEY,
      uploads:      !!(process.env.UPLOADTHING_SECRET || process.env.R2_ACCESS_KEY_ID),
      transcription:!!process.env.DEEPGRAM_API_KEY,
      copyrightAPI: !!process.env.ACRCLOUD_ACCESS_KEY,
      email:        !!process.env.RESEND_API_KEY,
      redis:        !!process.env.UPSTASH_REDIS_REST_URL,
    },
  });
}
