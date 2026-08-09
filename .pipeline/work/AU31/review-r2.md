# AU31 wave A — code review, round 2

**Scope.** The four commits since round 1 (`aa64b45b` B2, `ccfbf6f8` B1, `8cff343e` N1+N4,
`09768755` attestation), read as a delta on the tree round 1 already reviewed at `78996283`
(base `59b9299a`, HEAD `09768755`, tree clean). Round 1's verifications are carried forward, not
re-derived: §3.2's transport contract, §2.8, §3 clause 2, the two hoisted reads, site 7's reorder,
site 8's founder-ruled error handling, the four original test inversions, and ACs 1/2 met for wave
A's share with exactly §12's predicted post-wave-A inventory remaining. Wave B's file set, the
lifecycle-drain cluster (reassigned to wave B), and R2's launder rule are out of scope by
orchestrator decision and are not assessed.

**Verdict: DONE** — 0 blocking findings. Both round-1 blockers are genuinely closed. Proceed to
final approval and ship.

---

## Gates I re-ran myself, in the foreground, on the clean committed tree

| Gate | Result |
|---|---|
| `npm run verify` | **exit 0** (`VERIFY_EXIT=0`) |
| ├ `npm run check` | `typecheck-gate: PASS — all 34 packages checked` |
| ├ `npm run lint` | `governance-lint: PASS — 3358 tracked files (790 production, 2568 development), 33 packages, 8247 crossings, 18 rules, **187 production + 0 development** known violation(s) at warn`; fixtures 63 PASS, attacks 49 PASS |
| ├ `npm run knip` / `knip:production` | **PASS** (were red in round 1) |
| ├ `npm run deps:check` | **PASS** — `33 packages, imports and manifests agree (1 justified exception)` (was red in round 1) |
| ├ `npm run mock-inventory:check` | PASS |
| ├ web + desktop build | PASS |
| └ `verify-attest` (affected slice) | unit 12 files / 167 tests PASS; service integration 252 files + 1 skipped / 2419 tests + 3 skips PASS; e2e affected none; attestation `status=passed` |
| The two new B2 failure-window tests, run alone | 2 files / 10 tests PASS |
| **Sanity-break**: reverse-applied `aa64b45b`'s two production hunks, re-ran those two files | **exactly the 2 new tests fail, the other 8 pass** (see below) — overlay removed, tree clean at `09768755` |
| `git diff 59b9299a...HEAD -- governance/rule-severity.json` | **empty** — correct, wave A deletes no key (§12/§12.1) |
| The WP's own transaction-threading probe | 21 tx bodies; the one new core body is `teams-routes.ts:269` with a single callee, `createTeam(tx, …)` — a core service. No orchestration callee inside any core transaction. |

Production violations did **not** rise: 187 in round 1, 187 now. Development violations stay 0 —
so neither the new Postgres trigger nor the `vi.spyOn` fault injection created a governance finding.

---

## AC-by-AC (wave A)

| AC (`plan.md:47-53`) | Owner | Status |
|---|---|---|
| 1 — no layer names another layer or its service (imports **and manifest**) | wave B completes; wave A owed its call-site + manifest share | **Wave A share met.** Round 1 confirmed the call-site half and the exact remaining §12-predicted inventory. The manifest half is now closed too: `layers/agent-orchestration/package.json:15` declares `@hyperidle/agent-run-config` (same-layer service — no cross-layer manifest crossing), `agent-run-config/package.json` drops the now-unreferenced `@hyperidle/shared` (`rg` in that package: zero references), and `tools/eval/package.json` declares what its new fixture imports. `deps:check` agrees with the tree. |
| 2 — no cross-layer DI | wave B | Wave A share met (round 1); untouched by these four commits. |
| 3 — applications compose faces only | **wave B** | Not wave A. |
| 4 — MCP router dialled by the harness-owning layer | **wave B** | Not wave A. |
| 5 — owned keys removed from `governance/rule-severity.json` | **wave B** | File unchanged — correct per §12 ("wave A deletes no key"), verified by empty diff. |
| 6 — AU28 bookkeeping gone | moot upstream (AU32) | Nothing built, nothing needed. |
| 7 — `npm run verify` green (the run itself is ship-time) | **wave A owes the green tree** | **PASSES.** `npm run verify` exit 0, run by me in the foreground on the clean committed tree. This is the AC that failed round 1; it is closed. |

