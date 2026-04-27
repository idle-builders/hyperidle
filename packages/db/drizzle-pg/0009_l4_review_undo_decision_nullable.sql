-- L4 review (arch W2): make `responses.decision` nullable so undo rows
-- can store NULL instead of synthesising a fake decision.
--
-- L4 review (security MEDIUM + adversary W6 + arch O3): partial UNIQUE
-- INDEX so a single commit can be undone exactly once even on Postgres
-- READ COMMITTED (where SQLite's IMMEDIATE-transaction serialisation has
-- no equivalent). The index makes a double-undo race fail at the DB
-- level; the route maps the resulting unique-violation to its 404
-- idempotency contract.
ALTER TABLE "responses" ALTER COLUMN "decision" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "responses_undoes_response_id_uq"
	ON "responses" ("undoes_response_id")
	WHERE "undoes_response_id" IS NOT NULL;
