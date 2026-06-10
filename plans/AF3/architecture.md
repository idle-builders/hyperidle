# AF3 — Architecture: Type-green the fabric package

**Type:** type-debt drain (no new primitive, no UI). Triage + fix strategy.
**Goal:** `@hyperidle/fabric` compiles with **zero own-package errors** under `scripts/typecheck-gate.ts`, and the `fabric` entry is **removed** from `typecheck-debt.json`.

---

## 0. Binding policy (inherited from AF2 — non-negotiable)

From `plans/AF2/architecture.md` §6, restated and binding on AF3:

- **No `any`, no `@ts-ignore`/`@ts-expect-error`, no `as unknown as T`** convenience fixes. Tighten, don't erase.
- **No exported signature loosened** to `any`/`unknown` to silence a caller.
- **Test-strictness policy:** in **test files**, `noUncheckedIndexedAccess` errors (TS2532/TS18048) are resolved with non-null assertion `!` or narrowing at the call site — never by relaxing the compiler flag, never by widening the asserted value. In **src files**, the same errors get a **guarded fix** (presence check / early return / `??` default) that preserves behavior. Test assertions themselves must not change.
- **No runtime behavior change** except guarded fixes for genuine possibly-undefined dereferences. Any fix that *would* change runtime behavior is deferred to the owning functional workpackage (AF6–AF9) and recorded against its `Z8-NNN` register entry — never silently altered here.
- **Frozen:** do not touch `scripts/typecheck-gate.ts`, `scripts/lib/typecheck-verdict.ts`. AF1 owns the gate.

---

## 1. Gate mechanics — how "removed from quarantine" works and is verified

The gate (`scripts/typecheck-gate.ts`) runs `tsc --noEmit -p packages/fabric/tsconfig.json` fresh per package, strips reference-noise codes (`TS6305/TS6307/TS6059`), and applies `computeVerdict`. Two rules matter:

- **Non-excepted failure:** a package not in `typecheck-debt.json.packages` with ≥1 own error → **FAIL**.
- **STALE-ratchet:** a package *in* the debt list with **0** own errors → **STALE → FAIL**. (Verified: `scripts/lib/typecheck-verdict.ts` STALE rule.)

Consequence: **leaving `fabric` in the debt file with zero errors fails the gate.** Removal is mandatory, not cosmetic. The final edit deletes the `fabric` key from `typecheck-debt.json.packages`, leaving only `server` (AF4) and `web` (AF5).

