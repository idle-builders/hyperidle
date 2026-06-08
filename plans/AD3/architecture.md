# AD3 Architecture — Single-User UX Polish

## Required Reading

- `packages/web/src/shell/Sidebar.tsx` — current team list rendering
- `packages/web/src/layouts/AppShell.tsx` — team data flow, handleViewChange
- `packages/web/src/settings/SettingsOrgChart.tsx` — org data fetch pattern
- `packages/web/src/settings/SettingsNotifications.tsx` — toggle list rendering
- `packages/web/src/pages/knowledge/KnowledgeCreateDialog.tsx` — scope picker
- `packages/web/src/hooks/useTeams.ts` — existing team fetch hook
- `packages/web/src/hooks/useFetch.ts` — generic fetch hook (reusable)
- `packages/web/src/pages/work/BetCreateDialog.tsx` lines 59-60, 138 — existing `teams.length === 1` pattern

## Plan Reconciliation

| Spec assumption | Reality | Resolution |
|---|---|---|
| `GET /api/org` returns `{ edges, users }` with `kind` field | Confirmed: `org.ts` line 40-50, selects `id, kind, name, role` | No change needed |
| `users.kind === "human"` for human filtering | Confirmed: `schema.ts` line 37, seed.ts line 94 | Use this value |
| `useTeams()` already used in AppShell | Confirmed: AppShell line 312 | Reuse existing call |
| `SCOPE_KINDS` has 7 items | Confirmed: `types.ts` lines 140-148 | Filter subset for solo |
| `handleViewChange` navigates to `/work/portfolio` for work view | Confirmed: AppShell line 172 | Change to conditional navigate |
| Sidebar receives `teams` as prop | Confirmed: SidebarProps line 65, AppShell line 372 | Add conditional in Sidebar |
| KnowledgeCreateDialog does NOT receive teams | Confirmed: props are `open, onClose, onCreated, lockedScopeKind, lockedScopeId` | Add `useTeams()` call inside dialog |
| SettingsNotifications has no external data dependency | Confirmed: uses only `useState` | Needs new data source |

No spec/codebase conflicts found. All assumptions verified.

---

## Acceptance Criteria

### AC-1: Sidebar single-team auto-navigate
**With 1 team, the sidebar Work section header click navigates directly to the team page instead of showing a 1-item team list.**

Verification: Unit test renders `<Sidebar>` with `teams=[{id:"t1",name:"Alpha"}]` (length 1). Asserts no `<ul>` of team sub-items is rendered when `activeView="work"`. Integration test renders AppShell with mock `useTeams` returning 1 team, clicks Work header, asserts navigation to `/work/team/t1`.

### AC-2: OrgChart solo contextual message
**With 1 human user, the Org Chart settings section shows a contextual message instead of the edge table and "Add Edge" button.**

Verification: Unit test renders `<SettingsOrgChart>` with mock `GET /api/org` returning `{ edges: [], users: [{ id:"u1", kind:"human", name:"Founder", role:"founder" }] }`. Asserts the contextual message text is visible. Asserts no table element and no "Add Edge" button.

### AC-3: Knowledge scope picker simplified
**With 1 team, the knowledge scope picker shows only "Shared" and "Personal" options (mapping to `factory` and `user`) instead of all 7 scope kinds.**

Verification: Unit test renders `<KnowledgeCreateDialog open={true}>` with mock `useTeams` returning 1 team, no `lockedScopeKind`. Asserts the scope `<select>` has exactly 2 `<option>` elements. Asserts option text is "Shared" and "Personal".

### AC-4: Notifications solo toggles
**With a solo user (1 human), notification settings show only 2 toggles: "Review requests" and "Cost alerts".**

Verification: Unit test renders `<SettingsNotifications>` with `isSolo={true}`. Asserts exactly 2 Toggle components rendered. Asserts their labels are "Review requests" and "Cost alerts". With `isSolo={false}`, asserts 4 toggles.

### AC-5: Reactivity — second team reveals hidden elements
**When a user adds a second team, hidden elements appear without a page reload.**

