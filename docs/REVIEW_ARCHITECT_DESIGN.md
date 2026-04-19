# Architectural Review — Design Synthesis
## HyperIdle "The Factory" Implementation Assessment

**Date:** April 19, 2026  
**Reviewers:** Senior Staff Engineer (Architecture)  
**Scope:** ShellSynthesis, ConversationSynthesis, WorkSynthesis, KnowledgeSynthesis  
**Status:** Complete — Recommended Build Order Enclosed

---

## Executive Summary

The four design synthesis documents represent a high-quality, internally consistent visual and structural system. The synthesis process has successfully extracted the best from prototypes (Version A) and existing code (Version B), resolving conflicts with clear reasoning in each case.

**Key findings:**

1. **Effort is manageable but non-trivial:** ~10–12 weeks of full-stack work (not 4 weeks as UI_DESIGN.md optimistically targets).
2. **Breaking changes are localized** — primarily Tier 1 (primitives) and Tier 3 (regions). Tier 4 pages adapt to the new shapes with minimal refactor.
3. **No architectural issues detected** — the synthesis respects the three-layer model (Human Interface → Meta Layer → Agent Runtime), maintains component contracts, and preserves existing test coverage.
4. **Two forward dependencies must resolve first:** (a) Settings as a drawer instead of modal, (b) collapsed Rail showing semantic color pills (BLK/REV/PSD).
5. **No new services required.** Everything lives in existing packages (web, db, server).

This review covers effort estimation, breaking changes, dependency mapping, architectural risks, and a recommended phased build order.

---

## 1. EFFORT ESTIMATION

### 1.1 Shell Synthesis (Design System + Navigation)

| Component | Files Changed | Files Created | T-Shirt | Reasoning |
|-----------|---------------|---------------|---------|-----------|
| Token/theme system | `tailwind.config.ts`, `src/index.css` | — | S | Already wired; only `--density` knob activation needed |
| IconRail redesign | `IconRail.tsx` | — | M | Add 2px left-edge active indicator + unread dot; preserves roving focus |
| Rail collapsed state | `Rail.tsx` | — | M | Three semantic pills (BLK/REV/PSD) + expand chevron; state logic exists |
| Submenu enhancements | `Submenu.tsx` | — | S | Add mono header + count bubble + segmented filter row for Conversations/Knowledge |
| Settings drawer | `SettingsPanel.tsx`, `AppShell.tsx` | — | L | Replaces modal; new z-index/focus mgmt; impacts `AppShell` layout flow |
| Command-K visual | `GlobalSearchPanel.tsx` | — | M | Adopt A's grouping + keyboard nav; B's routing already there |
| **Subtotal** | 6 files | 0 | **M → L** | Riskiest: Settings drawer layout implications |

**Shell Effort: 3–5 days (includes theme validation)**

---

### 1.2 Conversation Synthesis

| Component | Files Changed | Files Created | T-Shirt | Reasoning |
|-----------|---------------|---------------|---------|-----------|
| ThreadRow list grouping | `ConversationsReview.tsx`, submenu | — | M | Reorder by (Pinned → Blocking → Reviews → Chats → Resolved); data shape unchanged |
| ReviewHeader | `ReviewHeader.tsx` | — | S | Already proposer-led; no change |
| Reasoning block | `MessageBubble.tsx` (or new) | `ReasoningBlock.tsx` | M | Render `Message.reasoning[]` as collapsible steps; new component |
| ArtifactView polish | `ArtifactView.tsx` | — | M | Five shapes already present; add metadata strip, related history; composition |
| Verdict toolbar | `ReviewHeader.tsx` | — | M | Surface 4 + overflow; keybind chips on buttons |
| Chat variant | `ConversationsChat.tsx` | — | S | Already distinct mode; validate no artifact rendering |
| Inline comment anchoring | `text_diff` in `ArtifactView.tsx` | — | L | New interaction: click comment icon → focus position in diff; anchor data structure |
| Chief-of-Staff chat | `ConversationsChat.tsx` (variant) | — | S | Grouped message threading; conditional rendering |
| **Subtotal** | 3–4 files | 1 | **L** | Inline comment anchoring is the riskiest lift |

**Conversation Effort: 4–6 days (mostly polish, one new concept)**

---

### 1.3 Work Synthesis

| Component | Files Changed | Files Created | T-Shirt | Reasoning |
|-----------|---------------|---------------|---------|-----------|
| Portfolio page | `WorkPortfolio.tsx` | — | M | Richer BetCard (lead, sparkline, cycle stripe); data query unchanged |
| Canvas capacity | `Canvas.tsx` | — | S | Enhance capacity badge visual prominence; logic already there |
| Kanban + TaskCard grouping | `Kanban.tsx`, `TaskCard.tsx` | `BetGroup.tsx` | M | Group TaskCards by bet; new container, reuse cards |
| PitchSelector detail pane | `PitchSelector.tsx` | `PitchDetail.tsx` | M | Inline detail expansion; data shape exists |
| Bet detail page | `WorkBet.tsx` | — | L | Breadcrumb + pitch body + task table + comments; composition of existing pieces |
| State semantics | existing components | — | S | Verify `blocked = warning`; no change needed (already correct) |
| **Subtotal** | 5 files | 2 | **L → XL** | Bet detail page is heaviest: pitch markdown + table + thread |

**Work Effort: 5–8 days (table rendering + comment thread integration)**

---

### 1.4 Knowledge Synthesis

