# AU32 — the schema-test question, for the concept gate

**What this document asks of you — changed from the earlier draft.** The recommendation is still
**(a) — add the companion — for every lint-flagged site** in all four files, with zero rule changes
and zero baseline exceptions. But it no longer asks for zero founder rulings: it asks for **one**.
One `teams` row in the foreign-key file — a row the lint does not flag — must **stay partial**,
because completing it would silently weaken the test it arranges. plan.md is explicit that a kept
partial-state fixture in these files is your decision, recorded in `founder-rulings.md`, never an
agent's judgement call. Draft ruling text is below for approval.

Four files in `framework/db/src/__tests__/` are tests **of the schema itself** and were held out of the
mechanical pass so a person decides them. The plan named a fifth, `seed-then-migrate.integration.test.ts`
— it is already clean (it writes `teams` and `teamMembers` together, lines 38–43) and needs nothing.

For each file the options are:
- **(a)** add the companion row; the assertion stays fully intact,
- **(b)** keep the partial-state fixture under a founder ruling naming the file and the reason,
- **(c)** refine the rule so tests whose subject is the constraint are not violations.

**Two schema facts decide this — one per pair.** The feared failure was: "adding a companion row
could mask the very foreign-key constraint being probed" — the delete would then reject because of
the added row, not the constraint under test.
- **For the knowledge pair the fear is empty.** The projection's foreign key is
  `onDelete: "cascade"` (`framework/db/src/schema.ts:1008-1011`). A cascade FK can never cause a
  delete to reject. Whatever makes `db.delete(knowledgeItems)` throw, it is not the projection row.
- **For the teams pair the fear is real.** `teamMembers.teamId → teams.id` is
  `onDelete: "restrict"` (`schema.ts:127-129`) — a membership row is itself a sufficient cause of a
  team-delete rejection. There is exactly one place in the swept set where that bites: the `teams`
  row `p1` at `foreign-keys.integration.test.ts:104`, in the test "rejects deleting a team while a
  bet references it". Its assertion (:114, `rejects.toThrow()` with no matcher) probes
  `bets.teamId → teams.id`. Add a membership row and the assertion becomes over-determined: it
  stays green even if the `bets` RESTRICT constraint — the thing under test — were dropped, because
  the membership row's own RESTRICT FK rejects the delete anyway. Assertions byte-identical, suite
  green, test proves strictly less. That row is not one of the file's four flagged sites (the lint
  credits the whole file for the `teamMembers` write its shared seeder makes at :41-43), so no rule
  or baseline is involved — but the plan's per-entity completion obligation reaches it, and the
  honest resolution is to leave it partial, on the record.

The exclusion criterion is derived from the schema's delete behaviour, never from a file path: *an
arranged entity gets no companion when the test asserts that deleting the entity rejects and the
companion references it through a non-cascade FK.* The sweep behind "exactly one place" read every
delete of a grouped table and every rejection assertion across all 39+ files this work package
touches (`feasibility.md` P11); on the live schema only the teams pair can ever meet the criterion,
and only this entity does. The same file's first test ("rejects deleting a team while a teamMembers
row references it", :76-84) needs nothing — it seeds the full pair and the membership FK **is** its
probe.

**Recommendation: (a) for all lint-flagged sites in all four files; (b) for the one un-flagged
teams row above — one ruling, zero rule changes, zero baseline exceptions.** Per-file evidence
below.

**Why not (c), anywhere.** "The subject of this test is the constraint itself" is intent — it lives in
the test author's head, not in anything the lint can derive from code. Any mechanical spelling of (c)
collapses into "files under `framework/db/src/__tests__/` are exempt", which is a directory carve-out —
exactly what the contract forbids ("never a pattern, never a directory"). There is no honest derivation,
so (c) is not on the table. (Note the keep-partial ruling above is not a spelling of (c): it changes
no rule and exempts nothing from the lint, which never flagged that row — it records a plan-level
decision the lint cannot see either way.)

---

## foreign-keys.integration.test.ts — 4 flagged sites (lines 210, 233, 248, 270) + 1 un-flagged teams row (line 104)

