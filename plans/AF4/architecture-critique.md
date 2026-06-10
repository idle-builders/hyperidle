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

---

# Architecture Critique: AF4 — ROUND 2

ARCHITECTURE-SCORE: 9/10  rounds=2  score-line: SA:9 LI:9 AC:9 DM:9 N:9 MD:9 FMC:9 S:9 V:8

**Verdict: APPROVE.** The revision is sound, not merely changed. Every round-1 CRITICAL is resolved at the ground-truth level, and I re-verified the resolution empirically against the rebuilt 758 baseline — not just against the plan's prose. The phantom framing is fully purged, the dependency anchoring is corrected to the installed versions, the dropped D-candidate is confirmed absent, and the surviving src/test work is real and accurately classified. Ship it to build.

## Empirical re-verification (this session, refs built)

Reproduced the exact ground truth the orchestrator pinned:
- `npx tsc -b packages/shared packages/db` (leaves built, exit 0; the residual `tsc -b` lines are TS6059/TS6307 rootDir-config noise, correctly stripped by the regen filter) → server `tsc --noEmit` filtered = **758 total, 103 src / 655 test, TS7031 = 0**. Top codes **TS2532 (285) / TS18048 (157)** — exactly the spec's ~762. Matches §0/§1 line-for-line.
- Installed versions confirmed: **zod 3.25.76, @hono/zod-validator 0.7.6, drizzle-zod 0.8.3.** No v4.

## Round-1 CRITICAL resolution (verified, not assumed)

### C1 (3780/TS7031 phantom) — RESOLVED, soundly.
- §0 now states the true 758 baseline, attributes the 3148 TS7031 to **stale leaf `dist/*.d.ts`** cascading through vitest-fixture destructuring, and prescribes the cure as **build-ordering (`tsc -b` leaves first)** — operational, not server type-debt. Accurate.
- §0 correctly resolves the v1 gate-vs-build open question: **CI validates the attestation signature only** (`.github/workflows/ci.yml` → `scripts/check-attestation.ts`), never re-runs the gate, so the phantom is a **local-only precondition, never a CI failure.** This is the right resolution and it closes v1's W3 non-determinism concern — the gate-input state is pinned (leaves built) as an executable precondition.
- **The `tsc -b` leaves step IS called out as an executable step** in §0 (regen block), §6 step 1, §7 step 1, §8 AC1 precondition, and §9/§10 risks. It is impossible for the next agent to miss. The "3153 make-or-break / central fixture-type fix" framing is **fully deleted** — §3 explicitly states "No root-cause TS7031 step (it does not exist at 758)."
- One residual imprecision (NIT, non-blocking): §1's tail row folds TS2554 into "~80 tail" but the actual TS2554 src count is exactly 4 (`bet.schema:62`, `threads-schema:94`, `threads:307`, `team-management:64`) — all four are individually enumerated in §4c/§4g, so no work is lost; only the summary table is loose.

### C2 (zod v4 → v3) — RESOLVED.
- Every "zod v4" claim is purged. §2/§4a/§4c/§9 re-anchor on **zod v3 (3.25.76)** and `@hono/zod-validator 0.7.6`. Verified against source: `validate.ts:31` already constrains `T extends z.ZodTypeAny` (v3) — the plan correctly re-describes the real error as the `zValidator` overload-routing failure under the `ReturnType<typeof zValidator>` widening + hook cast, **not** a missing constraint. The TS2554 `z.record` cluster is correctly diagnosed as the v3.25 single-arg deprecation (`z.record(value)` → `z.record(key, value)`), verified at `bet.schema.ts:62` = `z.record(z.unknown())`. Same wire shape.

### W1 (write-memory `.version` D-candidate) — DROPPED, confirmed phantom.
- `grep write-memory.ts` against the 758 list → **zero errors**. §5's "NOTE — phantom D-candidate removed" is accurate. The headline AF3-dependency risk is correctly downgraded to a measurement caveat (§9: "the coupling is weaker than feared").

## Spot-checks of the 103 src fixes (all real at 758)

