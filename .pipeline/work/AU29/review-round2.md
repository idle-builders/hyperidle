# AU29 — Implementation review, round 2

Reviewer: independent, read-only, fresh evaluator. Branch `pipeline/AU29`, HEAD `0563fa71`.
Round-2 delta reviewed: `9d5c5e51..0563fa71` (commits `22fd4886` + `0563fa71`).
Every claim below was produced by running the command shown. Tree was `git status --porcelain` empty before and after every probe.

## Verdict

**BLOCKED — 1 blocking finding.**

Round 1's B1 is **genuinely closed**, proven by running, with no collateral damage — and it is now *more* equivalence-preserving than round 1 required (the `--root` leg produces byte-identical first-boot state). All seven plan ACs still hold at this HEAD, independently re-run. The three doc fixes each point at something that exists and says something true.

The new blocking item is in the attestation commit `0563fa71`, not in the code: the committed attestation carries `"dirty": true`, which `scripts/check-attestation.ts:184` rejects unconditionally. The source is fully green; the artifact that carries that green to CI is not. One re-mint on a clean tree fixes it, and I proved the identical source mints a passing attestation.

---

## B1 — CLOSED

`tools/setup/src/setup-cli.ts:201`

```ts
const migrationsFolder = path.resolve(Dirname, "..", "..", "..", "framework", "db", "drizzle");
```

**Depth is correct — checked, not trusted.**

```
Dirname  = /Users/tg/hyperidle/.worktrees/pipeline-AU29/tools/setup/src
resolved = /Users/tg/hyperidle/.worktrees/pipeline-AU29/framework/db/drizzle
exists   = true      sql files = 56
```

**The reviewer's original failing command now succeeds.**

```
$ npx tsx tools/setup/src/setup-cli.ts --root <scratch>/fakeroot --db-path <scratch>/rootdb
[setup] Profile: laptop (db=pglite)
[setup] Ready. PGlite data at <scratch>/rootdb
EXIT=0
```

`<scratch>/fakeroot` remained **empty** afterwards (`ls -la` → `.` and `..` only) — positive proof `--root` no longer reaches the migrations lookup.

**Default path (no `--root`) still works.** `npx tsx tools/setup/src/setup-cli.ts --db-path <scratch>/defaultdb` → exit 0, same banner.

**Equivalence against `bbe82e9a` in both modes.** Original was `path.resolve(Dirname, "..", "drizzle")` from `framework/db/src` → `framework/db/drizzle`. New anchor from `tools/setup/src` resolves to the same absolute directory. Both modes now yield state identical to the committed control:

| leg | diff vs `probes/first-boot-control.json` |
|---|---|
| CLI **with `--root`** (`--data-dir <scratch>/rootdb`) | **empty** |
| CLI **default** (`--data-dir <scratch>/defaultdb`) | **empty** |
| composition-root (`--bootstrap`) | **empty** |

Probe is not vacuous: `{users: 7, knowledgeItems: 1, knowledgeAppProjection: 1, agentRunConfig: 6}`.

**`root` is not orphaned.** Still consumed at `setup-cli.ts:176` (`path.join(root, "hyperidle-pg")` — the `--db-path` default) and `:213` (`path.join(root, "docker-compose.yml")` — the vps lookup). Both uses are what the help text at `:41` claims. `defaultRoot` (`:90-95`) is unchanged from `bbe82e9a`.

**Scope.** The fix commit touches exactly 5 files: the one B1 line, the three docs round 1 named, and `.pipeline/work/AU29/review.md`. Nothing outside AU29's locked scope. It also satisfies `architecture.md` §2.6's "moved verbatim except import specifiers and the bootstrap call" and §2.6's explicit `../../..` re-derivation instruction.

---

## Doc fixes — each verified against a real target

| fix | target | verdict |
|---|---|---|
| `docs/system-prompts/assistant.md:38` → `layers/core-api/src/services/tool-provider-bindings.ts` | file exists; `export function toolsForRole(role: string)` at **`:71`** | **true**. The other path in the same sentence (`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts`) also still exists. Repo-wide, `toolsForRole` in docs now has exactly one reference and it is correct. |
| `framework/shared/src/factory-roster.ts` → `applyFactoryCoreState` | `layers/core-api/src/bootstrap/factory-state.ts:58`, `export async function applyFactoryCoreState(db: HyperIdleDb)` — single `db` param, matching the comment's `applyFactoryCoreState(db)` | **true** |
| `tools/setup/vitest.config.ts` comment | `npx vitest run --project setup` → **1 file / 16 tests passed** | **true**; the false "no unit tests today" claim is gone and the replacement is accurate |