**What the flagged sites prove.** Two RESTRICT constraints: deleting a `knowledge_items` row must be
blocked while `knowledge_edit_log` rows (site 210/233) or `knowledge_conflicts` rows (site 248/270)
still reference it, and the audit rows must survive the failed delete.

**Effect of adding the companion at the flagged sites.** A projection row for `ki-1` cascades — it
cannot produce the asserted `rejects.toThrow()`. The throw still comes only from the RESTRICT FK
under probe; the "audit rows still exist" assertions read tables the companion never touches.
Assertions byte-identical. Bonus: the arranged world becomes the one production actually has (an
item always carries its projection), so the probe now runs against a producible state.

**Residual risk, named.** If someone later changes the projection FK to RESTRICT, these tests would
still pass while proving less. That is a property of the schema, not of this change; a one-line comment
at the added insert ("cascade — cannot cause the asserted rejection") is enough.

**Verdict for the flagged sites: (a).**

**The un-flagged teams row (line 104): (b) — keep partial, under the ruling below.** Completing it
is the masking failure itself (see the teams fact above); option (c) stays off the table; (b) is
what plan.md's gate clause exists for. The builder adds a domain-worded comment at the insert so the
next agent does not "helpfully" complete it, and the per-entity review check confirms it received no
companion.

### Draft ruling for `founder-rulings.md` (approve, amend, or reject at this gate)

> **Ruling 16 — a deliberately member-less team in the foreign-key acceptance test.**
> `framework/db/src/__tests__/foreign-keys.integration.test.ts`, test "rejects deleting a team
> while a bet references it": the arranged team keeps **no** `teamMembers` row. Reason: the test
> asserts that deleting this team rejects, and `teamMembers.teamId → teams.id` is itself
> `onDelete: "restrict"` — a membership row would be a second sufficient cause of the asserted
> rejection, leaving the test green even if the probed `bets.teamId` RESTRICT constraint were
> dropped. The unreachable state is the point of this probe. The lint does not flag this row (the
> file's write set already credits `teamMembers` via its shared seeder), so this ruling adds no
> rule exception and no baseline entry; it records the keep-partial decision the per-entity
> completion obligation would otherwise override. It covers this one arranged row only.

## schema.integration.test.ts — 4 sites (lines 438, 461, 474, 486)

**What it proves.** Plain CRUD probes: `knowledge_items` holds and returns rows (438), an update bumps
title/version (461/474), `knowledge_edit_log` holds a row referencing an item (486). Every assertion
selects by id from `knowledgeItems` or `knowledgeEditLog`; none reads the projection table.

**Effect of adding the companion.** A minimal projection row (`{ id, knowledgeItemId }`, all other
columns nullable) is invisible to every assertion. The CRUD probe becomes a probe of a state the
application can reach. (The file's four FK-rejection tests at :567-664 assert **insert** rejections
on ids no companion row ever creates — swept, inert; P11.)

**Verdict: (a).**

## migration.integration.test.ts — 1 site (line 63)

**What it proves.** "Migrated database supports CRUD with Drizzle ORM" — insert one `teams` row, read
it back. Not a constraint probe at all; it landed in the held-out set only by living in this directory.

**Effect of adding the companion.** A `teamMembers` row alongside changes nothing the test selects and
exercises CRUD on a second migrated table for free.

**Verdict: (a).**

## session-requests.integration.test.ts — 1 site (line 59)

**What it proves.** Sessions can be task-free while retaining request correlation. The inserted
`teams` row (`"team-1"`) is referenced by **nothing** in the file — not the user, not the request, not
the session (its `taskId` is null). It is a vestigial arrange row.

**Two equally clean fixes.** Delete the insert (preferred — a row nothing references proves nothing;
builder re-runs the file to confirm no hidden FK needed it), or add the `teamMembers` companion.
Either way assertions are untouched.

**Verdict: (a), preferring deletion of the vestigial row.**

---

## If you disagree

Any *flagged* file you want left partial gets its own ruling in
`.pipeline/work/AU28/founder-rulings.md` naming the file and the reason, and its baseline entry
stays until that ruling exists — the recommendation needs none of those. The one ruling it does
need is the drafted keep-partial above; rejecting it means choosing (a) for that row, which this
document argues is a silent weakening of the test, or reshaping the test itself, which is outside
this work package's contracts (assertions never change).
