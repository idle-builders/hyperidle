# Architecture Critique: AF4

ARCHITECTURE-SCORE: 5/10  rounds=1  score-line: SA:5 LI:9 AC:6 DM:7 N:8 MD:8 FMC:6 S:4 V:4

**Verdict: REVISE.** The src-fix half of this plan (§4, §5) is excellent — sharp, file-specific, empirically grounded, behavior-aware. But the plan's entire foundation (§0 measurement reconciliation, §1 buckets, §3 — the largest section, §7 ordering) is built on a **measurement artifact**, not real type debt. The "3780, dominated by 3153 TS7031" framing is wrong: 3148 of those TS7031 are a build-cascade phantom that vanishes the instant the project references are built. The real, durable server debt is **~758** — exactly the spec's stated **762**. The plan inverted the spec's "760 was a narrow grep" into a false correction. This must be fixed before tests, because the plan's task ordering, effort estimate, and the entire §3 "make-or-break" section are predicated on phantom work.

---

## CRITICAL

### C1. [§0, §1, §3] The 3153 TS7031 "make-or-break" mass is a build-artifact phantom, not type debt. Real baseline is ~758, matching the spec's 762.

The plan's §0 "reconciliation" declares the spec's 760/762 figure a "narrower grep" and crowns **3780 (TS7031=3153)** as "gate-accurate … because the gate is the AC." This is backwards, and I proved it empirically.

