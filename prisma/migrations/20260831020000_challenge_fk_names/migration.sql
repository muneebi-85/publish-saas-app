-- Align the Challenge table's foreign-key constraint names with the schema's
-- canonical names, and remove the duplicates migration
-- 20260830000000_referral_challenge_coach created on databases that were
-- originally shaped with `prisma db push`.
--
-- Why both shapes exist:
--   * `prisma db push` names these constraints after the FIELD
--     (Challenge_acceptedByUserId_fkey / Challenge_challengerId_fkey).
--   * Migration 20260830000000 declares them after the RELATION name
--     (Challenge_acceptedBy_fkey / Challenge_challenger_fkey) and guards each
--     ADD with `IF NOT EXISTS <that name>` — so on a db-push-shaped database
--     the guard found nothing and ADDED a second, duplicate constraint.
--     A fresh database built only from migrations carries only the
--     migration-named pair.
--
-- This migration is idempotent against both shapes:
--   * push legacy: canonical name present AND migration name present -> drop
--     the migration-named duplicate.
--   * fresh migration chain: only the migration name present -> rename it to
--     the canonical name.
--   * already aligned: neither branch fires.

DO $$
BEGIN
  -- acceptedByUserId -> User
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Challenge_acceptedByUserId_fkey')
     AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Challenge_acceptedBy_fkey') THEN
    ALTER TABLE "Challenge" DROP CONSTRAINT "Challenge_acceptedBy_fkey";
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Challenge_acceptedByUserId_fkey')
     AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Challenge_acceptedBy_fkey') THEN
    ALTER TABLE "Challenge" RENAME CONSTRAINT "Challenge_acceptedBy_fkey" TO "Challenge_acceptedByUserId_fkey";
  END IF;

  -- challengerId -> User
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Challenge_challengerId_fkey')
     AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Challenge_challenger_fkey') THEN
    ALTER TABLE "Challenge" DROP CONSTRAINT "Challenge_challenger_fkey";
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Challenge_challengerId_fkey')
     AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Challenge_challenger_fkey') THEN
    ALTER TABLE "Challenge" RENAME CONSTRAINT "Challenge_challenger_fkey" TO "Challenge_challengerId_fkey";
  END IF;
END $$;