| Component | Files Changed | Files Created | T-Shirt | Reasoning |
|-----------|---------------|---------------|---------|-----------|
| Scope browser (Submenu) | `Submenu.tsx`, `KnowledgeList.tsx` | `ScopeBrowser.tsx`, `KnowledgeGroup.tsx` | L | Three-scope segmented control + topic tree + health dots; new IA |
| List grouping | `KnowledgeList.tsx` | `KnowledgeGroup.tsx` | M | Wrap existing KnowledgeRow in group headers; collapse state |
| Kind + Status tags | `Tag.tsx`, `StatusChip.tsx` | — | S | Extend Tag with optional `kind` variant for icons; StatusChip unchanged |
| Triage view | `KnowledgeList.tsx` | `TriageView.tsx` | L | Attention-scored list, reason lines, curation cards; new data contract |
| Detail page | `KnowledgeDetail.tsx` | `KnowledgeEditMode.tsx` | L | Metadata bar + markdown body + edit toggle + observation logs; heavy composition |
| Factory scope treatment | `KnowledgeRow.tsx`, `Tag.tsx` | — | M | Serif accent, version pill, "Amendable" banner; styling only |
| Attention score visibility | `TriageView.tsx` | — | S | Reason lines (textual signal), hide raw score |
| **Subtotal** | 4 files | 4 | **XL** | Scope browser + Triage + Detail rebuild is the heaviest view |

**Knowledge Effort: 8–12 days (most new surfaces, highest IA complexity)**

---

### 1.5 Consolidated Effort Table

| Synthesis | Core Components | New Components | Tier 1 Changes | Tier 2 Changes | Est. Days | Risk |
|-----------|-----------------|----------------|----------------|----------------|-----------|------|
| Shell | 6 | 0 | 3 (Token, active indicator, pill colors) | 0 | 3–5 | Medium (Settings drawer) |
| Conversations | 3–4 | 1 | 0 | 2 (ReviewHeader, MessageBubble) | 4–6 | Medium (inline anchoring) |
| Work | 5 | 2 | 0 | 3 (Canvas, Kanban, TaskCard) | 5–8 | Medium–High (detail page) |
| Knowledge | 4 | 4 | 1 (Tag variant) | 3 (KnowledgeRow, list, detail) | 8–12 | High (new surfaces) |
| **TOTAL** | **18–17** | **7** | **4** | **8** | **20–31 days** | **Medium–High** |

**Effort Summary:**
- **Best case:** 20 days (tight implementation, minimal rework)
- **Expected case:** 25 days (includes rework, testing, iteration)
- **Worst case:** 31 days (complex interactions, accessibility audit)

**T-shirt sizing:**
- S = < 1 day (token activation, validation, static styling)
- M = 1–3 days (component enhancement, existing data shapes, composition)
- L = 3–5 days (new surfaces, multi-part interactions, table rendering)
- XL = 1+ week (IA redesign, new data contracts, heavyweight compositions)

---

## 2. BREAKING CHANGES & TEST IMPACT

### 2.1 Component Interface Changes

**StatusChip** (STABLE)
- Current: `status: Status` (6 values)
- Synthesis: No change — already correct (blocked=warning, not error)
- Tests: Pass without modification
- Risk: None

**Tag** (MINOR EXTENSION)
- Current: `label: string` only
- Synthesis: Add optional `kind?: 'pattern' | 'decision' | 'failure' | ...` + `showIcon?: boolean`
- Breaking: No (both new props optional)
- Tests: Existing tests pass; add new tests for `kind` variant
- File: `/packages/web/src/components/Tag.tsx`

**NavItem** (STABLE)
- Current: Icon + text + optional count badge
- Synthesis: Add optional unread dot + refine selected state indicator
- Breaking: No (additive)
- Tests: Update IconRail.test.tsx to assert dot rendering
- File: `/packages/web/src/components/NavItem.tsx`

**Submenu** (MINOR EXTENSION)
- Current: `children` contract, collapse/search props
- Synthesis: Keep contract as-is; composition in parent (KnowledgeList) adds ScopeBrowser
- Breaking: No (children are flexible)
- Tests: Existing tests pass
- File: `/packages/web/src/shell/Submenu.tsx`

**ReviewHeader** (STABLE)
- Current: Artifact-agnostic header + verdict buttons
- Synthesis: Already proposer-led; add keybind display on buttons
- Breaking: No
- Tests: ReviewHeader.test.tsx updated for keybind chips
- File: `/packages/web/src/components/ReviewHeader.tsx`

**ArtifactView** (STABLE)
- Current: Five artifact kinds (text_diff, content_preview, visual_comparison, action_summary, data_metrics)
- Synthesis: Add metadata strip, related history; no new kinds
- Breaking: No
- Tests: Pass with enhanced rendering
- File: `/packages/web/src/shell/ArtifactView.tsx`

**Canvas & Kanban** (STABLE)
- Current: Two-lane Canvas + four-column Kanban
- Synthesis: No lane/column changes; visual enhancements only
- Breaking: No (capacity visual, TaskCard grouping is composition)
- Tests: Pass; Kanban.test.tsx + Kanban.keyboard-drag.test.tsx validate
- Files: `/packages/web/src/shell/Canvas.tsx`, `Kanban.tsx`

---

### 2.2 Data Shape Changes

**No shared-type changes required:**
- `Message.reasoning?: string[]` already exists (just not rendered)
- `KnowledgeItem` layers/kinds/status already in schema
- `BetStatus`, `TaskState` enums unchanged

**New internal data structures (no API contract change):**
- `ReasoningBlock` component (local, UI-only)
- `TriageItem` (local state, computed from existing KnowledgeItem + scoring)
- `PitchDetail` (component-level, no new DB table)
- `CurationCard` (local state, no new table)