**TS6305 is reference-noise, not a measurement hazard.** The live `tsc -p packages/fabric/tsconfig.json` may emit `TS6305`; the gate **strips** it (`TS6305/TS6307/TS6059`), so it is never an own-error. **There is no stale-`dist` problem:** `@hyperidle/shared` exports `./src/index.ts` directly (`packages/shared/package.json` `exports["."] = "./src/index.ts"`, `main: null`, `types: null`) — `packages/shared/dist` does not exist even after a green `npm run build`. Fabric **always** type-checks against fresh shared/db **source**. The error codes do not change before/after a build. A build is harmless hygiene for a clean `tsc -b`, **not** load-bearing for measurement, and does not reshape any error (in particular it does **not** turn the dispatcher's TS7006 into TS2339 — see C9). The own-error count is **173**, which reconciles exactly to the cluster sum in §2.

**AC verification:**

| AC | Verification method |
|---|---|
| fabric compiles zero errors under the real gate | `npm run check` → fabric row shows `PASS` (not QUARANTINED/STALE/FAIL) in the summary table |
| fabric removed from quarantine | `jq '.packages \| keys' typecheck-debt.json` → `["server","web"]` (no `fabric`) |
| no signature loosened to any/unknown, no `@ts-ignore` | `git diff` of changed files contains no new `any`/`@ts-ignore`/`as unknown`; `npm run lint` (no-explicit-any) green |
| genuine bugs fixed-in-place or routed to Z8, no silent suppression | this plan §2 routing table; each deferral cites a Z8 entry + owning WP; `npm run test` + `test:integration` green proves fixed-in-place ones changed no behavior |
| adding a new type error fails the gate | regression already guaranteed by un-excepting: inject `const x: string = 123` into any fabric src → `npm run check` → FAIL naming fabric |
| `npm run verify` passes | run it end-to-end; green |

---

## 2. Triage — every error cluster categorized

**173** own-package errors (gate-filtered) — the count is stable before/after `npm run build` (no stale-`dist`, §1) and reconciles exactly to the clusters below. Two categories: **(S) pure strictness** — fix in place / test, behavior-preserving; **(B) genuine bug** the checker exposed — decide fix-in-place vs defer-to-Z8. **C9b is a cross-cutting root-cause cluster** (7 TS7006 implicit-any handlers) pulled out of C9/C13 so all 7 get one fix pattern, not three — its members were already inside the 173, so breaking it out does not change the total.

| # | Cluster (file · count · TS code) | Cat | Root cause | Decision |
|---|---|---|---|---|
| C1 | **Test fixtures** `attention-classifier` (13), `attention-scoring` (25), `attention-scoring.l22` (10), `relevance-scoring.integration` (21), parts of others — TS2353 ×48 + TS2339 ×23 | S (test) | `makeItem(overrides: Partial<KnowledgeItem>)` reads `layer/kind/attentionScore/confidence/meta` — columns **removed** from `knowledgeItems.$inferSelect` (moved to `knowledgeStrategyFabric` per `@lore O2`). The fields live on `KnowledgeItemWithFabric` now. | **Fix in tests.** Retype the fixture's `overrides`/return to `KnowledgeItemWithFabric` (from `knowledge-repository.js`), which carries the optional fabric columns. No runtime change — fixtures only. Assertions unchanged. |
| C2 | **Index-access in test files** `file-watcher.integration` (32), `writeback.integration` (15), `debounce` (8), `transaction-semantics.integration` (3) — TS2532/TS18048 | S (test) | `noUncheckedIndexedAccess`: `arr[i]`, `manifest.items[id]`, `result[0]` possibly-undefined. | **Fix in tests** per AF2 policy: non-null `!` or narrowing at call site. Never relax the flag, never change the asserted value. |
| C3 | **`writeback.ts:214,232`** — TS2532 ×2 | S (src) | `manifest.items[existing.itemId]` possibly-undefined when assigning `.version`. | **Guarded fix in src.** `existing.itemId` was just resolved from this manifest, so the entry exists — narrow with a local `const entry = manifest.items[existing.itemId]; if (entry) entry.version = …` (or non-null with a `@lore` note). Behavior-preserving. |
| C4 | **`services/notifications/config.ts:385-388`** — TS18048 ×5 (`a`,`b` possibly undefined) | S (src) | `const [a, b] = nums` after `parts.length !== 4` guard; TS doesn't narrow destructured tuple from the length check. | **Guarded fix in src.** Index directly with proven bounds or assert post-guard. `isPrivateIPv4` is SSRF-adjacent — the fix adds presence narrowing only; the blocklist semantics (which IPs are private) must be byte-for-byte identical. Verify against `ssrf`/notification-config unit tests. |
| C5 | **`config.ts:402`** — TS2345 (`string \| undefined` → `string`, `embedded[1]`) | S (src) | regex `.match()[1]` is `string \| undefined` under strict. | **Guarded fix in src.** `if (embedded)` already truthy-checks the match; narrow `embedded[1]` with a presence check before passing to `isPrivateIPv4`. Behavior-preserving (a non-matching regex never enters the branch). |
| C6 | **`services/silence-policy.ts:93-94`** — TS18048 ×4 (`startH/startM/endH/endM`) | S (src) | destructured cron/time parts possibly-undefined. | **Guarded fix in src.** Same shape as C4 — narrow after the parse/length guard. No behavior change. |
| C7 | **`services/routine-scheduler.ts:78,79,118-122`** — TS2345 ×7 (`string \| undefined` → `string`) | **B (src)** | `parseCron` / `parseField` pass `parts[i]` (now `string \| undefined` under `noUncheckedIndexedAccess`) into helpers typed `(field: string, …)`. Sites: `parseField(parts[0..4], …)` and `part.split("-")` → `[startStr, endStr]`. | **Fix in place — behavior-preserving.** The length guards (`parts.length !== 5` at L113, range-split) already prove presence at runtime; the checker only lost the narrowing. Tighten by validating/narrowing each part before use (e.g. guard `startStr`/`endStr`, or assert after the `.length` check). This is the spec's "genuine signature bug" but the **runtime is already correct** — a malformed cron throws today and will still throw. **No Z8 deferral.** Add a `@lore` noting the length-guard→narrowing relationship. |
| C8 | **`services/routine-scheduler.ts:228`** — TS2769 (no overload, `db.insert(sessions).values({…})`) | S (src) | The `NewSession` payload (`{ id, taskId, agentId, modelTier:"workhorse", startedAt, state:"active", cost:0 }`) supplies **all required `NewSession` fields** (`= typeof sessions.$inferInsert`, `db/schema.ts:916`). The TS2769 is **literal-narrowing**, NOT a missing runtime value — no column the scheduler should populate is omitted. | **Strictness-align in src — no defer.** Resolved now (not handed to the builder): align the literal to satisfy the overload (e.g. annotate the payload as `NewSession`, or widen the offending literal field). Behavior-preserving — every supplied field is real, no runtime value invented. **Contingency only:** if inspection ever surfaces a genuinely-missing required column the scheduler must populate, that would be behavior-changing → AF7 under Z8-003/Z8-006 — but the verified payload makes this unreachable. |
| C9 | **`services/assistant-dispatcher.ts:95`** (handler param) **+ :133,:145** (`event.hostId`) — **TS7006** implicit-any | **B (src)** | **Root cause is the handler typing, not `event.hostId`.** The dispatcher registers an **`async` handler** (returns `Promise<void>`) with `EventBus.on<T>("thread_message_appended", handler)` (`event-bus.ts:49`). The async handler fails the generic `on<T>` overload whose `EventHandler<T>` (`events.ts:328`) is `(event: EventByType<T>) => void`; resolution falls through to the non-generic signature, so **`event` lands as implicit-any (TS7006 at :95)**. Because `event` is `any`, `event.hostId` at :133/:145 is **swallowed** — it stays implicit-any and **never** surfaces as TS2339 (and no build changes this — there is no stale `dist`). Separately, `ThreadMessageAppendedEvent` (`events.ts:187-195`) has **no `hostId`** field anyway (`streamId, threadId, messageId, messageType, senderId, timestamp`). | **Two-step fix in place — behavior-preserving.** (1) **Correct the handler typing** so it matches `EventHandler<T>` and `event` infers as `ThreadMessageAppendedEvent` (resolve the `async`-vs-`void`-overload mismatch — see the **TS7006 handler-typing sub-cluster** note below; same root cause across lifecycle-propagation ×3, promotion-pipeline ×3, dispatcher ×1). (2) Once `event` is typed, the two `event.hostId` refs become genuine TS2339 and are swapped to **`threadRow.hostId`** — the dispatcher already loads `threadRow` (verified present at **:121**) and builds `threadLike.hostId = threadRow.hostId` before both log sites. `hostId` is **log-only** at :133/:145 (no control flow reads it), so the swap changes no behavior. **No Z8 deferral for the type fix.** The *broader* Z8-007 defect (assistant dispatch never wired / notification events have no listeners) is **out of scope** and owned by **AF7** (Z8-004/Z8-048) / **AF9-notifications** (Z8-007) — leave the deferred-provisioning skeleton intact. |
| C10 | **`materialization.ts:71`** — TS2339 `Property 'path' does not exist on Dirent` | **B (src)** | `path.join(entry.parentPath ?? entry.path, entry.name)` reads `entry.path`. On Node 26 (`@types/node` current), `Dirent` exposes **`parentPath`**, not `path` (`path` was deprecated then removed from the type). Verified live: `'path' in dirent === false`, `'parentPath' in dirent === true`. | **Fix in place — behavior-preserving.** Drop the `?? entry.path` fallback; use `entry.parentPath` directly. The `?? entry.path` branch was **never reachable** on modern Node (`parentPath` is always defined for `recursive` reads), so removing it changes no runtime behavior. The spec flags this as "a genuine bug the checker exposed" — it is; the dead fallback referenced a nonexistent property. **No Z8 deferral.** |
| C9b | **TS7006 handler-typing sub-cluster** — `assistant-dispatcher.ts:95` (×1), `lifecycle-propagation.ts:669,676,686` (×3), `promotion-pipeline.integration.test.ts` (×3) — **TS7006 ×7** implicit-any on event-bus handler params | **B (src) + S (test)** | **Single shared root cause** with C9: each registers an **`async` handler** with `EventBus.on<T>(...)`; the async (`Promise<void>`) return fails the generic `on<T>` overload (`EventHandler<T> = (event: EventByType<T>) => void`, `events.ts:328`; `on` at `event-bus.ts:49`), resolution falls to the non-generic signature, and the `event` param becomes **implicit-any**. | **One fix pattern, applied to all 7 sites.** Make each handler match `EventHandler<T>` so `event` infers from the event name — e.g. give the handler the correct typed signature so the `on<T>` overload binds (do **not** annotate `event: any`; the whole point is to let `EventByType<T>` flow in). Src sites (dispatcher, lifecycle-propagation) get the typed handler; test site (promotion-pipeline) same pattern, no assertion change. Behavior-preserving — typing the param changes no runtime path. **The dispatcher's :133/:145 `event.hostId` swap (C9) is downstream of this fix.** `@lore`: async handlers must satisfy `EventHandler<T>` or `event` silently degrades to `any`. |
| C11 | **`materialization.ts:148`, `token-budget.ts:56,63`** — TS2345 (`KnowledgeItemWithFabric` arg → narrower base-shape param) | S (src) | The **argument** is a `KnowledgeItemWithFabric` value; the **parameter** is inferred/declared as the narrower base shape (`{ id; createdAt; status; … }`), so the wider arg is rejected. The fix direction is **widen the parameter**, not change the caller — a builder reading "fix the caller" would look at the wrong end. | **Fix in src — widen the consuming function signature, behavior-preserving.** Declare the **parameter** type of `rankAndBudget`/`estimateTokens` as `KnowledgeItemWithFabric` (it already is at `relevance-scoring.ts:192` for `rankAndBudget`; the remaining narrow params — `estimateTokens` at token-budget:56/63 — get widened to `KnowledgeItemWithFabric`). Optional fabric columns ⇒ pure widening, no `as`, no `any`. No runtime change — the values already carry the fabric fields at runtime; only the signature was too narrow. |
| C12 | **`session-context.ts:88`** — TS2322 `string \| null` → `string` | S (src) | `task.description` is `string \| null`; assigned to `SessionContextData.task.description` which is… `string \| null` already (line 24). The error is at the **`bet.description`** path or a field where the target is non-nullable. | **Fix in src.** Inspect line 88's exact target: if the interface field is legitimately nullable, the assignment is fine once narrowed; if a `?? ""`/`?? null` default is the right semantic (matching the existing `routine.description ?? null` pattern in the same file), apply it. The file already uses `?? null` defaults idiomatically — follow that. Behavior-preserving (null stays null or becomes documented default). |
| C13 | **Singletons** — TS2538/TS2741/TS2578/TS2430/TS2365/TS2352 in relevance-service, notifications/dispatcher, git-export-config, prompt-composition, knowledge-repository, events, scattered test files | S (mixed) | Assorted strictness: index-key type, missing prop in literal, unused `@ts-expect-error`, interface-extends conflict. **(The TS7006 implicit-any handlers formerly grouped here — lifecycle-propagation ×3 + promotion-pipeline ×3 + dispatcher ×1 — are now consolidated into C9b; do not fix them here.)** | **Fix at each site** per category: src → guarded/narrowed; test → `!`/narrowing. **TS2578 (unused `@ts-expect-error`)** means a previously-suppressed error is now genuinely gone — **delete the directive** (do not leave dead suppressions). Each inspected individually; none expected to be behavior-changing. Builder flags any that are and routes to the owning WP. |

### Z8 routing summary (deferrals)

**No type fix in AF3 is deferred — including C8.** Every error above is either pure strictness or a behavior-preserving bug fix (C7, C9/C9b, C10 are genuine bugs but their correct fix preserves runtime behavior — handler typing + log-source swap, dead-fallback removal, length-guard narrowing). **C8 is resolved up front to strictness-align, no defer** (verified: the `routine-scheduler.ts:228` payload supplies all required `NewSession` fields; the TS2769 is literal-narrowing, not a missing runtime value). The AF7/Z8-003 path remains only as an unreachable contingency, not an open fork the builder must adjudicate.

The **broader behavioral defects** co-located with these files (assistant dispatch unwired = Z8-007/Z8-004/Z8-048 → AF7/AF9; routine scheduler never invoked = Z8-003/Z8-006 → AF7; notification listeners = Z8-007 → AF9) are **explicitly out of AF3 scope**. AF3 makes the types honest; AF6–AF9 wire the behavior. Type-fixing must not pull any of that work forward.

---

## 3. Test-strategy — what the "red phase" is for a type-level AC

**Key reframe (per CLAUDE.md / testing.md):** AF3's acceptance criteria describe a **static codebase property** ("fabric type-checks clean, off the exception list"), not runtime behavior. Per the rules, **static properties are enforced by the gate/type system, not by tests.** There is therefore **no genuinely-new runtime test to write** for the core AC.

- **The "requirement-defining" artifact is the gate itself.** Removing `fabric` from `typecheck-debt.json` *is* the failing-then-passing assertion: before the fixes, un-excepting fabric makes `npm run check` FAIL (173 errors); after the fixes it PASSES. The validation scenario "adding a new type error makes `npm run check` fail" is **automatically guaranteed** by un-excepting — no new test needed (and would be a forbidden `readFileSync`/`execSync` pseudo-test if written).
- **The existing test suite IS the red phase.** Most errors (≈120 of 173) live in `src/__tests__/*`. These are **existing tests that must themselves become type-clean** — the work is making the suite compile under strict, not authoring new tests. Their assertions are frozen (AF2 policy); only types/`!`/narrowing change.
- **Regression proof that fixed-in-place src bugs (C3–C8, C10–C13) changed no behavior:** the existing `npm run test` + `npm run test:integration` suites for fabric (file-watcher, writeback, relevance-scoring, transaction-semantics, attention-scoring) are the proof. They must stay green after the src edits. **No new tests; green existing tests = no regression — for these clusters.**
- **C9 is the exception — proven by inspection, not coverage.** The `assistant-dispatcher` is an **unwired deferred-provisioning skeleton (Z8-007)** with likely **no test exercising its log path**, so a green suite proves nothing about C9 specifically. C9's safety rests on **inspection**: `hostId` is read **only** in two `logger` calls (:133/:145), no control flow depends on it, and `threadRow.hostId` is the same value the dispatcher already computed (:121). State this explicitly so `/review` does not expect a test to guard the C9 swap. (C9b's handler-typing changes are likewise type-only — no runtime path moves.)
- **Builder note:** `/write-tests` should report "no new runtime tests — AC is a static/gate property; red phase = un-exception + existing suite compiles" and proceed to `/write-code`. Do **not** invent runtime tests for a type-level AC.

