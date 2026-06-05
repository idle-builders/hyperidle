# Y4 Architecture: Knowledge Triage Improvements

---

## 1. Scope

Refine the existing knowledge triage tab with four changes:
1. Server-side attention score in API response; client-side sort by attention in triage.
2. `needs_human` status support in kernel + triage filter.
3. Sidebar count badge for pending triage items.
4. Rapid processing: inline actions, keyboard navigation, auto-advance.

No new routes/pages. No new design-system primitives. No migrations (status column is text, no DB enum).

---

## 2. Schema changes

### 2.1 Kernel status widening

**File:** `packages/shared/src/types.ts`

The `KERNEL_KNOWLEDGE_STATUSES` array gains `"needs_human"`:

```ts
export const KERNEL_KNOWLEDGE_STATUSES = ["draft", "active", "archived", "needs_human"] as const;
```

This affects:
- `KernelKnowledgeStatus` type (auto-derived from the const).
- The route validation schema in `packages/server/src/routes/knowledge.ts` which uses a local `KNOWLEDGE_STATUSES` array -- must be updated to include `"needs_human"`.

**No DB migration needed.** The `status` column is `text()` in Drizzle with no CHECK constraint. Adding a new string value requires no schema change. The index `ki_status_idx` on `status` remains valid.

### 2.2 Attention score in API response

**File:** `packages/server/src/routes/knowledge.ts` -- GET `/` handler.

The existing LEFT JOIN to `knowledgeStrategyFabric` already selects `relevanceScore`. Add `attentionScore` to the select:

```ts
const rawItems = await db
  .select({
    item: knowledgeItems,
    relevanceScore: knowledgeStrategyFabric.relevanceScore,
    attentionScore: knowledgeStrategyFabric.attentionScore,
  })
  .from(knowledgeItems)
  .leftJoin(/* ... existing ... */);
```

The response mapping adds `attentionScore` to signals:

```ts
signals: {
  lastActivityAt,
  accessCount30d,
  citationCount: null,
  relevanceScore: relevanceScore ?? null,
  attentionScore: attentionScore ? parseFloat(attentionScore) : null,
}
```

Note: `attentionScore` is stored as `text` in the DB (per schema). Parse to number in the API response.

---

## 3. API changes

### 3.1 GET /api/knowledge -- response shape change

**Current signals shape:**
```ts
signals: {
  lastActivityAt: string | null;
  accessCount30d: number | null;
  citationCount: number | null;
  relevanceScore: number | null;
}
```

**New signals shape:**
```ts
signals: {
  lastActivityAt: string | null;
  accessCount30d: number | null;
  citationCount: number | null;
  relevanceScore: number | null;
  attentionScore: number | null;  // NEW
}
```

No query parameter changes. The full list is returned; the client filters by status.

### 3.2 GET /api/knowledge/triage-count (NEW endpoint)

**File:** `packages/server/src/routes/knowledge.ts`

Lightweight count endpoint for the sidebar badge. Returns the number of items with `status IN ('draft', 'needs_human')`.

```ts
router.get("/triage-count", async (c) => {
  const userId = c.get("userId");
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(knowledgeItems)
    .where(
      and(
        inArray(knowledgeItems.status, ["draft", "needs_human"]),
        or(
          ne(knowledgeItems.scopeKind, "user"),
          eq(knowledgeItems.updatedBy, userId),
        ),
      ),
    );
  return c.json({ count: result?.count ?? 0 });
});
```

**Route registration order:** Must be registered before `/:id` to avoid route conflict (same pattern as `/search`).

**Response:** `{ count: number }`

### 3.3 PATCH /api/knowledge/:id -- accept `needs_human` status

**File:** `packages/server/src/routes/knowledge.ts`

The `updateKnowledgeSchema` already accepts `z.enum(KNOWLEDGE_STATUSES)` for status. The local `KNOWLEDGE_STATUSES` array needs to include `"needs_human"`:

