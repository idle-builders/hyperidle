-- @lore U2: The U1 migration (0018) added `at_risk` as a PostgreSQL boolean column.
-- The Drizzle schema defines it as `integer("at_risk")` — both approaches are valid
-- but they must match. This migration converts the column back to integer so Drizzle
-- ORM and the application code can use 0/1 values consistently.
-- The route layer normalises 0→false / 1→true on the wire (AC-4a, architecture-critique).
-- Guarded with information_schema check so it is idempotent.

DO $$
BEGIN
    IF (SELECT data_type FROM information_schema.columns WHERE table_name='bets' AND column_name='at_risk') = 'boolean' THEN
        ALTER TABLE "bets" ALTER COLUMN "at_risk" DROP DEFAULT;
        ALTER TABLE "bets" ALTER COLUMN "at_risk" SET DATA TYPE integer USING ("at_risk"::int);
        ALTER TABLE "bets" ALTER COLUMN "at_risk" SET DEFAULT 0;
    END IF;
END$$;
