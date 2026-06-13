# AI5 — Phase 4 Code Review

Branch `feat/AI5-shared-primitive-adoption` vs `origin/main`. Reviewer = Phase-2 critic, warm on contracts.

## Verdict: NOT DONE

AC2 fails. A set of standalone DaisyUI `btn btn-*` action buttons on **surfaces this diff touched** (WorkRoutine, WorkPortfolio, WorkTeam, WorkBet, AgentProfile) were left unmigrated although the plan listed them as "Candidate migrate" and the builder's keep-justification only covers dialog footers + AG5 menu triggers — not these. They are exactly the "hand-rolled equivalent left in the tree to copy from" AC2 forbids. Everything else (AC1, AC3, AC4, AC5, AC6) is met and proven green. This is a bounded, finishable gap — migrate the standalone `btn` actions (or justify each per-site in the plan's keep-list grammar) and it ships.

## AC table

| AC | Status | Evidence |
|---|---|---|
| **AC1 — identity renders identically** | **MET** | Avatar adopted at WorkTeam:801, WorkBet:1143, RecipientPicker:194/210; `deriveInitials` canonical (`utils/initials.ts`), unit-tested incl. the intentional WorkBet "GT"→"GR" word-initials→slice delta (documented in code + plan E5). `grep rounded-full near initials` = ZERO leftovers; `grep .slice(0,2)` in web src = ZERO leftover derivations. WorkTeam agent chip keeps `agent` green via `<Avatar … agent>`, aria/title preserved on wrapper. 126 protected scope/identity tests green. |
| **AC2 — one treatment per role; no hand-rolled button stylings** | **NOT MET** | All hand-rolled *custom-CSS* pills migrated to `<Button>` (Conversations, KnowledgeCreate, KnowledgeDetail, KnowledgeList, NotFound, CurationSuggestionCard) — good. But standalone DaisyUI `btn btn-*` **action** buttons remain on touched surfaces and were not migrated nor per-site justified (see CRITICAL-1). |
| **AC3 — one loading family; compact empty/error variants** | **MET** | `Skeleton` single-bar adopted (ArtifactThreadsSummary:36, BlockRefEmbed:42); compact `EmptyState`/`ErrorState` adopted (ArtifactThreadsSummary, SessionActivityPanel, BlockRefEmbed). `grep animate-pulse` (non-test/story) = exactly the 3 AI4 allowlisted live-dots (Conversations:324, SessionActivityPanel:199, RecipientPicker:203). No skeleton bypass survives. Compact tests (EmptyState.compact, ErrorState.compact, Skeleton.singlebar) green; full-variant EmptyState/ErrorState contract tests green. |
| **AC4 — scope picker one implementation in all 4 sites** | **MET** | One `ScopePicker` at KnowledgeList:663 (filter), KnowledgeCreate:497, KnowledgeCreateDialog:937, ScopeChangeDialog:985 — each with the pinned `testIdPrefix` (`scope-pill`/`-create`/`-dialog`/`-change`) + `data-active`. ScopeChangeDialog converted Select→pills. `grep rgba(22,118,79,0.08)` in web src = ZERO. No local scope-pill builder remains. U9/AD3/AD6/W3/KnowledgeCreate.af13 protected tests + new AI5-ScopeChangeDialog test green. |
| **AC5 — 44px touch targets ≤1024px** | **MET** | Triage (KnowledgeList:331/356/381), close/attach controls (SessionActivityPanel:211, AssistantOverlay:355, AssistantAttachButton:38) repaired with `min-h-[44px] min-w-[44px] xl:min-h-[<dense>]`. Overflow menu triggers (KnowledgeDetail:412, WorkBet:954) hit-area-expanded only, stayed `<button>` (no AG5 breach). ScopePicker pills carry `min-h-[44px] xl:min-h-[24px]`. ESLint touch-target rule clean. |
| **AC6 — 2 intentional bypasses stay; no new undocumented bypass** | **MET** | Sidebar nav + HostThreadSection empty state untouched (not in diff), lore intact. New compact/Skeleton/ScopePicker bypasses all carry `@lore`. ESLint `no-handrolled-*` clean. |

Docs skip: justified. No new user-facing feature/behavior/API — pure consolidation. Not scoring a doc rubric.

---

## Findings

### CRITICAL-1 — AC2: standalone `btn btn-*` action buttons left unmigrated on touched surfaces

