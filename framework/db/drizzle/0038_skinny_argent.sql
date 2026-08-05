ALTER TABLE "service_connections" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "service_connections" CASCADE;--> statement-breakpoint
ALTER TABLE "tailored_grants" ALTER COLUMN "arg_pinned" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "tailored_grants" ALTER COLUMN "consumed" SET DATA TYPE boolean;