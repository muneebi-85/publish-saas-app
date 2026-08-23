-- Add NewsletterSubscriber: somewhere for the landing-page signup to land.
--
-- The footer form previously called setSubscribed(true) and discarded the
-- address, so the "check your inbox to confirm" message was untrue. The form now
-- POSTs to /api/newsletter, which writes a row here.
--
-- `email` is unique and normalised (trimmed, lower-cased) by the route before the
-- write, so a repeat signup upserts instead of creating a duplicate. That makes
-- the endpoint idempotent, which matters because it is unauthenticated.
--
-- `unsubscribedAt` is nullable rather than the row being deleted: a delete would
-- let a later signup silently re-subscribe someone who had opted out.
--
-- Purely additive — no existing table or index is touched, so this is safe to
-- apply to a live database with no downtime.

-- CreateTable
CREATE TABLE "NewsletterSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'landing-footer',
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_email_key" ON "NewsletterSubscriber"("email");

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_createdAt_idx" ON "NewsletterSubscriber"("createdAt");
