# AU29 — Implementation review, round 3 (closure check)

Reviewer: independent, read-only. Branch `pipeline/AU29`, HEAD `39cba533` (= `origin/pipeline/AU29`, tree clean before and after every probe, `origin/main` `bbe82e9a` is an ancestor). Delta reviewed: `0563fa71..39cba533` — `ddab0fa3` (N6 prose + N7 guard) and `39cba533` (attestation re-mint). 4 files: `.pipeline/work/AU29/review-round2.md`, the attestation rename, `framework/shared/src/factory-roster.ts` (comment-only), `tools/setup/src/__tests__/setup-cli.test.ts`.

## Verdict

**DONE.** No blocking findings. B2 is closed, N7 is a real guard proven red-then-green, N6's attribution is correct, nothing regressed, scope is clean. One non-blocking defect (N8) rides in the N6 fix.

---

## 1. B2 — CLOSED

```
$ VERIFY_SECRET="$(cat ~/.config/hyperidle/verify-secret)" npx tsx scripts/check-attestation.ts
check-attestation: verified (test, test:integration, test:e2e) at 2026-08-08T15:04:30.484Z [scope=affected]
EXIT=0
```

Exactly one attestation in the tree — `git ls-tree -r HEAD | grep verify-attest` returns only `.verify-attestations/ddab0fa3a593cff913d9074b895bb40d27070797.json`; the `22fd4886` file is gone from both the tree and the working dir. Its payload: `"dirty": false`, `status: passed`, `partial: false`, `scope: "affected"`, `tools == allTools`, per-harness map fully populated. It cleared HMAC, status, partial, dirty, scope, agentic floor and harness symmetry, then the source-integrity gate.

**srcHash is genuinely current, and the commit ordering is correct, not stale.** `sourceHash()` (`scripts/check-attestation.ts:44-56`) fingerprints `git ls-tree -r HEAD` with `.verify-attestations/` and `.verify-attestation.json` filtered out — so committing the attestation cannot change its own expected value (`@lore Z8-166`, `:39-43`). That is exactly why the attestation commit must post-date the attested source commit in this repo; `ddab0fa3` attested, `39cba533` recording it, is the designed shape. The gate recomputed the hash over the *current* HEAD and matched — had one source byte drifted, `:243` would have failed with "tracked source differs from the attested run". Nothing about this is a fresh staleness problem.

## 2. N7 — a real guard, shown red

Reproduced in an isolated `git archive HEAD` copy under scratch (node_modules symlinked; the reviewed worktree was never touched). Three runs, one variable each:

| source | test | result |
|---|---|---|
| HEAD `setup-cli.ts` (fixed) | HEAD test (with `--root`) | 16 passed |
| `git show 9d5c5e51:tools/setup/src/setup-cli.ts` (pre-fix) | HEAD test (with `--root`) | **1 failed** / 15 passed |
| pre-fix | pre-N7 test (`0563fa71`, no `--root`) | 16 passed |

The failure is the exact B1 regression, not an incidental error:

```
FAIL  src/__tests__/setup-cli.test.ts > H4 AC1 > creates PGlite data dir, runs migrations, seeds — end to end
Error: ENOENT: no such file or directory, open '/var/folders/.../hyperidle-h4-pl6Ipy/not-a-repo-root/framework/db/drizzle'
 ❯ applyMigrations framework/db/src/migrate.ts:59:9
 ❯ applyLaptopMigrations src/setup-cli.ts:154:8
 ❯ runLaptop src/setup-cli.ts:200:2
```

Row 3 is the load-bearing control: the same buggy source is **green** under the old test, so the added `--root` argument — not some unrelated drift — is what makes the guard bite. The guard cannot pass vacuously: it asserts `exit === 0` *and* queries the resulting PGlite for `system:propagation`, so a migration that silently no-ops still fails.

## 3. N6 — attribution is true

