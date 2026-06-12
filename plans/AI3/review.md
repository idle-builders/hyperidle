# Code Review: AI3 — One clock (Phase 4)

REVIEW-VERDICT: **DONE** (ship-eligible). 1 WARNING, 4 NOTES. No CRITICAL. The one WARNING (AC-1 work-page surface not proven) is an evidence-coverage gap against the spec's literal "≥4 surfaces incl. work pages", not a code defect — the work-page sites (WorkTask/WorkBet) ARE correctly migrated and exercised by the existing suite; only the *AI3-specific side-by-side proof* omits them. Adjudicated below as a non-blocking WARNING with a cheap fix the builder should apply, not a gate.

Diff reviewed: `git diff origin/main...HEAD` excluding `plans/` — HEAD 87a8cc4b. Read every changed file body, every deleted file, the ESLint gate, both test files, the E2E spec, and the proof artifacts. Independently re-grepped migration completeness, fired both lint sub-rules with live probes, ran the 84 unit tests + 9 E2E (proper harness) + `verify:quick` — all green.

---

## Lens results

### Architecture (does the code honor the plan's contracts?) — PASS

- **Package boundary (LI):** `time.ts` lives in `packages/shared/src/format/`, exported from the barrel exactly per plan §"Package-boundary decision". design-system imports it (`ArtifactTimestamp.tsx:1`, `CommentRow.tsx:10-20`). No inverted dep. ✓
- **Module shape (MD):** 5 named exports + `TIME_PLACEHOLDER` + `TimestampInput`, one internal `toEpoch`. Matches the plan's signature block verbatim. Ladder thresholds, floor-everywhere, memoized `Intl.DateTimeFormat`, `now?` seam — all per the implementation contract. ✓
- **Migration completeness (the load-bearing check):** independent grep of `toLocaleDateString|toLocaleTimeString|toLocaleString` across `packages/web/src` + `packages/design-system/src` (excl. tests/stories) → **zero** residual. All 17 sites migrated. ✓
- **`relativeLong = relativeShort + " ago"` AC-1 guarantee** implemented structurally (`time.ts:106-110`), not as a parallel ladder. Unit-locked across 7 probe offsets. ✓
- **The 6 exempt arithmetic sites untouched & not disabled:** verified line-for-line — `ThreadSections.tsx:54-55,117,141-142,201` (sort/seam), `ThreadShell.tsx:133,138` (window check), `BlockActionsPopover.tsx:66,93` (UI timer), `useSessionActivity.ts:131` (fallback), `Composer.tsx:29` (client-key). No `eslint-disable` added anywhere. ✓
- **Deleted files truly gone:** `utils/format-time.ts` + `utils/relative-time.ts` + `web/src/__tests__/relative-time.test.ts` deleted; no lingering imports (`AgentProfile`, `WorkTeam`, `KnowledgeList` all rewired; dead-import lint backstops resurrection). ✓
- **Diff delivers exactly the plan — nothing more:** no scope creep, no new package, no i18n, no ticking. The only additions beyond the migration table are `data-testid` hooks for the E2E (`thread-time`, `knowledge-time`, `knowledge-row`, `notification-time`, `activity-time`, `routine-created`) — justified, minimal, test-only attributes. ✓

### Design (vocabulary fidelity on rendered surfaces) — PASS

- Proof screenshots (`plans/AI3/proof/`): thread list, knowledge list, notification popover all render **identical "14h"** for one shared seed. `labels.txt` records `All labels identical: true`. ✓
- WorkRoutine "Created" rewired to a token-styled KeyValue-shaped row (mono caps label + `text-primary` value) — consistent with the page's other `KeyValue` rows. No hardcoded colors, on-grid spacing (`gap-[6px]` = `--space-1`), on-scale type (11px label, 15px value). ✓
- CommentRow happy-path render is byte-identical (migration is `{hour:"numeric",minute:"2-digit"}` → `clockTime(seconds:false)`, same options) — only the invalid path changes (hide-chip carve-out). ✓
- SessionActivityPanel 24h normalization is the documented intentional behavior change, asserted by E2E regex `/^\d{2}:\d{2}:\d{2}$/` + `not(/AM|PM/i)`. ✓

