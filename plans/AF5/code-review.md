# AF5 Code Review — Type-green the web frontend

**Verdict: DONE** — all 5 acceptance criteria PASS, zero CRITICAL, zero WARNING. Type-level only, no behavioral/visual change. The implementation matches the 9/10 plan's hard constraints line-for-line.

Reviewed: diff `origin/main...HEAD` (104 files, +693/-393). Re-ran the gate, the regression injection, and full `npm run verify` myself — not relying on builder claims.

---

## AC table

| AC | Verification | Result |
|---|---|---|
| **1.** web compiles 0 errors, checked by root gate (not quarantined) | `npm run check` → `web 0 PASS`; `typecheck-gate: PASS — all 11 packages`. No QUARANTINE/STALE/FAIL. | **PASS** |
| **2.** web removed from `typecheck-debt.json` | Diff shows `.packages` went `{ web: {...} }` → `{}`. Whole entry deleted, stale `errors:235`/`note` removed wholesale. | **PASS** |
| **3.** Z8-084 density + property-existence FIXED not suppressed | `useSettings.ts:36` `density:"auto"` line **deleted** (not re-added, no `@ts-expect-error`); `useSettings.test.ts:129` `appearance.density` assertion **deleted** (the §11 permitted exception). Zero new src suppressions/casts (grep clean). Remaining `density` strings are unrelated (CSS row-height comment in `Sidebar.tsx`, a stale `@lore` in `useSettings.ts:13`). | **PASS** |
| **4.** Prop contracts sound — no TS2741/TS2739 | Gate's 0-error PASS covers it; injection proves the gate is live. | **PASS** |
| **5.** `npm run verify` passes | Ran it: `Test Files 204 passed | 1 skipped`, `Tests 2583 passed | 5 skipped`; check + lint + knip + build + attestation green; attestation written `status=passed`. | **PASS** |
| **(regression)** inject prop/type error → gate FAILs naming web | Injected `const x: string = 123` into `useSettings.ts`: gate → `web 2 FAIL`, `"web" has 2 type error(s) and is not on the exception list`. Reverted clean. Proves web is genuinely gated, not excepted. | **PASS** |
| **(no behavior change)** baseline green | verify suite all green; no protected-test assertion changed beyond the documented density deletion. Mock fields use valid runtime shapes (see below). | **PASS** |

---

## Hard-scrutiny items (builder self-reported — each verified legitimate)

- **No src casts/suppressions.** Grep of the src-only diff (excluding test/stories/test-setup) for `as X` / `any` / `@ts-expect-error` / `@ts-ignore` → **empty**. Every cast the builder reported lives in TEST files. Confirmed.
- **`PlainPayload & { blockId?: string }` intersection** — TYPE-only on the `isPlainPayloadWithBlockId` guard predicate in `HostThreadSection.tsx:75`. Runtime predicate unchanged (still the same `typeof === "object"` shape check); the intersection makes the narrowed branch carry `blockId` so line 269 reads it without error. `@lore AF5/G` explains why. Plan §3 cat G / §4 item 2 mandated exactly this. The literal cast occurrences are in test files only.
- **`window as ...` casts** — all in test files (`test-setup.ts`, hook tests), ambient-global test fixtures setting `__HYPERIDLE__`. `@lore AF5/S` documents why the intersection-cast is needed. Legitimate test-infra, not a src contract gap.
- **Fetch/Response mock casts (`as unknown as typeof fetch` / `as unknown as Response`)** — all in test files, standard vitest mock shaping. Acceptable per AF2 test-strictness policy.
- **Two `@ts-expect-error` removed** (`M3-host-threads.null-agent.test.ts:94`, `task-threads-shim.test.ts:84`) — both were stale TS2578. Each test asserts an export is **absent** via `(module as Record<string, unknown>).X` — the cast handles the access, so the `@ts-expect-error` suppressed nothing. Removal is correct (the SUGGESTION in the critique to delete-after-sibling-fix is satisfied: the cast was already present). Not masking a real error.
- **`SettingsBackend.tsx:24`** — fix is `const isLocal = true;` (dead `!== "shared"` comparison collapsed). `platform` type **NOT widened**. `backendMode` **NOT switched to**. `@lore AF5/L` left at the site deferring the behavioral fix to AF13–AF16. Matches plan §4 item 1 / critique CRITICAL resolution exactly.
- **AF2 strictness — `!` in src** — grep of src-only diff for new `!.` / `![` / `)!` / `]!` → **empty**. Src uses real guards: `useConversationsThreads.ts` (`first !== undefined` ternary), `host-threads.ts` (`if (first !== undefined) return`), `HostThreadSection.tsx` (`?? null`), `TaskSheet.tsx` (`if (first===undefined||last===undefined) return`), `WorkBet.tsx` (`if (!bet) return`), `KnowledgeCreate`/`KnowledgeCreateDialog` (`?? {default}`). `!` appears only in test files. Confirmed.
- **BlockId (cat H)** — `KnowledgeBody.tsx:115` and `WorkBet.tsx:247` fixed by widening the local Set to `Set<string>` so plain-string map keys compare without brand mismatch. **No `as BlockId`** introduced (the forbidden `design-system/Block.stories.tsx` stub pattern). Comment explains the brand. Behavior identical (membership test on the same id strings).
- **Mock field values match runtime shapes** — `atRisk: false` matches `BetDetail.atRisk: boolean` (required, U5; `bet.ts:28`) — valid default. `identities: {}` matches the host-thread response's identity-map (empty = no identities) — valid, not an arbitrary stub that could mask a regression.
- **Gate frozen** — `git diff` of `scripts/typecheck-gate.ts`, `scripts/lib/typecheck-verdict.ts`, `typecheck-debt.schema.json` → **no changes**. Only data edit is the debt-key deletion. Confirmed.