**No server-side API changes:**
- `/api/conversations/*` endpoints unchanged
- `/api/work/*` endpoints unchanged
- `/api/knowledge/*` endpoints unchanged (may add `?scope=factory` param, backward compatible)

---

### 2.3 Which Tests Will Break

**Test file impact matrix:**

| Test File | Status | Changes Required |
|-----------|--------|-------------------|
| `IconRail.test.tsx` | Will break | Assert 2px indicator + unread dot |
| `Rail.test.tsx` | Will break | Assert BLK/REV/PSD pills when collapsed |
| `Submenu.test.tsx` | Safe | No breaking changes (children flexible) |
| `SettingsPanel.test.tsx` | Will break | Drawer instead of modal; z-index, focus trap tests |
| `GlobalSearchPanel.test.tsx` | Safe | Grouping is visual; routing contract unchanged |
| `ReviewHeader.test.tsx` | Will break | Keybind chips on buttons |
| `ArtifactView.test.tsx` | Safe | Five kinds render as before; metadata is additive |
| `ConversationsReview.test.tsx` | Safe | ThreadRow order changes (filter test, not assertion) |
| `Canvas.test.tsx` | Safe | Capacity visual only; board state unchanged |
| `Kanban.test.tsx` | Safe | TaskCard grouping is wrapper; card logic unchanged |
| `KnowledgeList.test.tsx` | Will break | Scope browser, grouping, Triage tab |
| `KnowledgeDetail.test.tsx` | Will break | New metadata, edit mode, observation logs |
| `Tag.test.tsx` | Safe | Add new test case for `kind` variant |
| `AppShell.test.tsx` | Will break | Settings drawer replaces modal in shell layout |

**Test count estimates:**
- Tests to update: ~8 files
- New test cases: ~15 (for new components: ReasoningBlock, KnowledgeGroup, ScopeBrowser, TriageView, PitchDetail, CurationCard)
- Coverage target: 100% of new code (Vitest + Playwright E2E for shell interactions)

---

## 3. DEPENDENCY MAP & BUILD SEQUENCING

### 3.1 Logical Dependency Graph

```
Phase 0: Token & Primitive Changes (no dependencies)
├── Activate --density knob in SettingsData.appearance
├── Add Tag.kind variant
└── Verify tailwind.config.ts wiring (should be no-op)

Phase 1: Shell Changes (depends on Phase 0)
├── IconRail: 2px indicator + unread dot
├── Rail: semantic pills (BLK/REV/PSD) when collapsed
├── Submenu: mono header + count bubble + filters (Conversations/Knowledge)
├── Settings drawer: right-side sheet (AppShell layout)
└── GlobalSearchPanel: grouping + keyboard nav

Phase 2: Core Region Changes (depends on Phase 1)
├── ReviewHeader: keybind chips on verdict buttons
├── ArtifactView: metadata strip + related history
├── MessageBubble: render Reasoning block
└── ConversationReview: Pinned/Blocking/Reviews/Chats/Resolved grouping

Phase 3: Work Surface (depends on Phase 1)
├── Portfolio: enriched BetCard
├── Canvas: capacity visual enhancement
├── Kanban + TaskCard: grouping by bet
├── PitchSelector: detail pane (inline expansion)
└── WorkBet: bet detail page (breadcrumb + pitch + table + comments)

Phase 4: Knowledge Surface (depends on Phase 1)
├── Submenu: ScopeBrowser (Practice/Product/Factory scopes)
├── KnowledgeList: KnowledgeGroup wrapper + Triage tab
├── KnowledgeDetail: metadata bar + edit mode + observation logs
├── Tag: kind variant with icons
└── Factory scope: serif accent + version pill + "Amendable" banner

Phase 5: Validation & Polish (depends on Phase 4)
├── E2E tests: drawer, comment anchoring, triage reasoning
├── Accessibility audit: shell focus management, keyboard nav
├── Empty/loading/error states
└── Motion + transitions (120/200/320ms)
```

**Critical path:** Phase 0 → Phase 1 → (Phases 2, 3, 4 in parallel) → Phase 5

---

### 3.2 Parallelizable Work

**These can land in parallel (no data/component dependencies):**

1. **Shell Phase (Phase 1):** All region changes are independent after Phase 0.
2. **Work Surface (Phase 3):** Only uses existing Canvas/Kanban; no shared changes with Conversations.
3. **Knowledge Surface (Phase 4):** Self-contained; uses generic primitives (Tag, StatusChip, NavItem).

**Critical sequencing (cannot parallelize):**
- Phase 0 must complete before Phase 1 (tokens, primitives)
- Phase 1 must complete before Phases 2–4 (all depend on Shell)
- Phase 5 depends on all of Phases 2–4 (validation is full-system)

**Recommended team split (if 2–3 developers):**
- **Dev A:** Phase 0 + Phase 1 (Shell)
- **Dev B:** Phase 2 (Conversations) + Phase 5 validation
- **Dev C:** Phase 3 + 4 (Work + Knowledge) in sequence or parallel

---

## 4. ARCHITECTURAL CONCERNS & RISK ASSESSMENT

### 4.1 Settings Drawer: Layout & Z-Index Interactions

**Design decision:** Settings slides in from the right, pushing Rail out, leaving Submenu + Main visible.

**Concerns:**
1. **Z-index layering:** Drawer sits above Main but at same level as Rail. If Rail is `z-40` (daisyUI base), drawer needs `z-50` (or explicit stacking context).
2. **Focus trap:** Modal has explicit `focus-trap-react`. Drawer is non-modal (user can still interact with Main via tab). Is focus trap needed? Synthesis says "closes on Esc or outside-click," which is drawer behavior.
3. **Width math:** `w-[420px]` is hardcoded. Does this break at 1024px (submenu collapse breakpoint)? At 1280px?

