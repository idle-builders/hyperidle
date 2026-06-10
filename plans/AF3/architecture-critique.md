# Architecture Critique: AF3

ARCHITECTURE-SCORE: 7/10  rounds=1  score-line: SA:9 LI:8 AC:7 DM:7 N:8 MD:7 FMC:7 S:8 V:7

Critique performed cold against real source (post-`npm run build`). Live error count re-measured: **173** (matches the plan's cluster sum exactly). Every behavior-preserving claim (C7/C9/C10) verified at source. The plan is fundamentally sound, the triage is accurate, and the behavior-preservation judgments are correct — but its **core measurement model is wrong** in a way that misdescribes C9 and invalidates Task 1's premise. That is a CRITICAL the builder must not inherit blindly, but it does not change any *fix decision*, so the plan ships with the correction applied.

---

### CRITICAL

- **[§1 "TS6305 caveat" + §4 Task 1 + §8 risk-1] The stale-`dist` model is false. `@hyperidle/shared` has no `dist` — it exports `./src/index.ts` directly.**
  Verified: `packages/shared/package.json` → `exports["."] = "./src/index.ts"`, `main: null`, `types: null`. `packages/shared/dist/index.d.ts` **does not exist** after a green `npm run build`. Fabric type-checks against shared **source**, always fresh. The plan's central claim — "tsc resolving `@hyperidle/shared` against a **stale `dist`** is why 9 errors surface as TS7006/TS18046… the builder MUST `npm run build` before measuring, otherwise `event.hostId` hides behind a generic implicit-any" — is **mechanically incorrect**. I ran `npm run build` (green) then re-measured: the TS7006 at `assistant-dispatcher.ts:95` **persists**, and `event.hostId` **never becomes TS2339**.
  → **Fix:** Strike the TS6305/stale-dist theory from §1, the "build-first or mismeasure" rationale from Task 1, and risk-1 in §8. Replace Task 1 with: "Build deps for a clean `tsc -b` (TS6305 reference-noise is gate-stripped regardless); baseline the 173-error list." The build step is still harmless hygiene — but it is **not** load-bearing and must not be sold as the thing that reshapes the error codes.

- **[§2 C9 + §1] The dispatcher error is TS7006 (implicit-any on the handler parameter), not TS2339 on `event.hostId`. The plan's diagnosis and fix-description are wrong, even though the end-state code is right.**
  Verified: `EventBus.on<T>("thread_message_appended", handler)` (event-bus.ts:49) *should* infer `event: ThreadMessageAppendedEvent` via `EventHandler<T> = (event: EventByType<T>) => void`. But the dispatcher registers an **`async` handler returning `Promise<void>`**, overload resolution falls through to the non-generic third signature (`handler: EventHandler<EventType> | WildcardHandler`), and `event` lands as **implicit-any (TS7006 at 95,68)**. Consequently `event.hostId` does **not** error as TS2339 — it's swallowed by the implicit-any. The plan asserts "becomes TS2339 once shared/dist is fresh" — false on both counts (no dist; stays TS7006).
  → **Fix:** Rewrite C9's root-cause to: "the `async` handler fails the `on<T>` overload, so `event` is implicit-any (TS7006); the real fix is to make the handler match `EventHandler<T>` so `event` types as `ThreadMessageAppendedEvent`, **then** the two `event.hostId` log refs become genuine TS2339 and are swapped to `threadRow.hostId`." The swap target (`threadRow.hostId`, verified present at dispatcher:121, log-only at :133/:145, no control-flow dependency) is **correct and behavior-preserving** — keep it. But the builder must first resolve the handler-typing (same root cause as the 3 TS7006s in `lifecycle-propagation.ts:669/676/686` and `promotion-pipeline.integration.test.ts`), which the plan does **not** call out as a cluster at all. This is a real, unaccounted sub-cluster of **7 TS7006** errors hiding inside C9/C13.

---

### WARNING

- **[§2 C8 — conditional deferral is genuinely undefined and resolvable now]** "Builder decides on inspection; default = strictness-align" leaves a load-bearing AC decision (behavior-preserving vs. Z8-deferred) open. I inspected it: `routine-scheduler.ts:228` `db.insert(sessions).values({ id, taskId, agentId, modelTier:"workhorse", startedAt, state:"active", cost:0 })` against `NewSession = typeof sessions.$inferInsert` (db/schema.ts:916). The TS2769 is overload-narrowing, not a missing required column the scheduler omits — every field supplied is real and the payload is functionally complete. This is **strictness-align, no deferral** — and it can be **resolved in the plan now** rather than handed off.
  → **Fix:** Change C8's decision to "strictness-align, no deferral (verified: payload supplies all required `NewSession` fields; TS2769 is literal-narrowing, not a missing runtime value)." Keep the AF7/Z8-003 fallback only as a one-line contingency, not the default fork.

- **[§2 C11 — fix direction is inverted in the prose]** Plan says "align the **caller's** type to `KnowledgeItemWithFabric` (a **widening** on the type)." The actual errors (materialization:148, token-budget:56/63) are the **reverse**: a `KnowledgeItemWithFabric` **argument** is rejected by a **narrower base-shape parameter** (the inferred `{ id; createdAt; status; … }` shape). The fix is to **widen the consuming function's parameter** (`rankAndBudget`/`estimateTokens` should declare `KnowledgeItemWithFabric`), not the caller. The plan lands on the right type name but describes the wrong end to change — a builder following the prose literally will look at the call site, not the signature.
  → **Fix:** Reword C11: "the **parameter** type is the narrow base shape; widen the function signature to `KnowledgeItemWithFabric` (optional columns ⇒ pure widening, no `as`)."

- **[§2 C9 / §3 — "no new tests" leaves the behavior-preserving swaps unproven for the one case with no existing coverage]** §3 rests the no-regression proof on the existing fabric suite staying green. That is sound for C3–C8, C10–C12. But C9's dispatcher is explicitly a **deferred-provisioning skeleton** (Z8-007, dispatch never wired) — there may be **no test exercising the log path** that the `event.hostId → threadRow.hostId` swap touches, so "green suite" proves nothing about C9 specifically. The swap is still log-only and safe by inspection, but the plan's blanket "green existing tests = no regression" over-claims for C9.
  → **Fix:** Add to §3: "C9 is log-only and uncovered by runtime tests; its safety is established by inspection (no control-flow reads `hostId`), not by the suite. State this explicitly so review doesn't expect a test to guard it."

---

### SUGGESTION

- **[§2 C12]** session-context:88 verified as `string | null → string` (TS2322). Plan's "follow the file's `?? null` idiom" is right, but the target field's nullability should be stated, not inspected-later — it's a 1-line lookup. Pin it in the plan.
- **[§8 risk "173 includes ~9 stale-dist artifacts; true count may differ"]** Now falsified — post-build count is exactly 173, no stale-dist inflation exists. Delete this hedge; it implies a measurement uncertainty that isn't real.
- **[§2 C13]** The 7 TS7006 implicit-any handlers (lifecycle-propagation ×3, promotion-pipeline ×3, dispatcher ×1) share **one root cause** (async handler vs `EventHandler<T>` overload). Call them out as a single named sub-cluster with one fix pattern, rather than scattering them across C9/C13 — otherwise the builder fixes them three different ways.

---

### What's Working Well

- **Triage accuracy is excellent.** All 13 clusters sum to the live 173 with no orphan errors; cluster file-attributions match `tsc` output site-for-site (C1 fixtures: attention-scoring 25, relevance-scoring 20, attention-classifier 13, l22 10 — exact). This is the rare type-debt plan where the accounting actually reconciles.
- **The behavior-preservation discipline is correct where it counts.** C7 (cron length-guards prove presence; malformed cron still throws — verified at routine-scheduler:77-105/113), C10 (`?? entry.path` is dead on modern Node; `parentPath` always defined for recursive reads — verified at materialization:71), and the C9 *swap target* are all genuinely behavior-preserving. The "no Z8 deferral for these" call is right. The plan correctly refuses to smuggle runtime changes through the type gate — the AC's whole point.
- **AF2 policy inheritance is faithful**, not asserted: AF2 §1 decided "FIX every call site, never relax `noUncheckedIndexedAccess`" — AF3 §0 restates it verbatim and applies it consistently to C2/C3/C6/C13. No `any`/`unknown`/`@ts-ignore` is smuggled into any cluster (C1 fixture-retype to `KnowledgeItemWithFabric` is a real type, not a widen).
- **Gate mechanics are correct:** the STALE-ratchet observation (leaving `fabric` in debt.json with 0 errors → FAIL) is verified against `typecheck-verdict.ts` and makes removal mandatory, not cosmetic.

---

## Verdict

**APPROVED — score 7/10, no blocking CRITICAL on any *fix decision*.**

Every fix the plan prescribes is correct or correct-after-trivial-rewording. The two CRITICALs are **measurement/diagnosis errors, not strategy errors**: the stale-dist theory is false and C9 is TS7006-not-TS2339, but the *resulting code* (swap to `threadRow.hostId`, narrow cron parts, drop dead fallback) is exactly right and behavior-preserving. The builder must apply the C9/Task-1 correction (the real blocker is the async-handler overload typing, a 7-error sub-cluster the plan under-specifies) and resolve C8 to "strictness-align, no defer" up front. With those folded in, the plan is buildable as written. No `/architecture` restart needed.

I do **not** exit — I carry this context (verified source state, the handler-typing sub-cluster, the C11 direction inversion) into Phase 4 `/review` of the code.
