-- Verdicts written by the deleted reachability probe are not trustworthy
-- (it called every public remote with no connection unreachable). Under the
-- claim-time hold every agent using such a row would never be claimed again,
-- so they must go. The first session or the first Check writes a real one.
UPDATE "filesystems" SET "state" = 'attached' WHERE "state" = 'needs_attention';
--> statement-breakpoint
ALTER TABLE "filesystems" DROP COLUMN "writeback";
--> statement-breakpoint
ALTER TABLE "filesystems" ADD COLUMN "attention_reason" text;
--> statement-breakpoint
ALTER TABLE "service_connections" DROP COLUMN "health";
--> statement-breakpoint
ALTER TABLE "service_connections" DROP COLUMN "last_validated_at";
