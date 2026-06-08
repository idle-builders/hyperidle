# AD3 Design — Single-User UX Polish

```
DESIGN-CLASS: routine  ref=BetCreateDialog(teams.length===1)  pattern=none
```

## Phase 0 — Brief

**User task:** A solo founder with 1 team manages a fleet of AI agents. Every UI element that exists only for multi-team/multi-human scenarios adds friction and makes the product feel enterprise-heavy. The user wants the UI to feel purpose-built for their situation.

**Decision:** No new decisions for the user. These are elements that currently *distract* from the user's actual decisions (reviewing agent work, managing bets, creating knowledge). We remove visual noise; we do not add anything.

**Interrogation — all questions are already settled by the brief:**
- Who? Solo founder, 1 team, N agents (1 human user).
- What pattern? `teams.length === 1` (sidebar, scope picker) and `humanUsers.length === 1` (org chart, notifications).
- Reactive? Yes — constraint states "adding second team reveals hidden elements without page reload."
- Existing precedent? `BetCreateDialog.tsx` line 59 and 138: `const singleTeam = teams.length === 1` + `{teams.length > 1 && (...)}`.

No open questions remain. Proceeding directly to variant.

---

## Phase 1 — Single Variant: Conditional Collapse

### Surface 1: Sidebar Work Section

**Threshold:** `teams.length === 1`

**Current behavior (multi-team):** Clicking the Work section header sets `activeView = "work"`, which reveals a `<ul>` of team items. Clicking a team item calls `onSelectTeam(id)` which navigates to `/work/team/:id`.

**Simplified behavior (single team):** Clicking the Work section header *directly* navigates to `/work/team/:id` for the sole team. The `<ul>` of team sub-items is never rendered. The section header still highlights as active when on any `/work/**` route.

**Implementation logic in AppShell (caller controls behavior):**
```
// In AppShell handleViewChange:
if (view === "work") {
  if (sidebarTeams.length === 1) {
    navigate(`/work/team/${encodeURIComponent(sidebarTeams[0].id)}`);
  } else {
    navigate("/work/portfolio");
  }
  return;
}
```

**In Sidebar component:** The team list `<ul>` renders only when `teams.length > 1`:
```
{teams.length > 1 && activeView === "work" && !settingsOpen && (
  <ul>...</ul>
)}
```

**Reactivity:** `useTeams()` is called in AppShell. When a second team is created (e.g., via Settings or API), the next re-render of AppShell will update `sidebarTeams` from the hook. Since `useTeams` runs on mount only, reactivity requires either:
- (a) Re-fetching teams on focus/visibility change, OR
- (b) The team-creation flow triggers a state refresh (navigate or re-mount)

Option (b) is sufficient: team creation happens in Settings or via API. When the user leaves Settings, AppShell re-mounts the teams fetch. The constraint says "without page reload" — a navigation (route change) is not a page reload.

**States:**
- 1 team: Section header clickable, no sub-items rendered, click navigates directly
- 2+ teams: Current behavior unchanged (sub-items listed)
- 0 teams: Edge case — show "No teams" empty state (already impossible in practice since onboarding creates a team)

---

### Surface 2: SettingsOrgChart

**Threshold:** `humanUsers.length <= 1` (derived from the `users` array in the `GET /api/org` response, filtered by `kind === "human"`)

**Current behavior:** Fetches `GET /api/org`, renders edge table + "Add Edge" button.

**Simplified behavior (solo human):** Instead of the full edge table + add form, render a contextual message:

```
<p class="text-[13px] text-[var(--text-tertiary)]">
  Org chart manages reporting lines between humans. 
  Add a second human to your factory to use this feature.
</p>
```

The entire `SettingsOrgChart` component handles this internally — no parent-level hiding needed. The section header ("Org chart") and its `<section>` wrapper in SettingsPage remain visible so the user knows the feature exists (discoverability). Only the content changes.

**Implementation logic:**
```
const humanUsers = data.users.filter(u => u.kind === "human");
const isSolo = humanUsers.length <= 1;

if (isSolo) {
  return <p ...>contextual message</p>;
}
// else: existing table + form
```

**Reactivity:** The component already calls `loadOrg()` on mount. Adding a second human user (via API/invite) won't auto-refresh this component unless the user navigates away and back. This is acceptable — you don't add a human and stay on the org chart page expecting it to auto-populate. The constraint "without page reload" is naturally satisfied since route changes re-mount the component.

**States:**
- Solo human: Contextual message (not an error, not empty — it is an explanation)
- 2+ humans: Full org chart (current behavior)
- Loading: Skeleton (existing)
- Error: Error message (existing)

---

### Surface 3: KnowledgeCreateDialog Scope Picker

**Threshold:** `teams.length === 1` (passed into the dialog or derived from a hook)