**Recommendation:** 
- Z-index: Use `z-40` for drawer (above Main at `z-20`, below modals at `z-50`).
- Focus: No focus trap (drawer allows Main interaction). Use `onEscape` to close.
- Responsive: At `<1024px` (submenu collapsed), drawer `w-[360px]` (narrower on phone). Media query in Tailwind.
- File: `packages/web/src/shell/AppShell.tsx` + new `packages/web/src/shell/SettingsDrawer.tsx`

**Risk level:** Medium — needs layout testing on 1024/1280 breakpoints.

---

### 4.2 PitchSelector: Inline vs Overlay Layout Implications

**Current design:** PitchSelector replaces Kanban (takes up Main pane, full width).

**Synthesis proposal:** PitchSelector sits *between* Canvas and Kanban, with inline detail pane.

**Concerns:**
1. **Viewport height:** Canvas + PitchSelector + (detail pane) + Kanban all visible? Not possible at typical 800px height. Synthesis mockup likely shows scrolling within regions, not all visible.
2. **Composition:** WorkTeam page becomes: `Canvas | PitchSelector (inline, with detail expansion) | Kanban`. Is PitchSelector a full-width overlay or a third lane?

**Reading the synthesis more carefully:** The synthesis shows PitchSelector as an *overlay* (like the current design), but with a detail pane *within* the PitchSelector itself (not replacing Kanban). The detail pane expands inline when a pitch is selected, showing pitch body + keybind ("press Enter to commit").

**Recommendation:**
- PitchSelector remains an overlay (replaces Kanban).
- Detail pane is a secondary panel *inside* PitchSelector.
- Composition: Canvas (always visible) + PitchSelector (modal swap of Kanban).
- File: `packages/web/src/shell/PitchSelector.tsx` + `packages/web/src/shell/PitchDetail.tsx` (internal to PitchSelector)

**Risk level:** Low — existing overlay pattern is well-defined.

---

### 4.3 Knowledge Scope Browser: Submenu Contract

**Current Submenu:** Takes `children` (ReactNode). Simple API.

**Scope browser:** Three-scope segmented control + topic tree + subtopic drill-down.

**Concern:** Does this fit inside `children`? 

**Answer:** Yes. The scope browser is just JSX that lives inside `children`. The Submenu component stays unchanged. The parent (KnowledgeList page) composes the browser and passes it as `children`.

**Implementation plan:**
- New component: `ScopeBrowser.tsx` (just UI, no state)
- State lives in `KnowledgeList.tsx` (currentScope, expandedTopics)
- ScopeBrowser receives props: `scope`, `onScopeChange`, `topics`, `onTopicToggle`, etc.
- Passed as `<Submenu children={<ScopeBrowser ... />} />`

**Risk level:** Low — Submenu contract is flexible.

---

### 4.4 Reasoning Block: New Component or Composition?

**Synthesis says:** "Collapsible Reasoning panel listing numbered steps from reasoning[]"

**Questions:**
1. Is this a reusable Tier-2 component (like ThreadRow, BetCard) or page-specific composition?
2. Where does collapse state live? Component or parent (ConversationsReview)?

**Recommendation:**
- **New Tier-2 component:** `ReasoningBlock` (title, steps, collapse affordance)
- **Props:** `steps: string[]`, `isOpen?: boolean`, `onToggle?: () => void`
- **State:** Parent (ConversationsReview or ReviewHeader) manages open/closed
- **Rendered by:** `MessageBubble` or `ArtifactView` (depending on artifact kind)
- **File:** `/packages/web/src/components/ReasoningBlock.tsx`
- **Test:** ReasoningBlock.test.tsx (all collapse states)

**Risk level:** Low — straightforward composition.

---

### 4.5 CurationCard & KnowledgeGroup: New Tier-2 Blocks?

**Synthesis proposes:**
- `CurationCard`: "Merge these 3?", "This topic has no items for 2 cycles" (facilitator suggestions)
- `KnowledgeGroup`: Topic header + count + stale indicator + collapsible rows

**Tier-2 check:** Are these reused in multiple views or just Knowledge?

- **KnowledgeGroup:** Only in KnowledgeList (Knowledge view). Not reused.
- **CurationCard:** Only in TriageView (sub-view of Knowledge/List). Not reused.

**Recommendation:**
- **KnowledgeGroup:** Keep as local composition inside KnowledgeList. No separate file (inline in the component).
- **CurationCard:** New component (visual + interaction > simple JSX). May be reused in future.
- **Files:**
  - `/packages/web/src/components/CurationCard.tsx`
  - KnowledgeGroup logic inline in `/packages/web/src/pages/KnowledgeList.tsx`

**Risk level:** Low — clear, localized scope.

---

### 4.6 Factory Scope: Serif Treatment & New Font?

**Synthesis says:** "larger row height + serif accent on titles"

**Current font stack:** Space Grotesk (sans-serif, data) + Inter (sans-serif, UI). No serif font loaded.

**Concern:** Adding a serif for just Factory scope items seems like scope creep. Is it worth the font load (Lora, Playfair, etc.)?

**Recommendation:**
- **Skip the serif font.** Use Space Grotesk at `font-bold` (heavier weight) for Factory item titles.
- **Density change:** `h-16` (larger row height) instead of default `h-12`.
- **Visual differentiation:** size + weight, not font family. Keeps dependency count down.
- **Alternative:** If serif is non-negotiable, load a system serif first (`Georgia, serif`) before adding a web font.

**Risk level:** Low (design guideline, not engineering).

---

