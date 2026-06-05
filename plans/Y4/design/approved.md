# Y4 Design: Knowledge Triage Improvements

**Classification: Routine** -- refining an existing tab within the existing component family. No new pages, no new design-system primitives.

---

## 1. Design problem statement

A human reviewer opens the Knowledge section to triage items that need human judgment. Today they see draft items in arbitrary order, have no indication of how many items await them before navigating there, and must click back to the list after processing each item. The triage workflow should feel like an email inbox: badge shows count, items sorted by priority, processing one surfaces the next.

---

## 2. Variant A: Inline triage refinement (SELECTED)

This is the only variant because the workpackage explicitly requires refinement of the existing triage tab, not a new page. The "did we consider" section below covers alternatives that were evaluated and rejected.

### 2.1 Sidebar count badge

**Where:** On the "Knowledge" section header in the Sidebar, inline after the label text.

**What:** A small numeric badge showing the count of items that need triage (status `draft` or `needs_human`). The badge is a `<span>` element rendered inside the existing `SectionHeader` button, after the label text. It uses the following visual treatment:

- Font: 9px (AQ-004 floor for count badges), font-weight 600, tabular-nums.
- Background: `var(--accent-primary)` (forest green).
- Text: `var(--text-on-accent)` (white/cream).
- Shape: `rounded-full`, min-width 18px, height 18px, centered text.
- Padding: 0 horizontal (circular for 1-2 digits), grows naturally for 3+ digits.
- Hidden when count is 0 (no badge, not "0").

**Data flow:** AppShell already fetches knowledge items for thread routing. The triage count is a lightweight dedicated endpoint (GET /api/knowledge/triage-count) returning `{ count: number }` rather than re-fetching the full list. This avoids doubling the full list query on every AppShell render.

**Props change:** `SidebarProps` gains `knowledgeTriageCount?: number`. The `SectionHeader` for "knowledge" renders the badge when count > 0.

### 2.2 Attention-score ordering in triage tab

**Current behavior:** Triage tab filters `status === "draft"` then sorts by the selected sort option (relevance/recency/frequency). Relevance sorts by `signals.relevanceScore`.

**New behavior:** Triage tab filters `status === "draft" || status === "needs_human"`. The existing `relevance` sort already uses `relevanceScore` from the fabric; the backend needs to also return `attentionScore` so the triage tab can sort by it. The default sort for the triage tab changes from `relevance` to `attention` (a new sort option that only appears in triage context).

However, to avoid adding a sort option that only exists in one context, a simpler approach: the API returns triage items pre-sorted by attention score (descending). The triage tab uses server-provided order rather than client-side re-sorting. This is cleaner because:

1. Attention score ordering is the ONLY sensible default for triage (the whole point is surfacing what needs attention first).
2. The sort bar (relevance/recency/frequency) still works for override, but the default triage order is attention-based.
3. No new sort option in the shared type -- avoids touching KNOWLEDGE_SORT_OPTIONS.

**API change:** The GET /api/knowledge endpoint gains a `?tab=triage` query parameter. When present, the response filters to `status IN ('draft', 'needs_human')` and orders by `knowledgeStrategyFabric.attentionScore DESC NULLS LAST`. This keeps the client simple -- it receives items in the right order.

**Frontend change:** The `useFetch` call in KnowledgeList passes `?tab=triage` when the triage tab is active (or passes no param for the curated tab, which returns active items). Alternatively, a single fetch returns all items and the frontend filters + sorts. The current pattern fetches all items once; changing to tab-specific fetches would mean two fetches on tab switch.

**Decision:** Keep the single fetch (GET /api/knowledge returns all items). Add `attentionScore` to the API response signals. The triage tab sorts by attention score client-side (highest first), falling back to the existing sort options. This preserves the current data flow and avoids extra network requests.

The `ApiKnowledgeItem.signals` interface gains `attentionScore?: number | null`. The `sortApiItems` function gains handling for `attention` as a sort mode. When `tab === "triage"`, the default sort is by attention score descending.

### 2.3 `needs_human` status inclusion

**Current triage filter:** `i.status === "draft"`.

**New triage filter:** `i.status === "draft" || i.status === "needs_human"`.

**Schema concern:** The kernel DB uses 3 statuses (`draft`, `active`, `archived`). `needs_human` is a fabric-layer concept. Two options:

A) Add `needs_human` to the kernel DB status column. Simplest -- the triage query just filters on status.
B) Keep `needs_human` in fabric only, store it in `knowledgeStrategyFabric.meta` or a dedicated column.

**Decision:** Option A. The kernel already accepts arbitrary strings in the status column (text type, no DB enum constraint). The route validation schema (`z.enum(KNOWLEDGE_STATUSES)`) needs to accept `needs_human`. Adding it to `KERNEL_KNOWLEDGE_STATUSES` is the right call because `needs_human` is a lifecycle state that directly affects what appears in the human interface -- it belongs in the kernel, not hidden in strategy metadata.

### 2.4 Rapid processing UX

The reviewer wants to validate, reject, or defer items without friction. Three interaction requirements:

**A) Auto-advance after action.** When the reviewer takes an action (validate = set status to `active`, reject = set status to `archived`, defer = leave as `draft` and move to next), the list automatically highlights/scrolls to the next item. This happens in the KnowledgeList triage view -- no navigation to KnowledgeDetail is needed for the primary actions.