**Current behavior:** Shows all 7 SCOPE_KINDS in a `<select>`: factory, product, practice, team, bet, task, user.

**Simplified behavior (single team):** Show only 3 meaningful scopes:
- `factory` (labeled "Shared" — visible to everyone)
- `user` (labeled "Personal" — visible only to you)
- `bet` / `task` (contextual — only shown when `lockedScopeKind` is set)

The rationale: with 1 team, "product", "practice", and "team" scopes are all equivalent to "factory" (they all resolve to the same team/group). The user gains nothing from distinguishing between them. `bet` and `task` scopes are only relevant when creating knowledge from a bet/task context (the `lockedScopeKind` prop handles this already).

**Simplified scope options:**

| Value | Label (simplified) | When shown |
|---|---|---|
| `factory` | Shared | Always |
| `user` | Personal | Always |
| `bet` | This bet | Only when `lockedScopeKind === "bet"` |
| `task` | This task | Only when `lockedScopeKind === "task"` |

When `lockedScopeKind` is set, the scope is already displayed as a read-only Tag (existing behavior, line 174-177). The simplification only affects the open combobox case (non-locked).

**Implementation logic:**
```
const SOLO_SCOPE_KINDS: ScopeKind[] = ["factory", "user"];
const SOLO_SCOPE_LABELS: Record<string, string> = {
  factory: "Shared",
  user: "Personal",
};

// In the select:
const displayedScopes = isSingleTeam ? SOLO_SCOPE_KINDS : SCOPE_KINDS;
```

**How to get `isSingleTeam`:** The dialog does not currently receive teams. Two options:
- (a) Call `useTeams()` inside the dialog — adds a fetch
- (b) Pass a `teamCount` prop from the parent page (KnowledgeList, which already fetches teams)

Option (b) is cheaper: the parent already has the data. But KnowledgeCreateDialog is also opened from bet/task detail pages. Those pages do not fetch teams. Option (a) is simpler and universal — the `useTeams` hook is a one-shot fetch with dedup via the browser's HTTP cache.

Decision: **Option (a)** — call `useTeams()` inside KnowledgeCreateDialog. This matches the BetCreateDialog pattern (teams passed as prop) but avoids threading a prop through 5 different parent contexts. The fetch is cached and fast.

**Reactivity:** If a second team is added while the dialog is open (unlikely), the dialog won't update until next open. Acceptable — dialogs are short-lived.

**States:**
- 1 team, not locked: Show 2 options (Shared, Personal)
- 1 team, locked: Show locked scope as read-only Tag (existing behavior, unchanged)
- 2+ teams, not locked: Show all 7 SCOPE_KINDS (current behavior)
- 2+ teams, locked: Show locked scope as read-only Tag (existing behavior, unchanged)

---

### Surface 4: SettingsNotifications

**Threshold:** `humanUsers.length <= 1` (same signal as OrgChart)

**Current behavior:** Shows 4 toggles: review-requests, cost-alerts, blocker-notifications, email-digests.

**Simplified behavior (solo):** Show only 2 toggles:
- "Review requests" — still relevant (agent output needs human review)
- "Cost alerts" — still relevant (budget monitoring)

Hidden toggles:
- "Blocker notifications" — irrelevant solo (who would be blocked? only agents, and agent blockers surface in the Conversations view already)
- "Email digests" — irrelevant solo (you're already IN the app, there's nobody else to summarize activity for)

**Implementation logic:**
```
const SOLO_NOTIFICATION_KEYS = ["review-requests", "cost-alerts"];

// Filter displayed settings:
const displayedSettings = isSolo
  ? NOTIFICATION_SETTINGS.filter(s => SOLO_NOTIFICATION_KEYS.includes(s.key))
  : NOTIFICATION_SETTINGS;
```

**How to get `isSolo`:** The Notifications component does not currently fetch user data. Options:
- (a) Fetch `GET /api/org` and count `users.filter(u => u.kind === "human")`
- (b) Add a lightweight endpoint or piggyback on an existing one
- (c) Share the org data between OrgChart and Notifications (they render on the same page)

The SettingsPage renders both OrgChart and Notifications. They are siblings. Having both fetch `GET /api/org` independently is acceptable (browser HTTP cache dedup, same page lifecycle). But cleaner: extract a shared hook `useOrgUsers()` or simply pass the count down from SettingsPage.

Decision: **SettingsNotifications receives an `isSolo` prop** from SettingsPage. SettingsPage already renders SettingsOrgChart which fetches org data — lift the user-count signal up to SettingsPage level and pass it down. This avoids Notifications making its own fetch.

