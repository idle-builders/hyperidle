-- Each person on a shared backend is themselves: an email names them, their own key speaks as them.
ALTER TABLE "users" ADD COLUMN "email" text UNIQUE;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "key_hash" text UNIQUE;