**B) Inline action buttons on triage rows.** Each triage row gets action buttons visible on hover (desktop) or always visible (mobile). Actions:

- **Validate** (checkmark icon): PATCH status to `active`, remove from triage list, advance to next.
- **Reject** (X icon): PATCH status to `archived`, remove from triage list, advance to next.
- **Open** (arrow icon): navigate to KnowledgeDetail for full review.

No "defer" button -- the item stays in triage by default. Skipping is just moving focus to the next item.

**C) Keyboard navigation.** When the triage tab is focused:

- `j` / `ArrowDown`: move focus to next item.
- `k` / `ArrowUp`: move focus to previous item.
- `v`: validate focused item (status -> active).
- `x`: reject focused item (status -> archived).
- `Enter` / `o`: open focused item in detail view.
- `Escape`: clear focus.

Focus is tracked via a `focusedIndex` state. The focused row gets a visual highlight (subtle background change: `bg-[rgba(44,36,26,0.04)]`). After an action removes an item, focus stays at the same index (next item slides into position).

**D) Keyboard hint.** A subtle hint bar below the sort bar in triage mode: `j/k navigate  v validate  x reject  Enter open`. Text style: 11px, `var(--text-tertiary)`, font-mono. Only shown when triage tab is active and there are items.

### 2.5 Attention score display on triage rows

Each triage row displays the attention score as a small pill on the right side, before the timestamp. Visual treatment:

- Score as percentage: "87%" format.
- Color coding:
  - Score >= 0.7: `var(--accent-secondary)` background (amber -- high attention, needs action).
  - Score >= 0.4 and < 0.7: `var(--surface-container)` background, `var(--text-secondary)` text.
  - Score < 0.4 or null: no pill shown (low priority items still appear but without score emphasis).
- Font: 11px, font-weight 500, tabular-nums.
- Shape: `rounded-[var(--r-pill)]`, px-[6px] py-[2px].

---

## 3. Did we consider

### 3a. Dedicated triage page (rejected)

A full-page triage experience with split view (list on left, preview on right). Rejected because:
- Violates the constraint "refinement, not replacement."
- Adds a new route and page component.
- The inline triage with keyboard shortcuts achieves the same throughput without the page overhead.

### 3b. Sort dropdown instead of keyboard shortcuts (rejected)

Adding "Attention" to the existing sort bar and relying on mouse-based row clicking. Rejected because:
- The workpackage explicitly calls for "rapid processing without friction."
- Mouse navigation between list and action buttons is slower than keyboard shortcuts.
- A sort option doesn't address auto-advance.

### 3c. Notification/toast instead of sidebar badge (rejected)

Surfacing triage count via toast notifications. Rejected because:
- Toasts are ephemeral -- the user needs persistent visibility.
- The sidebar badge is always visible and matches the "see at a glance" AC.

### 3d. `needs_human` as fabric-only metadata (rejected)

Storing `needs_human` in `knowledgeStrategyFabric.meta` rather than the kernel status column. Rejected because:
- The triage query would need a JOIN + JSON extraction, adding complexity.
- `needs_human` is a lifecycle state (it determines what appears in the human interface), which is a kernel concern.
- The kernel status column is a text field with no DB enum constraint, so adding a value is zero-migration-cost.

---

## 4. Component inventory

No new design-system primitives needed. All UI changes compose from:

- **Sidebar** (Tier 3 shell composition): add badge span to SectionHeader.
- **KnowledgeListRow** (page-local inline component): add action buttons, attention score pill, focus styling.
- **KnowledgeListContent** (page-local): add keyboard handler, focus tracking, keyboard hint bar.
- DaisyUI primitives for buttons (action icons).

Component budget impact: 0 new custom components.

---

## 5. States

### Sidebar badge
- **0 items:** Badge hidden (not rendered).
- **1-99 items:** Badge shows number.
- **100+ items:** Badge shows "99+".
- **Loading:** Badge hidden (conservative -- don't flash stale counts).
- **Error:** Badge hidden.

### Triage tab
- **Empty:** "Nothing needs attention" empty state (existing).
- **Loading:** Skeleton list (existing).
- **Error:** Error state (existing).
- **Populated, no focus:** Items listed by attention score, hover reveals action buttons.
- **Populated, focused:** Active item has highlight background, keyboard shortcuts active.

### After action (validate/reject)
- Item fades out with `var(--motion-fast)` (120ms) opacity transition.
- Focus advances to the next item at the same index.
- Badge count decrements.
- If last item processed, show empty state.

---

## 6. Self-critique

**Strengths:**
- Minimal surface area change: one badge, sort order, filter widening, inline actions.
- Keyboard shortcuts match established patterns (vim-like j/k, common in triage UIs).
- No new design-system primitives, no new pages, no new routes.

**Weaknesses:**
- Keyboard shortcuts require discoverability (mitigated by the hint bar).
- The action buttons on hover may be hard to discover on first use (mitigated by keyboard hint).
- Attention score display on rows adds visual density -- acceptable for power users but worth monitoring.

**Risk:**
- `needs_human` addition to kernel statuses widens the status enum. All existing code that switches on status needs auditing. Mitigation: the kernel status validation schema (`KNOWLEDGE_STATUSES` in the route) already accepts the 3 kernel values; adding a 4th is a controlled change. The `toKnowledgeStatus` function in KnowledgeList maps unknown statuses to `captured`, which needs updating.
