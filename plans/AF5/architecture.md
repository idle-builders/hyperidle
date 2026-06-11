# AF5 — Type-green the web frontend: architecture plan

Drain `packages/web` to zero own-errors under the AF1 gate, then remove its entry from `typecheck-debt.json`. Tooling/type-level only — **no visual or behavioral change**. `/concept` skipped (no new primitive/noun; the density removal is a W2-completed concept already reflected in the type). `/design` skipped (no UI surface change). Value is the **categorization + ordering + the genuine-vs-strictness triage**, not prose.

## Concept check (one line)
AF5 introduces NO new noun and reshapes none. It fixes types against already-shipped concepts (`AppearanceSettings` post-W2 density removal, existing component prop contracts). No concept doc needed.

---

## 0. How web joins the gate (CONFIRMED — no gate change needed)

The spec flagged "how does web join the root gate given its non-composite, JSX config?" as the key structural question. **Answer: web is ALREADY in the gate; the only work is draining errors to zero + removing the debt entry.**

Evidence from `scripts/typecheck-gate.ts`:
- `discoverPackages()` (lines 77-88) globs every `packages/<pkg>/tsconfig.json` and runs each **regardless of `composite` status**. web has a `tsconfig.json` (`composite: false`, `jsx: "react-jsx"`, `include: ["src"]`), so it is already discovered and measured.
- `runPackage()` runs `npx tsc --noEmit -p packages/web/tsconfig.json` directly — no `tsc -b`, no project-reference graph required. JSX is handled by web's own tsconfig. The non-composite/JSX shape is a non-issue for `--noEmit -p`.
- web currently appears as `QUARANTINED (AF5)` because it is the single remaining entry in `typecheck-debt.json`.
- The AF1 **stale-ratchet** (`scripts/lib/typecheck-verdict.ts` `staleExcepted`) forces removal: once web has zero own-errors but is still listed, the gate FAILS. So draining and removing the debt entry are coupled — the removal is gate-enforced, not optional bookkeeping.

**Conclusion:** "wiring into the gate" = (1) drain to zero own-errors, (2) `del .packages["web"]` from `typecheck-debt.json`, in the same commit. The gate, the gate's verdict logic, and `typecheck-debt.schema.json` are **FROZEN — do not modify** (AF1 owns them).

### Measurement protocol (binding — @lore Z8-170)
Raw `tsc --noEmit -p packages/web/tsconfig.json` from a dist-free tree **overcounts** because web references `shared` + `design-system`; without their `.d.ts` you get a TS6305 reference-noise cascade (83 such lines measured here). The gate pre-builds **shared + db only** (separately, dependency order) then filters reference-noise codes TS6305/TS6307/TS6059. **design-system is NOT pre-built** by the gate — its TS6305 lines are filtered out, not resolved.

To measure web accurately, EITHER:
- run `npm run check` (does the leaf pre-build + filtering for you), OR
- pre-build leaves then filter manually:
  ```
  npx tsc -b packages/shared; npx tsc -b packages/db
  npx tsc --noEmit -p packages/web/tsconfig.json 2>&1 \
    | grep "packages/web/" | grep "error TS" \
    | grep -vE "error (TS6305|TS6307|TS6059)"
  ```

---

## 1. Scope — gate-accurate own-error count (measured 2026-06-11)

**211 own-errors** (reference-noise filtered). Spec said 203 — minor drift since the spec was written; the per-code breakdown matches the spec's within ±5 per code. This 211 is the live truth; builder re-measures, does not assume 211.

> Note: `typecheck-debt.json` records `errors: 235` for `web`. That recorded count is **cosmetic** — the AF1 gate reads only the package KEY (`web`), never the stored count. So no count needs reconciling: draining to zero own-errors and deleting the whole `web` entry (§5 step 9) removes it wholesale, count included.

### Distribution by error code (gate-accurate)

