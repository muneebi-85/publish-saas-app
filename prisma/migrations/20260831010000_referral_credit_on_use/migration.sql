-- Add Referral.referrerCreditedAt: the referrer's credit is paid on the
-- referee's first completed review, not at attach.
--
-- Attach-time payment let a farmer mint unlimited audits: each throwaway
-- signup credited the farmer's account for free, and the throwaway's own credit
-- was discarded anyway. Deferring the referrer's credit to the referee's first
-- REAL review makes every farmed credit cost a full pipeline run, which is the
-- same unit the credit buys.
--
-- Backfill: every row with granted=TRUE predates the deferral and its
-- referrer credit was already paid — stamp them so the worker does not pay
-- those a second time. Rows with granted=FALSE never paid anyone.

-- AlterTable
ALTER TABLE "Referral" ADD COLUMN "referrerCreditedAt" TIMESTAMP(3);

-- Backfill
UPDATE "Referral" SET "referrerCreditedAt" = "createdAt" WHERE "granted" = TRUE;