Verification: This is inherent in the hook-based architecture. The `useTeams()` hook re-runs on component mount. Navigation (leaving Settings → returning) triggers re-mount. No explicit test needed beyond confirming the hook is called at the right level. Covered implicitly by AC-1 and AC-3 tests (changing prop/mock data changes output).

---

## Type Signatures

### New Hook: `useHumanCount`

```typescript
// packages/web/src/hooks/useHumanCount.ts

interface OrgUser {
  id: string;
  kind: string;
  name: string;
  role: string;
}

interface OrgData {
  edges: unknown[];
  users: OrgUser[];
}

export interface UseHumanCountResult {
  humanCount: number | null;  // null while loading
  loading: boolean;
}

export function useHumanCount(): UseHumanCountResult;
```

Implementation: uses `useFetch<OrgData>("/api/org")`, filters `data.users` by `kind === "human"`, returns count.

**Design-it-twice decision:** Considered two approaches:

**(A) `useHumanCount` hook wrapping `useFetch("/api/org")`** — Thin, focused. Each consumer gets exactly what it needs. The hook filters the response internally.

**(B) Prop threading from SettingsPage** — SettingsPage fetches org data once, passes `isSolo` to both OrgChart and Notifications. Avoids the double-fetch concern.

**Decision: (A).** Rationale:
- `useFetch` already deduplicates via URL key (same URL, same effect lifecycle — React will batch).
- SettingsOrgChart already fetches `/api/org` internally for its own edge table. Adding a parent-level fetch creates two parallel fetches anyway.
- Prop threading requires changing SettingsPage, OrgChart, and Notifications signatures — 3 files touched for plumbing vs 1 new hook file.
- The hook is reusable if other components need the solo check later.
- Browser HTTP cache handles the actual network dedup.

Trade-off: SettingsOrgChart will fetch `/api/org` twice (once in `useHumanCount`, once in its own `loadOrg`). Cost: one extra HTTP request per settings page visit (cached, ~0ms after first). Acceptable for the architectural simplicity gained.

**Optimization:** SettingsOrgChart already fetches and parses the org data. It can compute `humanCount` from its own `data.users` without needing the hook. Only SettingsNotifications needs the hook. Final plan: SettingsOrgChart computes solo internally from its existing fetch; SettingsNotifications uses `useHumanCount()`.

---

## Ordered Task List

### Task 1: Create `useHumanCount` hook
**File:** `packages/web/src/hooks/useHumanCount.ts`
**Dependencies:** None
**Test:** `packages/web/src/hooks/__tests__/useHumanCount.test.ts`

Create a hook that calls `useFetch<OrgData>("/api/org")` and returns `{ humanCount, loading }`. humanCount is the count of users where `kind === "human"`. Returns `null` while loading.

### Task 2: Sidebar single-team conditional rendering
**Files:**
- `packages/web/src/shell/Sidebar.tsx` — wrap team `<ul>` in `teams.length > 1` guard
- `packages/web/src/layouts/AppShell.tsx` — change `handleViewChange` for work view

**Dependencies:** None (uses existing `sidebarTeams` already computed in AppShell)

**Changes in Sidebar.tsx (line 242-280):**
Replace:
```tsx
{activeView === "work" && !settingsOpen && (
  <ul className="flex flex-col">
    {teams.map((team) => { ... })}
  </ul>
)}
```
With:
```tsx
{activeView === "work" && !settingsOpen && teams.length > 1 && (
  <ul className="flex flex-col">
    {teams.map((team) => { ... })}
  </ul>
)}
```

**Changes in AppShell.tsx (line 164-180):**
Replace the work case in `handleViewChange`:
```tsx
if (view === "work") {
  if (sidebarTeams.length === 1 && sidebarTeams[0]) {
    navigate(`/work/team/${encodeURIComponent(sidebarTeams[0].id)}`);
  } else {
    navigate("/work/portfolio");
  }
  return;
}
```

Add `sidebarTeams` to the `useCallback` dependency array.

**Test:** `packages/web/src/__tests__/AD3-sidebar-single-team.test.tsx`
- Render Sidebar with 1 team, activeView="work" — assert no `<li>` team items rendered
- Render Sidebar with 2 teams, activeView="work" — assert 2 `<li>` items rendered

