# AD6 Architecture: Knowledge Cleanup & Scope Simplification

## 1. Summary

Presentation-layer changes only. No schema migrations, no new tables, no new API endpoints. The backend `scopeKind` enum (7 values) and `kind` field (8 values on strategy fabric) remain unchanged. Changes are scoped to:

1. `packages/web/src/pages/KnowledgeList.tsx` — static scope pills, remove kind badge
2. `packages/web/src/pages/KnowledgeDetail.tsx` — wire archive, simplify metadata, remove flag
3. `packages/web/src/pages/KnowledgeCreate.tsx` — 3-option scope picker, remove kind selector
4. `packages/web/src/pages/knowledge/KnowledgeCreateDialog.tsx` — same 3-option picker
5. Test files updated to match new behavior

---

## 2. Scope Pill Mapping

### 2.1 Type definition (shared utility)

Create a utility mapping in `packages/web/src/utils/scope-labels.ts`:

```typescript
/**
 * Maps user-facing scope pill labels to backend scopeKind values.
 * Used by KnowledgeList (filter) and KnowledgeCreate (picker).
 */
export const SCOPE_PILL_OPTIONS = [
  { label: "All", filter: null },
  { label: "Shared", filter: ["factory", "product", "practice"] },
  { label: "Team", filter: ["team"] },
  { label: "Private", filter: ["user"] },
] as const;

export type ScopePillLabel = (typeof SCOPE_PILL_OPTIONS)[number]["label"];

/**
 * Maps a user-facing scope pill selection to the backend scopeKind for creation.
 */
export const SCOPE_CREATE_OPTIONS = [
  { label: "Shared", scopeKind: "factory" as const, needsScopeId: false },
  { label: "Team", scopeKind: "team" as const, needsScopeId: true },
  { label: "Private", scopeKind: "user" as const, needsScopeId: false },
] as const;

/**
 * Returns the user-facing label for a backend scopeKind.
 * Used in KnowledgeDetail metadata aside.
 */
export function scopeKindToLabel(scopeKind: string): string {
  if (scopeKind === "user") return "Private";
  if (scopeKind === "team") return "Team";
  // factory, product, practice all map to "Shared"
  return "Shared";
}
```

### 2.2 List filtering logic

In `KnowledgeList.tsx`, replace the dynamic `scopeOptions` derivation:

**Current:**
```typescript
const scopeOptions = useMemo<string[]>(() => {
  const seen = new Set<string>();
  for (const item of allItems) {
    if (item.scopeKind && item.scopeKind !== "user") {
      seen.add(item.scopeKind);
    }
  }
  return Array.from(seen).sort();
}, [allItems]);
```

**New:**
```typescript
// Static scope pill options — no longer data-driven
const scopeFilterOptions = SCOPE_PILL_OPTIONS;
```

The `selectedScopeFilter` state changes from `string | null` to `ScopePillLabel | null`. Filter logic:

```typescript
const filteredByScope = useMemo(() => {
  if (!selectedScopeFilter) return allItems; // "All" — no filter
  const option = SCOPE_PILL_OPTIONS.find(o => o.label === selectedScopeFilter);
  if (!option || option.filter === null) return allItems;
  return allItems.filter(item => option.filter.includes(item.scopeKind as any));
}, [allItems, selectedScopeFilter]);
```

This filtered set feeds into both `triageItems` and `curatedItems` derivation.

---

## 3. KnowledgeList changes

### 3.1 Scope pills render

Replace the dynamic `{scopeOptions.map(...)}` block with a static render of `SCOPE_PILL_OPTIONS`:

```tsx
{SCOPE_PILL_OPTIONS.map((option) => {
  const isActive = selectedScopeFilter === option.label
    || (option.filter === null && selectedScopeFilter === null);
  return (
    <button
      key={option.label}
      type="button"
      data-testid={`scope-pill-${option.label.toLowerCase()}`}
      data-active={isActive ? "true" : "false"}
      className={isActive ? activeClass : inactiveClass}
      onClick={() => onScopeFilterChange(
        option.filter === null ? null : option.label
      )}
    >
      {option.label}
    </button>
  );
})}
```

