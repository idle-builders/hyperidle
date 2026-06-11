# AF4 — Type-green the server package: retro

**Date:** 2026-06-11
**Branch:** feat/AF4-type-green-server
**Result:** DONE — server 758 → 0 real errors, removed from typecheck-debt quarantine, `npm run verify` green. 41 commits (28 fix, 9 docs/plan, 1 merge, 1 churn drain, 2 biome/knip cleanup).

---

## Cost signals (high-value; read by A/B harness)

### 1. Measurement-artifact loop — three baselines before one true count (HIGH COST)

The spec quoted ~762. The designer's first architecture plan measured **3780** (TS7031=3153) using `tsc --noEmit -p packages/server/tsconfig.json` on a tree whose leaf `dist/*.d.ts` were absent. The architecture-critique empirically disproved it (built leaves → **758, TS7031=0**) and forced a full plan revision round (commit `f2935ab0` + round-2 critique `77b14111` + zod-plan amendment `a18494c0`).

**Wasted work:** one complete architecture plan written to phantom assumptions, one full critique round, one revision round, one re-critique round. Estimated: 2–3 agent sessions + 4 docs-commits before builder started.

**Single prevention check:** `ls packages/shared/dist packages/db/dist` before measuring. If either is absent, run `npx tsc -b packages/shared packages/db packages/fabric` first, then measure. One command, documented in lore.md §1. No plan should quote an error count from a dist-free tree.

---

### 2. Zod version mis-location — designer and reviewer anchored on root zod (3.25.76); server resolves its own zod (4.4.3)

Architecture plan §4a/§4f/§9 anchored fixes on "zod v4 export names" using the root `package.json` zod (3.25.76). The critique caught this and forced a plan amendment (commit `a18494c0`). The builder then discovered server's `node_modules/zod` is **4.4.3** (not root), causing a builder BLOCKER on the `z.record` arity fix — `z.record(z.string(), z.unknown())` (v4 arity) compiled under the server's local zod but the plan prescribed the v3 single-arg form.

**Lesson:** always resolve `packages/<pkg>/node_modules/<dep>/package.json` to determine the version a package sees — not the root `package.json`. For any type-debt workpackage touching schemas, print `cat packages/server/node_modules/zod/package.json | jq .version` before anchoring fixes.

**Recurring risk:** in a monorepo with hoisting exceptions, the consuming package's `node_modules` overrides the root. This is a cross-AF risk; AF5 (web) should check its own zod version before any schema fix.

---

### 3. False-BLOCKER: `tsc -b` scattering `.d.ts` droppings into `src/`, biome flagging 714 errors

Builder ran `npx tsc -b packages/shared packages/db packages/fabric` to populate leaf dist (correct procedure per plan §0), but these packages are not wired as clean composite references — `tsc -b` emitted ~114 generated `.d.ts/.js/.map` files into `packages/shared/src/` and `packages/db/src/`. Biome lints `src/` but not `dist/`, so it flagged ~714 `noBannedTypes` errors in generated files. Builder raised it as a BLOCKER ("main is red").

**Orchestrator diagnosis:** the 714 errors are generated-file noise — delete the droppings with a git-untracked cleanup command, keep `dist/`. Not a source error. Builder's initial lore recorded the **wrong** conclusion ("gate needs no leaf dist"); orchestrator ran `rm -rf packages/*/dist && npm run check` → 3428 errors, proving leaf dist IS required, and corrected the lore (commit `74eb1507`).

**Wasted work:** one blocker round, one false lore, one empirical disproof, one lore correction = ~3 agent rounds.

**Fix (now documented in lore.md §2):** after `tsc -b`, always run the src-droppings cleanup: `git status --short | grep -E '^\?\? packages/.*src/.*\.(d\.ts|js|map)$' | awk '{print $2}' | xargs -r rm -f`. This is the correct procedure and is now in `plans/AF4/lore.md §Correct procedure`.

**Systemic note:** the dropping trap recurs because `tsc -b` is the obvious dist-population command but the packages aren't wired as proper composites. AF5 and any future non-leaf package drain will hit this again.

---

### 4. Stale-base drift — AF3 merged mid-flight, rewrote shared files AF4 was fixing (CC-017)

AF3 PR #245 merged into `origin/main` while AF4 was mid-build (commit `e83a913a` = merge). It rewrote `tool-registry.ts` and `assistant-tools.ts`, the same files AF4 was type-greening. The merge auto-resolved cleanly (no conflicts). However, the `typecheck-debt.json` stored figure for server was the inflated 3780 (single-project-mode count), which needed manual reconciliation in the drain step, and Z8 numbering needed a cross-check pass.

**Earlier rebase impact:** the merge was unavoidable (AF3 landed after AF4 started). An earlier rebase would have aligned `typecheck-debt.json` sooner but wouldn't have prevented the file overlap — both were touching the same tool-registry files for type reasons. The auto-resolve was clean. Marginal value of earlier rebase: low. This is a CC-017 occurrence — architecture-level parallel-file tracking is the fix.