| Code | Count | Meaning |
|---|---|---|
| TS2741 | 41 | missing required prop (prop-contract gap) |
| TS2532 | 37 | object possibly undefined (index/optional access) |
| TS2322 | 30 | type not assignable |
| TS18048 | 21 | value possibly undefined |
| TS2345 | 20 | argument type mismatch |
| TS2339 | 16 | property does not exist |
| TS7006 | 11 | implicit-any parameter |
| TS2739 | 7 | missing required props (object literal) |
| TS2353 | 5 | unknown property in object literal |
| TS2503 | 4 | namespace not found |
| TS6133 | 3 | declared but unused |
| TS2769 | 3 | no matching overload |
| TS7017 | 2 | implicit-any index |
| TS2578 | 2 | unused `@ts-expect-error` |
| TS2352 | 2 | non-overlapping cast |
| TS18046 | 2 | value is `unknown` |
| TS2708/2559/2554/2367/18047 | 1 each | misc |

### Distribution by file class (THE load-bearing fact)

| Class | Errors | Implication |
|---|---|---|
| **Test files** (`*.test.*`, `__tests__/`, `test-setup.ts`) | 155 | call sites stale vs current component/hook contracts; test-strictness |
| **Stories** (`*.stories.tsx`) | 32 | story call sites missing newly-required props |
| **Pure src** (production code) | 24 | the only class that can hide behavior; triaged in §4 |

**This contradicts a naive "203 prop mismatches" reading.** 88% of errors are in test + story files — stale call sites against components/hooks that gained required props or tightened types. Only 24 are in production code, and (per §4) none are genuine behavioral bugs.

---

## 2. The Z8-084 density leftover (precise)

W2 stripped the density system (`.claude/rules/aesthetic-quality.md` AQ-002/003/016/017 all "Removed in W2"). `AppearanceSettings` now has exactly one field:

```ts
// packages/web/src/settings/settings-types.ts:83
export interface AppearanceSettings { theme: Theme; }
```

But `useSettings.ts` still ships `density`:
```ts
// packages/web/src/hooks/useSettings.ts:36 — buildDefaultAppearance()
density: "auto",   // TS2353: 'density' does not exist in type 'AppearanceSettings'
```

**Two error sites, both fixed by deleting the leftover (NOT by re-adding `density` to the type):**
1. `packages/web/src/hooks/useSettings.ts:36` — TS2353. Fix: **delete the `density: "auto"` line** from `buildDefaultAppearance()`. The function returns `SettingsData["appearance"]` = `{ theme }`; density is dead.
2. `packages/web/src/hooks/__tests__/useSettings.test.ts:129` — TS2339 (`Property 'density' does not exist on type 'AppearanceSettings'`). Fix: **delete the assertion that reads `appearance.density`** (it asserts a field that no longer exists; the assertion is itself the leftover).

Other density references found in src are in test files (`KnowledgeRow.factory.test.tsx`, `KeyValue.density.test.tsx`, `AppShell.test.tsx`, `W2-settings-appearance.test.tsx`, `AD5-settings-notifications.test.tsx`) and `Sidebar.tsx`. Of these, only the two above surface as type errors; the builder must check whether `KeyValue.density.test.tsx` and the `Sidebar.tsx` density reference still type-check — if they error, same fix (remove the dead density path), if they don't, leave them for a later cleanup workpackage (out of AF5 scope unless they error). **AC-3 requires fixing the density leftover, not suppressing it** — deletion, never `@ts-expect-error` or a re-added field.

⚠️ `KeyValue.density.test.tsx` filename suggests a whole test asserting a removed feature. If it errors, the type-safe fix is to delete the obsolete assertions (the feature is gone); do not resurrect density. This is the one place to double-check you are deleting dead test code, not masking a regression.

---

## 3. Error taxonomy → fix-category (with counts + approach)