- `applyFactoryCoreState` exists at `layers/core-api/src/bootstrap/factory-state.ts:58` and is the real consumer (`applications/desktop/src/main.ts:459`, `tools/setup/src/factory-bootstrap-runner.ts:19`).
- Display-name derivation is where the comment says: `factory-state.ts:97` reads `COMMUNITY_DISPLAY_NAMES`, defined at `factory-roster.ts:115` in the same file the comment says "below".
- `:71` (`system:propagation`) matches `factory-state.ts:66-74`; `:73` (`seed-ki-1`) matches `ensureFactoryKnowledgeSeed` → `layers/core-api/knowledge/src/factory-seed.ts:23`.
- No `db-bootstrap` / `db-owned infra` / `db-writer` / `db infra` string survives anywhere in `factory-roster.ts`. `FACILITATOR_TOOLS` and `skills` appear only as the "no longer exist" note (`:37-38`) and the pre-existing `@lore AU26 G1` block (`:105`).

## 4. Nothing regressed

- `npm run check` → `typecheck-gate: PASS — all 35 packages checked` (0 errors, every package).
- `npm run lint` → **exit 0**. `governance-lint: PASS — 3312 tracked files (788 production, 2524 development), 34 packages, 8189 crossings, 19 rules, 191 production + 66 development known violation(s) at warn.` Zero `db:unknown`, zero `db:util` occurrences in the full log. The only `framework → *` group is `10  4 file(s)  framework → db:table (other) [table:write]` under **DEVELOPMENT** (all `framework/db/src/__tests__/*`) — zero production `framework → *`. The +1 tracked/development file vs round 2 (3311 → 3312) is exactly `review-round2.md`; production stays 788.
- `npm run test` → **exit 0**, 352 files / 3343 tests passed.
- **AC 7 first-boot equivalence re-run at this HEAD**, all three legs diff **empty** against the committed control `.pipeline/work/AU29/probes/first-boot-control.json`: CLI default (`--db-path`), CLI with `--root <fakeroot>`, and composition-root (`--bootstrap`). Non-vacuous: `{users: 7, knowledgeItems: 1, knowledgeAppProjection: 1, agentRunConfig: 6}`. The `--root` leg left `fakeroot` empty (0 entries) — `--root` still cannot reach the migrations lookup.

## 5. Scope — clean

The delta is comment text, one test argument, one pipeline artifact, one attestation. `factory-roster.ts` is comment-only (verified line by line in the diff — no code line changed). Nothing touches `scripts/governance-new-cells.ts` (round 1 N1) or `knip.json` (N5): both correctly left alone. No `governance/baseline.json`, no architecture.json, no AU30/AU32/AU34 surface.

---

## NON-BLOCKING DEFECT

**N8 — the N6 fix re-states a claim that is false twice over.**
`framework/shared/src/factory-roster.ts:72`

```
 *   - `factorySettings` cost/cycle/template rows (always written by `applyFactoryCoreState`)
```

`applyFactoryCoreState` (`factory-state.ts:58-132`, read in full) writes exactly four things: the propagation user, the roster users, the `agentCategory` backfill, and the knowledge seed. It never touches settings. And the table it names no longer exists — `framework/db/drizzle/0049_AU18_drop_factory_settings.sql` ends `DROP TABLE "factory_settings";`, with `framework/db/src/__tests__/schema.integration.test.ts:62` asserting `expect(tableNames).not.toContain("factory_settings")`. Round 2's N6 flagged the vague "db infra" attribution; the fix replaced it with a *specific* attribution that is wrong, which is more misleading than what it replaced. Same class as N6/N3 — comment-only, no behavioral or AC impact, no governing AC. One-line fix: drop the bullet, or restate it as "retired — see migration 0049".

## FOLLOW-UP / NOTES

- `factory-roster.ts:47` — `templateRole`'s doc still says "which `system_template:<role>` key **in factorySettings** the persona reads from", against the same dropped table. Pre-existing (outside the delta), and `rg templateRole` across `framework layers tools applications` finds only the interface field and the five literals that populate it — **zero readers**. A dead field with stale documentation; a genuine follow-up, not AU29 work.
- WP-ID surface: the delta adds `@lore AU29 N7:` in the test and a "see the AU26 G1 lore below" cross-reference at `factory-roster.ts:37-38`. Both sit in the `@lore` regime that the AU28 ruling exempts and that rounds 1–2 accepted for the identical pre-existing tags in this same file. Worth noting only that `N7` / `(B1)` are *review-round* labels — unresolvable to anyone without `.pipeline/` access; the surrounding prose fortunately states the constraint in full, so the labels are decoration rather than load-bearing.
- The `@lore` on the new test argument explains *why* `--root` must not reach the migrations lookup rather than what the line does — the right shape for the thing a future editor would otherwise re-break.