Architecture contracts touched this round:

| Contract | Status |
|---|---|
| §3.1's one rule — *"The core transaction commits; the seam call follows"* | **9 of 9 now correct.** Sites 2 and 4 restored; the other seven were already exact (round 1). |
| §3.1 sites 2 / 4 residue as written in §3.1 ("team exists with no harness defaults"; "flagged item with no queued review action") | **Now exactly what the code produces** — the residue is cross-layer only again, which is what was ruled. |
| §3.1 — window named at each site in code | Preserved verbatim at both sites, with the core-atomicity reason added (`teams-routes.ts:266-269`, `knowledge-repository.ts:1295-1300`). |
| §3.1 — "a seam call never runs while this process holds a transaction" (the deadlock rule) | **Held at both fixed sites** — verified directly, not by shape. |
| §10 per-window tests | Improved: two new failure-window tests, both proven to fail when the fix is reverted. N2 (three windows still positive-path only) unchanged. |

---

## B2 — verified closed (the correctness regression)

**`layers/core-api/src/routes/teams-routes.ts:269-283`.** `createTeam(tx, …)` runs inside
`await db.transaction(...)`; `agentOrchestration.runConfig.writeTeamDefaults(teamId, …)` is at
`:284`, **after** the transaction callback closes. `createTeam`
(`layers/core-api/org/src/team-lookup.ts:253` `teams`, `:260` `teamMembers`, in that order) is not
internally transactional, so this is the only wrapper — and it is the shape sites 5/6/9 use. The
route's `db` is the pooled handle; the seam call is issued with no transaction open, so the
deadlock this WP root-caused twice cannot recur here. No cross-layer write was pulled back inside:
the probe reports `teams-routes.ts:269` with exactly one threaded callee, `createTeam`.

**`layers/core-api/knowledge/src/knowledge-repository.ts:1301-1314`** (`transition`'s `"flag"`
case). The `knowledgeItems` UPDATE and the `knowledgeEditLog` INSERT are both inside
`await db.transaction(...)`; `getItemForTransition` stays a read before it. The seam call
(`agentOrchestration.intents.submit`) lives in the caller, `routes/knowledge.ts:906-950`, and runs
after `knowledgeTransition` has returned — i.e. after commit. Every caller of `transition` in the
tree passes the pooled route handle (`routes/knowledge.ts:632, 766, 806, 893, 1031`), so no seam
call is inside this transaction and no caller is surprised by it. The one development caller that
does pass a real transaction handle — the pre-existing `flagItem rollback lock`
(`knowledge-repository.au14-round2.integration.test.ts:208`) — still passes, so the nested
savepoint path works; that test's guarantee is unchanged, which is what §3.1 said it should be.

**The two new tests prove rollback, and I proved that they prove it.** Reverse-applying
`aa64b45b`'s two production hunks and re-running both files fails exactly the two new tests, with
the two states round 1 named:

```
FAIL  flagItem's own two writes stay atomic with each other (AU31 review B2)
      AssertionError: expected 'draft' to be 'active'          ← the UPDATE committed alone
FAIL  createTeam's own two writes stay atomic with each other (AU31 review B2)
      AssertionError: expected [ { …(10) } ] to have a length of +0 but got 1   ← teams row, no companion
Test Files  2 failed (2)      Tests  2 failed | 8 passed (10)
```

The overlay was removed immediately; `git status` is clean at `09768755`.

