-- A review stays waiting until a person approves or rejects it; opening it no longer clears it.
-- The per-reviewer "opened" record existed only for that, so it goes.
DROP TABLE review_opened;
