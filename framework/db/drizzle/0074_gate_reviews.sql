-- gate_reviews — links a submitted review to the action gate block that caused it.
-- Written when an agent calls submit_review after /action-check denies an action.
-- Only a review with a gate_review record may trigger a session resume on verdict.

CREATE TABLE "gate_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"review_message_id" text NOT NULL,
	"blocked_tool" text NOT NULL,
	"rule_pattern" text NOT NULL,
	"rule_id" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "gate_reviews_review_message_id_unique" UNIQUE("review_message_id")
);
--> statement-breakpoint
CREATE INDEX "gate_reviews_session_id_idx" ON "gate_reviews" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX "gate_reviews_review_message_id_idx" ON "gate_reviews" USING btree ("review_message_id");
