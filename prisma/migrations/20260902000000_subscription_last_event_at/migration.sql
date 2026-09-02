-- Monotonicity guard for Lemon Squeezy webhook delivery: records the
-- updated_at of the last event applied to a subscription row, so a
-- late-delivered older transition (payment_success that 500'd, was retried
-- by LS after the dedup row was released, and landed mid-cycle) can be
-- detected and skipped instead of resetting the monthly quota or rolling
-- the period back. Null on every existing row = no guard applied yet, so
-- the first event after this migration always applies.
ALTER TABLE "Subscription" ADD COLUMN "lastEventAt" TIMESTAMP(3);
