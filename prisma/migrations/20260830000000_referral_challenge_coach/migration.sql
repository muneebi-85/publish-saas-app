-- Referral, Challenge, and CoachThread plus the User referral/leaderboard
-- columns previously existed only in schema.prisma (the live database was
-- shaped with `prisma db push`), so `prisma migrate deploy` on a fresh
-- database produced a schema where every referral, challenge, and coach path
-- threw P2021/P2022 at runtime. This migration closes that gap.
--
-- Every statement is guarded with IF NOT EXISTS so the migration is also
-- safe to run against the existing deployment, which already has these
-- objects: there it applies as a no-op and is simply recorded.

-- CreateTable (User columns first: the new tables reference them)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralCredits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "leaderboardOptIn" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS "User_referralCode_key" ON "User"("referralCode" ASC);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Referral" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "refereeId" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Challenge" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "challengerId" TEXT NOT NULL,
    "acceptedByUserId" TEXT,
    "acceptedReportId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CoachThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "reportId" TEXT,
    "messages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachThread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Referral_referrerId_idx" ON "Referral"("referrerId" ASC);
CREATE INDEX IF NOT EXISTS "Referral_code_idx" ON "Referral"("code" ASC);
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_refereeId_key" ON "Referral"("refereeId" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Challenge_challengerId_idx" ON "Challenge"("challengerId" ASC);
CREATE INDEX IF NOT EXISTS "Challenge_reportId_idx" ON "Challenge"("reportId" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CoachThread_userId_updatedAt_idx" ON "CoachThread"("userId" ASC, "updatedAt" ASC);

-- The concurrency guard for /api/challenge/accept: one accepter closes a
-- given challenge exactly once, so a double-accept can never pay the
-- challenger twice. Existing (pre-guard) rows may already satisfy it.
CREATE UNIQUE INDEX IF NOT EXISTS "Challenge_reportId_acceptedByUserId_key"
    ON "Challenge"("reportId" ASC, "acceptedByUserId" ASC);

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Referral_refereeId_fkey') THEN
        ALTER TABLE "Referral" ADD CONSTRAINT "Referral_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Referral_referrerId_fkey') THEN
        ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Challenge_acceptedBy_fkey') THEN
        ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_acceptedBy_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Challenge_challenger_fkey') THEN
        ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_challenger_fkey" FOREIGN KEY ("challengerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CoachThread_userId_fkey') THEN
        ALTER TABLE "CoachThread" ADD CONSTRAINT "CoachThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;