**Both run on a plain pooled handle, as production does.** The knowledge test calls
`transition(db, …)` with the `db` fixture (`framework/db/src/__testing__/test-fixtures.ts:47-53` —
a checked-out pool instance, truncated on checkout, wrapped only to unwrap Drizzle error
messages), never a caller-opened transaction; its own comment says so and it is true. The teams
test goes through `app.request("/api/teams", …)` — the real HTTP route on the real database — and
the `app` fixture is built from the **same** `db` object (`test-fixtures.ts:126`), which is why
spying on that object reaches the route.

**The asymmetric fault injection is justified, and the justification is factually correct.**
- Teams: `vi.spyOn` on the real transaction handle's `insert`, faulting only `teamMembers`. The
  stated reason — a raw `sql` template naming `team_members` would read to the census as a
  `team_members` write with no `teams` companion — checks out: `teams`/`teamMembers` is a real
  companion group (`scripts/lib/crossing-detectors.ts:375-382` names `teamMembers` explicitly as
  "updated by their owners and genuinely part of the row set"), the census credits writes named
  inside a `sql` template (`:480`), and a development-world write of a guarded table without its
  companion is `forbidden` under `write-the-whole-row-set`
  (`scripts/lib/governance-model.ts:377-389`). There is a governance attack fixture for exactly
  this shape (`governance-attacks.ts:502-506`, "a test creating a team with no membership row").
- Knowledge: a real `before insert` trigger on `knowledge_edit_log`, which is **not** a guarded
  companion — Ruling 13a excludes append-only logs from companion groups and names
  `knowledgeEditLog` as one of them (`crossing-detectors.ts:375-381`). So the trigger is free
  here and would not have been on `team_members`. Lint confirms: 0 development violations.
- Neither injection can pass for an unrelated reason. If the teams spy failed to match
  (`table === teamMembers` across module instances), the route would return 201 and the row would
  exist, failing both assertions; the injected error is visible in the run's stderr
  (`AU31 B2 injected team_members write failure`). The knowledge trigger fires on the second write,
  after the UPDATE, so passing requires the UPDATE to have been rolled back.
- Cleanup is real: the trigger is dropped in `finally` (the pool truncates, it does not drop), and
  the transaction spy is restored in `finally`.

**The class is closed, not just the two instances.** Four `db.transaction` removals exist in the
whole wave-A diff; all four are now accounted for: `routes/agents.ts` (site 1) and
`teams-routes.ts:412` (site 3) each wrapped exactly **one** core write (`insertUser`) plus the seam
write, so nothing core-side lost atomicity; `routes/sessions-routes.ts` wrapped two
**orchestration** writes, which moved intact into orchestration's own transaction
(`agent-orchestration-intake.ts:157-169`, the §3 clause 2 atomic pair round 1 verified); and sites
2 and 4 are re-wrapped. No other site in the diff drops a core-only transaction.

## B1 — verified closed (the red gates)

`deps:check`, `knip` and `knip:production` all pass. Each row lands in the block its importer's
world requires and no new **production** manifest crossing was created:

- `layers/agent-orchestration/package.json:15` → `@hyperidle/agent-run-config`. The importer
  (`layers/agent-orchestration/src/routes/agent-orchestration-intake.ts`) is production; the target
  is a service of the **same** layer, so this is not a cross-layer manifest crossing, and the
  production count is unchanged at 187 — confirming it.
- `tools/eval/package.json` → `@hyperidle/agent-orchestration`, `@hyperidle/api-contract`, `hono`.
  `tools/` sits outside the shipping roots, so this manifest is development-world; the rows match
  the fixture's real imports (`tools/eval/src/agent-orchestration-fixture.ts:18-23` — one value
  import and two type-only), and they sit alongside the package's existing `@hyperidle/core-api` /
  `@hyperidle/users` / `@hyperidle/settings` rows in the same block. No production manifest gains a
  layer row.
- `layers/agent-orchestration/agent-run-config/package.json` drops `@hyperidle/shared`. The
  package's `src/` has zero references left (it was `validate-agent-config.ts`'s import, moved out
  by §2.8); `devDependencies` untouched.