---

## AC re-confirmation at HEAD `0563fa71`

- **AC 1 / AC 2** — `npx tsx scripts/governance-lint.ts` over the full verify log: `db:unknown` occurrences **0**, `db:util` occurrences **0**. `governance-lint: PASS — 3311 tracked files (788 production, 2523 development), 34 packages, 8189 crossings, 19 rules, **191 production + 66 development** known violation(s) at warn.` (The +1 tracked/development file vs round 1's 3310/2522 is exactly `.pipeline/work/AU29/review.md`, added by `22fd4886` — outside the shipping roots, so development. Production count unchanged at 788.)
- **AC 3** — `framework/db/src/factory-bootstrap.ts` absent. `rg '\.(insert|update|delete)\(' framework/db/src` excluding tests/`__testing__` → one hit, `pg-ssl.ts:39 parsed.searchParams.delete(key)`, a URLSearchParams call. Composition-root leg diffs empty.
- **AC 4** — `rg 'eventBus\.(emit|on)\(|bus\.on\('` over `framework/` production → one hit, comment text at `agent-run-admission.ts:31`.
- **AC 5** — `governance/baseline.json`: 29 groups; the only group matching `framework`/`db:util`/`db:unknown` is `framework → db:table (other) [table:write] **development**` (AU32's, explicitly out of scope). Zero production `framework → *`. Lint output confirms: the only `framework → *` group emitted is the 10-site development one.
- **AC 6** — baseline non-empty (29 groups), so the contingency correctly does not trigger; `governance/baseline.json` and `--adopt` stay.
- **AC 7** — `npm run verify` **exit 0** from a clean tree. `typecheck-gate: PASS — all 35 packages checked`; `governance-lint --fixtures: PASS — 63 synthetic cases`; `governance-lint --attacks: PASS — 49 break-tests`; `governance-lint: PASS`; knip + knip:production clean; deps:check; mock-inventory:check; core-ui + desktop builds; test legs `307 passed | 1 skipped (308) files`, `2685 passed | 3 skipped (2688) tests`. First-boot equivalence: all three legs diff **empty** (table above).

### Both new guards still bite, and name an architectural fact

Event-bus emit in `framework/shared` (added `probe-emit-r2.ts`):

```
ERROR  [crossing-event] framework/shared/src/probe-emit-r2.ts:4: framework → EventBus [event] production —
emits `task_state_changed` (eventBus). the framework provides the bus. A framework package that also
publishes on it is both the pipe and the water, and the bus can no longer be reasoned about from the outside.
governance-lint: FAIL — 1 error(s).
```

Unplaced barrel export in `framework/db` (added `probe-nodb-r2.ts` + one barrel line):

```
ERROR  [db-symbols-all-placed] framework/db/src/index.ts: probeNoDbR2 — re-exported from
./probe-nodb-r2.ts, a module governance/architecture.json does not name
governance-lint: FAIL — 1 error(s).
```

Neither finding carries a count, ledger number or ratchet. After removing both probes: `git status --porcelain` empty, `governance-lint: PASS — … 191 production + 66 development`.

---

## BLOCKING

### B2 — the committed attestation is `dirty: true`; CI's own gate rejects it

`.verify-attestations/22fd488640cf046560bb26b599496b0dc9d03025.json` → `"dirty": true`
Rejected at `scripts/check-attestation.ts:184`:

```ts
if (attestation.dirty) {
    fail("verify ran with uncommitted changes — commit all changes, then re-run verify");
}
```

Reproduced against the committed artifact on the clean tree, with the real signing key:

```
$ VERIFY_SECRET="$(cat ~/.config/hyperidle/verify-secret)" npx tsx scripts/check-attestation.ts
check-attestation: verify ran with uncommitted changes — commit all changes, then re-run verify
EXIT=1
```

It gets *past* the HMAC, `status`, and `partial` checks and dies on `dirty` — so the signature and the recorded green are both fine; the flag is the sole defect.

**This is a regression, and it is change-caused.** The attestation this one supersedes was clean:

| commit | attested sha | dirty |
|---|---|---|
| `4da35ff9` (round 1's) | `2fb23990` | **false** |
| `origin/main` | `ab916700` | **false** |
| `0563fa71` (this round) | `22fd4886` | **true** |

**The source is not the problem.** `srcHash` recomputed over `git ls-tree -r HEAD` minus the attestation paths = `cc9af70bce7adeb2dd7832cb8e39abc3ddf93883614419dd70425896f41019c5` — byte-identical to the attested value, so the attestation covers the current tree and is **not stale**. My own `npm run verify`, started from a clean tree, minted `.verify-attestations/0563fa71….json` with the **same `srcHash`** and `"dirty": false`, and that attestation passes the gate:

```
check-attestation: verified (test, test:integration, test:e2e) at 2026-08-08T14:49:00.906Z [scope=affected]
EXIT=0
```

(I then deleted my file and restored the committed one; tree clean.)

**Governing authority:** concrete regression + AC 7. `.github/workflows/ci.yml:118-120` runs `npx tsx scripts/check-attestation.ts` on every non-`.md` PR, so this deterministically red-lights the merge gate. `0563fa71`'s commit message asserts "npm run verify re-run clean on the tree" — the artifact records the opposite.
**Impact:** the branch cannot go green in CI as committed. No runtime impact.
**Fix:** re-run `npm run verify` on a clean working tree and commit the resulting attestation (delete the `22fd4886` one). Already proven to produce a passing artifact over identical source. This blocks because a committed merge-gate artifact fails that gate, not because anything is dangerous.

---

## NON-BLOCKING DEFECTS

### N6 — `framework/shared/src/factory-roster.ts` still carries the stale prose one paragraph over

The fix closed round-1 N3 at lines 5, 11, 60, 83 exactly, but the same file still says:

- `:34-35` — "…are DERIVED from `community` by the **db-bootstrap** (it keeps `COMMUNITY_DISPLAY_NAMES` / `FACILITATOR_TOOLS` as **db-owned infra**)". Both attributions are now false: there is no db-bootstrap, and `COMMUNITY_DISPLAY_NAMES` is defined at **`:113` of this very file**.
- `:69-72` — `system:propagation`, `factorySettings`, `seed-ki-1` described as "db infra"; `:72` again names "db-bootstrap".

Same class as N3, in the file the fix commit opened. Comment-only, no behavioral or AC impact.

### N7 — no regression test guards the B1 line

`tools/setup/src/__tests__/setup-cli.test.ts` has a real end-to-end laptop test (`:35`, runs migrations) that passes no `--root`, and a `--root` test (`:90`) that only covers the **vps** docker-compose path. Nothing exercises laptop + `--root`, which is exactly the combination that broke. Adding `--root` to the existing `:41` invocation would be one argument. Non-blocking: the plan has no AC for it, and the failure mode is loud rather than silent.

---

## Round 1's five deliberately-left notes — correctly left

- **N1 (`governance:new-cells` names deleted surfaces)** — still emits 20 lines naming `db:bootstrap`/`db:util`. Correctly left: `scripts/governance-new-cells.ts:9` states "It is a report, not a gate"; `rg 'new-cells'` over `package.json` and `.github/workflows/` finds it only as a standalone npm alias, in no gate chain and no CI job. Genuine follow-up, not AU29 work.
- **N5 (knip redundant-entry hints)** — the three `tools/setup` entries still appear, alongside the identical pre-existing hints for `applications/desktop`, `tools/eval` and `framework/db`. knip and knip:production both exit 0. Correctly left; touching `knip.json` here would be adjacent cleanup outside the plan.
- **N2 / N3 / N4** were acted on and are verified above (N3 only partially — see N6).

---

## FOLLOW-UP / NOTES

- Round 1's open question — whether the committed attestation validates against HEAD's tracked source — is now answered: `srcHash` matches exactly, and HEAD differs from the attested commit only by the attestation file itself (`git diff --stat 22fd4886 HEAD` = 1 file). Freshness is fine; only the `dirty` flag is wrong.
- No new WP-ID leak outside `@lore` tags in the round-2 delta. The three `AU29` mentions added by `22fd4886` all sit inside `@lore` blocks (`setup-cli.ts:197`, `factory-roster.ts:12`), which the AU28 ruling exempts.
- The `@lore` block the fix replaced now states the constraint rather than the mechanics — it explains *why* `root` must not reach the migrations lookup, which is the thing a future editor would otherwise re-break.