---

## 4. Ordered, committable tasks

Each task is one commit, scoped so the gate/test state is checkable after it.

1. **Build deps (hygiene) + baseline.** Optionally `npm run build` (or `tsc -b packages/shared packages/db`) for a clean `tsc -b`; **this does not change the error codes** — fabric type-checks against shared/db **source** regardless (no stale `dist`, §1). Run `tsc -p packages/fabric/tsconfig.json`, strip the gate's reference-noise (`TS6305/6307/6059`), and baseline the **173**-error list against §2's clusters. Do **not** expect the dispatcher TS7006 to become TS2339 — it stays TS7006 (C9/C9b). *(no commit — measurement)*
2. **Test fixtures retype (C1).** Point `makeItem` and siblings at `KnowledgeItemWithFabric`; fabric attention/relevance test files compile for the fixture-shape cluster. Commit: `fix(AF3): retype knowledge test fixtures to KnowledgeItemWithFabric [skip ci]`.
3. **Test index-access (C2).** `!`/narrowing in file-watcher, writeback, debounce, transaction-semantics integration tests. Commit: `fix(AF3): narrow index access in fabric tests [skip ci]`.
4. **src guarded fixes (C3–C6, C12).** writeback, notifications/config (SSRF-preserving), silence-policy, session-context. Commit: `fix(AF3): guard possibly-undefined dereferences in fabric services [skip ci]`.
5. **src genuine bugs (C7, C9, C9b, C10).** routine-scheduler cron narrowing; **C9b handler typing** (type the 7 async event-bus handlers so `event` matches `EventHandler<T>` — dispatcher, lifecycle-propagation ×3, promotion-pipeline ×3); **then** assistant-dispatcher `event.hostId`→`threadRow.hostId` (TS2339 only surfaces after the handler is typed); materialization `entry.path`→`entry.parentPath`. Add `@lore` notes (handler-typing gotcha; cron length-guard→narrowing; dead-fallback). Commit: `fix(AF3): type event-bus handlers, fix Dirent.path / hostId log source / cron narrowing [skip ci]`.
6. **src type alignment + C8 + singletons (C11, C8, C13).** **Widen** `rankAndBudget`/`estimateTokens` **parameters** to `KnowledgeItemWithFabric` (C11 — the param is too narrow, not the caller); routine-scheduler:228 insert overload (strictness-align, no defer — C8); delete dead `@ts-expect-error`; remaining singletons. Commit: `fix(AF3): widen fabric ranking params to KnowledgeItemWithFabric and clear remaining strictness [skip ci]`.
7. **Un-quarantine.** Delete the `fabric` key from `typecheck-debt.json.packages`. `npm run check` → fabric `PASS`. Commit: `chore(AF3): remove fabric from typecheck quarantine [skip ci]`.
8. **Verify.** `npm run verify` green end-to-end (check + lint + knip + test:all + build + attestation). The attestation commit is separate and last per the verify-commit-order rule. Commit: `chore(AF3): verify attestation`.