- `package-lock.json` was regenerated with the same four rows, so `npm ci` stays consistent.
- **No gate was widened to pass.** No `scripts/` change in these four commits; `JUSTIFIED_UNUSED`
  (`scripts/lib/dep-manifest-verdict.ts`), `knip.json` and `governance/*` are untouched by the whole
  branch except `scripts/governance-context.ts`, whose only edit **raises** the `api` detector floor
  126 → 184 (a ratchet in the strengthening direction, pre-existing to this round).

## Two non-blocking closures — both correct

- **N1**: `layers/core-api/routine/src/index.ts` no longer re-exports `resolveRoutineRunTargetAgent`.
  Nothing consumed it through the barrel and nothing does now — the production caller
  (`routine-scheduler.ts:74`) and the test caller
  (`routine-run-resolver.integration.test.ts:148`) both import `./routine-service.js` relatively.
  `check` and `knip` green.
- **N4**: `transitionProposedCall`'s outer parameter is `exec` on all three overloads and the
  implementation (`layers/core-api/review/src/proposed-call-workflow.ts:496-508`), and every body
  reference was renamed with it. **`innerTx` is untouched** — `exec.transaction(async (innerTx) …)`
  at `:536` still threads `innerTx` to `resolveReengagementRequest(innerTx, …)` at `:563`, and the
  seam-backed `ports.intentRecorder.record(exec, pendingIntent)` at `:594` stays **outside** that
  transaction. Semantics unchanged; only the misleading name is gone.

---

## BLOCKING

None.

## NON-BLOCKING DEFECTS

Round 1's N2, N3, N5, N6, N7 and N8 were deliberately left open and are unchanged; they are not
re-argued here and they do not block. One new, smaller item:

**N9 — the injected plpgsql function outlives its test.** The knowledge test drops its trigger in
`finally` but leaves `au31_b2_reject_knowledge_edit_log()` defined
(`knowledge-repository.au14-round2.integration.test.ts:243-250`); the pool truncates rather than
drops, so the function persists for every later file on that instance. Harmless today — nothing
references it once the trigger is gone — but the `finally` that already exists is the free place to
`drop function if exists` too.

## FOLLOW-UP / NOTES (not assigned)

- The committed attestation is keyed to `8cff343e`, not `HEAD` (`09768755`), because the
  attestation commit itself moved the sha. My own `verify` run regenerated one for `09768755` and I
  deleted it to leave the tree clean, so this is purely a note for `/pipeline:ship`, which
  regenerates the attestation for the pushed sha anyway.
- Governance's own Ruling 13a treats `knowledgeEditLog` as history rather than state, so site 4's
  half of B2 was the stricter of the two calls. Re-wrapping it is still right — it costs nothing,
  matches sites 5/6/9, and restores the pre-`origin/main` guarantee that the file's own
  `flagItem rollback lock` test describes — but the teams half is the one that closed a state the
  governance model calls impossible.
- I also ran the **full** service integration lane, not just the affected slice verify gates on:
  `npm run test:integration:service` exit 0, `Test Files 321 passed | 1 skipped (322)`,
  `Tests 2844 passed | 4 skipped (2848)` — exactly round 1's 2842 + 4 skips plus these two new
  tests, so the pooled-instance residue (injected trigger, transaction spy) leaks into no other
  file.

## What is demonstrably right

- Both round-1 blockers are closed at the root, not papered over: the transaction restored where it
  was lost, the manifests corrected where the import moved, and no gate, floor, allowlist or
  severity file touched to get there.
- The two new tests are honest evidence. Each fails for the right reason when the fix is removed,
  each runs against the real database through the real path production uses, and each cleans up the
  state it injected.
- Nothing regressed: verify exit 0, 34/34 packages, 187/0 governance violations (flat), the full
  affected unit + integration slice green, and the pre-existing suite that passes a real
  transaction handle into the newly-wrapped `flag` case still passes.
