CREATE TABLE "service_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"service" text NOT NULL,
	"auth_source" text NOT NULL,
	"encrypted_token" text,
	"server_url" text,
	"health" text DEFAULT 'needs-attention' NOT NULL,
	"last_validated_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_connections" ADD CONSTRAINT "service_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "service_connections_user_service_source_idx" ON "service_connections" USING btree ("user_id","service","auth_source");--> statement-breakpoint
CREATE INDEX "service_connections_user_idx" ON "service_connections" USING btree ("user_id");