### Security (STRIDE) — PASS

- Pure display formatter. No endpoint, no mutation, no POST/PATCH → rate-limiting N/A.
- **Input-trust boundary handled & improved:** `toEpoch` rejects any non-finite parse → `TIME_PLACEHOLDER`; output is a text node, never `dangerouslySetInnerHTML`. The old `ArtifactTimestamp` *echoed the raw `value` on parse failure* (`return value`) — that DOM-leak of arbitrary agent/DB strings is now removed (returns the placeholder instead). Net security improvement. ✓
- No paths, URLs, or secrets touched. ✓

### Adversarial (try to break it) — PASS (edge cases covered)

- **epoch 0 / `Number.NaN` / `Infinity` / `""` / `null` / `undefined`** → all → `TIME_PLACEHOLDER`, unit-tested (`time.test.ts:222-341`). `relativeShort(0,...)` is a valid epoch (1970) not the null path — correct, it renders a large `Ny`, no crash.
- **Future timestamps:** clamp via `Math.max(0, …)` → "just now" for relative; absolute registers render the real future date (legit for next-run). Unit-tested + E2E (`FUTURE_CREATED_AT` → WorkRoutine renders "Mar 15, 2030"). No `-Nm`, no `NaN`. ✓
- **Exactly-at-threshold:** `59_999ms → "just now"`, `89m → "1h"`, `23h59m → "23h"`, `7d → "1w"`, `30d → "1mo"`, `365d → "1y"` all asserted. Boundary `<` vs `>=` semantics consistent with the deleted `relative-time.ts`. ✓
- **DST / locale hour-cycle:** `Intl.DateTimeFormat` handles DST inherently; the 24h-vs-locale split for clockTime is deliberate and tested. No naive `getHours()` arithmetic. ✓
- **Register misuse / bypass:** the ESLint gate makes a new `new Date(...).toLocale*()` an error (probe fired: "AC-2 one-clock gate") and a resurrected `utils/format-time` import an error (probe fired). A future *variable-held* Date formatter (`const d=new Date(); d.toLocaleString()`) would slip the selector — this is the documented residual SUGGESTION from the arch-critique; zero such sites exist today and the AC-3 E2E backstops divergence. Acceptable. ✓
- **Saboteur/Auditor:** PR claim "84 unit + 9 E2E green" — verified true by re-running both. "verify:quick + build green" — verified `verify:quick` exits 0. No weakened tests; the protected `ArtifactTimestamp.test.tsx` keeps its `/2026/` assertion (name-only rename, authorized). No backdoors, no silent regressions.

### Simplification — PASS

- No over-build. `relativeLong` delegates to `relativeShort` (no duplicate ladder). `clockTime` is one fn with a `seconds` param, not two near-copies. Memoized formatters created once at module scope. CommentRow coercion is a 2-line, single-surface carve-out, not a generic mechanism. Nothing premature, no dead code, no value-free wrappers.

### AI Slop — PASS

- `@lore AI3` comments are load-bearing (explain the name-swap deletion, the killed seconds register, the 24h normalization, the CommentRow carve-out) — not filler. No "TODO: implement", no "simplified version", no redundant defensive null-checks (the `task.startedAt &&` gate in WorkTask is a real nullable guard, not noise). Naming consistent (`fmtDate`/`fmtClockSeconds` etc.). The `SEC_MS` const is unused-but-harmless as the ladder base — actually it IS used (`MIN_MS = 60 * SEC_MS`). No slop.

---

## Findings

### WARNING — AC-1 work-page surface is migrated but not *proven* in the AI3 side-by-side

**Spec AC-1 (TRACK-AI.md:114):** "proven by a side-by-side capture of **at least four surfaces (notifications, work pages, knowledge list, thread/comment rows)** seeded with identical timestamps."