| # | Category | Count | Files (where) | Fix approach |
|---|---|---|---|---|
| **A** | **Density leftover (Z8-084)** | 2 | `useSettings.ts:36`, `useSettings.test.ts:129` | Delete dead `density` (§2). Never re-add the field. |
| **B** | **Prop-contract gaps in TESTS** | ~120 | test files (TS2741 ~33, TS2739 ~6, TS2322 16, TS2339 12, TS2345 15, TS2769 3, ...) | Components/hooks gained required props or tightened a prop type; **update the test render call sites** to pass the now-required props with valid values. Fix the call site, NOT the component prop contract — the contract is the current truth. |
| **C** | **Prop-contract gaps in STORIES** | 32 | `*.stories.tsx` (TS2741 ~8, TS2322 14, TS2739, ...) | Same as B but in stories. Each story must render with current required props. Stories are call sites of the live contract. |
| **D** | **Src index-access / undefined-narrowing** | 7 | `useConversationsThreads.ts:101` (`s[0]`), `host-threads.ts:48` (`threads[0]`), `WorkBet.tsx:951` (`bet` null), `HostThreadSection.tsx:266` (`prevMsg`), `TaskSheet.tsx:214,219` (`last`/`first`) | **Guarded fixes in src** (AF2 policy). Early-return, default, or `if (!x) return`/`throw`. NO `!` in src except provably-safe with comment. |
| **E** | **Test-file index-access** | 52 | test files (TS2532/TS18048) | **`!` allowed** (AF2 policy). Prefer `const x = arr[0]; expect(x).toBeDefined()` where it reads cleanly; `arr[0]!.foo` acceptable. |
| **F** | **Implicit-any params** | 11 | src: `KnowledgeCreateDialog.tsx:174` (`md`), `KnowledgeCreate.tsx:185`, `BetCreateDialog.tsx:169`, `SetupFlow.tsx:244,258` (`e`), `SettingsNotifications.tsx:137` (`on`), `SettingsProfile.tsx:84,93` (`e`); + tests | Add explicit param types from the surrounding signature (event handler → `React.ChangeEvent<...>` / `React.FormEvent`, map callback → element type). NO `any`. |
| **G** | **Missing-prop on PlainPayload (guard-narrowing)** | 1 | `HostThreadSection.tsx:232` (`blockId` on `PlainPayload`) | Type-guard `isPlainPayloadWithBlockId` narrows to `PlainPayloadWithBlockId` (has optional `blockId`), but line 232 reads `.blockId` on the broader `PlainPayload`. Fix the guard's predicate type / narrow scope so the narrowed branch's type carries `blockId`. Type-level only — runtime guard logic unchanged. |
| **H** | **Block-id key-type mismatch** | 2 | `KnowledgeBody.tsx:119`, `WorkBet.tsx:251` | `KnowledgeBody.tsx:119` is a **map-key-type mismatch**: a `Map<string, …>`'s `string` keys are being compared/looked-up against a `Set<BlockId>` (branded). Fix by **aligning the key types** — make the map keyed by `BlockId` (or vice-versa) so both sides agree — NOT by rebranding per call site. The `blockId()` constructor takes structured `BlockIdInput`, NOT a raw id string, so it cannot be sprinkled at the call site. **`as BlockId` is FORBIDDEN**: the only `as BlockId` in the repo is a stub in `design-system/Block.stories.tsx` — that is the anti-pattern to avoid, not a model to copy. Resolve `WorkBet.tsx:251` the same way: align the declared key/value type, no casts. |
| **I** | **ScopeCreateOption undefined** | 3 | `KnowledgeCreateDialog.tsx:57,78`, `KnowledgeCreate.tsx:51` (`ScopeCreateOption \| undefined` → `ScopeCreateOption`) | `useState<ScopeCreateOption>` initialized from a possibly-empty `options[0]`. Guard: derive a non-undefined default or change state type to `ScopeCreateOption \| undefined` and handle the empty case in render. Type-safe, no behavior change (empty-options path was already implicitly broken). |
| **J** | **Unused declarations** | 3 | `Conversations.tsx:478` (`_onFilterChange`), `WorkBet.tsx:907` (`_handleSort`) + 1 | Remove the dead declaration. `_`-prefixed already signals intentional-unused but TS6133 still fires — delete it (it's genuinely unreferenced). |
| **K** | **Namespace not found** | 4 | TS2503 (likely JSX/test-env) | Investigate — likely a missing type import or test-only namespace. Add the import; if a test references a global namespace, ensure `test-setup.ts`/tsconfig provides it. NO ambient `any`. |
| **L** | **Provably-dead comparison (latent behavioral bug, out-of-scope to fix)** | 1 | `SettingsBackend.tsx:24` (TS2367 `"electron"` vs `"shared"` no overlap) | See §4. `platform` is typed `"electron"` (closed literal, `window.d.ts:24` — identifies the HOST, never `"shared"` at runtime), so `platform !== "shared"` is statically always-true → `isLocal` always `true` → "Shared (remote)" UI unreachable. **TYPE-ONLY fix:** simplify the provably-dead comparison so it type-checks WITHOUT changing runtime behavior (`isLocal` stays always-true). **FORBIDDEN:** widening `platform` to include `"shared"` (corrupts a sound HOST-identity contract to mask a real bug). **OUT OF SCOPE:** switching to `backendMode` (`window.d.ts:26`, the field that actually carries local-vs-shared) — that's a behavior change owned by AF13–AF16. Leave a `@lore` comment deferring the real behavioral fix (read `backendMode`) to AF13–AF16. |
| **M** | **Misc long tail** | ~24 | TS18046 (`unknown`), TS7017, TS2578 (unused `@ts-expect-error`), TS2352, TS2708/2559/2554 | Per-site. TS2578 = an `@ts-expect-error` that no longer suppresses anything → **delete it** (it's stale, and AC-4 wants sound contracts). TS2352 → fix the narrowing, no `as unknown`. |

Counts are approximate within categories because some files mix codes; **builder re-measures after each cluster and works to the live `npm run check` table, not these numbers.**

---

## 4. Genuine-behavioral-bug triage (REQUIRED — deliverable item 7)

Behavioral fixes are out of scope (those belong to AF13–AF16). I inspected every pure-src error that could mask a real bug. **Finding: none of the 24 src errors is a genuine behavioral bug. All are type-strictness or dead code.** Detail on the two suspicious-looking ones:

1. **`SettingsBackend.tsx:24` TS2367** — `const isLocal = !platform || platform !== "shared"`. `platform` is `"electron" | null` (from `window.__HYPERIDLE__?.platform ?? "electron"`). Per `window.d.ts:24`, `platform: "electron"` is a **closed literal that identifies the HOST and never emits `"shared"` at runtime**; the actual local-vs-shared mode lives in a separate field, `backendMode?: "local" | "shared" | null` (`window.d.ts:26`). So `platform !== "shared"` is statically always-`true` → `isLocal` is always `true` → the "Shared (remote)" branch is unreachable. This is a **latent BEHAVIORAL bug**: the component reads the WRONG property. **But AF5 does NOT fix the behavior** (out of scope — belongs to AF13–AF16, which wire mode display to `backendMode`). The AF5 fix is **TYPE-ONLY: simplify the provably-dead comparison so it type-checks while preserving the current always-local runtime behavior** (e.g. drop the dead `!== "shared"` term, keeping `isLocal` always-true). **FORBIDDEN: do NOT widen `platform` to include `"shared"`** — `platform` is a sound HOST-identity contract; widening it to mask a behavioral bug corrupts the contract. **Do NOT switch the read to `backendMode`** — that changes runtime behavior and is AF13–AF16's job. Leave a `@lore` comment at the fix site: the displayed mode is always "Local" because `platform` never carries the mode; the real fix (read `backendMode`) is deferred to AF13–AF16.

2. **`HostThreadSection.tsx:232` TS2339** (`blockId` on `PlainPayload`) — already protected by the `isPlainPayloadWithBlockId` type guard (line 231) added in T5 to replace an unsafe cast. The error is that the guard's narrowing doesn't reach line 232's `.blockId` access cleanly. Fix the **guard predicate's return type**, not the runtime filter logic. Type-level; the runtime filter behaves identically.

The index-access guards (category D — `s[0]`, `threads[0]`, `prevMsg`, `first`/`last`, `bet` null) are `noUncheckedIndexedAccess` strictness, not latent bugs: the surrounding logic already implies presence (e.g. `if (s.length === 0) return s` guards `s[0]`; `threads.length > 0` guards `threads[0]`). The guarded fix makes the implied invariant explicit. **Each src guard must preserve current output** — proven by the existing component/hook tests staying green (no assertion changes).

---

## 5. Ordered task list (builder executes — grouped by file/area to minimize churn)

Each numbered group is one logical unit. **Re-measure (`npm run check` or the manual protocol) after each group.** Do NOT remove web from `typecheck-debt.json` until own-errors hit zero (step 9).

1. **Density leftover (A).** `useSettings.ts:36` delete `density: "auto"`; `useSettings.test.ts:129` delete the `appearance.density` assertion. Check `KeyValue.density.test.tsx` / `Sidebar.tsx` — if they error on density, delete the dead path; if clean, leave. (§2)
2. **Src guards + narrowing (D, G, H, I, L).** Group by file: `useConversationsThreads.ts`, `services/host-threads.ts`, `shell/TaskSheet.tsx`, `shell/HostThreadSection.tsx` (D + G), `pages/WorkBet.tsx` (D + H + J), `pages/knowledge/*` + `pages/KnowledgeCreate.tsx` (H + I + F), `settings/SettingsBackend.tsx` (L). Read each file's surrounding logic; apply guarded fix preserving behavior. Run the affected component/hook unit tests after each file.
3. **Src implicit-any params (F).** `SetupFlow.tsx`, `SettingsNotifications.tsx`, `SettingsProfile.tsx`, the `md`-callback files — add explicit param types. Group with step 2 per file where they coincide.
4. **Src unused + stale suppressions (J, M-subset).** Remove `_onFilterChange`, `_handleSort`, any TS2578 stale `@ts-expect-error`.
5. **Confirm src is zero.** Re-measure; filter to pure-src (`grep -vE "test|spec|__tests__|stories"`). Must be empty before touching tests/stories (keeps the genuine surface clean and reviewable).
6. **Stories (C).** Per `.stories.tsx` file — update each render to pass current required props. `ArtifactSection.stories.tsx` (8), `WorkTeam/WorkRoutine/WorkPortfolio.stories.tsx`, `SettingsWorker/SettingsModels.stories.tsx`, `CocOverlay.stories.tsx`. The component prop contract is the truth; stories conform.
7. **Test prop-contract gaps (B).** Per test file, biggest first: `ArtifactSection.test.tsx` (14), `HostThreadSection.filter/prefill.test.tsx` (12), `Sidebar.settings.test.tsx` (6), `WorkBet.pitch.test.tsx` (10), etc. Update render call sites to current contracts. **Do not change assertions** beyond the density one in step 1.
8. **Test index-access (E).** Per test file — `!` or `expect(x).toBeDefined()` narrowing. AF2 policy permits `!` in tests. `test-setup.ts` (3), the hooks/services tests, etc.
9. **Drain.** Confirm `npx tsc --noEmit -p packages/web/tsconfig.json` (leaves pre-built) filtered → empty. Then `jq 'del(.packages["web"])' typecheck-debt.json > tmp && mv tmp typecheck-debt.json`. Run `npm run check` — web shows **PASS** (not QUARANTINED, not STALE, not FAIL); `typecheck-debt.json` `.packages` is now `{}`.
10. **Full validation.** `npm run lint` (no new `any`/`@ts-ignore`), `npm run test` + `npm run test:integration` (no runtime regression from src guards), then `npm run verify` end-to-end.

Commit grouping: steps 1-4 (src) one commit; step 6 (stories) one; steps 7-8 (tests) one or split by area; step 9 (drain) folded into the final commit that hits zero. Keep the gate green-or-quarantined at each commit (web stays quarantined until step 9 — that's fine, it can't FAIL while listed).

---

## 6. Test-strictness policy (CITATION — binding, do not re-litigate)

`plans/AF2/architecture.md` §1, restated verbatim in its §6: **"fix call sites; never relax `noUncheckedIndexedAccess`. `!` allowed in test files, guarded fixes in src."** Sub-rules:
- **Test files** (`*.test.ts(x)`, `*.spec.ts`, `__tests__/`, `test-setup.ts`): non-null `!` on indexed access ALLOWED; prefer `const x = arr[0]; expect(x).toBeDefined()` where clean.
- **Source files**: `!` is NOT the default — real guard (early return, `if (!x) throw`, default value). `!` only where an invariant makes it provably safe **with a comment stating why**.
- **Never** `any`, `@ts-ignore`, `@ts-expect-error`, or `as unknown as T` to silence anything. **No `any` casts to silence prop mismatches** (AF5 spec, non-negotiable) — fix the prop call sites.
- **No exported signature / component prop contract loosened** to silence a stale test/story. The contract is the current truth; the call site is what's stale.

---

## 7. Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| 203 own-errors | 211 gate-accurate (drift); `typecheck-debt.json` stores `errors: 235` | Builder works to live count; §1 documents all three. The stored `235` is cosmetic — gate reads only the `web` KEY; deleting the whole entry removes it. |
| "web is the LAST quarantined package" | TRUE — `typecheck-debt.json` `.packages` = `{ web }` only | Drain leaves `{}`. |
| "how does web join the gate given non-composite/JSX config?" | web ALREADY discovered + measured by gate (composite-agnostic, runs `-p`) | §0 confirms; no gate change. |
| Z8-084 density in `useSettings.ts` | CONFIRMED at line 36 + test:129 | §2 — delete, don't suppress. |
| Error mix mostly prop mismatches | 88% are test(155)+story(32) call sites; 24 src | §1, §3 — fix call sites, not contracts. |
| Genuine behavioral bugs may lurk | NONE found in 24 src errors | §4 — two suspicious ones triaged as type-only. |
| gate pre-builds leaves so web measures real errors | CONFIRMED (@lore Z8-170: shared+db, separately) | §0 measurement protocol. |

No spec/codebase contradictions block the plan.

---

## 8. Acceptance criteria → verification

| AC | Verification method |
|---|---|
| **1.** web compiles zero type errors, checked by root `npm run check` gate | `npm run check` → summary table shows `web ... 0 ... PASS` (not QUARANTINED/STALE/FAIL). Exit 0. |
| **2.** web removed from `typecheck-debt.json` | `jq '.packages \| keys' typecheck-debt.json` → `[]`. The AF1 stale-ratchet would FAIL the gate if web were left listed at zero errors, so a PASS in AC-1 already proves the removal happened. |
| **3.** density leftover (Z8-084) + property-existence errors FIXED not suppressed | `git diff packages/web/src/hooks/useSettings.ts` shows the `density` line **deleted** (no re-added field, no `@ts-expect-error`); `grep -rn "@ts-expect-error\|@ts-ignore\|: any\|as any\|as unknown as" packages/web/src` over the diff shows **no new** suppressions/casts; `npm run lint` (no-explicit-any) green. |
| **4.** prop contracts sound — no TS2741/TS2739 remaining | `npx tsc --noEmit -p packages/web/tsconfig.json 2>&1 \| grep -E "error (TS2741\|TS2739)"` (leaves pre-built) → empty. Covered by AC-1's zero. |
| **5.** `npm run verify` passes | run it; green end-to-end (check + lint + knip + test:all + build + attestation). |
| **(regression) adding a type error to web fails the gate** | inject `const x: string = 123` into a web src file, `npm run check` → FAIL naming web (proves web is now non-excepted and gate-checked). Revert. |
| **(no runtime regression)** | `npm run test` + `npm run test:integration` green; **no protected-test assertion changed** (see §11). |

---

## 9. Type signatures / contracts the implementation must match

No new types introduced. The implementation must conform to (not change) these existing contracts:
- `AppearanceSettings = { theme: Theme }` — density is gone; `buildDefaultAppearance` returns `{ theme }`.
- `PlainPayloadWithBlockId` (from `@hyperidle/shared`) — `text: string` + optional `blockId`; the `HostThreadSection` guard predicate must narrow to this type so `.blockId` is reachable.
- `BlockId` — branded string from `@hyperidle/shared`; its constructor `blockId()` takes structured `BlockIdInput`, not a raw id string. The cat-H errors are **key-type misalignments** (a `Map<string>` vs a `Set<BlockId>`), fixed by making the collection key types agree — never by `as BlockId` (the lone repo occurrence, in `design-system/Block.stories.tsx`, is a forbidden stub, not a pattern).
- Component prop interfaces in `packages/design-system` and `packages/web/src/components` — **the truth**; tests/stories conform to them. AF5 does not edit a single component prop type to satisfy a call site (that would be loosening the contract).

---

## 10. Risks / ambiguities

- **`SettingsBackend.tsx:24` (L)** — there is NO choice: the fix is type-only simplification of the provably-dead `!== "shared"` comparison, preserving the current always-local behavior. ⚠️ Builder must NOT widen `platform` (forbidden) and must NOT switch to `backendMode` (behavior change, AF13–AF16). The "Shared (remote)" branch is already unreachable at runtime today; the type-only fix does not change that. Leave the `@lore` comment deferring the behavioral fix to AF13–AF16.
- **`KeyValue.density.test.tsx` (A)** — filename implies a whole test suite for a removed feature. If it type-errors, deleting obsolete assertions is correct (feature gone); but confirm it's truly dead, not masking a `KeyValue` regression. The one place to be careful you're deleting dead test code, not hiding a real failure.
- **Prop-contract fixes (B/C)** — when a test/story is missing a required prop, the builder must pass a *valid* value, not a placeholder that changes what the test asserts. For tests, the added prop must not alter the assertion's meaning. If a required prop genuinely has no sensible test value, that signals a possibly-wrong component contract — flag it, do not loosen the prop to silence.
- **Stale `@ts-expect-error` (TS2578)** — deleting these is safe ONLY if the underlying error is also fixed; if an `@ts-expect-error` becomes unused *because* a sibling fix resolved the error, delete it. Don't delete one that's still suppressing a real error you haven't fixed.
- **Re-measure discipline** — counts here are a snapshot; fixing shared/design-system upstream (already drained by AF2/earlier) is stable, but fixing one web file can cascade (a guard fix changing an inferred type used elsewhere). Work to the live `npm run check` table.

---

## 11. Protected tests
`protectedTests`:
- All existing `packages/web/src/**/*.test.tsx` and `*.test.ts` assertions — index-access policy edits may add `!`/`toBeDefined()` narrowing and prop-contract fixes may add required props, but **MUST NOT change what is asserted** about behavior.
- **Exception (the only permitted assertion change):** `packages/web/src/hooks/__tests__/useSettings.test.ts:129` — the `appearance.density` assertion is deleted (it asserts a W2-removed field). And `KeyValue.density.test.tsx` if it asserts removed density behavior.
DoD audit: `git diff` the test files; every change must be a prop-addition, an index-access guard/`!`, or the two documented density deletions — nothing else.

## 12. Security & abuse cases
- **N/A** — tooling/type-level workpackage. No new routes, inputs, credentials, outbound URLs, or path inputs. No POST/PATCH added. The `ssrf`/credential surfaces are not touched (those live in shared/server, drained by AF2/AF4).
- `SettingsBackend.tsx` (L) touches a platform-mode display string only; no auth/credential logic. Type-only fix.

## 13. Route checklist
- **N/A** — no routes added or modified.

## 14. Migrations
- The only "migration" is the `typecheck-debt.json` entry deletion (§5 step 9), which empties `.packages`. No symbol renames/moves/removals beyond deleting dead `density` code (which has no external call sites — `AppearanceSettings` already dropped the field, so nothing imports a density field from web).

## 15. Shared files
`sharedFiles`:
- `typecheck-debt.json` — AF5 removes the final entry. AF2/AF3/AF4 already drained theirs; AF5 runs last. No concurrency conflict expected (AF5 depends on the others having shipped).
No other infrastructure file (schema.ts, router.tsx, app.ts, seed files) is touched.

## Required reading (builder)
- `scripts/typecheck-gate.ts` + `scripts/lib/typecheck-verdict.ts` — gate mechanics, **read-only, FROZEN**. Note @lore Z8-170 (leaf pre-build) for measurement.
- `plans/AF2/architecture.md` §1 + §6 — the binding test-strictness policy.
- `typecheck-debt.json` + `typecheck-debt.schema.json` — drain target / shape (don't edit the schema).
- `.claude/rules/typescript.md` — strict-mode contract (no `any`/`@ts-ignore`/unsafe `as`).
- `.claude/rules/aesthetic-quality.md` AQ-002/003/016/017 — proof density was removed in W2 (Z8-084 context).
- `packages/web/src/hooks/useSettings.ts`, `packages/web/src/settings/settings-types.ts` — density leftover.
- `packages/web/src/shell/HostThreadSection.tsx` (T5 guard), the `Window.__HYPERIDLE__` ambient declaration, `@hyperidle/shared` `BlockId` brand constructor — the three src fixes needing care.