The plan (`architecture.md` §Button) split `btn` sites into "**Candidate migrate**" (standalone action buttons) and "**KEEP**" (dialog footers in AI2 surfaces; overflow-menu triggers feeding AG5). The builder migrated **zero** candidate `btn` sites. The migration commit (`02ffe723`) justifies only "Overflow menu triggers + dialog footers KEPT (AG5/AI2 boundary)" — silent on every standalone action button below. These are not footers and not menu triggers; they are the bypass AC2 names ("DaisyUI `btn` sites" in the spec's "Why this matters") and the "hand-rolled equivalent left in the tree to copy from."

Genuine AC2 violations (standalone action buttons on surfaces this diff edited):
- `pages/WorkRoutine.tsx:250` Confirm delete, `:259` Cancel, `:271` Pause/Resume, `:280` Trigger Now, `:291` Delete — page-level config actions, `btn btn-ghost/primary btn-sm`.
- `pages/WorkPortfolio.tsx:246` New bet (`btn btn-sm btn-primary`), `:410` Create bet, `:446` Clear filters — **`:446` sits in an `EmptyState` `action` slot, the exact pattern migrated to `<Button>` in Conversations:544 and KnowledgeList:1096.**
- `pages/WorkTeam.tsx:726` Customize (`btn btn-ghost btn-xs`, standalone, stopPropagation).
- `pages/WorkBet.tsx:1052` Add knowledge, `:1290` Draft with AI, `:1368` Cancel + `:1376` Save (inline retro `<form>`, NOT a Dialog footer).

Fix: migrate each to `<Button variant size>` (primary/secondary/ghost/destructive map cleanly to the existing variants), OR — if any is deliberately kept — add it to the plan's keep-list with the same per-site grammar ("dialog footer" / "menu trigger") and a real reason. "It's DaisyUI not hand-rolled CSS" is not a sufficient reason: the spec explicitly enumerates `btn` sites as in-scope bypasses, and AC2's contributor clause is about leaving no copyable template.

Legitimately kept (NOT findings — confirmed correct):
- `WorkBet:324/332` (Kill bet) + `WorkBet:468/476` (Adjust appetite) — inside `Dialog` `footer={…}` slots → AI2 keep. ✓
- `WorkTeam:257`, `WorkRoutine:179`, `AgentProfile:147`, `AgentProfile:226` — `<Link>` (breadcrumbs / "Edit in Settings"). `<Button>` renders a `<button>`, not a router `<Link>`; no asChild affordance exists. These keep a shared DaisyUI `btn` treatment, not hand-rolled CSS. Defensible — but should be named in the plan keep-list for the record rather than left silent.

### WARNING-1 — Skeleton: dynamic Tailwind arbitrary values are fragile (works only by incidental literal coverage)

`design-system/src/Skeleton.tsx:64` builds `className={`${SKELETON_BAR} h-[${height}] w-[${width}] …`}`. Tailwind's JIT scans source for **literal** class strings; interpolated `h-[${height}]` cannot generate CSS on its own. It renders today only because the exact values in use (`h-[32px]`, `h-[16px]`, `w-[33%]`, `w-[100%]`) happen to appear as literals elsewhere in the scanned globs (web/DS `src/**`, which include `.test.tsx`/`.stories.tsx`) — `w-[33%]`/`w-[100%]` only exist as literals in `Skeleton.singlebar.test.tsx`/stories. The first caller that passes a novel value (e.g. `width="50%"`) silently renders a zero-dimension bar. This is the AI-slop "value-free abstraction over a real constraint" pattern: the prop API promises arbitrary dims the rendering can't deliver. Fix: use inline `style={{ width, height }}` (matches how Avatar/SearchField pass dynamic dims) and drop the interpolated arbitrary classes, OR constrain the prop to a closed token set. Not blocking (no live broken render), but it will bite the next adopter.

### NIT-1 — `time-vocabulary.spec.ts` scope creep + naming

`e2e/time-vocabulary.spec.ts:213` renames `_specDir`→`SpecDir` — an unrelated AI3 e2e file, no AI5 reason. Harmless but out of scope. Also `SpecDir` is PascalCase for a local `const` string (convention: `specDir` or `SPEC_DIR`). Revert or rename.

### NIT-2 — `mock-data-purge` inventory churn

`plans/mock-data-purge/{inventory,queue}.{json,md}` regenerated due to line-number shifts from the `Button` import (commit `2331e2a2`). Expected mechanical churn, no action — noted so the auditor doesn't flag it as smuggled change.

---

## Things explicitly verified clean
- AC4 tint grep: ZERO `rgba(22,118,79,0.08)` in web src; WorkPortfolio:307/342 + WorkTeam:803 swapped to `--accent-primary-dim` / removed via Avatar.
- AC3 animate-pulse grep: exactly the 3 AI4 live-dots, no skeleton bypass.
- AC1: no missed avatar circle (`rounded-full`+initials) and no leftover `.slice(0,2)` derivation.
- Overflow triggers stayed `<button>` (KnowledgeDetail:412, WorkBet:954) — no AG5 breach.
- af13 test rewrite (5 assertions Select→pill anatomy): legitimate test-tracks-implementation; behavioral contract (3 labels, factory/practice→Shared, Team gated by hasTeam) preserved, not bent.
- ScopePicker filter-mode "All"→null logic correct against `SCOPE_PILL_OPTIONS[0] = {id:"all", filterKinds:null}`.
- `npm run check` PASS (12 packages). `npm run lint` PASS (warnings only, zero errors; ESLint design plugin incl. touch-target + no-handrolled clean).
- Targeted AI5 tests 61/61 green; protected tests 126/126 green.