### 4.7 Inline Comment Anchoring in text_diff

**Synthesis says:** "inline comment anchoring in text_diff"

**Current state:** ArtifactView renders diff lines as mono-text. No comment interaction.

**Challenge:** How to anchor a comment to a line in the diff?

**Implementation plan:**
1. Diff data shape includes line numbers (already there? check ArtifactView.tsx)
2. Each line gets a `data-line-number` attribute
3. Click a "comment" icon on a line → store the line number in local state
4. Open a comment form (inline or as a popover)
5. On submit, create a `Comment { line_number, text, author, timestamp }`
6. Render submitted comments below the diff, with visual connector to the line

**File changes:**
- `ArtifactView.tsx` (text_diff section)
- New component: `DiffCommentThread.tsx` (popover + form)
- Test: ArtifactView.test.tsx (comment rendering + anchoring)

**Risk level:** High — interaction model is new; needs Playwright E2E test.

---

## 5. WHAT'S WELL-DESIGNED

### 5.1 High Coherence, Low Addition Count

**Strength:** The synthesis adds only **7 new components** across four views (ReasoningBlock, KnowledgeGroup, ScopeBrowser, TriageView, PitchDetail, CurationCard, DiffCommentThread). Total component count stays ~26 (19 baseline + 7 new). The codebase remains lean.

**Supporting evidence:**
- No new Tier-3 regions (shell, artifact, canvas, kanban all kept)
- No new Tier-4 pages (all changes are enhancements to existing pages)
- Existing primitives (Tag, StatusChip, KeyValue, NavItem) are extended, not replaced
- DaisyUI base classes stay stable

---

### 5.2 Section Grouping & Attention Economy

**Conversations synthesis:**
- "Pinned / Blocking / Reviews / Chats / Resolved" ordering wins the day
- Puts the human's decision burden first (Pinned = must-see)
- Blocking outranks kind (a "blocking chat" shows before a "non-blocking review")
- This is a UX win that makes the UI scannable

**Knowledge synthesis:**
- Three-scope browser (Practice / Product / Factory) is the right IA
- Scope groups knowledge by trust/authority (Practice is editable; Factory is immutable)
- Triage view with "Why now" reason lines (instead of raw scores) makes prioritization legible

---

### 5.3 Incremental Ship Strategy

**Observation:** Many changes are *additive* and can ship independently:

| Can Ship Independently | Why |
|---|---|
| Settings drawer | Closes on modal; doesn't break existing modal tests |
| IconRail 2px indicator | Visual enhancement; KeyboardNav unchanged |
| Rail semantic pills | Collapsed state refinement; expanded Rail unaffected |
| Tag.kind variant | Optional prop; existing Tag usage safe |
| ReasoningBlock | New component; doesn't change ArtifactView contract |
| Portfolio richer BetCard | Data query unchanged; styling only |
| PitchDetail inline pane | Inside PitchSelector; no Kanban impact |

**Implication:** Build can proceed with feature flags or feature branches, shipping pieces as they land.

---

### 5.4 Test Coverage Strategy

**Synthesis design respects test boundaries:**
- Tier 1 primitives have isolated unit tests (StatusChip, Tag)
- Tier 2 blocks have component tests + fixtures (BetCard, PitchCard)
- Tier 3 regions have integration tests + keyboard shortcuts (Canvas, Kanban)
- Tier 4 pages have E2E tests via Playwright (ConversationsReview, WorkPortfolio, KnowledgeList)

**Existing test infrastructure is sufficient** — no new test framework needed.

---

## 6. RECOMMENDED BUILD ORDER

### Phase 0: Token & Primitive Stabilization (1–2 days)

**Goal:** Ensure all base tokens are wired and minor Tier-1 props are added.

**Story breakdown:**

| Story | Files | Effort | Work |
|-------|-------|--------|------|
| UI-TOKEN-0: Activate density knob | `SettingsData`, `index.css`, `AppShell.tsx` | 1 day | Read current density code (should be dormant), wire UI toggle to actual CSS scale factor (padding/gap/text-size adjustments). Test all three density modes in a E2E visual snapshot. |
| UI-PRIM-0: Extend Tag.kind variant | `Tag.tsx`, `Tag.test.tsx` | 0.5 day | Add optional `kind?: string`, optional icon map. Keep default behavior (kind=undefined renders as neutral badge). Update tests. |
| **Phase 0 Total** | 2 files | **1.5 days** | **Done when:** `bun run test` passes, density visual snapshot captured |

**Acceptance criteria:**
- [ ] Density knob in Settings changes rendered density (Vitest + visual snapshot)
- [ ] Tag.kind renders with icon when provided, falls back to neutral
- [ ] No regression in existing component tests
- [ ] `bun run lint` + `bun run check` pass

---

### Phase 1: Shell Redesign (3–5 days)

**Goal:** Land the four-zone shell with all new affordances (drawer, indicator, pills, grouping).

**Critical dependency:** Phase 0 must complete (token wiring).

**Story breakdown:**