Test IDs change: `scope-pill-all`, `scope-pill-shared`, `scope-pill-team`, `scope-pill-private`. The old dynamic IDs (`scope-pill-practice`, `scope-pill-factory`, `scope-pill-product`) are removed.

### 3.2 Kind badge removal from rows

In the `KnowledgeListRow` component, remove the `kind` badge rendering block:

```tsx
// REMOVE:
{kind && kStyle && (
  <span ... data-testid="kind-badge">{kind}</span>
)}
```

The `kind` prop stays in the interface (not a breaking change to callers) but is not rendered.

### 3.3 Scope filter application

The scope filter must apply BEFORE the triage/curated split:

```
allItems → filteredByScope → triageItems (status filter)
allItems → filteredByScope → curatedItems (status filter) → grouped (topic grouping)
```

---

## 4. KnowledgeDetail changes

### 4.1 Overflow menu reduction

`KnowledgeOverflowMenu` changes from 3 items to 2:

```tsx
function KnowledgeOverflowMenu({
  overflowOpen,
  overflowRef,
  onToggle,
  onArchive,
  onChangeScope,
}: {
  overflowOpen: boolean;
  overflowRef: React.RefObject<HTMLDivElement | null>;
  onToggle: () => void;
  onArchive: () => void;
  onChangeScope: () => void;
}): JSX.Element {
  // Remove onFlag prop entirely
  // Menu items: Archive, Change scope
}
```

### 4.2 Archive wiring

In `KnowledgeDetailView`, add archive handler:

```typescript
const navigate = useNavigate(); // already imported via react-router-dom

const [archiveError, setArchiveError] = useState<string | null>(null);

async function handleArchive(): Promise<void> {
  setOverflowOpen(false);
  const res = await apiFetch(
    `/api/knowledge/${encodeURIComponent(effectiveKnowledgeId)}/archive`,
    { method: "POST" }
  );
  if (!res.ok) {
    setArchiveError("Could not archive item. Try again.");
    return;
  }
  navigate("/knowledge");
}
```

The archive error renders as an inline banner (same shape as `conflictVersion` banner):

```tsx
{archiveError && (
  <div role="alert" className="flex items-center justify-between gap-2 px-[12px] py-[9px] ...">
    <span>{archiveError}</span>
    <button onClick={() => setArchiveError(null)}>Dismiss</button>
  </div>
)}
```

### 4.3 Metadata bar simplification

Remove `Tag(kind)` and `Tag(layer)` from the header metadata bar:

**Current:**
```tsx
<Tag label={item.kind} />
<StatusChip status={knowledgeStatusToStatus(item.status)} />
<Tag label={item.layer} />
<span>confidence ...</span>
<span>by ...</span>
<span>timestamp</span>
```

**New:**
```tsx
<StatusChip status={knowledgeStatusToStatus(item.status)} />
<span>confidence ...</span>
<span>by ...</span>
<span>timestamp</span>
```

### 4.4 Metadata aside — add Scope row

Add a "Scope" row to the metadata card, between Kind and Status:

```tsx
<div className="flex justify-between items-center py-[6px] border-b ...">
  <span className="text-[var(--text-tertiary)]">Scope</span>
  <span className="text-[var(--text-primary)] font-[500]">
    {scopeKindToLabel(item.scopeKind ?? "factory")}
  </span>
</div>
```

---

## 5. KnowledgeCreate changes

### 5.1 Remove kind selector

Delete the entire "Kind" section from the metadata aside:
- Remove `KNOWLEDGE_KINDS` constant
- Remove `kind` state
- Remove the kind `<select>`

The create payload no longer includes `kind` (it was never validated by the server schema anyway — `createKnowledgeSchema` does not have a `kind` field).

