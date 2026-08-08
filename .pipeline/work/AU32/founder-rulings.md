# AU32 — Founder rulings

Recorded at the concept gate, 2026-08-08. Binding on `/architecture`, `/write-tests`, `/write-code`,
`/review` and every downstream phase. These supersede any conflicting statement in `plan.md`,
`architecture.md`, `schema-test-decision.md`, `CLAUDE.md`, or a prior work package's rulings —
including AU28 Rulings 13/13a/14 where named below.

Each ruling is a **principle**. Apply it wherever it reaches, not only to the example that provoked
it.

---

## Ruling A — the one-seam requirement for AI requests is production-only (2026-08-08)

> "the AI grading system is development only. Only production cases all have to go through the same
> seam for AI requests."

### What this settles

AU28 Ruling 14 ("one runtime door") is **narrowed to the production world** for AI/LLM requests. The
reasons the door exists — calls being recorded, priced, replayable, provider-agnostic — are
properties the *shipped product* must have. A development file constructing a vendor runtime
directly is not a violation.

Consequences:

- `tools/eval/src/judges.ts:501-512` is **not** a violation and is **not** rewritten. Decision D6 of
  `architecture.md` is withdrawn. The eval judge is development-only tooling; it may construct the
  vendor SDK directly.
- The `tooling → raw runtime [capability] development` baseline entry clears by **relaxing the rule
  in the development world**, the same shape as Ruling 13 relaxed table writes — a rule change, not
  a per-file exception, and derived rather than listed.
- **AC-2 of `plan.md` is amended**: "no development file reaches past a single-door surface" no
  longer covers the AI-runtime door. It continues to cover the database door.
- Scope of this ruling is **AI requests**. It does not relax the database-door rules; the four
  `db:schema-ns` hand-rolled clients still route through the database package's own factory, because
  that door is about migrations and connection handling, not about recording and pricing.

---

## Ruling B — a dead test is deleted, never repointed (2026-08-08)

> "dead tests just delete."

### What this settles

A test that cannot fail — one asserting on a symbol that no longer exists, a mock that can never be
called, a condition already guaranteed by construction — is deleted. It is not resurrected against
live symbols, not rewritten to assert something adjacent, not kept for the shape of its coverage.

Consequences:

- `applications/desktop/__tests__/migrate.test.ts` — the test asserting `seed` is never called
  mocks a symbol the barrel has not exported since `seed.ts` was deleted. It is **deleted**, not
  repointed. Decision D5 of `architecture.md` is withdrawn. Deleting it also removes the `seed`
  import, which is what closes the `application → db:unknown` entry.
- Applied as a principle: the builder **sweeps the files this work package touches for other tests
  that cannot fail** and deletes those too, reporting each one and why it could not fail. A vacuously
  green test found and left behind is a review finding.
- Accepted cost, stated: the claim "the desktop migration path writes no seed data" becomes
  untested. It was never actually tested. If that guarantee is wanted it needs a real test, which is
  a separate work package, not a repoint smuggled in here.

---

## Ruling C — tests arrange only states production can reach; no per-file exceptions (2026-08-08)

> "if a team cannot exist without a memeber in produdction also a test should not create and test
> that scenario, tests should only exist for things that realistically exist in production no
> development only scenarios."
>
> "and surely no one time manual exceptions that turns into 20 exceptions in no time"

### What this settles

**Draft Ruling 16 is rejected.** No arranged entity stays partial. Every entity a test arranges gets
the companion the owner would write, with no exception for any file, row, or test — the exception
mechanism is refused outright, on the grounds that one becomes twenty.

This resolves the collision the critique found in the opposite direction from the recommendation, and
it makes a stronger demand than the plan did: where a test's assertion **only holds on the impossible
state**, the test is the thing that is wrong, not the arrangement.

Consequences — the planner must work these out at principle level, not for the one named example:

- Every arranged entity in every touched file receives its companion. `foreign-keys.integration.test.ts:104`
  included.
- Where completing an entity makes an assertion over-determined, the honest resolution is required —
  never an exemption. In order of preference: make the assertion specific enough that it still proves
  its own constraint; or, if **production has no path that performs the operation the test probes**,
  the test is arranging a development-only scenario and is deleted under Ruling B. The planner must
  determine, from production code, whether a team is ever deleted at all — and answer the same
  question for every delete the sweep found, not just the one that provoked this.
- **AC-3 of `plan.md` is amended.** "Every test whose fixture changed still proves what it proved
  before, with its assertions intact" no longer holds unconditionally: an assertion that depended on
  an unreachable arrangement **may** change, and the test may be deleted. What survives is the ban on
  weakening: an assertion may not become easier to satisfy, and a test may not be made to pass by
  proving less. A changed or deleted assertion must be justified in the diff by the impossible state
  it depended on.
- The contract "no exception is added to the rule to make a file pass" is **strengthened**: no
  exception is added at all, for any reason, including a founder ruling naming a file. `plan.md`'s
  own carve-out clause ("except where a founder ruling names the file and the reason") is withdrawn
  by the founder who would have to sign it.

---

## Ruling D — an unreachable operation is dead code; delete the feature, not just the test (2026-08-08)