---

## Six lenses

**Architecture** — No layer violations; no API/route/data-model change (type-only). `_handleSort`/`_onFilterChange` removed from `WorkBet.tsx`/`Conversations.tsx` are genuinely-dead `_`-prefixed declarations (TS6133); removing the sort setters leaves `sortColumn`/`sortDirection` as static initial values feeding `sortTasks` at WorkBet.tsx:727 — but the handler was never wired to any control, so sort was already inert. No behavior change. Clean.

**Design** — SKIPPED. No UI/visual change (one component touched, `SettingsBackend.tsx`, type-only; the rendered label/hint strings are byte-identical to before because runtime was already always-local). No token/component-budget/a11y surface touched.

**Security** — N/A per plan §12. No routes, inputs, credentials, outbound URLs, or path inputs added. `SettingsBackend` touches a display string only. No new dangerous patterns (`dangerouslySetInnerHTML`/`eval`/`exec`) introduced.

**Adversarial** — Saboteur: no weakened tests. The only test deletion is the `getDropdownItem` dead helper in `WorkBet.L14-actions.test.tsx` (was `biome-ignore noUnusedVariables: kept for future use`, never called) — actual assertions untouched. The density assertion deletion is the documented §11 exception. New Hire: guards are self-documenting with one-line comments stating the invariant. Auditor: builder's claims (no src casts, gate frozen, type-only) all verified true against the diff. No N+1 / unbounded-list / perf concerns (no runtime logic added).

**Simplification** — `KnowledgeCreate.tsx` and `KnowledgeCreateDialog.tsx` both carry a `?? { label:"Shared", id:"shared", scopeKind:"factory" }` fallback for `SCOPE_CREATE_OPTIONS[0]` (a const 3-item array — index 0 provably defined). The fallback is unreachable but is the idiomatic `noUncheckedIndexedAccess` satisfier and is comment-justified as unreachable. Acceptable. `KnowledgeCreateDialog` hoists it to a module const `INITIAL_SCOPE_OPTION` (avoids per-render binding in `useEffect` deps) — reasonable. No over-abstraction, no dead code left.

**AI Slop** — Guard comments are load-bearing (they state the `noUncheckedIndexedAccess` invariant), not restating code. `@lore` comments are appropriate (cross-cutting type constraints future agents need). No filler, no "TODO/for now/in production" tells.

---

## Findings

### CRITICAL
None.

### WARNING
None.

### NOTE (non-blocking, optional cleanup — do NOT gate the PR on these)
- **N1 — `SettingsBackend.tsx:25–28` dead ternary branches.** With `isLocal = true` now a constant, the `: "Shared (remote)"` / `: "Connected to a shared backend server."` branches are statically unreachable. This is intentional per the plan (preserve always-local behavior, defer the real fix to AF13–AF16) and is documented by `@lore AF5/L`. Leaving the ternary keeps the future-fix shape visible. No action required; flagging for completeness.
- **N2 — `useSettings.ts:13` stale `@lore` comment** still reads "appearance (density/theme)". Density was removed in W2; the comment names a field that no longer exists. Trivial doc-staleness in a code comment (not a user-facing doc). Optional one-word tidy; not in AF5's error set so out of strict scope.