### 5.2 Replace scope dropdown with 3-pill segmented control

Replace the `SCOPE_KINDS.map(...)` `<select>` with:

```tsx
<div className="flex flex-col gap-[6px]">
  <span className="text-[12px] font-[600] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
    Scope
  </span>
  <div
    role="radiogroup"
    aria-label="Scope"
    className="flex gap-[6px]"
  >
    {SCOPE_CREATE_OPTIONS.map((option) => {
      const isActive = scopeKind === option.scopeKind;
      const isDisabled = option.scopeKind === "team" && !userTeamId;
      return (
        <button
          key={option.label}
          type="button"
          role="radio"
          aria-checked={isActive}
          aria-disabled={isDisabled || undefined}
          data-testid={`scope-create-${option.label.toLowerCase()}`}
          className={isActive ? activePillClass : inactivePillClass}
          style={isDisabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
          onClick={() => {
            if (isDisabled) return;
            setScopeKind(option.scopeKind);
          }}
        >
          {option.label}
        </button>
      );
    })}
  </div>
</div>
```

### 5.3 Remove scopeId free-text input

The scopeId is auto-resolved:
- **Shared** (`factory`): no scopeId needed (already works — server handles null)
- **Team** (`team`): scopeId auto-filled from user's team. For AD6, since `useCurrentUser()` does not return teamId, the "Team" pill is disabled. This is a known limitation noted in the design.
- **Private** (`user`): scopeId auto-filled from userId (already works — server uses `userId` from auth context)

The conditional scopeId `<input>` is removed entirely.

### 5.4 Team scope: disabled for AD6

Since the `/api/auth/me` endpoint does not return a `teamId` and adding one would require a data model change (out of scope for AD6), the "Team" pill is rendered as disabled in both KnowledgeCreate and KnowledgeCreateDialog.

A follow-up workpackage can:
1. Add `teamId` to the `/api/auth/me` response (derived from team_members table)
2. Enable the Team pill when teamId is available

For AD6, the user can still create team-scoped items via the ScopeChangeDialog on the detail page (power-user path).

---

## 6. KnowledgeCreateDialog changes

### 6.1 When not locked

Same 3-pill segmented control as KnowledgeCreate. Replace the `SCOPE_KINDS.map(...)` `<select>` with the pill group.

### 6.2 When locked (bet/task context)

Unchanged. Show read-only tag with `lockedScopeKind` label. This is the agent/power-user path.

---

## 7. Test changes

### 7.1 Tests to update

| Test file | Change |
|---|---|
| `U9-knowledge-scope-pills.test.tsx` | Replace dynamic scope-pill assertions with static pills: `scope-pill-all`, `scope-pill-shared`, `scope-pill-team`, `scope-pill-private`. Remove `scope-pill-practice`, `scope-pill-product`, `scope-pill-factory`. |
| `KnowledgeList.test.tsx` | Remove any assertions on kind badge presence. |
| `KnowledgeList.j8.test.tsx` | Verify kind badge is NOT rendered (negative assertion). |
| `KnowledgeRow.test.tsx` / `KnowledgeRow.factory.test.tsx` | Update if they assert kind badge rendering. |
| `KnowledgeDetail.test.tsx` | Update overflow menu assertions (no "Flag" item). Add archive action test. |
| `KnowledgeDetail.metadata.test.tsx` | Remove kind/layer Tag assertions from metadata bar. Add scope row assertion. |
| `KnowledgeCreateDialog.test.tsx` | Update scope selector tests — now pills instead of dropdown. Remove kind selector assertions. |

### 7.2 New test file

`packages/web/src/__tests__/AD6-knowledge-simplification.test.tsx`:

