DO $$
BEGIN
	IF (SELECT data_type FROM information_schema.columns WHERE table_name='items' AND column_name='blocking') = 'integer' THEN
		ALTER TABLE "items" ALTER COLUMN "blocking" DROP DEFAULT;
		ALTER TABLE "items" ALTER COLUMN "blocking" SET DATA TYPE boolean USING (COALESCE("blocking", 0) <> 0);
		ALTER TABLE "items" ALTER COLUMN "blocking" SET DEFAULT false;
	END IF;
END$$;
--> statement-breakpoint
DO $$
BEGIN
	IF (SELECT data_type FROM information_schema.columns WHERE table_name='routines' AND column_name='delegation_allowed') = 'integer' THEN
		ALTER TABLE "routines" ALTER COLUMN "delegation_allowed" DROP DEFAULT;
		ALTER TABLE "routines" ALTER COLUMN "delegation_allowed" SET DATA TYPE boolean USING (COALESCE("delegation_allowed", 0) <> 0);
		ALTER TABLE "routines" ALTER COLUMN "delegation_allowed" SET DEFAULT false;
	END IF;
END$$;
--> statement-breakpoint
DO $$
BEGIN
	IF (SELECT data_type FROM information_schema.columns WHERE table_name='routines' AND column_name='human_review') = 'integer' THEN
		ALTER TABLE "routines" ALTER COLUMN "human_review" DROP DEFAULT;
		ALTER TABLE "routines" ALTER COLUMN "human_review" SET DATA TYPE boolean USING (COALESCE("human_review", 0) <> 0);
		ALTER TABLE "routines" ALTER COLUMN "human_review" SET DEFAULT false;
	END IF;
END$$;
--> statement-breakpoint
DO $$
BEGIN
	IF (SELECT data_type FROM information_schema.columns WHERE table_name='routines' AND column_name='silent') = 'integer' THEN
		ALTER TABLE "routines" ALTER COLUMN "silent" DROP DEFAULT;
		ALTER TABLE "routines" ALTER COLUMN "silent" SET DATA TYPE boolean USING (COALESCE("silent", 0) <> 0);
		ALTER TABLE "routines" ALTER COLUMN "silent" SET DEFAULT false;
	END IF;
END$$;
--> statement-breakpoint
DO $$
BEGIN
	-- routines.active default is true (1), so a NULL is intentionally
	-- preserved as true (matches `default(true)` in the schema).
	IF (SELECT data_type FROM information_schema.columns WHERE table_name='routines' AND column_name='active') = 'integer' THEN
		ALTER TABLE "routines" ALTER COLUMN "active" DROP DEFAULT;
		ALTER TABLE "routines" ALTER COLUMN "active" SET DATA TYPE boolean USING (COALESCE("active", 1) <> 0);
		ALTER TABLE "routines" ALTER COLUMN "active" SET DEFAULT true;
	END IF;
END$$;
--> statement-breakpoint
DO $$
BEGIN
	IF (SELECT data_type FROM information_schema.columns WHERE table_name='tasks' AND column_name='cross_team') = 'integer' THEN
		ALTER TABLE "tasks" ALTER COLUMN "cross_team" DROP DEFAULT;
		ALTER TABLE "tasks" ALTER COLUMN "cross_team" SET DATA TYPE boolean USING (COALESCE("cross_team", 0) <> 0);
		ALTER TABLE "tasks" ALTER COLUMN "cross_team" SET DEFAULT false;
	END IF;
END$$;
--> statement-breakpoint
DO $$
BEGIN
	IF (SELECT data_type FROM information_schema.columns WHERE table_name='threads' AND column_name='pinned') = 'integer' THEN
		ALTER TABLE "threads" ALTER COLUMN "pinned" DROP DEFAULT;
		ALTER TABLE "threads" ALTER COLUMN "pinned" SET DATA TYPE boolean USING (COALESCE("pinned", 0) <> 0);
		ALTER TABLE "threads" ALTER COLUMN "pinned" SET DEFAULT false;
	END IF;
END$$;