| Story | Files | Effort | Work |
|-------|-------|--------|------|
| UI-SHELL-1: IconRail indicator + dot | `IconRail.tsx`, `IconRail.test.tsx`, `NavItem.tsx` | 1.5 days | Add `2px left-edge` active indicator (via `border-l-2 border-primary`). Add unread dot (conditional `::before` pseudo-element or inline span). Update ARIA (aria-current, aria-label). Keyboard nav unchanged. |
| UI-SHELL-2: Rail semantic pills (collapsed) | `Rail.tsx`, `Rail.test.tsx` | 1.5 days | When collapsed, show three pills (BLK, REV, PSD) with semantic colors (error, primary, neutral). Keep expand chevron. When expanded, show current NotificationRow list (no change). |
| UI-SHELL-3: Submenu enhancements | `Submenu.tsx`, `Submenu.test.tsx` | 1 day | Add mono header + count bubble (for Conversations/Knowledge views). Add segmented filter row (All / Needs review / Chats / Resolved). SearchField already present. |
| UI-SHELL-4: Settings drawer | `AppShell.tsx`, `SettingsPanel.tsx`, new `SettingsDrawer.tsx`, `AppShell.test.tsx` | 2 days | Convert SettingsPanel from modal to right-side drawer (`w-[420px]` responsive). Update z-index, focus management (no focus trap, allow Main interaction). Responsive: `<1024px` narrows to `w-[360px]`. Close on Esc/outside-click. |
| UI-SHELL-5: Command-K visual | `GlobalSearchPanel.tsx`, `GlobalSearchPanel.test.tsx` | 1 day | Add grouped results (Conversations / Work / Knowledge). Keyboard nav with arrow keys + Enter. Mono recent-queries row at bottom. Styling from A. |
| **Phase 1 Total** | 6 files | **3–5 days** | **Done when:** Settings drawer responsive, Rail pills render, IconRail keyboard nav intact |

**Acceptance criteria:**
- [ ] `bun run test` passes (all shell region tests updated)
- [ ] Playwright E2E: drawer opens/closes, pills visible when collapsed
- [ ] Responsive: 1024px submenu collapse, 1280px rail expand, drawer `w-[360px]` on mobile
- [ ] Keyboard: Esc closes drawer, Command-K nav works, IconRail roving focus works
- [ ] No regressions in AppShell layout

---

### Phase 2: Conversations Surface (4–6 days)

**Goal:** Land review/chat with reasoning, proposer-led header, new grouping, inline comments.

**Dependency:** Phase 1 (shell grouping affects submenu).

**Story breakdown:**

| Story | Files | Effort | Work |
|-------|-------|--------|------|
| UI-CONV-1: ReviewHeader keybind chips | `ReviewHeader.tsx`, `ReviewHeader.test.tsx` | 1 day | Display keybind on verdict buttons (A/R/X + Pause if blocking). E.g., `<button>Approve <kbd>A</kbd></button>`. Styling: mono-sm, muted color. |
| UI-CONV-2: Reasoning block | `ReasoningBlock.tsx`, `ReasoningBlock.test.tsx`, `MessageBubble.tsx` | 1.5 days | New component: render `message.reasoning[]` as collapsible list. Styles: section header + ordered steps. Parent manages collapse state. Update MessageBubble to render ReasoningBlock before artifact. |
| UI-CONV-3: Thread grouping + filters | `ConversationsReview.tsx`, submenu config | 1.5 days | Reorder ThreadRows by (Pinned → Blocking → Reviews → Chats → Resolved). Add submenu filters (All / Needs review / Chats / Resolved). No data shape change. |
| UI-CONV-4: ArtifactView polish | `ArtifactView.tsx`, `ArtifactView.test.tsx` | 1.5 days | Add metadata strip (kind, status, SLA, routing). Add related history section below artifact. All five kinds still render. |
| UI-CONV-5: Inline comment anchoring (text_diff) | `ArtifactView.tsx`, new `DiffCommentThread.tsx`, `ArtifactView.test.tsx` | 2 days | Click line in diff → inline comment form. Anchor to line number. Store comments in local state (save via API deferred). Playwright E2E test for interaction. |
| UI-CONV-6: Chat mode (Chief-of-Staff) | `ConversationsChat.tsx`, messaging types | 0.5 day | Grouped-message threading (multiple messages from same sender appear stacked). Validate no artifact rendering. Existing component, minimal changes. |
| **Phase 2 Total** | 4 files | **4–6 days** | **Done when:** All reasoning, grouping, comments render; Playwright E2E passes |

**Acceptance criteria:**
- [ ] Reasoning block collapsible, shows all steps
- [ ] ThreadRows sorted by Pinned/Blocking/Reviews/Chats/Resolved
- [ ] Submenu filters work (client-side list filtering)
- [ ] Comment anchoring in diff (line number preserved, Playwright test)
- [ ] `bun run test` passes, no regressions

---

### Phase 3: Work Surface (5–8 days)

**Goal:** Land portfolio, canvas/kanban enhancements, pitch selector detail, and bet detail page.

**Dependency:** Phase 1 (shell) for consistent styling.

**Story breakdown:**

| Story | Files | Effort | Work |
|-------|-------|--------|------|
| UI-WORK-1: Portfolio enrichment | `WorkPortfolio.tsx`, `BetCard.tsx`, `BetCard.test.tsx` | 1.5 days | Add to BetCard: lead agent avatar, shipped count, velocity sparkline, progress bar. Query shapes unchanged. Styling enhancements. Add cycle management stripe below product cards. |
| UI-WORK-2: Canvas capacity visual | `Canvas.tsx`, `Canvas.test.tsx` | 1 day | Enhance capacity badge (N/C). Add "Over capacity" warning in error red. Visual prominence (larger, bolder). Logic unchanged. |
| UI-WORK-3: Kanban TaskCard grouping | `Kanban.tsx`, `TaskCard.tsx`, new `TaskGroup.tsx`, tests | 1.5 days | Wrap TaskCard stacks in group headers (by bet). Collapse/expand group. Count + stale indicator per group. Keep card logic. |
| UI-WORK-4: PitchSelector detail pane | `PitchSelector.tsx`, new `PitchDetail.tsx`, `PitchSelector.test.tsx` | 1.5 days | When pitch selected, show detail pane inline (problem / appetite / solution / rabbit holes). Display pitch body. "Press Enter to commit" hint. Keep overlay as-is. |
| UI-WORK-5: Bet detail page | `WorkBet.tsx`, new `BetBodyRenderer.tsx`, `WorkBet.test.tsx` | 3 days | Breadcrumb. Bet header (enriched). Pitch body rendered as markdown. Task table (not cards; sortable columns: title, status, owner, cost). Comment thread below. Heavy composition. |
| **Phase 3 Total** | 6 files | **5–8 days** | **Done when:** Bet detail page renders all sections; Playwright E2E for task table |