**Evidence delivered:**
- Proof screenshots (`plans/AI3/proof/`): **3** surfaces — thread list, knowledge list, notification popover. **No work-page screenshot.**
- AC-1 E2E (`time-vocabulary.spec.ts:169-254`): thread list, knowledge list, notification popover — **3** surfaces. **No WorkTask/WorkBet task-row assertion.**
- CommentRow (thread/comment rows) is covered, but only in the AC-3 block, and SessionActivity/WorkRoutine only in AC-4.

The work-page sites **are correctly migrated** — `WorkTask.tsx:306` `relativeLong(task.startedAt)`, `WorkBet.tsx:1628` `relativeLong(task.startedAt)` — and they import the same shared register, so they cannot disagree with the proven surfaces by construction (single source, structural `+" ago"` guarantee). The risk of an actual label-divergence regression is therefore low. But the spec **names "work pages" explicitly** as one of the four required side-by-side surfaces, and neither the proof screenshots nor an AC-1 assertion includes one. The proof literally shows 3, and the spec says "at least four."

**What correct looks like:** add one work-page surface to the AI3 AC-1 proof — cheapest path is a 4th E2E assertion in the `AC-1` describe block that mounts a WorkTask (via the existing `overrideTaskId`/`overrideBetId` prop seam already on `WorkTask`, or a `page.route` mock of the task detail) seeded with `SEED_CREATED_AT` and asserts `[data-testid="task-started-at"]` renders the shared `relativeLong` label (e.g. `3h ago`). Alternatively add a `surface-4-work-task.png` to the proof folder showing the matching label. Either closes the spec's "four surfaces incl. work pages" letter. file: `packages/web/e2e/time-vocabulary.spec.ts` AC-1 block / `plans/AI3/proof/`.

### NOTE — AC-1 E2E assertions verify *presence*, not *agreement*

The 3 AC-1 tests assert only `not.toBeEmpty()` and `text !== "—"` per surface. They never assert the three surfaces render the **same string**. Since `SEED_CREATED_AT` is a single shared constant and the proof screenshots manually confirm "14h" on all three, AC-1 is *proven* by the static proof — but the E2E that is meant to lock it would still pass if one surface drifted to a different (non-empty, non-dash) bucket. Stronger: capture each surface's `textContent` and `expect(threadLabel).toBe(knowledgeLabel)` (within the relative register). Not blocking — the structural single-source guarantee + the proof screenshots carry AC-1 — but the E2E under-delivers on its stated purpose ("assert the relative labels match"). file: `packages/web/e2e/time-vocabulary.spec.ts:217-254`.

### NOTE — proof timestamp/label mismatch is cosmetic, worth a glance

`labels.txt` seed is `2026-06-12T09:32:07.000Z` rendering "14h" — i.e. captured ~23:34Z that day (consistent). The unit-test and E2E seeds use a *different* reference ("3h" / 14:32:07Z). Two different demonstration values across artifacts is fine (each is internally consistent), but a reader cross-referencing them may stumble. No action required.

### NOTE — doc-check skip justification is reasonable

Doc check = NO, justification "formatting consolidation, no new capability." Correct: AI3 changes *how* timestamps render, not *which* timestamp any surface shows (spec contract §"No change to which timestamp each surface displays — only how it is formatted"). No user-facing capability, route, or primitive added. `docs/ui-design/` describes tokens/components, not the relative-time vocabulary. No doc owes an update. Skip is justified. ✓

### NOTE — ESLint selector is inline-`new Date()`-shaped only (documented residual)

The `no-restricted-syntax` selector matches `new Date(...).toLocale*()` specifically. A Date held in a variable would evade it. Zero such sites today; the arch-critique Round-2 residual SUGGESTION already documented this and routed the backstop to the AC-3 E2E. Carried forward as-is. No action.

---

## AC completeness audit