Order rationale: tests before src so the suite is type-clean independent of src edits; genuine-bug commit isolated so review can scrutinize the three behavior-adjacent fixes; un-exception last so the gate flips green in one observable step.

---

## 5. Required reading (builder)

- `plans/AF2/architecture.md` §1, §6 — binding test-strictness + no-loosening policy.
- `scripts/typecheck-gate.ts`, `scripts/lib/typecheck-verdict.ts` — gate verdict rules (read-only; STALE + non-excepted-fail).
- `typecheck-debt.json` — drain target (`fabric` key).
- `packages/shared/src/events.ts:187-195` — `ThreadMessageAppendedEvent` (no `hostId`; C9).
- `packages/shared/src/event-bus.ts:49` (`on<T>` overload) + `packages/shared/src/events.ts:328` (`EventHandler<T>`) — the async-handler-vs-overload mismatch that produces the TS7006 ×7 sub-cluster (C9/C9b).
- `packages/fabric/src/knowledge-repository.ts:81-88` — `KnowledgeItemWithFabric` shape (C1, C11).
- `packages/db/src/schema.ts:942` — `KnowledgeItem` inferred type (columns moved per `@lore O2`).
- `plans/Z8/master-flag-register.md` — Z8-003/006 (routine scheduler), Z8-004/007/048 (dispatch/notification) — out-of-scope behavioral owners.
- `.claude/rules/typescript.md`, `.claude/rules/testing.md` — strict-mode + what-is-a-test contracts.