**Acceptance criteria:**
- [ ] BetCard shows lead, shipped count, sparkline
- [ ] Kanban groups TaskCards by bet
- [ ] PitchSelector shows detail pane when pitch selected
- [ ] Bet detail: breadcrumb, pitch markdown, task table, comments all render
- [ ] `bun run test` passes; task table keyboard nav tested

---

### Phase 4: Knowledge Surface (8–12 days)

**Goal:** Land scope browser, list grouping, triage view, detail page with edit mode, factory scope.

**Dependency:** Phase 1 (shell) + Tag.kind variant (Phase 0).

**Critical note:** This is the heaviest phase. Consider splitting into two sub-phases if time is tight.

**Story breakdown:**

| Story | Files | Effort | Work |
|-------|-------|--------|------|
| UI-KNOW-1: Scope browser (Submenu) | `KnowledgeList.tsx`, new `ScopeBrowser.tsx`, tests | 2 days | Three-scope segmented control (Practice / Product / Factory). Topic NavItems below with disclosure. Subtopic drill-down. Health dots + gap markers. State in KnowledgeList. |
| UI-KNOW-2: List grouping + Triage tab | `KnowledgeList.tsx`, new `TriageView.tsx`, tests | 2.5 days | KnowledgeGroup wrapper (topic header, collapse, count, stale indicator). Two-tab switcher (Curated / Triage). Triage shows attention-scored items with "Why now" reason line. CurationCard for suggestions. |
| UI-KNOW-3: Kind + Status tags | `Tag.tsx`, `KnowledgeRow.tsx` | 1 day | Use Tag.kind variant for pattern/decision/failure with icons. StatusChip unchanged (already correct). Visual audit: kind (subtle tint + icon), status (color + dot). |
| UI-KNOW-4: Detail page (read) | `KnowledgeDetail.tsx`, `KnowledgeDetail.test.tsx` | 2.5 days | Metadata bar (kind, status, layer, confidence, timestamps, origin agent). Markdown body. Observation log (facilitator-agent pairs + edits). Related items sidebar. Edit history timeline (deferred). |
| UI-KNOW-5: Detail page (edit mode) | `KnowledgeDetail.tsx`, new `KnowledgeEditMode.tsx`, tests | 2 days | Toggle edit via button. In-place edit with toolbar (bold, code, link). Markdown editor (textarea with preview). Save/cancel buttons. Local state, API save deferred. |
| UI-KNOW-6: Factory scope treatment | `KnowledgeRow.tsx`, `Tag.tsx`, banner component | 1.5 days | Factory items: larger row (h-16), serif accent (heavy Space Grotesk weight), version pill (v1.2 badge), "Amendable under review" banner at top of detail page. Styling only. |
| **Phase 4 Total** | 7 files | **8–12 days** | **Done when:** Triage tab renders, edit mode works, factory scope styling applied |

**Acceptance criteria:**
- [ ] Scope browser: all three scopes switch, topics list updates, subtopics drill down
- [ ] Triage: items sorted by attention score, reason lines display
- [ ] Kind tags: pattern/decision/failure each have distinct icon + tint
- [ ] Detail: metadata bar, markdown body, observation log all render
- [ ] Edit mode: toggle works, save/cancel buttons present
- [ ] Factory items: row height larger, version pill visible, banner at top
- [ ] `bun run test` passes

**Sub-phase recommendation (if splitting):**
- **4A (5 days):** Scope browser + list grouping + Triage (Core IA)
- **4B (4 days):** Detail page read + edit + factory scope (Polish)

---

### Phase 5: Validation & Polish (2–3 days)

**Goal:** E2E testing, accessibility, empty/loading states, motion.

**Dependency:** Phases 2, 3, 4 complete.

**Story breakdown:**

| Story | Files | Effort | Work |
|-------|-------|--------|------|
| UI-VAL-1: Playwright E2E suite | E2E test file | 1.5 days | Test: drawer open/close, comment anchoring, triage tab switch, edit toggle, scope browser navigation. 8–10 critical user flows. |
| UI-VAL-2: Accessibility audit | All components | 0.75 days | WCAG 2.1 AA: keyboard nav (Tab, Esc, Arrow keys), focus indicators, ARIA labels (aria-label, aria-current, aria-hidden). Use axe-core in Playwright. |
| UI-VAL-3: Empty/loading/error states | Per-page components | 0.75 days | Skeleton loaders (Conversations list, Work board, Knowledge list). Empty state messaging. Error state fallbacks. DaisyUI `skeleton` component reused. |
| **Phase 5 Total** | 1 file (E2E) | **2–3 days** | **Done when:** Playwright suite passes, axe audit clean, empty states styled |

**Acceptance criteria:**
- [ ] `bun run test` passes (all unit + component tests)
- [ ] Playwright E2E passes (all critical flows)
- [ ] axe-core audit: 0 violations
- [ ] Empty/loading states rendered correctly

---

## 7. CRITICAL DECISIONS & LORE

### 7.1 Blocked = Warning, Not Error