### Task 3: SettingsOrgChart solo contextual message
**File:** `packages/web/src/settings/SettingsOrgChart.tsx`
**Dependencies:** None

**Changes:** After the existing `const { edges, users } = data;` line (183), add:
```tsx
const humanUsers = users.filter(u => u.kind === "human");
if (humanUsers.length <= 1) {
  return (
    <p className="text-[13px] text-[var(--text-tertiary)]">
      Org chart manages reporting lines between humans. Add a second human user to start defining your org structure.
    </p>
  );
}
```

This goes after the loading/error guards (lines 166-181) and after the data destructure (line 183), so it only triggers when data is loaded and solo is confirmed.

**Test:** `packages/web/src/settings/__tests__/AD3-SettingsOrgChart-solo.test.tsx`
- Mock `GET /api/org` with 1 human user — assert contextual message visible, no table, no "Add Edge" button
- Mock `GET /api/org` with 2 human users — assert table renders, "Add Edge" button visible

### Task 4: KnowledgeCreateDialog simplified scope picker
**File:** `packages/web/src/pages/knowledge/KnowledgeCreateDialog.tsx`
**Dependencies:** None

**Changes:**
1. Add import: `import { useTeams } from "../../hooks/useTeams.js";`
2. Inside the component, after existing hooks:
```tsx
const { data: teamsData } = useTeams();
const isSingleTeam = (teamsData?.teams?.length ?? 0) === 1;
```
3. Define simplified scope options:
```tsx
const SOLO_SCOPES: { value: ScopeKind; label: string }[] = [
  { value: "factory", label: "Shared" },
  { value: "user", label: "Personal" },
];
```
4. In the scope `<select>` (lines 179-192), replace:
```tsx
{SCOPE_KINDS.map((kind) => (
  <option key={kind} value={kind}>{kind}</option>
))}
```
With:
```tsx
{isSingleTeam ? (
  SOLO_SCOPES.map(({ value, label }) => (
    <option key={value} value={value}>{label}</option>
  ))
) : (
  SCOPE_KINDS.map((kind) => (
    <option key={kind} value={kind}>{kind}</option>
  ))
)}
```

**Test:** `packages/web/src/pages/knowledge/__tests__/AD3-KnowledgeCreateDialog-scope.test.tsx`
- Mock `useTeams` returning 1 team, render dialog open, no lockedScopeKind — assert 2 options ("Shared", "Personal")
- Mock `useTeams` returning 2 teams, render dialog open — assert 7 options (original SCOPE_KINDS)
- Mock `useTeams` returning 1 team, with lockedScopeKind="bet" — assert locked tag rendered (existing behavior unchanged)

### Task 5: SettingsNotifications solo toggle filtering
**File:** `packages/web/src/settings/SettingsNotifications.tsx`
**Dependencies:** Task 1 (useHumanCount hook)

**Changes:**
1. Add import: `import { useHumanCount } from "../hooks/useHumanCount.js";`
2. Inside component, add:
```tsx
const { humanCount, loading: humanCountLoading } = useHumanCount();
const isSolo = humanCount !== null && humanCount <= 1;
```
3. Define which keys are solo-visible:
```tsx
const SOLO_NOTIFICATION_KEYS = new Set(["review-requests", "cost-alerts"]);
```
4. Filter displayed settings:
```tsx
const displayedSettings = isSolo
  ? NOTIFICATION_SETTINGS.filter(s => SOLO_NOTIFICATION_KEYS.has(s.key))
  : NOTIFICATION_SETTINGS;
```
5. Replace `NOTIFICATION_SETTINGS.map(...)` with `displayedSettings.map(...)` in the JSX.

**Test:** `packages/web/src/settings/__tests__/AD3-SettingsNotifications-solo.test.tsx`
- Mock `GET /api/org` with 1 human — assert 2 toggles rendered (Review requests, Cost alerts)
- Mock `GET /api/org` with 2 humans — assert 4 toggles rendered
- While loading — assert all 4 toggles shown (graceful degradation: show everything until we know to hide)

