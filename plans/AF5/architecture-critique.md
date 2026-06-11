# Architecture Critique: AF5

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:9 AC:9 DM:7 N:8 MD:8 FMC:8 S:8 V:9

Verdict: **APPROVED (8/10 ≥ 7)** — ship the plan to `/write-tests`/`/write-code`, with the CRITICAL on SettingsBackend triage applied as a hard constraint and two WARNINGs folded in. No re-architecture needed.

The plan is unusually well-grounded: I independently re-ran the measurement protocol and **every load-bearing number reproduces exactly** — 211 own-errors filtered, 155 test / 32 story / 24 src split, 48 TS2741+TS2739, and the full 24-line src error inventory matches §3/§4 file:line-for-line. The taxonomy is from real `tsc` output, not guessed. The gate-mechanics claim (web already discovered, composite-agnostic, stale-ratchet forces removal) is confirmed against `scripts/typecheck-gate.ts` and `scripts/lib/typecheck-verdict.ts`.

---

### CRITICAL

- **[§4 item 1, §3 cat L, §10] The `SettingsBackend.tsx:24` TS2367 triage is wrong, and the plan's preferred fix (widen the `platform` type) would corrupt a sound ambient contract to mask a genuine behavioral bug.** Ground truth:
  - `packages/web/src/window.d.ts:24` declares `platform: "electron"` (closed literal — it identifies the *host*, always "electron" when the bridge exists).
  - The same bridge declares a *separate* field `backendMode?: "local" | "shared" | null` (line 26) — **that** is the field carrying the local-vs-shared distinction. `SettingsWorker.stories.tsx:35` confirms `backendMode` is the live signal.
  - `SettingsBackend.tsx:24` does `platform !== "shared"` — it reads the **wrong property**. Because `platform` can only ever be `"electron"`, `isLocal` is statically always `true`, so the "Shared (remote)" label + hint (lines 25, 28) is **dead/unreachable UI**. This is a latent behavioral bug (a settings screen that can never show shared mode), not "just a too-narrow type."
  - **Therefore the plan's option A — "widen the `__HYPERIDLE__.platform` type to include `"shared"`" — is forbidden.** The runtime bridge never emits `platform: "shared"`; widening the ambient type to silence the comparison would (a) falsify a correct contract and (b) bury the real bug. That is precisely the "type-cast to mask a behavioral bug" the workpackage prohibits.
  - **Required fix for AF5 (type-only, no behavior change):** the `"shared"` comparison against `platform` is dead code given the contract. The type-safe, behavior-preserving fix is to **simplify the dead comparison** — `platform !== "shared"` is provably always true, so the conditional collapses to the local path that already runs at runtime today. Do NOT widen `platform`. Do NOT switch to reading `backendMode` — that would *change behavior* (make the shared branch live), which is AF13–AF16 territory, not AF5.
  - **Leave a `@lore` breadcrumb** at the simplification site: "SettingsBackend reads `platform` but local/shared mode actually lives in `backendMode`; the shared-mode UI is currently unreachable — fixing that is a behavioral change deferred to AF13–AF16." This stops AF5 from silently erasing evidence of the real bug.
  - **Plan edit:** rewrite §4 item 1 and §3 cat L to state "fix = simplify the dead comparison + leave a @lore; widening `platform` is forbidden (would mask a real bug)," and drop the widen-the-type option entirely.

### WARNING

- **[§3 cat H, §9] The BlockId brand-constructor instruction is satisfiable but mis-described, and one of the two sites is not a simple re-brand.** A constructor *does* exist: `blockId(args: BlockIdInput): BlockId` (`packages/shared/src/blocks/block-id.ts`), so "use the existing brand constructor, never raw `as BlockId`" is enforceable — good. BUT: (a) `blockId()` takes structured `BlockIdInput`, not a raw id string, so it is the wrong tool for *re-branding an existing id string* — the builder must verify the call signature before assuming it applies. (b) `KnowledgeBody.tsx:119`'s TS2345 is a **key-type mismatch**: `messagesByBlockId` is keyed by plain `string` while `renderedIds` is `Set<BlockId>`; the right fix is aligning the map's key type (or branding at the map-construction boundary), not casting at line 119. The only raw `as BlockId` precedent in the repo is a *stub* in `design-system/Block.stories.tsx` — explicitly call this out as the anti-pattern, not the model. **Plan edit:** in cat H, (1) name the actual constructor `blockId()` and its `BlockIdInput` signature, (2) note the `KnowledgeBody:119` fix is map-key-type alignment not a per-call brand, (3) flag the `Block.stories.tsx` `as BlockId` as the forbidden pattern.