- **`tool-registry.ts:150–175` (20) + `assistant-tools.ts:116–129` (13)** — confirmed 33 TS2322 `ToolDefinition<{specific}> → ToolDefinition<unknown>` invariance errors, exactly the line ranges in §4b. Erasure safety **hard-verified**: the only 3 `.handler(` call sites in server src are `tool-registry.ts:130/233` and `assistant-tools.ts:145`; the external dispatch (`:233 def.handler(parsed.data, ctx)`) runs **after `inputSchema.safeParse`** (`:229`). The other two are inside the wrap closures delegating to the typed `shape.handler`. Erasing `Input → unknown` at the registry boundary is sound. Folding the existing `wrapForRegistry` + `wrapAssistantTool` into one `toRegistered` adapter is the correct consolidation (naming-is-architecture; replaces two bespoke wrappers with one named boundary). **W4's "make the grep a hard gate" is now in §7 step 3 / §9 / §12.**
- **`validate.ts:31` (validateBody)** — source confirmed: `export function validateBody<T extends z.ZodTypeAny>(schema: T): ReturnType<typeof zValidator> { return zValidator("json", schema, validationHook as Parameters<typeof zValidator>[2]); }`. §4a's fix (drop the `ReturnType` widening + hook cast, let the inferring overload carry the typed validation map) is the correct root cause. The fallback (typed `ValidatedJson<T>` helper, never `as Shape`) keeps AC2 boundary-clean. The pre-existing `validate.ts:22 as unknown as Response` is in the 400-hook error path (not a req/resp boundary cast) — AC2's grep gate correctly scopes to **new** matches only.
- **`bet.schema.ts:105–108`** — confirmed 4 TS2345 `BuildSchema<"select"> → SomeType` (drizzle-zod 0.8.3 × zod 3.25 interaction). §4c's internal-schema bridge (`as z.ZodTypeAny` on a non-boundary schema-construction site, version-alignment out of scope) is the right call.
- **`dispatcher.ts:248/454/457/467`** — confirmed. Inspected source: 454 (`"response_recorded"`) and 457 (`"bet_committed"`) are dead `case` labels in a fall-through group that all `return false`; removing them is behavior-neutral (same as the exhaustive `default`). **The protectedTest claim is verified**: `o1-event-split.test.ts:153–154` literally asserts `expectedTypes.has("bet_committed") === false` and `…has("response_recorded") === false` — so removal keeps the union honest and the test green. `:467`'s never-error is correctly classified fix-here-neutral (add explicit `case … return false`) unless a member needs a real observability event → then route (AF6). Sound.

## D-candidate adjudication (re-verified at 758)

- **dispatcher:467** — fix-here-neutral, gated on "does a reaching member need a real event?" Correct; protected by o1-event-split. ✓
- **credentials:311** — source confirmed: `_exhaustive: never = name` with fail-closed `{ valid: false }` default. The only error is TS6133 (unused sentinel); the compiler already treats the switch as exhaustive at that point. §4g/§5/§12's rule (remove sentinel if exhaustive; route to AF11 if a `CredentialName` lacks a validator; **preserve fail-closed**) is sound and security-aware. ✓
- **session-provisioning:385 + handoff-to:54** (TS2741 `traceId` missing) — confirmed both exist; §5 routes to AF7 if a real traceId must thread, else type-fix optional-by-design. Correct rule. ✓
- **team-lookup:47** (TS2322 `Row | undefined → Row`) — confirmed; fix-here guard-or-widen on caller contract. Correct. ✓

## Test bucket (655)

AF2 §1 policy correctly applied (verified the policy exists in `plans/AF2/architecture.md` §1: fix every site, no `noUncheckedIndexedAccess` relaxation, `!`/`toBeDefined()` allowed in tests, genuine guards in src). Bulk is TS2532 (283 test) + TS18048 (152 test) index-access/possibly-undefined — genuinely mechanical, per-file. §11 protectedTests guards assertions (type-level additions only, no `expect(...)` deltas). With the phantom gone, v1's S1 concern (auditing 3148 churned test edits) collapses to the 655 real edits — fine.

## AC → verification mapping

Complete. AC1 = gate PASS + `jq` drain proof + regression injection, with the leaves-built precondition pinned (resolves v1 W3). AC2 = `no-explicit-any`/`no-unsafe-*` lint + **grep gate for zero NEW boundary casts** + the typed-`valid("json")` proof. AC3 = Z8 note-or-neutral-compile per D-candidate, grep proves no silent suppression. AC4 = `verify` after leaves built. Drain (§6) correctly atomic-single, gate-forced via `staleExcepted`, no gate modification.

## Residual findings (all NIT, none blocking)

- **N1 [§1 table]** TS2554 folded into "~80 tail" reads as fuzzy; actual is 4, all enumerated downstream. Cosmetic — tighten if convenient, no work lost.
- **N2 [§4g]** `AppType` restore-or-delete is a genuine adjudication the builder must make (grep web AF5-quarantined, don't depend on its compile). Plan handles it correctly; flagging it as the one place a real decision (not mechanical fix) is required.
- **N3 [§9]** AF3 (fabric) leaves must be built before measuring, same as shared/db — §9 notes it; ensure §7 step 1 includes fabric in the `tsc -b` if any server import resolves through it (the regen command in §0 only builds shared+db; if fabric `.d.ts` is stale, a fabric-export cascade could reappear). Minor: extend the precondition build to `packages/shared packages/db packages/fabric` to be safe.

## Dimension rationale (deltas from round 1)

- **SA 5→9:** the spurious-accuracy foundation (the whole reason for the 5) is gone; §0 is now empirically correct and self-defending against re-chasing.
- **AC 6→9:** AC1 input-state pinned, AC2 grep gate + typed-valid proof, AC3 honest route/neutral split. W3 resolved.
- **S 4→9 / V 4→8:** versions corrected to installed (zod v3); every load-bearing fix re-verified against installed `.d.ts`. V held at 8 only because the §4a inferring-return is asserted-then-fallback rather than proven-compiles (the fallback is sound, so this is acceptable — the builder verifies at green).
- **FMC 6→9:** root-cause fixes confirmed real and sound; D-candidate adjudication verified against actual source + the protecting test.

No CRITICAL, no WARNING. APPROVE for Phase 4 build.
