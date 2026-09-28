-- A team's `functions` were the roster's input. There is no roster.
--
-- The column mapped a team's declared domains (development, product, …) through
-- the role catalog to auto-provision a Builder, a Product Manager and a QA
-- Engineer. A new team is one empty agent. The column has been
-- write-only for its whole life — four call sites wrote it, nothing ever read it
-- back — and now nothing writes it either.
ALTER TABLE "teams" DROP COLUMN IF EXISTS "functions";