Actually simpler: **SettingsNotifications calls `useTeams()` as the threshold** — no, the threshold is human user count not team count. But in the single-user scenario (AD3's target), `teams.length === 1` AND `humanUsers.length === 1` are correlated. The spec says "solo user" which means 1 human.

Final decision: **Both OrgChart and Notifications fetch the same `GET /api/org` data.** Create a small `useHumanUserCount()` hook that calls `GET /api/org` and returns `{ humanCount, loading }`. Both components use it. The browser HTTP cache means no double-fetch.

Alternatively and even simpler: Notifications can just check `useTeams()` — with 1 team AND the current user being the only user in the system, it's solo. But `useTeams()` returns team count, not user count.

**Revised final decision:** Create a `useSoloMode()` hook that fetches `GET /api/org`, filters `users` by `kind === "human"`, and returns `{ isSolo: boolean, loading: boolean }`. Both OrgChart and Notifications consume this. Architecture will settle the exact hook shape.

**Reactivity:** Same as OrgChart — adding a second human (rare, intentional action) reveals the hidden toggles on next mount/navigation.

**States:**
- Solo (1 human): 2 toggles (reviews, cost alerts)
- Multi-human: 4 toggles (current behavior)

---

## Rejected Directions (did we consider X/Y/Z?)

1. **Full section hiding for OrgChart** — Considered hiding the entire "Org chart" section (header + content) in SettingsPage when solo. Rejected: removes discoverability. The user should know the feature exists so they can use it when they grow. A contextual message is better than absence.

2. **Configuration flag** — Considered a server-side `SOLO_MODE` config flag. Rejected: the constraint explicitly says "runtime data, not config flags." The system should auto-detect from actual team/user counts.

3. **Collapsible accordion for hidden elements** — Considered showing all elements but auto-collapsed in an "Advanced" accordion. Rejected: adds complexity (new UI pattern), doesn't actually reduce visual noise (the accordion header is itself noise).

4. **Scope picker with radio buttons instead of select** — Considered replacing the `<select>` with radio buttons for the 2-option simplified case. Rejected: inconsistent with the existing select pattern used in the locked case. Two options in a select is fine.

5. **Empty state illustration for OrgChart** — Considered an illustration/icon with the contextual message. Rejected: illustrations are decorative and add no information. Terse prose is the Hearth way.

6. **Notifications: hide the entire section** — Considered hiding "Notifications" entirely for solo users. Rejected: same discoverability argument as OrgChart. The 2 remaining toggles are genuinely useful.

---

## Phase 4 — Approved Design

### Summary of Changes

| Surface | Threshold | Simplified State |
|---|---|---|
| Sidebar Work | `teams.length === 1` | Header click navigates directly to sole team; no sub-items |
| SettingsOrgChart | `humanCount <= 1` | Contextual message instead of table + form |
| KnowledgeCreateDialog | `teams.length === 1` | 2-option scope picker (Shared/Personal) instead of 7 |
| SettingsNotifications | `humanCount <= 1` | 2 toggles instead of 4 |

### Threshold Signals

Two signals needed:
1. **Team count** — from `useTeams()` (already exists, already called in AppShell)
2. **Human user count** — from `GET /api/org` response (new hook needed: `useSoloMode`)

### Reactivity Contract

- All thresholds derive from API responses consumed via hooks.
- Adding a team: `useTeams()` is called on AppShell mount. Navigation (leaving/entering Settings, switching views) triggers re-mount and re-fetch. This satisfies "without page reload."
- Adding a human: Same pattern via `useSoloMode()` re-fetch on mount.
- No WebSocket/SSE required. The frequency of "adding a team" or "adding a human" is near-zero in daily use. Re-fetch on mount is sufficient reactivity.

### Component Mapping

No new design-system components. Changes are conditional rendering logic inside existing components:
- `Sidebar` — conditional `teams.length > 1` guard on the team `<ul>`
- `AppShell` — conditional navigate target in `handleViewChange`
- `SettingsOrgChart` — early return with `<p>` when solo
- `KnowledgeCreateDialog` — filtered `SCOPE_KINDS` array based on team count
- `SettingsNotifications` — filtered `NOTIFICATION_SETTINGS` array based on human count
- New hook: `useSoloMode` (not a component — a hook)

### Copy

**OrgChart solo message:**
> "Org chart manages reporting lines between humans. Add a second human user to start defining your org structure."

**Scope picker labels (simplified):**
- "Shared" (maps to `factory`)
- "Personal" (maps to `user`)

### Open Questions for Architecture

1. Should `useSoloMode` be a dedicated hook or should SettingsOrgChart share its already-fetched `data.users` with a parent-level check?
2. How does `KnowledgeCreateDialog` get team count — prop from parent vs internal `useTeams()` call?
3. Does `AppShell.handleViewChange` need the team count, or should `Sidebar` handle the auto-navigate internally via an `onAutoNavigate` callback?