Tests for:
1. Scope pills are static (Shared/Team/Private always present regardless of data)
2. "Shared" filter shows factory + product + practice items
3. "Private" filter shows only user-scoped items
4. Kind badge is NOT rendered in list rows
5. Archive button in overflow menu calls POST /api/knowledge/:id/archive
6. Archive success navigates to /knowledge
7. Archive failure shows error banner
8. Create page has 3-pill scope picker (not 7-item dropdown)
9. Create page has no kind selector
10. Team pill is disabled when no team context

---

## 8. File inventory

| Path | Action |
|---|---|
| `packages/web/src/utils/scope-labels.ts` | **CREATE** — scope mapping utility |
| `packages/web/src/pages/KnowledgeList.tsx` | **MODIFY** — static pills, remove kind badge, scope filter logic |
| `packages/web/src/pages/KnowledgeDetail.tsx` | **MODIFY** — wire archive, remove flag, simplify metadata bar, add scope to aside |
| `packages/web/src/pages/KnowledgeCreate.tsx` | **MODIFY** — 3-pill scope, remove kind selector, remove scopeId input |
| `packages/web/src/pages/knowledge/KnowledgeCreateDialog.tsx` | **MODIFY** — 3-pill scope when unlocked, remove kind reference |
| `packages/web/src/__tests__/U9-knowledge-scope-pills.test.tsx` | **MODIFY** — update assertions for static pills |
| `packages/web/src/__tests__/AD6-knowledge-simplification.test.tsx` | **CREATE** — new test file for AD6 ACs |
| `packages/web/src/__tests__/KnowledgeDetail.test.tsx` | **MODIFY** — update overflow menu assertions |
| `packages/web/src/__tests__/KnowledgeCreateDialog.test.tsx` | **MODIFY** — update scope/kind assertions |

---

## 9. Task ordering

1. **Create `scope-labels.ts` utility** — no dependencies, pure logic
2. **Update KnowledgeList.tsx** — import utility, replace scope pills, remove kind badge, add scope filter
3. **Update KnowledgeDetail.tsx** — wire archive handler, remove flag from overflow menu, simplify metadata bar, add scope row to aside
4. **Update KnowledgeCreate.tsx** — replace scope dropdown with pill group, remove kind selector
5. **Update KnowledgeCreateDialog.tsx** — same pill group when unlocked
6. **Update/create tests** — align assertions with new behavior
7. **Run `npm run check && npm run lint && npm run test`** — full verification

Tasks 2-5 can run in parallel after task 1. Task 6 should be written BEFORE tasks 2-5 (TDD red phase), but depends on understanding the exact interface changes from task 1.

Recommended TDD order:
1. Create `scope-labels.ts`
2. Write failing tests for all ACs
3. Implement KnowledgeList changes
4. Implement KnowledgeDetail changes
5. Implement KnowledgeCreate + CreateDialog changes
6. Run full verification

---

## 10. Risk analysis

| Risk | Likelihood | Mitigation |
|---|---|---|
| Existing tests assert on old scope pill testIds | High | U9-knowledge-scope-pills.test.tsx and KnowledgeList.j6.test.tsx likely break. Update in step 6. |
| Protected tests (KnowledgeDetail.test.tsx) assert Tag(kind) in metadata bar | Medium | Read test file carefully before modifying. May need to remove assertions, not change component behavior that tests depend on. |
| Team pill disabled UX is confusing | Low | Clear visual signal (opacity). Follow-up workpackage enables it once teamId is on /me response. |
| Archive endpoint returns error for already-archived items | Low | API returns the updated item regardless. No special handling needed. |

---

## 11. What this does NOT change

- Backend `scopeKind` enum (7 values in `@hyperidle/shared`)
- Backend `kind` field on `knowledge_strategy_fabric`
- API endpoints (merge, split, flag remain accessible for agents)
- `ScopeChangeDialog.tsx` (power-user escape hatch, keeps all 7 scopes)
- Database schema or migrations
- `SCOPE_KINDS` constant in `@hyperidle/shared`
- `KnowledgeKind` type in `@hyperidle/fabric/types`
- Server-side route logic