**Decision:** Keep existing `StatusChip` mapping: `blocked = warning (amber)`, not `error (red)`.

**Rationale:** Blocked is "stuck waiting" (recoverable); error is "broken" (intervention required). Synthesis correctly identified this distinction applies across Conversations, Work, and Knowledge.

**Implication:** No code change needed in `StatusChip.tsx`. Update assertions in tests to expect `badge-warning` for blocked states.

---

### 7.2 Settings as Drawer, Not Modal

**Decision:** Right-side drawer instead of modal. Allows Main pane interaction while settings are open.

**Rationale:** Settings is configuration, not a destination. User may want to glance at Main while adjusting a setting.

**Implementation note:** Use Tailwind `group-data-*` or React state to conditionally render drawer. No new library (daisyUI drawer class exists).

---

### 7.3 Semantic Pill Colors When Rail Collapsed

**Decision:** BLK (error), REV (primary), PSD (neutral) — three semantic pills instead of neutral badges.

**Rationale:** At a glance, user learns if something is *blocking* (high urgency) vs. just pending review (lower urgency). Color is the whole point.

**Implementation note:** When `collapsed=true`, render three pill elements with conditional rendering:
```tsx
{blockerCount > 0 && <div className="badge badge-error">BLK {blockerCount}</div>}
{reviewCount > 0 && <div className="badge badge-primary">REV {reviewCount}</div>}
{pausedCount > 0 && <div className="badge badge-neutral">PSD {pausedCount}</div>}
```

---

### 7.4 Attention Score: Show Reason, Hide Number

**Decision:** Display "3 new observations since review" instead of raw score (e.g., `+0.42`).

**Rationale:** The user's decision driver is the *why*, not the *how much*. Numeric scores are implementation detail.

**Implementation note:** Compute attention score server-side, store the driving factor (observations_count, last_review_date, etc.). On Triage render, derive the reason line from these factors, not the score value.

---

### 7.5 No New Fonts; Keep Sans-Serif

**Decision:** Skip serif font for Factory scope. Use heavier Space Grotesk weight instead.

**Rationale:** Minimize dependency count. Size + weight differentiation is sufficient.

**Implementation note:** Factory-scope items use `font-bold` (Space Grotesk 700) instead of default 400/500.

---

## 8. NOT INCLUDED (Deferred)

The following features appear in the synthesis mockups but are explicitly deferred:

| Feature | Why Deferred | Likely Effort |
|---------|------------|---------------|
| Edit history timeline (Knowledge detail) | Requires new data table (`knowledge_edit_log`) | 2 days |
| Observation log edit UI | Requires facilitator-agent attribution system | 3 days |
| Merge/split modals (Knowledge) | Requires server-side logic (merge conflicts, version control) | 5 days |
| Inline edit with full markdown toolbar | Rich editor integration (ProseMirror, CodeMirror) | 4 days |
| Knowledge gap indicators (server-side logic) | Requires analyzer agent or heuristic | 3+ days |
| Sparkline rendering (Portfolio) | Requires chart library (recharts, plotly) | 2 days |

These are all post-synthesis. Ship the synthesis first, then revisit.

---

## 9. VERIFICATION CHECKLIST

Before marking the build complete, verify:

### Tests
- [ ] `bun run test` passes (100% of new code covered)
- [ ] Playwright E2E suite passes (8+ critical flows)
- [ ] `bun run lint` + `bun run check` pass (zero errors/warnings)

### Functionality
- [ ] IconRail 2px indicator + unread dot visible on all views
- [ ] Rail semantic pills visible when collapsed
- [ ] Settings drawer slides in/out, responsive at all breakpoints
- [ ] Command-K groups results, keyboard nav works
- [ ] Reasoning block collapsible, shows all steps
- [ ] ThreadRows grouped by (Pinned / Blocking / Reviews / Chats / Resolved)
- [ ] Comment anchoring in text_diff works (line number preserved)
- [ ] Portfolio shows lead, shipped count, sparkline
- [ ] Kanban TaskCards grouped by bet
- [ ] PitchSelector shows detail pane inline
- [ ] Bet detail: breadcrumb, pitch markdown, task table, comments all present
- [ ] Scope browser: three scopes switch, topics/subtopics drill down
- [ ] Triage tab: items sorted, reason lines display
- [ ] Detail page: edit toggle works, save/cancel buttons present
- [ ] Factory scope: row height larger, version pill visible, banner displays

### Accessibility
- [ ] axe-core audit: 0 violations
- [ ] Keyboard nav: Tab, Arrow keys, Esc all work as expected
- [ ] ARIA labels on all interactive elements
- [ ] Focus indicators visible

### Visual
- [ ] No regressions in existing component rendering
- [ ] Empty/loading/error states styled
- [ ] Motion + transitions smooth (120/200/320ms)
- [ ] Responsive: 1024px and 1280px breakpoints work

---

## CONCLUSION

The design synthesis is **high-quality, well-reasoned, and implementable** within 3–4 weeks of full-stack work (25–31 days of effort, accounting for testing and iteration). Breaking changes are localized to Tier 1 and Tier 3; Tier 4 pages adapt with minimal refactor. No architectural issues detected; all changes respect the three-layer model and existing test infrastructure.

**Recommended approach:** Execute Phase 0 → Phase 1 → (Phases 2, 3, 4 in parallel with team split) → Phase 5. This keeps critical path short (Phase 0 + Phase 1 = ~6 days before parallel work) and ships incremental value (Settings drawer lands early; Knowledge can iterate in parallel with Work).

The synthesis is **ready for implementation.**

---

**Document Version:** 1.0  
**Last Updated:** April 19, 2026  
**Status:** Ready for Work Package Generation