## 6. sharedFiles

- `typecheck-debt.json` — also drained by AF4/AF5. AF3 removes only the `fabric` key; AF3–AF5 must not run concurrently on this file (they don't — sequential after AF2). Merge order: AF3 before/after AF4/AF5 is fine since each deletes a distinct key, but rebase if a sibling lands first.

## 7. Security & abuse

- `notifications/config.ts` `isPrivateIPv4`/`isPrivateIPv6` (C4/C5) is the SSRF blocklist. The guard fixes add **presence narrowing only** — they must not change which addresses are classified private. A guard that widens what passes the blocklist is a security regression. Verify against existing SSRF/notification-config unit tests; the fix narrows already-validated values, never relaxes a check. Applicable + addressed.
- No new routes, inputs, credentials, or runtime paths. Otherwise N/A — tooling/type workpackage.

## 8. Risks / ambiguities

- **C9/C9b handler typing is the real C9 work, not the `event.hostId` swap.** The blocker is the **async-handler-vs-`EventHandler<T>` overload** (TS7006 ×7); the `event.hostId`→`threadRow.hostId` swap is trivial and only surfaces (as TS2339) **after** the handler is typed. There is **no stale-`dist`** — do not expect a build to reshape codes (§1). Fix all 7 handlers with one pattern (C9b) so the builder doesn't fix them three different ways.
- **C12 session-context:88** — `string | null → string` (TS2322). Follow the file's existing `?? null` idiom; pin the target field's nullability by a 1-line lookup, don't invent a non-null default that changes downstream context content.
- **Count is stable at 173** — no stale-`dist` inflation exists; the figure reconciles exactly to §2's clusters before/after any build. No re-measurement hedge needed.

## 9. Migrations

- N/A. No symbol renames/moves. The `typecheck-debt.json` `fabric`-key deletion is the only "migration"; procedure in §4 Task 7.