| AC / Scenario | Requirement | Evidence | Status |
|---|---|---|---|
| **AC-1** | Same age → identical label; side-by-side ≥4 surfaces (notifications, work pages, knowledge list, thread/comment rows) | Unit: `relativeLong===relativeShort+" ago"` ×7 offsets (`time.test.ts:203-212`). Proof: 3 screenshots all "14h" + `labels.txt` identical=true. E2E: 3 surfaces (thread/knowledge/notif) render shared label; CommentRow covered in AC-3. **Work-page surface migrated (WorkTask/WorkBet `relativeLong`) but absent from AI3 proof + AC-1 assertion.** | **PARTIAL** — WARNING above. Spec names 4 surfaces incl. work pages; proof shows 3 + comment. Migrated-correct, under-proven. |
| **AC-2** | Named variants of one source; no local *display* arithmetic | 5 named exports, all callable (unit). ESLint gate fires at error on `new Date().toLocale*` (live probe ✓) + dead-import ban (live probe ✓). Arithmetic half → review checklist + AC-3 E2E per documented split. | **MET** |
| **AC-3** | Invalid/future → graceful placeholder, never NaN/negative/crash | Unit: full table (`null/undefined/NaN/Infinity/""/garbage` → `—`; future → "just now"; no result contains "NaN"; no `-` prefix) `time.test.ts:219-342`. E2E: thread/knowledge/notif render "—" on bad ts; **CommentRow carve-out** asserts row renders, no time chip, no "—" glyph (`:323-393`). | **MET** |
| **AC-4** | One absolute format app-wide | Unit: `absoluteDate` matches `/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/`; `absoluteDateTime` date+", "+clock; `clockTime(seconds)` `/^\d{2}:\d{2}:\d{2}$/` 24h. E2E: WorkRoutine "Created" matches MMM D, YYYY; SessionActivity renders 24h HH:mm:ss, no AM/PM. | **MET** |
| **AC-5** | design-system consumes the shared source | `ArtifactTimestamp.tsx:1` imports `absoluteDate, relativeLong`; `CommentRow.tsx` imports `clockTime, TIME_PLACEHOLDER` from `@hyperidle/shared`. Zero local `Date`-receiver `toLocale*` in design-system (grep + lint gate scopes `design-system/src`). Protected `ArtifactTimestamp.test.tsx` green (2 tests), absolute case renamed to drop "ISO-style" (assertion `/2026/` unchanged). | **MET** |
| **Scenario** "identical createdAt → 3 surfaces same age label" | — | Proof screenshots: thread/knowledge/notif all "14h". | **MET** (3 of the named surfaces; work-page = WARNING) |
| **Scenario** "unparsable ts → every surface placeholder" | — | E2E AC-3 block per surface + CommentRow carve-out. | **MET** |
| **Scenario** "search for local date-diff arithmetic in components → none outside source" | — | Grep: zero `toLocale*` in non-test web/ds source; 6 ms-arithmetic sites are sort/group/timer/seam (not display) — documented exempt. ESLint dead-import + toLocale ban enforce. | **MET** (display arithmetic; sort/timer correctly out-of-scope per split) |

---

## Verification log (re-run independently, not trusted from PR)

- `npx vitest run packages/shared/src/__tests__/time.test.ts` → **84 passed**.
- `npx vitest run packages/design-system/src/__tests__/ArtifactTimestamp.test.tsx` → **2 passed** (protected, green).
- `npm run -w @hyperidle/web test:e2e -- time-vocabulary.spec.ts` → **9 passed (40.7s)**. (Direct `npx playwright` fails with "invalid URL" — that needs the workspace webServer/baseURL; not a code issue.)
- ESLint live probe `new Date().toLocaleDateString()` in `pages/` → **error** (AI3 gate fires).
- ESLint live probe `import from "../utils/format-time"` → **error** (dead-import ban fires).
- `grep toLocale*` web+ds non-test source → **0 residual**.
- 6 exempt arithmetic sites → present, untouched, no `eslint-disable`.
- `npm run verify:quick` → **exit 0** (check + lint + knip green).