- **[§1, §7, AC-2 verification] `typecheck-debt.json` currently records `errors: 235` and `note: "props mismatches, test-setup, shared refs"` — the plan reconciles 203-vs-211 but never mentions the live file says 235.** I confirmed the gate reads only `Object.keys(.packages)` (the `errors` count is decorative, not consumed by verdict logic), so this does not affect gate behavior — but the plan's §5 step 9 deletes the whole `web` key, which is correct and moots the stale 235. **Plan edit:** add one line to §7/§5 step 9 noting the debt entry's `errors:235`/`note` fields are cosmetic and removed wholesale via `del(.packages.web)`; no need to reconcile the number.

### SUGGESTION

- **[§3 cat K] All 4 TS2503 "namespace not found" are specifically `Cannot find namespace 'JSX'`** (`U6-router.test.tsx:59`, `CocOverlay.stories.tsx:25/40/55`). The fix is the React-19 pattern `import type { JSX } from "react"` (exactly as `SettingsBackend.tsx:14` already does), not a tsconfig/ambient change. Name this explicitly in cat K so the builder doesn't reach for `lib`/global-namespace edits. (`CocOverlay` still carries the purged "Coc" noun, but that's out of AF5's type-only scope — do not touch naming here.)

- **[§5 step 9, §3 cat M] The two stale TS2578 `@ts-expect-error` are both in test files** (`M3-host-threads.null-agent.test.ts:94`, `task-threads-shim.test.ts:84`). §10's caveat ("delete only if a sibling fix resolved the underlying error, never one still suppressing a real error") is the right guard — make sure the builder deletes these *after* the index-access/prop fixes in the same files land, not before, so a real suppression isn't accidentally unwrapped into a hidden error.

- **[§8 verification, AC-1] The regression test (inject `const x: string = 123`, expect gate FAIL naming web) is a manual step, not an automated assertion.** AC-1/AC-3's validation scenario "a new prop mismatch added → gate fails" is genuinely a static-property check (gate behavior), so a scripted check is acceptable per the codebase's own rule — but the plan should state it runs the gate as a subprocess and asserts exit≠0, rather than describing it as a hand-run-and-revert. Minor; does not block.

### What's Working Well

- **Measurement is real, not narrated.** The plan ran the gate's leaf-pre-build + reference-noise-filter protocol and the numbers reproduce to the line — 211/155/32/24, the full 24-error src inventory, the 48 TS2741+TS2739. This is the opposite of CC-007 spec-drift: the plan corrected the spec (203→211, debt-file 235) against live `tsc`. Dimension 1 and 9 are near-perfect.
- **The strictness policy is cited verbatim and load-bearing, not re-litigated.** §6 quotes AF2's binding rule, partitions `!`-allowed (tests) vs guarded-fix (src), and the protected-tests block (§11) names the single permitted assertion deletion (the W2 density assertion) and forbids all other behavioral assertion drift — exactly the CC-008 discipline. The contract-vs-call-site framing ("the contract is the current truth; the call site is what's stale; never loosen a prop to silence") is correct and is the right default for 88% of the errors.
- **Gate is correctly treated as frozen.** §0 proves no gate-logic change is needed and explicitly fences `typecheck-gate.ts`/`typecheck-verdict.ts`/`typecheck-debt.schema.json` as read-only — the only data edit is the debt-key deletion, which the stale-ratchet *forces*, making removal gate-enforced rather than optional bookkeeping.

---

### Re-critique verdict (round 2 — commit 8552b10e)

**ARCHITECTURE-SCORE: 9/10** (was 8/10). **APPROVED.** All three findings resolved in the plan text, verified line-by-line against the revision diff — not merely claimed.

- **CRITICAL (SettingsBackend.tsx:24) — RESOLVED.** The forbidden "widen `platform`" option is deleted from every site (§3 cat L, §4 item 1, §9, §10). All four now mandate TYPE-ONLY simplification of the provably-dead `!== "shared"` comparison while preserving the current always-local runtime behavior; widening `platform` is explicitly FORBIDDEN; switching to `backendMode` is explicitly OUT OF SCOPE (deferred to AF13–AF16); the deferred `@lore` breadcrumb is required at the fix site. Matches the required fix exactly.
- **WARNING 1 (cat H) — RESOLVED.** Re-described as a map-key-type mismatch (`Map<string>` vs `Set<BlockId>`); fix is key-type alignment, not per-call rebranding. The `blockId()` constructor is named with its `BlockIdInput` signature (wrong tool for re-branding a raw id string). `as BlockId` flagged FORBIDDEN with the `design-system/Block.stories.tsx` stub cited as the anti-pattern. §9 updated to match.
- **WARNING 2 (debt count 235) — RESOLVED.** New §1 note + §7 row state the stored `errors: 235`/`note` fields are cosmetic (gate reads only the package KEY) and removed wholesale via `del(.packages.web)`; no number reconciliation needed.

The three SUGGESTIONs (JSX import pattern for cat K, ordering of TS2578 deletions, scripting the regression check) remain optional and do not block — builder should fold them in opportunistically during Phase 4.

**Verdict: APPROVED (9/10 ≥ 7). Proceed to /write-tests / /write-code.**