---

## File Summary

| File | Action | Task |
|---|---|---|
| `packages/web/src/hooks/useHumanCount.ts` | Create | 1 |
| `packages/web/src/hooks/__tests__/useHumanCount.test.ts` | Create | 1 |
| `packages/web/src/shell/Sidebar.tsx` | Edit (line 242) | 2 |
| `packages/web/src/layouts/AppShell.tsx` | Edit (lines 164-180) | 2 |
| `packages/web/src/__tests__/AD3-sidebar-single-team.test.tsx` | Create | 2 |
| `packages/web/src/settings/SettingsOrgChart.tsx` | Edit (after line 183) | 3 |
| `packages/web/src/settings/__tests__/AD3-SettingsOrgChart-solo.test.tsx` | Create | 3 |
| `packages/web/src/pages/knowledge/KnowledgeCreateDialog.tsx` | Edit (lines 179-192) | 4 |
| `packages/web/src/pages/knowledge/__tests__/AD3-KnowledgeCreateDialog-scope.test.tsx` | Create | 4 |
| `packages/web/src/settings/SettingsNotifications.tsx` | Edit | 5 |
| `packages/web/src/settings/__tests__/AD3-SettingsNotifications-solo.test.tsx` | Create | 5 |

---

## Security & Abuse Cases

| Concern | Applicable? | Resolution |
|---|---|---|
| Rate-limit on POST/PATCH | N/A — no new endpoints | — |
| Input-trust boundary | N/A — no new user input | — |
| Secret handling | N/A — no credentials | — |
| Path traversal | N/A — no path input | — |
| SSRF | N/A — no outbound URL | — |
| Information disclosure via conditional hiding | Low risk — hiding UI elements doesn't protect server data. The `GET /api/org` and team endpoints remain accessible regardless of count. This is a UX simplification, not a security boundary. | Acceptable — no server-side changes |

---

## Protected Tests

These existing test files must not have their assertions weakened:

```
protectedTests:
  - packages/web/src/__tests__/Sidebar.test.tsx
  - packages/web/src/__tests__/U6-AppShell-sidebar.test.tsx
  - packages/web/src/__tests__/KnowledgeCreateDialog.test.tsx
  - packages/web/src/__tests__/AppShell.P4-settings.test.tsx
  - packages/web/src/pages/__tests__/W3-settings.test.tsx
```

Existing tests that render with multiple teams (the default mock) should continue passing unchanged. New tests cover the single-team/solo scenarios specifically.

**Important:** Existing Sidebar tests likely render with 2+ teams (the default mock setup). The conditional `teams.length > 1` guard must not break them. Verify by running existing test suite before and after changes.

---

## Risks & Mitigations

1. **Risk: Existing Sidebar tests provide exactly 1 team in mocks.** If so, the `teams.length > 1` guard would hide the team list, breaking assertions that expect to see team items.
   - **Mitigation:** Read existing Sidebar test mocks. If they use 1 team, update them to use 2 (they're testing the multi-team rendering path).

2. **Risk: `useTeams()` call in KnowledgeCreateDialog causes an extra network request.**
   - **Mitigation:** Acceptable — it's a small JSON response, browser-cacheable, and the dialog is short-lived.

3. **Risk: Loading state in `useHumanCount` shows all 4 notification toggles briefly before collapsing to 2.**
   - **Mitigation:** This is intentional graceful degradation. Showing all toggles then hiding 2 would be jarring. Design decision: show all during loading (matches the multi-user state) so that if the fetch fails, the user still has full control. The loading state is <100ms for a local API.

---

## Dependency Graph

```
Task 1 (useHumanCount) ──→ Task 5 (Notifications)
Task 2 (Sidebar) ──→ (independent)
Task 3 (OrgChart) ──→ (independent)
Task 4 (KnowledgeCreate) ──→ (independent)
```

Tasks 2, 3, 4 are fully independent and can be built in parallel.
Task 5 depends on Task 1.
Task 1 can be built in parallel with 2, 3, 4.

Recommended execution order: 1 → 2, 3, 4 (parallel) → 5.