```ts
const KNOWLEDGE_STATUSES = ["draft", "active", "archived", "needs_human"] as const;
```

---

## 4. Frontend changes

### 4.1 KnowledgeList.tsx -- triage filter widening

**File:** `packages/web/src/pages/KnowledgeList.tsx`

**Current triage filter (line 567):**
```ts
allItems.filter((i) => i.status === "draft")
```

**New triage filter:**
```ts
allItems.filter((i) => i.status === "draft" || i.status === "needs_human")
```

### 4.2 KnowledgeList.tsx -- attention score sort

**Current `sortApiItems` function:** handles `relevance`, `recency`, `frequency`.

**Change:** When in triage tab, the default sort uses attention score (descending) rather than relevance score. The `sortApiItems` function does not need a new sort option; instead, the triage tab's `useMemo` for `triageItems` sorts by `attentionScore` directly:

```ts
const triageItems = useMemo<ApiKnowledgeItem[]>(
  () => {
    const filtered = allItems.filter(
      (i) => i.status === "draft" || i.status === "needs_human"
    );
    // Sort by attention score descending (highest priority first)
    return filtered.sort((a, b) => {
      const aScore = a.signals?.attentionScore ?? 0;
      const bScore = b.signals?.attentionScore ?? 0;
      const primary = bScore - aScore;
      return primary !== 0 ? primary : a.id.localeCompare(b.id);
    });
  },
  [allItems],
);
```

The sort bar still works for override (relevance/recency/frequency) when the user explicitly selects one. The default triage order is attention-based. This is accomplished by:
- When `tab === "triage"` and no explicit sort is set, use attention score order.
- When the user clicks a sort option, apply that sort to triage items too.

### 4.3 ApiKnowledgeItem interface -- attentionScore

**File:** `packages/web/src/pages/KnowledgeList.tsx`

```ts
interface ApiKnowledgeItem {
  // ... existing fields ...
  signals?: {
    lastActivityAt?: string | null;
    accessCount30d?: number | null;
    citationCount?: number | null;
    relevanceScore?: number | null;
    attentionScore?: number | null;  // NEW
  } | null;
}
```

### 4.4 KnowledgeListRow -- inline actions + attention score

**File:** `packages/web/src/pages/KnowledgeList.tsx`

The `KnowledgeListRow` component gains:

**New props:**
```ts
interface KnowledgeListRowProps {
  // ... existing ...
  attentionScore?: number | null;   // NEW: displayed as pill
  isFocused?: boolean;              // NEW: keyboard focus highlight
  showActions?: boolean;            // NEW: show inline action buttons
  onValidate?: () => void;          // NEW
  onReject?: () => void;            // NEW
  onOpen?: () => void;              // NEW (replaces onClick in triage)
}
```

**Attention score pill:** Rendered before the timestamp, conditionally based on score value:
- `>= 0.7`: amber background pill with percentage.
- `>= 0.4`: neutral background pill with percentage.
- `< 0.4` or null: no pill.

**Action buttons:** Three small icon buttons, visible on hover or when focused. Positioned after the badges, before the timestamp:
- Validate (checkmark): calls `onValidate`.
- Reject (X): calls `onReject`.
- Open (arrow-right): calls `onOpen`.

Buttons use minimal SVG icons (16x16), `var(--text-tertiary)` color, `var(--text-primary)` on hover. Touch targets: 24px (desktop exempt from 44px per AQ-015 -- these are visible on hover only on desktop).

**Focus highlight:** When `isFocused`, the row gets `bg-[rgba(44,36,26,0.04)]` background.

### 4.5 KnowledgeListContent -- keyboard navigation + auto-advance

**File:** `packages/web/src/pages/KnowledgeList.tsx`

**New state:**
```ts
const [focusedIndex, setFocusedIndex] = useState<number>(-1);
```

**Keyboard handler:** `useEffect` with `keydown` listener when `tab === "triage"` and items exist:

```ts
useEffect(() => {
  if (tab !== "triage" || filteredTriageItems.length === 0) return;
  const handler = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
    
    switch (e.key) {
      case "j":
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex(prev => Math.min(prev + 1, filteredTriageItems.length - 1));
        break;
      case "k":
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex(prev => Math.max(prev - 1, 0));
        break;
      case "v":
        if (focusedIndex >= 0) handleValidate(filteredTriageItems[focusedIndex].id);
        break;
      case "x":
        if (focusedIndex >= 0) handleReject(filteredTriageItems[focusedIndex].id);
        break;
      case "Enter":
      case "o":
        if (focusedIndex >= 0) onNavigate(filteredTriageItems[focusedIndex].id);
        break;
      case "Escape":
        setFocusedIndex(-1);
        break;
    }
  };
  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}, [tab, filteredTriageItems, focusedIndex]);
```

Note: the keyboard handler checks for input/textarea focus to avoid conflicts with the search bar.

**Auto-advance:** `handleValidate` and `handleReject` call PATCH /api/knowledge/:id to update status, then trigger a refetch (via `useFetch` invalidation or optimistic removal from the list). The `focusedIndex` stays at the same position (the next item slides up).

### 4.6 Action handlers -- PATCH calls

**File:** `packages/web/src/pages/KnowledgeList.tsx`

New functions in KnowledgeList (or KnowledgeListContent):

```ts
async function handleTriageAction(itemId: string, newStatus: "active" | "archived"): Promise<void> {
  const item = allItems.find(i => i.id === itemId);
  if (!item) return;
  await fetch(`/api/knowledge/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      version: item.version,
      updatedBy: userId,
      status: newStatus,
    }),
  });
  // Trigger refetch or optimistic removal
}
```

**Optimistic update vs refetch:** For rapid processing, optimistic removal is better UX (no loading flash between items). The item is removed from the local `allItems` array immediately, and a background PATCH is fired. If the PATCH fails (e.g., version conflict), a toast surfaces the error and the item reappears on next fetch.

This requires converting `allItems` from a derived `useMemo` to managed state that can be optimistically updated:

```ts
const [optimisticRemovals, setOptimisticRemovals] = useState<Set<string>>(new Set());

const triageItems = useMemo(() => {
  return allItems
    .filter(i => 
      (i.status === "draft" || i.status === "needs_human") &&
      !optimisticRemovals.has(i.id)
    )
    .sort(/* attention score */);
}, [allItems, optimisticRemovals]);
```

### 4.7 Keyboard hint bar

**File:** `packages/web/src/pages/KnowledgeList.tsx`

Rendered between the sort bar and the triage item list when `tab === "triage"` and items exist:

```tsx
{tab === "triage" && filteredTriageItems.length > 0 && (
  <div className="flex items-center gap-[12px] px-[24px] py-[6px] text-[11px] font-[family-name:var(--font-mono)] text-[var(--text-tertiary)]">
    <span><kbd>j</kbd>/<kbd>k</kbd> navigate</span>
    <span><kbd>v</kbd> validate</span>
    <span><kbd>x</kbd> reject</span>
    <span><kbd>Enter</kbd> open</span>
  </div>
)}
```

`<kbd>` elements styled with the same pattern as the sidebar search hint: `px-[6px] py-[2px] rounded-[4px] bg-[var(--surface-container)] text-[11px] font-mono border border-[var(--border-subtle)]`.

### 4.8 Sidebar badge

**File:** `packages/web/src/shell/Sidebar.tsx`

**SidebarProps addition:**
```ts
export interface SidebarProps {
  // ... existing ...
  knowledgeTriageCount?: number;  // NEW
}
```

**SectionHeader change:** The knowledge section header renders the badge:

```tsx
{view === "knowledge" && knowledgeTriageCount != null && knowledgeTriageCount > 0 && (
  <span
    className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[9px] font-[600] tabular-nums bg-[var(--accent-primary)] text-[var(--text-on-accent)] ml-auto"
    data-testid="knowledge-triage-badge"
  >
    {knowledgeTriageCount > 99 ? "99+" : knowledgeTriageCount}
  </span>
)}
```

**SectionHeader props change:** SectionHeader needs access to `knowledgeTriageCount`. Two options:
- Pass it through SectionHeader props (cleanest).
- Render the badge outside SectionHeader in the Sidebar (avoids changing SectionHeader interface for one case).

Decision: Render in Sidebar directly, wrapping the SectionHeader for knowledge in a flex container. This avoids polluting the generic SectionHeader with knowledge-specific concerns.

### 4.9 AppShell -- triage count data flow

**File:** `packages/web/src/layouts/AppShell.tsx`

Add a `useFetch` call for the triage count:

```ts
const { data: triageCountData } = useFetch<{ count: number }>("/api/knowledge/triage-count");
const knowledgeTriageCount = triageCountData?.count ?? 0;
```

Pass to Sidebar:

```tsx
<Sidebar
  // ... existing props ...
  knowledgeTriageCount={knowledgeTriageCount}