---

### 5. The systemic gate flaw — build-state-nondeterministic CI gate (Z8-169, recurs every AF workpackage)

The AF1 typecheck gate (`scripts/typecheck-gate.ts`) runs `tsc --noEmit -p` per package (single-project mode, never emits). CI validates only the HMAC attestation signature — it never re-runs the gate. This means:

- **On a dist-free tree:** gate reports 3428 errors, but attestation from a dist-present tree passes CI.
- **This is the mechanism** by which AF2's un-quarantine of design-system/desktop shipped green to CI (Z8-166 attestation-bypass) despite the gate being red locally on a fresh checkout.
- The attestation-bypass is **not a CI bug** — it's the intended design (local-green → attest → CI validates signature). But it means local gate output is tree-state-dependent, and a developer on a fresh clone will see a red gate that CI accepts.

**Recorded as:** Z8-169 (gate build-state nondeterminism). Proposed AF1 fix: `tsc -b` the leaf packages before the fan-out gate, or make `check` script emit leaves before measuring. Not AF4 scope; flagged for an AF1 follow-up.

**Recurrence pattern:** this burned AF2 (design-system/desktop false-done, Z8-166), AF3 (stale-dist theory drove wrong C1), and AF4 (3780 phantom baseline, builder BLOCKER, lore-correction round). Every non-leaf drain will hit it again until AF1 fixes the gate.

---

## What worked

- **AC delivery:** server 758→0 under real gate, removed from quarantine, `npm run verify` clean. 2583 tests passed / 5 skipped. No assertion deltas. No flag relaxation.
- **Architecture critique (round 2) was decisive:** the round-1 critique correctly identified the 3780 phantom as the single critical flaw and provided empirical proof. The revision reverted all phantom-based framing and grounded the plan in true 758 baseline. Without the critique, the builder would have wasted time on 3148 phantom annotations.
- **Binding policy inheritance from AF2 held:** no `any`/`@ts-ignore`/`@ts-expect-error` at route boundaries, no `noUncheckedIndexedAccess` relaxation, `!`/`toBeDefined()` only in tests. AC2 grep gate confirmed zero violations. Policy carried cleanly from AF2 → AF3 → AF4.
- **ValidatedJson<T> boundary helper:** the root-cause src fix for `validate.ts` (AC2) is a genuine type-soundness improvement — `c.req.valid("json")` now typed `z.output<T>` instead of `unknown`. The implementation was sound, behavior-neutral, and the `validate.route-boundary.test.ts` is a durable regression proof.
- **RegisteredTool invariance erasure:** folding `wrapForRegistry` + `wrapAssistantTool` into one `toRegistered` adapter was correctly diagnosed (`.handler(` only invoked post-`inputSchema.safeParse`), and reduces bespoke wrapper surface.
- **D-candidate adjudication honest:** three entries routed to Z8 (167/168/169) with real scope reasoning; dispatcher dead-case and credentials fail-closed preserved correctly. No silent suppressions.
- **Code review clean:** zero CRITICALs, zero WARNINGs blocking, four cosmetic observations only. The plan's accuracy translated to a clean implementation.
- **Lore captured proactively:** tsc-b dropping trap + correct verify sequence documented during implementation (`plans/AF4/lore.md`). Future AF5 builder has an executable procedure, not tribal knowledge.

---

## What to change

1. **Mandate pre-measurement leaf-dist check in architecture skill.** Before quoting any error count for a non-leaf package (server/web/fabric), the architect must: (a) `ls packages/shared/dist packages/db/dist` — if absent, `npx tsc -b` leaves; (b) confirm TS7031=0 before anchoring the plan. This is a one-line procedure that prevents the entire measurement-artifact loop.

2. **Resolve dependency versions from the consuming package's `node_modules`.** For any type-debt workpackage, the plan must quote `cat packages/<pkg>/node_modules/<dep>/package.json | jq .version` for every schema-adjacent dep (zod, drizzle-zod, hono). Root `package.json` is unreliable in a monorepo with hoisting exceptions.

3. **`tsc -b` src-droppings cleanup must be a named step in the lore / skill.** After building leaf dist via `tsc -b`, the cleanup command (`git status --short | grep src/.*\.(d\.ts|js|map)$ | xargs rm`) is mandatory before running biome. Both steps now in `plans/AF4/lore.md`; consider promoting to a named script in `package.json` (e.g., `npm run clean:src-droppings`).

4. **AF1 follow-up: make the typecheck gate build-state-deterministic.** The gate should build leaf `dist/` before running, or document the clean-checkout procedure to avoid phantom counts. This recurred across AF2–AF4; it will recur in AF5. Log in `/compound` target list.

