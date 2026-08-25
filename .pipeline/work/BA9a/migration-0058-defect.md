# Defect: migration 0058 aborts on any populated database

Found 2026-08-26 while running BA9a's live proof. **Pre-existing on `main`** — not caused by BA9a.
Needs a founder decision because the safe fix is not obvious.

## What happens

`framework/db/drizzle/0058_AU44_fold_team_members.sql` folds `team_members` into `teams`. Its steps run
in this order:

- **Step 3** re-points `users.team_id` from a `team_members` id to the corresponding `teams` id.
- **Step 4** drops the old foreign key on `users.team_id` that references `team_members`.

Step 3 runs while that foreign key is still in force. The moment it writes a `teams` id into a column
still constrained to hold a `team_members` id, Postgres rejects it:

```
insert or update on table "users" violates foreign key constraint "agents_team_id_teams_id_fk"
```

The constraint name is the legacy one the migration's own comment anticipates — and step 4 *would* have
found and dropped it correctly. It simply runs one step too late.

## Why it was not caught

The failure needs at least one user whose `team_id` actually points at a `team_members` row. A database
where **no user belongs to a team** passes cleanly, which is what the migration's test must have had.
Every populated install fails.

This is the second time this exact shape has appeared. BA1 found the first: *"a migration that passed its
own test would have aborted every real upgrade, because the test hand-wrote its own pre-migration schema
and got one column's nullability wrong."*

## Reproduction

The local dev database at migration 57 had:

- `team_members`: one row, `id='demo-team-members-acme'`, `team_id='demo-team-acme'`
- `users`: two agents with `team_id='demo-team-members-acme'`
- the FK `agents_team_id_teams_id_fk` on `users.team_id`, referencing **`team_members`**

Running the migrations aborted at 0058. Dropping that constraint by hand and re-running applied all five
remaining migrations cleanly (57 → 62).

## Why the fix needs a decision

The obvious fix — swap steps 3 and 4 — edits a migration that has **already been applied** on some
databases. Drizzle tracks applied migrations **by hash**, so changing the file changes its hash, and a
database that already ran the old version may try to re-run it and fail on columns that already exist.

The mitigating argument is that *no populated database can ever have applied it*, since it aborts on
exactly those. The databases that got past it are empty or near-empty ones. If that holds, editing in
place is safe in practice.

The alternative — a new repair migration — does not help a database stuck at 57, because it never reaches
the new migration.

**Recommendation:** reorder the steps in 0058 in place, and prove it by upgrading a database seeded to
look like a real one — a team, and users belonging to it — rather than an empty schema. Confirm what
drizzle does with the changed hash on a database that already applied the old file before committing to
it.

BA9d already carries an acceptance criterion about upgrading an older seeded database. This defect sits
directly under it.