/>
```

**Refetch on triage action:** When a triage action occurs in KnowledgeList, the triage count needs to update. Options:
1. Use a shared refetch trigger (context or callback).
2. Use SWR-style revalidation (refetch on focus).
3. Decrement optimistically in AppShell when notified.

Decision: Option 2 is simplest with the existing `useFetch` hook. The badge updates when the user navigates away and back, or on focus. For immediate updates, the AppShell can re-fetch triage-count on `knowledge_updated` websocket events (if WS is wired) or the KnowledgeList can call a callback. For Y4 scope, focus-based revalidation is sufficient.

### 4.10 `toKnowledgeStatus` update

**File:** `packages/web/src/pages/KnowledgeList.tsx`

The `toKnowledgeStatus` function maps API status strings to the `KnowledgeStatus` type. Currently maps `draft` to `captured` (the fabric status). It needs to handle `needs_human`:

```ts
function toKnowledgeStatus(apiStatus: string): KnowledgeStatus {
  switch (apiStatus) {
    case "active": return "active";
    case "archived": return "archived";
    case "needs_human": return "needs_human";
    default: return "captured";
  }
}
```

---

## 5. File change summary

| File | Change | Scope |
|------|--------|-------|
| `packages/shared/src/types.ts` | Add `"needs_human"` to `KERNEL_KNOWLEDGE_STATUSES` | Type |
| `packages/server/src/routes/knowledge.ts` | Add `"needs_human"` to local statuses; add `attentionScore` to GET / response; add GET /triage-count | API |
| `packages/web/src/pages/KnowledgeList.tsx` | Widen triage filter; attention sort; inline actions; keyboard nav; focus tracking; hint bar; optimistic removal; attentionScore in signals type | UI |
| `packages/web/src/shell/Sidebar.tsx` | Add `knowledgeTriageCount` prop; render badge on knowledge section | UI |
| `packages/web/src/layouts/AppShell.tsx` | Fetch triage count; pass to Sidebar | Data flow |

---

## 6. Ordered tasks

### Task 1: Schema + API (backend)

1. **T1a:** Add `"needs_human"` to `KERNEL_KNOWLEDGE_STATUSES` in `packages/shared/src/types.ts`.
2. **T1b:** Update `KNOWLEDGE_STATUSES` in `packages/server/src/routes/knowledge.ts` to include `"needs_human"`.
3. **T1c:** Add `attentionScore` to the GET `/` handler's select and response mapping.
4. **T1d:** Add GET `/triage-count` endpoint (before `/:id` route registration).
5. **T1e:** Write/update server tests for new status, attentionScore in response, and triage-count endpoint.

### Task 2: Sidebar badge (frontend)

1. **T2a:** Add `knowledgeTriageCount` prop to `SidebarProps` in `packages/web/src/shell/Sidebar.tsx`.
2. **T2b:** Render badge on knowledge section header.
3. **T2c:** Add `useFetch` for `/api/knowledge/triage-count` in `AppShell.tsx`; pass count to Sidebar.
4. **T2d:** Write/update Sidebar and AppShell tests for badge rendering and count states.

### Task 3: Triage tab improvements (frontend)

1. **T3a:** Widen triage filter in `KnowledgeList.tsx` to include `needs_human`.
2. **T3b:** Add `attentionScore` to `ApiKnowledgeItem.signals` interface.
3. **T3c:** Update `triageItems` sort to use attention score (descending) as default.
4. **T3d:** Add attention score pill to `KnowledgeListRow`.
5. **T3e:** Update `toKnowledgeStatus` to handle `needs_human`.
6. **T3f:** Write/update KnowledgeList tests for widened filter, sort order, and attention display.

### Task 4: Rapid processing (frontend)

1. **T4a:** Add inline action buttons to `KnowledgeListRow` (validate, reject, open).
2. **T4b:** Add keyboard navigation handler (j/k/v/x/Enter/Escape) to triage tab.
3. **T4c:** Add `focusedIndex` state and focus highlight styling.
4. **T4d:** Implement `handleTriageAction` with optimistic removal.
5. **T4e:** Add keyboard hint bar.
6. **T4f:** Write/update KnowledgeList tests for keyboard nav, actions, auto-advance.

### Task 5: Integration verification

1. **T5a:** Run `npm run check` -- zero type errors.
2. **T5b:** Run `npm run lint` -- zero lint errors.
3. **T5c:** Run `npm run test` -- all green.

---

## 7. Risks and mitigations

**Risk 1: `needs_human` in kernel statuses.** All code that switches on kernel status needs auditing. Mitigated by: the status column is text, existing code uses string equality checks (not exhaustive switch), and the only place that enumerates all statuses is the route validation schema (updated in T1b).

**Risk 2: Optimistic removal race condition.** If a PATCH fails after optimistic removal, the item disappears from the UI. Mitigated by: re-adding the item on error and showing a toast. The `optimisticRemovals` set is cleared on refetch.

**Risk 3: Keyboard shortcut conflicts.** The `v` and `x` keys might conflict with text input in the search bar. Mitigated by: the keyboard handler checks if the active element is an input/textarea/contentEditable and skips if so.

**Risk 4: Triage count endpoint performance.** A COUNT query on the knowledge_items table with status filter is efficient (uses `ki_status_idx` index). No risk at current data volumes.

---

## 8. Out of scope (per workpackage spec)

- Review assignment
- AI-assisted authoring during review
- Batch operations (select multiple, bulk validate/reject)
- WebSocket-based live count updates
- Sort by attention as a permanent sort option in the sort bar

---

## 9. Self-critique

**What could go wrong:**
1. The `useFetch` hook might not support revalidation on focus. If not, the triage count badge will be stale until page refresh. Verify `useFetch` API before implementation.
2. The optimistic removal pattern adds state complexity. If `useFetch` already supports optimistic updates or mutation, use that instead of a manual `optimisticRemovals` set.
3. The keyboard hint bar adds visual noise. Monitor and remove if feedback indicates it's not useful.

**What's missing:**
- No animation spec for item removal. The design says "fades out with motion-fast" but the exact CSS transition needs implementation detail. Keep it simple: `opacity 0 -> remove from DOM after transition`.
- No consideration of list virtualization. At <100 triage items, DOM list is fine. If triage grows large, virtualization would be needed but is out of scope.

**What's good:**
- Zero new design-system primitives. Zero migrations. Zero new pages/routes (triage-count is a sub-route of existing knowledge routes).
- Attention score sort is the right default for triage. Users who want a different sort can override.
- Keyboard shortcuts match established triage UI patterns (Gmail, Linear).
