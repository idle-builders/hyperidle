# AU32 — architecture critique, round 2 (focused re-critique of the B1 revision)

Artifacts as revised at `f729491c`: `architecture.md`, `schema-test-decision.md`, `feasibility.md`
(P11–P14). Authority: `plan.md`; Rulings 13/13a/14. Every claim below was re-verified against the
live tree, including an **independent re-run of the masking sweep with wider search patterns than
P11 used** — not by re-reading P11.

## Verdict

**APPROVED — zero blocking findings.** B1 is genuinely closed: the masking criterion is a real
schema derivation (not a carve-out), the sweep's "exactly one entity" survives an adversarial
independent re-sweep through channels P11 did not grep for, the C6/T2 contradiction is resolved
with a decidable rule plus a named review procedure, and the founder document now puts the
line-104 decision on the table in plain language with a correctly-scoped draft ruling. N1–N4 are
all closed (N1 re-executed, N2's mechanism verified against source). Nothing previously verified
was perturbed.

---

## 1. The derived criterion — genuine derivation, verified

The criterion (architecture §1: asserted delete-rejection of the arranged entity + companion
references it through a non-cascade FK) is decidable from test code + schema alone; no intent, no
path. Checked against the full schema:

- `teamMembers.teamId → teams.id` is the **only** non-cascade companion FK
  (`framework/db/src/schema.ts:129`, `onDelete: "restrict"`);
  `knowledgeAppProjection.knowledgeItemId` is cascade (`schema.ts:1011`). Confirmed by reading
  every `onDelete` in the schema (66 of them) — no third companion FK exists because only two
  companion groups exist (`buildCompanionGroups` live output, verified round 1).
- The parent-side direction cannot collide: a companion that is a *parent* (`teams` for a bare
  `teamMembers`, `knowledgeItems` for a bare projection) references nothing, and only children
  block deletes — so the criterion's child-side-non-cascade formulation is complete, not merely
  convenient.
- The reverse hazard (an added child breaking a test that *successfully* deletes the parent) is
  loud, not silent; P11 checked it anyway and I confirmed: **no test in the touched set
  successfully deletes a `teams` row** (only `foreign-keys` deletes `teams`, both asserted
  rejections, :83 and :114).

The criterion happens to select one file today, but it would select any future instance the same
way — that is a derivation, not a carve-out wearing one's clothes.

## 2. The sweep — independently reproduced, "exactly one" is a finding

Rebuilt the 45-file touched set from `probes/lint-development-sites.txt` (39 table-write files +
6 one-door files) and swept with **wider patterns than P11's**:

- **All `.delete(` calls** (not just grouped tables): grouped-table deletes exist in exactly one
  file — `foreign-keys.integration.test.ts`, five operations (:83, :96, :114, :233, :270),
  matching P11's classification hit for hit. The only other deletes anywhere in the set are
  `agent-run-config-store:157` (`users` — companions FK only `teams`/`knowledgeItems`; inert;
  `teamMembers.leadAgentId` carries no FK, checked) and `capture-provenance:149`
  (`filesystems` — inert).
- **All `.rejects` assertions** (27 across the set): my census equals P11's plus the four
  `foreign-keys` user/thread delete-rejections (:127, :160, :183, :198) that P11's written
  classification omits — inert, since neither companion table references `users` or `threads`
  (see §Notes, R2-N1).
- **Raw SQL / execute / truncate**: every `db.execute` in the set read in context
  (`migration` :21/:74/:87/:129, `schema` :29/:536/:551, `knowledge.q2` :62/:76/:89 — all
  catalog/information_schema SELECTs; `agent-run-admission-failed-*` — trigger DDL). Zero DML
  deletes. Confirms P11's "zero".
- **HTTP DELETE**: zero hits for any `method: "DELETE"` / `'delete'` spelling. Confirms P11.
- **Service-level deletes, broader than P11's name pattern**
  (`dissolve|remove|delete|archive|reap|purge|prune|evict|expire`): found
  `deleteFilesystem`/`deleteInjection` (`filesystems-completeness-contract` :106/:125-126) and
  the reaper trio (`reapAccessLog`/`reap`/`reapExpiredCredentials`, `retention-reaper` :37-39).
  None touches a grouped table — `reapAccessLog` deletes `knowledgeAccessLog`
  (`relevance-service.ts:246`), which Ruling 13a excludes from groups as history. P11's narrow
  grep missed these names but its conclusion survives the wider net.
- **Cascade-through-parent side effects**: read every cascade FK in the schema — the only cascade
  path *into* a grouped/companion table is `knowledgeItems → knowledgeAppProjection` itself;
  nothing FKs into `knowledgeAppProjection`, and the only FK into `teamMembers.id`
  (`users.teamId`, restrict, `schema.ts:69`) is already handled by D2's id-derivation clause.
  No successful delete of any *other* parent can remove or be blocked by an added companion.
- `_helpers.ts` (the file T3 extends): zero deletes, zero rejection assertions.

**Result: exactly one arranged entity meets the criterion — `foreign-keys.integration.test.ts:104`
— and the line-104 entity is indeed un-flagged** (the probe shows the file's flagged sites are the
four knowledge ones at 210/233/248/270 only; the shared seeder at :41-43 writes `teamMembers`,
crediting the whole file). The sweep's headline claims are findings, not artifacts of where it
looked.

## 3. C6/T2 reconciliation — resolved, checkable

C6 now states per-entity completion with one schema-derived exception; T2 owns the entity and
mandates a domain-worded comment at the insert; a new instance is "a finding to report for a
ruling, never a silent skip and never a silent completion." Checkability: the AC-3 evidence row
names the concrete reviewer procedure (re-run the delete-rejection scan over touched files;
confirm no added row is a non-cascade child of a deleted parent; confirm :104 stayed bare). With
the answer set this small (one file contains any grouped-table delete) that is a mechanical
five-minute check, not trust. C2's rewording does **not** widen the exception surface — it
narrows it, correctly noting Ruling 16 touches neither rule nor baseline (the lint never flagged
the entity), while AC-1's own escape clause ("except where a founder ruling names the file and
the reason") is exactly what the drafted ruling satisfies.

## 4. The founder document — states the real decision

`schema-test-decision.md` leads with the change ("no longer asks for zero founder rulings: it
asks for one"), states the masking mechanism concretely (over-determined `rejects.toThrow()`,
byte-identical assertions, strictly weaker test), and drafts Ruling 16 naming the file, the test,
and the schema reason — never a pattern or directory, covering "this one arranged row only."
Numbering is correct (`founder-rulings.md` ends at Ruling 15). The universal "masking fear is
empty" sentence from round 1 is gone, replaced by the per-pair split.

On the alternatives: adding the companion **plus a constraint-specific error matcher**
(`.rejects.toThrow(/bets/)`) would keep the probe sole-cause AND make the state producible — but
plan.md AC-3 requires changed-fixture tests keep "assertions intact," so that path needs a plan
amendment, and the document's dismissal ("reshaping the test itself... outside this work
package's contracts") is grounded, not evasive. Keep-partial is also the more robust choice on
merits: the test's own arrangement comment (":103 Minimal seed so only the bet references the
team") declares sole-cause-by-arrangement as the design, and matching on driver error text is
brittle. The recommendation is right; see R2-N2 for a presentational improvement.

## 5. N1–N4 closures — verified

- **N1 closed, re-executed.** `npx vitest run framework/db/src/__tests__/governance-crossings.test.ts`
  → 1 file, **68 passed, 2.33s** (claimed: 68 passed, 2.2s). Runs in the default/unit config as
  the evidence row now states.
- **N2 closed; P13's reasoning verified against source.** Severity is per-(group,file) allowance:
  `allowed = baseline.groups[key]?.sites[file] ?? 0`, `severity: isNew ? "error" : "warn"`
  (`scripts/rules/crossings.ts:64-87`). The attack lane runs against `EMPTY_BASELINE`
  (`governance-lint.ts:159`) **but** the `sort:"violation"` judge reads raw `violationsOf`
  output, severity-agnostic (`governance-attacks.ts:838-847`) — so the standing attack really
  cannot prove the flip, and D9 case 2 (running the exported `crossingRules` twice over one
  synthetic violation: allowance ⇒ warn, group absent ⇒ error) genuinely pins it, standing, in
  `test:full`. The test file already deep-imports scripts modules
  (`governance-crossings.test.ts:11-32` — verified), so the import shape is established.
- **N3 closed.** D4 excludes `runner.ts` from the `createTestDb()` alternative, citing its own
  `@lore X7` (verified live at `tools/eval/src/runner.ts:64-67`); the alternative is scoped to
  the three ah scripts.
- **N4 closed.** D2 now makes the helper the default with a mechanical helper-or-comment rule per
  core-api site ("a site with neither is a review finding"), which prevents the all-inline
  degeneration.

## 6. Nothing broken by the revision

Census figures in §1 unchanged (67/45/7; 61 sites/39 files; 24+15 file split; T4's 11 + T2's 4 =
15). Cascade fact, `seed-then-migrate` clean, `session-requests:59` vestigial, the `seed` ghost,
`seedBase` mechanics, D3/D4/D5/D6, D8's dormancy, single-builder-leaf — all as verified in round
1, untouched. AC evidence table deltas are all consistent: AC-3 gains the masking re-check the
expect-line diff is blind to; AC-4 gains D9 case 2 with the manual probe demoted to optional
corroboration; AC-6's unit-count arithmetic updated to "+2 for D9's two cases"; scenario-3's
command corrected and now proven by execution. Contracts C1–C7 all still bind; no WP ids in any
enforced artifact (Ruling 16 text and planned comments are domain-worded; `founder-rulings.md`
lives in `.pipeline/`). Proportionality unchanged: the revision added one test case, one ruling
draft, and prose — nothing bigger than the problem.

The "no test asserts less" AC resting partly on a review obligation is acceptable **here**: the
lint is file-grained by design, an entity-grained rule would be a rule change C2 forbids and a
mechanism larger than one entity warrants, and the obligation is discharged by a named, bounded,
reproducible procedure (P11's five searches) plus the planned insert-site comment and @lore. What
would make it stronger is out of this WP's scope (see R2-N3).

---

## NON-BLOCKING NOTES

### R2-N1 — P11's written classification omits four inert rejections it claims to cover
`feasibility.md` P11 says every `.rejects.` assertion was read, but its classified list skips
`foreign-keys.integration.test.ts:127/:160/:183/:198` (user/thread delete-rejections). They are
inert — neither companion table references `users` or `threads` — so the conclusion is
unaffected; the write-up is just incomplete relative to its own method statement. Worth a
two-line addendum so the next reader doesn't re-derive it.

### R2-N2 — the founder doc could name the matcher alternative explicitly
`schema-test-decision.md`'s "If you disagree" folds the "complete the pair + assert a
constraint-specific error matcher" option into "reshaping the test... outside contracts" without
naming it. The dismissal is correct under AC-3's "assertions intact," but the founder is entitled
to see the option he would be amending the plan to take. One sentence.

### R2-N3 — future drift past the masking criterion is unguarded, deliberately
If a later test adds a new delete-rejection on a grouped-table parent, nothing standing detects a
"helpful" companion completion there — the protection is the T2 comment + @lore at the one live
site. That is the right proportionality call for this WP (the alternative is an entity-grained
lint, a rule change), but it is worth carrying as context into `/pipeline:review`.

### R2-N4 — evidence-table naming nit
The AC-4 row calls the control twin `attack-companion-supplied`; that is the overlay filename —
the attack id is `missing-companion-control` (`governance-attacks.ts:522-535`). Immaterial.

## Gate condition

The founder gate (approve/amend/reject drafted Ruling 16 + the four per-file verdicts) remains
the only thing standing before Task 2, exactly as the architecture already sequences it.
