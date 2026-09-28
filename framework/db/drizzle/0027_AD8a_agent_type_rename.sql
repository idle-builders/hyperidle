-- Rename agent category "personal" -> "individual"
-- The agentCategory column is unconstrained text; this UPDATE covers all existing rows.
UPDATE "users" SET "agent_category" = 'individual' WHERE "agent_category" = 'personal';