---

## Doc funnel
No user-facing doc changes. Justification ("type-level only, no behavior change") is correct — no API shape, state machine, UI layout, lifecycle, or data model visible to users changed. The only behavior-adjacent code (`SettingsBackend`) renders byte-identical output to before. No stale `docs/` section. Confirmed: no user docs needed.

---

**Final verdict: DONE.** Ship via `/ship`. Commit the pending attestation (`88b0...json`) and the old-attestation deletion on a clean tree per the verify-commit-order rule.

---

## Post-ship integrity addendum — gate leaf-build change (commit 495042d1 / 495042d1)

**Commit reviewed:** `495042d1` "fix(AF5): build design-system declarations before web typecheck" — landed AFTER the DONE verdict, so initially unreviewed. Touches ONLY `scripts/typecheck-gate.ts` (18+/5-): adds `design-system` to the `buildLeafDeclarations` list `["shared","db"]` → `["shared","db","design-system"]`, plus @lore comments. Z8-166 integrity-risk class (a gate change could let a red tree ship green). Verified rigorously.

**VERDICT: LEGITIMATE — adds measurement accuracy, cannot hide errors, no verdict-logic change. AF5 NOT blocked.**

1. **Consistent with Z8-170 rationale.** `web/tsconfig.json` references BOTH `../shared` AND `../design-system`. design-system is a genuine composite leaf (references shared, emits `.d.ts` to gitignored `dist/`). It qualifies for the same pre-build as shared/db: without a fresh `.d.ts`, the reference-consumer (web) resolves cross-package imports to `any`. Ordering is correct — design-system depends on shared, so it is built AFTER shared.

2. **The 5 errors are phantom `any`-cascade, NOT masked real bugs — proven by reproduction.** Cleaned all leaf `dist/`+`.tsbuildinfo` (fresh `npm ci` simulation), built `shared`+`db` only, removed `design-system/dist`, measured web own-errors: **exactly 5**, at the exact lines the lore cites — `ThreadShell.test.tsx(304,312,320)` TS7006 and `tag-kinds.test.ts(30,37)` TS18046. Restoring `design-system/dist` → **0** own-errors. Mechanism: `computeSenderGrouping(...)` resolves to `any[]` so `.map((g)=>...)` infers `g:any`; `Object.values(TAG_KIND_ICONS)` resolves to `unknown[]` so `m`/`meta` are `unknown`. With real `.d.ts` the return types (`SenderGroupedMessage[]`, `Record<TagKind,TagKindMeta>`) type the callbacks correctly. Test source needs NO change — identical Z8-170 class.

3. **Cannot suppress a genuine own-package error — proven by injection.** With design-system pre-built, injected a deliberate `const __probe: number = "..."` into `packages/web/src/services/host-route.ts`. Gate output: `web ... 2 errors FAIL`, TS2322 surfaced, gate exit 1. A leaf pre-build only upgrades cross-package imports from `any` to real types; it can NEVER hide an own-package error. Confirmed directionally safe.

4. **No side-effects / no src pollution.** Separate ordered builds (not combined `tsc -b shared db design-system`), each emits to gitignored `dist/` only. `git status` shows no stray emitted files in any `src/` dir (the lone `css-modules.d.ts` is a pre-existing tracked file, not an emit). `npm run lint` exits **0** (320 warnings = pre-existing baseline, no errors). All three dist dirs confirmed gitignored.

5. **No verdict/exception/ratchet logic touched.** `git diff origin/main..HEAD -- scripts/lib/typecheck-verdict.ts` is EMPTY — `computeVerdict`, debt-schema reader, crash-guard, stale-ratchet, REFERENCE_NOISE_CODES all byte-identical to main. Only the leaf-build array + comments changed. The web debt-quarantine removal (commit 186efc14) is the legitimate AF5 drain, not a logic weakening.

**Full gate re-run:** all 11 packages PASS, web = 0 errors, no quarantine. The change makes the gate measure REAL web errors deterministically on CI's dist-free tree — it strengthens, not weakens, the gate.