> "if this action cannot be reached from production we can remove the tests. if its not a used
> interface we can remove the entire deletion mechanism so please check if this is true dead code and
> remove the entire feature if possible."
>
> "like if there is no deletion feature the database is still save."

### What this settles

This is the founder's answer to the round-3 blocking finding, and it **overrules the reviewer's
recommendation** to keep the nine constraint tests. Operation-reachability does extend from the state
a test arranges to the action it probes. The tests go.

But it goes further than the test file, and the reason is the second sentence: safety comes from the
**absence of the capability**, not from a constraint guarding a capability nobody has. A constraint
test protecting an operation no interface offers is protecting nothing; the honest act is to remove
the operation.

Consequences — and these must be established by investigation, not assumed:

- For **every operation the deleted tests probe** (delete a user, a thread, a knowledge item, an
  `items` row, a `teamMembers` row, and the `agentRunConfig` cascade), determine whether a deletion
  mechanism exists **in code at all** — repository/service function, route, handler, MCP tool,
  scheduled job, CLI path — and whether anything in production reaches it.
- **Where a mechanism exists but nothing production reaches it, it is true dead code and the whole
  feature is deleted**: the function, its route or tool registration, its types, its tests, and any
  now-orphaned helper. A mechanism reachable only from its own tests is dead — the tests are not a
  consumer.
- **Where no mechanism exists**, there is nothing to remove and that is the finding; say so with the
  evidence rather than manufacturing a removal.
- **Where a mechanism IS reachable from production, the test stays.** Reachability is the test's
  justification; finding it is a reason to keep, and it must be reported as such, not worked around.
- **The database schema is not touched.** No foreign key is dropped and no `onDelete` action is
  changed. Removing a capability is free; a migration altering constraints is not, and the founder's
  point is that the constraint is harmless once the capability is gone.
- **This amends `plan.md`'s scope**, which put the production world out of bounds. Deleting a dead
  production deletion feature is production code change, newly authorized here. It does not authorize
  touching any of the 221 production governance violations — those remain AU29/AU30/AU31's.
- If removal turns out to be entangled — the mechanism is reachable, or shares code with a live path,
  or removal cascades further than this work package can hold — report that precisely and stop at the
  boundary rather than half-removing a feature.

---

## Ruling E — the lint is a standard linter: a rule is error or warn, and nothing keeps books (2026-08-08)

> "what weird linter is this that checks against a record? makes no sense our architectural guards
> should check if something follow an architectural governance rule not if it compares to a count in
> some document"
>
> "ok thats not how those rules should work the rules should be warngins then we remove all the
> warnings and then set the rule to error, so after a one time fix which this workpackage is about the
> rule can be adjusted and not be broken anymore. please adjust the linter. the architectural rules
> should stay in place but the book keeping rule should be removed. it should be a standard linter
> that does not book keep or similar all it should do is that a specific architectual rule is either
> error or warning. All those that are clean should already be set to error, those that still have
> violations should be set to warnings and than this workpackaage is about solving all warnings for a
> specific set of rules and then setting the rule to error. at the end. So with the PR the rule starts
> biting."

### What this settles

This **revises AU28 Ruling 2**, which asked for a mechanical shrink-only ratchet because convention had
failed at that spot. Having seen it run, the founder is removing it. The friction — a red build as the
reward for fixing violations, naming no architectural fact — costs more than the protection.

The model, complete:

1. **Every architectural rule carries one severity: `error` or `warn`.** That is the whole of the
   configuration. No per-file allowances, no counts, no recorded violation sets, no adoption dates.
2. **A rule with zero violations is at `error`.** A rule with remaining violations is at `warn`.
3. **A work package clears every warning for its set of rules, then flips those rules to `error` in
   the same pull request.** With the PR, the rule starts biting. There is no promotion step to
   remember and no ledger to regenerate.
4. **The architectural rules themselves stay exactly as they are.** Only the bookkeeping goes.

### What is deleted

- `governance/baseline.json`, unconditionally — not "if it happens to empty".
- The `baseline-ratchet` rule. It can only ever report a disagreement with a stored number, which is
  not an architectural fact, so it is not a guard.
- The `governance:baseline` generator script and the `--adopt` escape hatch, under any name.
- Every code path that reads a per-file allowance to compute severity.

**`plan.md` AC-5 is amended accordingly**: the deletion is unconditional and this work package owns it,
rather than falling to whichever of the four clearing work packages finishes last. Reintroducing a
baseline, an adopt flag, or any per-file allowance — under any name — must fail the build.

### Accepted cost, stated plainly

A rule at `warn` warns for **all** its violations, including new ones. Nothing blocks new debt on a
rule that is not yet clean. That is the trade the founder is making for a lint that never fails on
bookkeeping, and it is consistent with trusting engineers rather than building walls first.

### Open granularity question — settle from live data, do not assume

This work package clears the **development world** while production keeps 221 violations across the
sibling work packages. So severity cannot be per-rule-name alone if a rule is clean in one world and
dirty in the other; the existing verdict data is already decided per world. Establish the real
granularity from the live rule and verdict data, state it, and keep it the smallest thing that works.

### Scope for this work package

`AU32` clears the development world and flips the development-world rules to `error` in its PR.
Production-world rules stay at `warn` for `AU29`/`AU30`/`AU31` to clear and flip the same way. Do not
touch the 221 production violations.
