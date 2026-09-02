-- Add AnalysisReport.sharedAt: the creator-side opt-in for public score cards.
--
-- Every public surface (share page, share API, badge, OG image, community
-- board, challenge accepts) previously resolved ANY report id, while the UI
-- copy claimed sharing was opt-in. `sharedAt` is that opt-in, stamped when
-- the creator clicks "Share score" and clearable to revoke.
--
-- Backfill: reports belonging to leaderboard-opted-in creators are stamped as
-- shared, because the community board already publishes their ids — for those
-- rows the world-readable state was the accepted, consented exposure, and
-- un-stamping would retroactively 404 links the board still displays. Every
-- other report starts private; a creator who previously copied a link re-
-- clicks Share to republish (one action, no data lost).

-- AlterTable
ALTER TABLE "AnalysisReport" ADD COLUMN "sharedAt" TIMESTAMP(3);

-- Backfill
UPDATE "AnalysisReport" AS r
SET "sharedAt" = r."createdAt"
FROM "User" AS u
WHERE r."userId" = u."id" AND u."leaderboardOptIn" = TRUE;
