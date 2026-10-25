-- A subscription can follow one object: an event about that task, thread or document only.
-- Following is how "Something I follow changes" reaches a person.

ALTER TABLE "subscriptions" ADD COLUMN "object_id" text;
--> statement-breakpoint

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_object_ck" CHECK ("object_id" IS NULL OR "event" IS NOT NULL);
