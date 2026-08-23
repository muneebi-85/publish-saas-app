-- Scope the Channel uniqueness to the owner, and drop the unused ApiKey table.
--
-- Channel: the previous UNIQUE(platform, channelId) was global, so the second
-- account to connect the same channel hit an opaque P2002 instead of the intended
-- 409, and the ownership branch in POST /api/channels was unreachable. Scoping the
-- index to (userId, platform, channelId) makes that check the thing that actually
-- decides, and lets one owner re-link their own channel idempotently.
--
-- ApiKey: no code path reads, writes, or issues these keys — there is no public
-- API — so the table only implied a capability that does not exist. Verified empty
-- (0 rows) before writing this migration; the DROP therefore loses no data.
--
-- Every statement here is safe on the existing database: the (platform, channelId)
-- pairs were checked for cross-user duplicates first and none exist, so creating
-- the narrower unique index cannot fail.

-- DropForeignKey
ALTER TABLE "ApiKey" DROP CONSTRAINT "ApiKey_userId_fkey";

-- DropIndex
DROP INDEX "Channel_platform_channelId_key";

-- DropTable
DROP TABLE "ApiKey";

-- CreateIndex
-- Non-unique replacement for the dropped global unique: POST /api/channels still
-- looks up (platform, channelId) across owners to return 409 when someone else
-- already connected that channel, and that lookup needs an index behind it.
CREATE INDEX "Channel_platform_channelId_idx" ON "Channel"("platform", "channelId");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_userId_platform_channelId_key" ON "Channel"("userId", "platform", "channelId");