**Evidence (reproduced in this critique session):**
- Cold `tsc --noEmit -p packages/server/tsconfig.json` (filtered TS6305/6307/6059) → **3780**, TS7031 **3153**. Matches the plan.
- The cause: `@hyperidle/db/test-fixtures` resolves to `packages/db/dist/test-fixtures.d.ts`, which **is not built** (gitignored `dist`, never emitted under `--noEmit`). So `dbTest` resolves to **`any`**, and every consumer `test("…", async ({ db, app }) => …)` destructure becomes implicit-any → **TS7031**. The direct "not built" error is TS6305 (filtered); its **downstream cascade (TS7031 in the consumer's own files) is NOT filtered** and is wrongly attributed to server.
- Proof: `tsc -b packages/db packages/shared` to emit the `.d.ts`, then re-measure server → **758 total, TS7031 = 0**. Top codes become **TS2532 (285) / TS18048 (157)** — index-access-undefined — *exactly* the spec's "760, dominated by TS2532/TS18048."
- Corroboration: `packages/db`'s own integration tests use the **identical** `dbTest.extend` + `async ({ db }) => …` pattern and have **zero TS7031** (db is the leaf — no unbuilt upstream to cascade from). The pattern is fine; the server's count is contaminated by unbuilt refs.
- The spec itself names the authority: `plans/Z8/typecheck-errors.txt` is the **`tsc -b` dump** (build mode = refs built = the correct measurement), and the spec quotes **~762** from it. The plan overrode the spec's own source of truth with a single-project miscount.

**Why this is CRITICAL, not a NIT:** §3 (the plan's largest section) is dedicated to clearing the 3148 TS7031 and is sold as "the bulk of the work / make-or-break." It is phantom work. The effort estimate, commit grouping, and step-4-before-step-9 ordering are all distorted by it.

**The §3a "preferred" mechanism is also empirically false.** §3a claims typing `test-fixtures.ts` makes the annotation "flow automatically … clearing the bulk of TS7031 without per-callback annotation." I tested this: typing the fixture-definition callbacks (and `extend<IntegrationFixtures>`) clears only the fixture's **own** errors — TS7031 drops **3153 → 3151** (two). It does **not** propagate to the 3148 consumer callbacks, because their root cause is the unbuilt `.d.ts`, not the fixture-definition annotation. The mechanism the plan picks does not do what the plan claims.

**Fix to apply in the plan:**
1. Rewrite §0: the real server debt is **~758 (≈ spec's 762)**, measured with references built (`tsc -b`, matching `plans/Z8/typecheck-errors.txt`). The 3780 is single-project-mode inflation from unbuilt db/shared `.d.ts` cascading through the test fixtures as phantom TS7031.
2. **Resolve the gate-vs-build question explicitly** (this is the real open issue C1 surfaces): the gate (`scripts/typecheck-gate.ts`) runs per-package `tsc --noEmit -p` and **never emits `.d.ts`**, and `verify` runs `check` *before* any build. So on a **clean CI checkout** the gate will see the 3780-shaped count (cascade included), because `dist` is absent. The plan must state which state the AC1 gate-green is asserted against and how AF4 makes it green deterministically. Two honest options — the plan must pick and justify one:
   - **(a) Pre-build refs in the gate/check flow** (e.g. `tsc -b` the leaf packages before fan-out, or add a `prebuild` of db/shared `.d.ts`). But the gate is **AF1-owned and the plan forbids modifying it** (§6) — so this likely routes a note to AF1, not a fix here.
   - **(b) The TS7031 cascade is real-in-CI and must be cleared by per-callback annotation** — in which case it is NOT phantom and §3 stands, but then §3a's "flows automatically" claim is false and the plan owes ~3148 explicit annotations (a very different effort/risk profile, and a test-churn footprint that strains the protectedTests guarantee).
   The plan currently asserts (a)-style propagation magic while the gate mechanics imply (b)-style reality. **This contradiction is the single most important thing to resolve** — it changes the workpackage from "~758 real fixes" to "either a 1-line ref-build change owned by AF1, or 3148 annotations." Until the plan names which world it's in, AC1's verification method is undefined.
3. Re-derive §1's bucket table from the refs-built baseline (src ≈ 103, test ≈ 655 at 758 — not src 224 / test 3556).

### C2. [§9, §4a, §4f, §10] Plan asserts zod v4 / `z.ZodType` v4 export names; installed zod is **3.25.76 (v3)**.

The plan repeatedly anchors load-bearing src fixes on "zod v4":
- §4a: "constrain `T extends z.ZodType` (zod v4 export name)."
- §4f: "zod v4 API change … `z.string().min(n)` vs a changed signature."
- §9: "the installed version (zod v4 era)."

Installed: **zod 3.25.76**, `@hono/zod-validator 0.7.6`. The existing `validate.ts` already uses `z.ZodTypeAny` (the v3 constraint) and already constrains `T extends z.ZodTypeAny` — so §4a's stated current error ("`T` not assignable to `ZodSchema`, *constrain* `T extends z.ZodType`") mis-describes the actual signature; the real error `validate.ts(31,28): TS2345 'T' not assignable to 'ZodSchema'` is the `zValidator` arg-position mismatch, not a missing constraint. **Fix:** purge every "zod v4" claim; re-anchor §4a/§4f against zod **3.25** and `@hono/zod-validator 0.7.6` exports. The `bet.schema.ts:62`/`threads-schema.ts:94` TS2554 arg-count errors are not a "v4 arity change" — diagnose them against the installed v3 API.

---

## WARNING

### W1. [§5, §9, §4f] The AF3-dependency D-candidate (`write-memory.ts:107` `.id`/`.version`) does not exist at the real baseline.

§4f/§5/§9 flag `skill-tools/write-memory.ts:107` (`.version`/`.id` on `KnowledgeItemWithFabric`) as the headline **AF3-dependency risk** ("depends on AF3 … re-check after AF3"). At the refs-built baseline (758), that src error **is gone** — only two *test-file* TS2532 remain in write-memory. It is another TS6305-cascade phantom (fabric `.d.ts` unbuilt). The AF3 *mechanism* is real (server `package.json` deps on `@hyperidle/fabric`, fabric is AF3, AF3 has **not shipped** — no `.pipeline/progress/AF3.json` exists; only AF1/AF2 progress present), but the plan mis-locates the symptom. **Fix:** correct the D-candidate table — re-measure §4f/§5 fabric-typed sites with fabric's `.d.ts` built; if they vanish, drop them from the D-list; keep the AF3-ordering note (AF3 unbuilt → server sees fabric-export rot as phantom errors) as a measurement caveat, not a contract bug.

### W2. [§4a] The single most-cited src fix (`validateBody`) is `⚠️ UNVERIFIED` and its current-error description is inaccurate.

§4a is "the single most valuable src fix" and the AC2 route-boundary fix, yet its signature is `⚠️ UNVERIFIED` against `@hono/zod-validator`, AND its description of the current error is wrong (see C2 — the constraint already exists). A plan's load-bearing fix should not rest on an unverified signature with a misdiagnosed starting state. **Fix:** before finalizing, read `node_modules/@hono/zod-validator@0.7.6`'s `Hook`/`ValidationTargets` exports; restate §4a's current error accurately (`zValidator`'s first-arg/overload mismatch under the `ReturnType<typeof zValidator>` widening), and give the concrete return type. The fallback ("`ValidatedContext` helper, never `as Shape`") is good and should stay.

### W3. [§8 AC-table, AC1] AC1's regression-proof and gate-green assertion don't pin the dist/refs state — so the verification is non-deterministic.

AC1 verification = "`npm run check` → server row = PASS" + inject `const x: string = 123` → FAIL. But per C1, the gate's output depends on whether `dist/*.d.ts` exists when it runs (758 vs 3780-shaped), and `verify` runs `check` before `build`. The regression-proof injection works regardless, but the **zero-errors** assertion is only meaningful once the gate's input state is pinned. **Fix:** the AC1 row must state the gate-input contract (refs built, or cascade-cleared) established in C1's resolution, and the verification must run in that state.

### W4. [§4b] `ToolDefinition` invariance erasure safety rests on "only call sites are post-validation" — verified-today but flagged as a re-grep risk; make the guard a hard gate.

§4b/§9 correctly identify that erasing `Input` to `unknown` in `RegisteredTool` is sound **only** because `.handler(` is always invoked post-`parse`. This is the right analysis and the fix is clean (folds two bespoke wrappers into one named boundary — good naming-is-architecture). But "re-grep before committing" is a soft gate for a soundness-critical erasure. **Fix:** elevate to a stated pre-condition with an explicit verification step in §7 (grep `\.handler\(` across server src, assert every call site is inside tool-registry/assistant-tools post-`parse`), and add the skill-tool integration suite as the runtime-no-regression proof (already implied in §7 step 3 — make it explicit in the AC).

---

## SUGGESTION

### S1. [§3b, §11] If C1 resolves to "cascade is real-in-CI" (option b), the protectedTests guarantee is under-specified for ~3148 test edits.

§11 permits "type annotations / `!` / `toBeDefined()` narrowing, no assertion deltas," audited by `git diff`. If 3148 callbacks need annotation, that's a massive diff to audit by eye. Specify a mechanical check (e.g. assert the diff touches only callback-param positions / adds only type syntax, no token changes inside `expect(...)`). If C1 resolves to "phantom" (option a), this shrinks to the ~655 real test errors and is fine.

### S2. [§4f, §9] `AppType` dead-export adjudication is sound but should name the decision criterion concretely.

§4f/§9 handle the `schemas/index.ts:14` `AppType` re-export well (restore vs delete, grep web first). Good. Minor: state the decision rule as a one-liner — "if any non-AF5-quarantined consumer imports `AppType`, restore; else delete and note for AF5." Web is AF5-quarantined so its compile can't gate this; the grep-not-depend instinct in §9 is correct.

### S3. [§6] Drain step is correct and well-grounded; no change needed.

The atomic-single-drain (not per-file), the stale-ratchet rationale (`staleExcepted` fails a zero-error quarantined package), and the "don't modify the gate" boundary are all right. Verified `typecheck-debt.json` has `server: 3780` (note: this stored figure is itself the inflated count — harmless for the `del` operation, but worth a one-line note that the stored number is single-project-mode, not the real debt).

---

## What's Working Well

- **§4 (src genuine-type work) is genuinely excellent.** File-and-line-specific, behavior-aware, every fix classified fix-here-neutral vs route-to-AFxx with a sound heuristic (§5: "does compiling require sending a different field / value the code never produced?"). The two root-cause fixes (`validateBody` erasure, `ToolDefinition` invariance) are correctly diagnosed and persist at the real 758 baseline — these are real, valuable, and well-scoped. The dispatcher exhaustive-`never`, credentials switch, and `SessionContext.traceId` D-candidates are all real at baseline and correctly adjudicated (fix-neutral vs route).
- **Layer integrity is clean (LI:9).** Type-only workpackage, no cross-layer reach; the §12 security framing (validateBody *tightens* the boundary, fail-closed credential default preserved) is a thoughtful read for a tooling change.
- **The binding policy inheritance (no flag-loosening, no boundary `any`, `!`/`toBeDefined()` only in tests) is correctly carried from AF2 §1 and reflected in the AC2 grep-gate.** No flag-relaxation anywhere — the hard constraint is honored.
- **The Z8 recording mechanism is verified** (markdown sections in `plans/Z8/master-flag-register.md`, no JSON API), and the "fix-here is the norm, route only true behavior changes" default matches AF2/AF3 precedent.
