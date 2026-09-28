DO $$
BEGIN
    IF (SELECT data_type FROM information_schema.columns WHERE table_name='bets' AND column_name='at_risk') = 'boolean' THEN
        ALTER TABLE "bets" ALTER COLUMN "at_risk" DROP DEFAULT;
        ALTER TABLE "bets" ALTER COLUMN "at_risk" SET DATA TYPE integer USING ("at_risk"::int);
        ALTER TABLE "bets" ALTER COLUMN "at_risk" SET DEFAULT 0;
    END IF;
END$$;
