# P4 Architecture Plan -- SetupFlow and Settings Redesign

## Required Reading

- `plans/P4/design/approved.md` -- locked visual contract (do not re-litigate)
- `plans/work-packages/TRACK-P.md` -- P4 spec + P2/P3 context
- `packages/web/src/layouts/AppShell.tsx` -- shell layout, settings state, Submenu/Main integration
- `packages/web/src/components/SettingsPanel.tsx` -- current settings modal (being replaced)
- `packages/web/src/pages/Onboarding.tsx` -- current onboarding (being replaced)
- `packages/web/src/pages/FirstRunRedirect.tsx` -- setup completion detection
- `packages/web/src/router.tsx` -- route table
- `packages/server/src/routes/settings.ts` -- GET/PATCH /api/settings
- `packages/server/src/routes/users.ts` -- /api/users routes (no profile PATCH)
- `packages/server/src/routes/org.ts` -- /api/org routes
- `packages/server/src/routes/health.ts` -- health endpoints for shared backend checks
- `packages/web/src/hooks/useSettings.ts` -- settings data fetching
- `packages/web/src/hooks/useCurrentUser.ts` -- authenticated user identity
- `packages/web/src/shell/ToastRegion.tsx` -- toast API (`useToast()`)
- `packages/web/src/shell/Submenu.tsx` -- Submenu component interface
- `packages/web/src/components/CredentialsTab.tsx` -- credential management (reused as-is)
- `packages/web/src/window.d.ts` -- Electron bridge API

---

## Phase 0 -- Interrogation (settled decisions)

**Q1: PATCH /api/users/:id writable fields?**
Settled: `{ name?: string, email?: string }`. Only human users. The auth middleware resolves the requesting user; the route enforces that the user can only patch their own profile (userId from auth context must match :id param). No avatarUrl write yet (no upload exists).

**Q2: Density persistence in web (non-Electron)?**
Settled: localStorage fallback. The `useTheme()` hook already uses localStorage for theme. Density follows the same pattern. In Electron, if `window.__HYPERIDLE__` exposes a config API in the future, it can be used; until then, localStorage is sufficient for both Electron and web.

**Q3: Setup completion check mechanism?**
Settled: composite browser-side check. Three parallel API fetches in FirstRunRedirect:
1. Check for human user: `GET /api/auth/me` -- 200 means user exists, 401/404 means no user
2. Check for products: `GET /api/products` -- products.length > 0
3. BackendMode: in Electron, read from client-local config via bridge. In web/dev, backend mode is always "local" (no config file needed).

No new endpoint. The three fetches are independent and run in parallel.

**Q4: Setup submission error recovery?**
Settled: idempotent operations. The setup form submits three API calls in sequence. If step 2 (create user) fails, the form stays with the error. If step 2 succeeds but step 3 (create product) fails, the user retries and step 2 is idempotent (creating a user when one exists returns the existing user or succeeds silently). The POST /api/products endpoint already handles this (no duplicate check, but creating two products with the same name is fine -- the user can delete one later).

**Q5: Submenu content swapping pattern?**
Settled: AppShell passes different `children` to `<Submenu>` when `settingsOpen` is true. The `Submenu` component itself does not change. AppShell already conditionally renders different children for different views (conversations threads vs work NavItems vs knowledge scope browser). Adding a settings branch is the same pattern.

**Q6: onOpenSettings bridge callback?**
Settled: it already triggers `setSettingsOpen(true)` via the existing effect in AppShell. The overlay pattern uses the same state variable (`settingsOpen`), so it continues to work.

---

## Phase 1 -- Plan Reconciliation

| Spec Assumption | Reality | Resolution |
|---|---|---|
| `PATCH /api/users/:id` for profile | Does NOT exist. Only `PATCH /:id/skills/:skillId`. | Add new PATCH route in users.ts. |
| `POST /api/users` for setup user creation | Does NOT exist. Users are created by seed scripts / internal logic. | Add new POST route for human user creation during setup. |
| `GET /api/setup/status` | Does NOT exist. | Not needed. Composite check in browser. |
| `SettingsPanel.tsx` modal | EXISTS at 638 lines. Must be replaced. | Delete the component. Move section content to new standalone components. |
| `Onboarding.tsx` | EXISTS at 134 lines. Must be replaced. | Delete and replace with `SetupFlow.tsx`. |
| `FirstRunRedirect.tsx` | EXISTS. Only checks products. | Update to check setup completion (user + products + backend mode). |
| `settingsOpen` state in AppShell | EXISTS at line 237. | Keep. Add `activeSettingsSection` state. |
| `useToast()` hook | EXISTS in ToastRegion.tsx. Returns `{ showToast }`. | Use for settings save feedback. |
| `useCurrentUser()` hook | EXISTS. Returns `{ user: { id, name, email, avatarUrl }, status, error }`. | Use for profile section pre-fill and user ID. |
| `useSettings()` hook | EXISTS. Returns `{ settings, status, error, save, retry, data }`. | Refactor: `save()` currently only writes notifications. Must also handle profile. |
| Product `phase` column | EXISTS in schema.ts. Text column. | Use for active/archived toggle. |
| Users `kind` column | EXISTS. `"human" \| "ai"`. | Filter to human for profile, AI for agents section. |
| Users `email`, `avatarUrl` columns | EXIST. Nullable. | Use for profile display/edit. |
| `CredentialsTab` component | EXISTS at 379 lines. | Reuse as-is. |
| Submenu `children` prop | EXISTS. Type `ReactNode`. | Pass settings NavItems when settingsOpen. |
| NavItem component | EXISTS in design-system. Props: `{ label, icon?, count?, selected?, onClick? }`. | Use for settings section navigation. |
| `/api/org` routes | EXIST. GET, PUT /edges, DELETE /edges/:id. | Consume in OrgChart section. |
| `/api/health` endpoint | EXISTS. Plus `/api/health/auth` behind auth. | Use `/api/health` for shared backend connectivity check in setup. |
| Router `/onboarding` route | EXISTS. Must change to `/setup`. | Replace route entry. |
| Router `/settings` redirect | EXISTS. Redirects to `/conversations?settings=open`. | Keep -- still works with the overlay pattern. |
| `useTheme()` hook | EXISTS. Used in AppShell. | Reuse for Appearance section. |
| `?settings=open` query param | EXISTS in AppShell. | Keep -- triggers `settingsOpen = true`. |
| `initialTab` on SettingsPanel | EXISTS but panel is being removed. | Remove. Settings entry is always Profile first. |

---

## Phase 2 -- Acceptance Criteria + Tasks

### Acceptance Criteria

**SetupFlow:**

| # | Criterion | Verification |
|---|---|---|
| AC-1 | On first launch (no human user exists), app shows SetupFlow at `/setup` instead of main UI | Playwright E2E: empty DB -> navigate to / -> assert redirect to /setup |
| AC-2 | Step 1: BackendMode select with "Run locally" (default) and "Connect to shared backend" | Playwright: assert select exists with both options, default is "Run locally" |
| AC-3 | Shared backend selection shows URL + key fields and "Test Connection" button | Playwright: select "Connect to shared backend" -> assert URL/key inputs appear |
| AC-4 | Step 2: Name and email fields for user identity | Playwright: assert name and email inputs exist |
| AC-5 | Step 3: Product name (required) + repo path (optional with folder picker) | Playwright: assert product name input, repo path input with folder icon |
| AC-6 | Step 4: Anthropic API Key field (optional) with "Skip credentials" and "Start HyperIdle" buttons | Playwright: assert credential input, skip button, start button |
| AC-7 | Start button disabled until name + email + product name are filled | Playwright: assert disabled initially, fill fields, assert enabled |
| AC-8 | After completing setup, main UI renders at /conversations | Playwright: fill fields, click Start, assert navigation to /conversations |
| AC-9 | Old Onboarding.tsx is deleted and /onboarding route removed | `ls packages/web/src/pages/Onboarding.tsx` returns file-not-found. Router has no /onboarding entry. |
| AC-10 | FirstRunRedirect checks for human user + product (not just products) | Integration test: DB with products but no human user -> redirect to /setup |

**Settings redesign:**

| # | Criterion | Verification |
|---|---|---|
| AC-11 | Avatar click opens settings overlay (Submenu shows settings sections, Main shows profile form) | Playwright: click avatar -> assert "Settings" title in Submenu + Profile heading in Main |
| AC-12 | Settings has 7 sections navigable via Submenu NavItems: Profile, Org Chart, Credentials, Notifications, Appearance, Products, Backend | Playwright: assert 7 NavItem labels in Submenu |
| AC-13 | Profile section: name + email edits persist via PATCH /api/users/:id | Integration test: PATCH /api/users/:id with new name -> GET confirms change. Playwright: edit name, save, reopen settings, assert new name persists. |
| AC-14 | OrgChart section: table of edges, Add Edge form, Delete button | Playwright: navigate to Org Chart section, assert table, add edge, assert new row, delete edge |
| AC-15 | Credentials section: reuses existing CredentialsTab | Playwright: navigate to Credentials, assert catalog entries visible |
| AC-16 | Notifications section: toggles + quiet hours + muted products, persisted via PATCH /api/settings | Integration test: PATCH notifications -> GET confirms. Playwright: toggle, save, reopen, assert persisted. |
| AC-17 | Appearance section: theme + density selects, applied immediately | Playwright: change density to compact -> assert `[data-density="compact"]` on root immediately |
| AC-18 | Products section: list with active/archived toggle | Playwright: assert product list with toggles |
| AC-19 | BackendMode section: shows current mode, switch button with restart warning | Playwright: assert "Local" badge, "Switch to Shared Backend" button |
| AC-20 | Old tab-based SettingsPanel modal is deleted | `ls packages/web/src/components/SettingsPanel.tsx` returns file-not-found (or refactored to only export types). |
| AC-21 | Escape key closes settings overlay | Playwright: open settings, press Escape, assert settings closed |
| AC-22 | Clicking view icon (Conversations/Work/Knowledge) while settings open closes settings and navigates | Playwright: open settings, click Work icon, assert settings closed + navigation to /work |
| AC-23 | Rail is dimmed while settings is open | Playwright: open settings, assert Rail has opacity class |
| AC-24 | Settings save feedback via toast | Playwright: save profile, assert toast "Profile saved" appears |

**Persistence fixes:**

| # | Criterion | Verification |
|---|---|---|
| AC-25 | Profile edits do NOT silently revert (the bug fix) | Playwright: edit name -> save -> close settings -> reopen -> assert name is the saved value |
| AC-26 | Density preference persists across page reload | Playwright: set density to compact -> reload page -> assert density is still compact |

**Server:**

| # | Criterion | Verification |
|---|---|---|
| AC-27 | `PATCH /api/users/:id` endpoint exists and updates name/email | Integration test: create user, PATCH with new name+email, GET confirms |
| AC-28 | `POST /api/users` endpoint creates a human user | Integration test: POST creates user with kind=human, GET confirms |
| AC-29 | `PATCH /api/users/:id` rejects unauthorized updates (user can only patch self) | Integration test: PATCH with different userId -> 403 |

---

### Type Signatures

```typescript
// packages/shared/src/types.ts (add)
export type SettingsSectionId =
  | "profile"
  | "orgchart"
  | "credentials"
  | "notifications"
  | "appearance"
  | "products"
  | "backend";

// packages/server/src/routes/users.ts (add PATCH /:id)
// Request body:
interface PatchUserBody {
  name?: string;
  email?: string;
}
// Response: the updated user row
// 403 if userId from auth context !== :id

// packages/server/src/routes/users.ts (add POST /)
// Request body:
interface CreateHumanUserBody {
  name: string;
  email: string;
}
// Response: { id, name, email, kind: "human" }
// 409 if human user already exists (idempotent)
```

### API Endpoints

| Method | Path | Purpose | Request Body | Response | Auth |
|---|---|---|---|---|---|
| PATCH | /api/users/:id | Update human user profile | `{ name?: string, email?: string }` | Updated user object | Yes. userId must match :id |
| POST | /api/users | Create human user (setup) | `{ name: string, email: string }` | `{ id, name, email, kind }` | No (setup happens before auth is configured) |
| GET | /api/health | Health check (shared backend) | - | `{ status: "ok", timestamp }` | No |
| GET | /api/health/auth | Authenticated health check | - | `{ status: "ok", timestamp, userId }` | Yes |

Note: POST /api/users for setup needs special auth handling. During setup, no API key may be configured yet (local mode). The route should check if no human user exists; if so, allow creation without auth. If a human user already exists, require auth. This prevents unauthorized user creation after setup.

---

### Ordered Task List

#### Track A: Server (no UI dependency)

**Task 1: Add PATCH /api/users/:id for profile updates**
- File: `packages/server/src/routes/users.ts`
- Add: Zod schema `patchUserSchema = z.object({ name: z.string().min(1).optional(), email: z.string().email().optional() })`
- Add: `router.patch("/:id", ...)` that validates body, checks auth (userId === :id), updates users table, returns updated user
- Test: `packages/server/src/routes/__tests__/users-profile.test.ts` -- PATCH with valid body returns 200 + updated fields; PATCH with wrong userId returns 403; PATCH with invalid email returns 400

**Task 2: Add POST /api/users for setup user creation**
- File: `packages/server/src/routes/users.ts`
- Add: Zod schema `createHumanUserSchema = z.object({ name: z.string().min(1), email: z.string().email() })`
- Add: `router.post("/", ...)` that checks if human user already exists. If exists, return 200 with existing (idempotent). If not, create with `kind: "human"`, return 201.
- Auth: no auth required when no human user exists. When human user exists, require auth.
- Test: `packages/server/src/routes/__tests__/users-create.test.ts` -- POST creates human user; second POST returns existing (idempotent); PATCH after creation works

**Task 3: Update PATCH /api/settings to also save profile data**
- File: `packages/server/src/routes/settings.ts`
- Current: `settingsPatchSchema` only accepts `{ notifications }`. Profile edits silently revert because PATCH /api/settings ignores profile.
- Change: Add `profile: z.object({ name: z.string(), email: z.string() }).optional()` to the schema. When present, update the human user row.
- Alternative: keep PATCH /api/settings for notifications only, use PATCH /api/users/:id for profile. This is cleaner separation.
- **Decision: use PATCH /api/users/:id for profile.** The settings save flow calls two endpoints: PATCH /api/users/:id for profile, PATCH /api/settings for notifications. The settings route stays focused on server config.
- Test: existing settings tests continue to pass

#### Track B: Web -- SetupFlow (no settings dependency)

**Task 4: Create SetupFlow page component**
- File: `packages/web/src/pages/SetupFlow.tsx`
- Implements the single-scroll layout from approved design
- Local state: backendMode, name, email, productName, repoPath, apiKey, validationErrors, submitting
- On submit: sequence of API calls (POST /api/users, POST /api/products, optionally set credential via bridge)
- Navigates to /conversations on success
- All form validation per approved design states

**Task 5: Update router**
- File: `packages/web/src/router.tsx`
- Remove: `/onboarding` route
- Add: `/setup` route (outside AppShell, same slot as onboarding)
- Keep: `/settings` redirect to `?settings=open`

**Task 6: Update FirstRunRedirect**
- File: `packages/web/src/pages/FirstRunRedirect.tsx`
- Change: check for human user via GET /api/auth/me (200 = exists) + products via GET /api/products
- If no human user: redirect to /setup
- If no products: redirect to /setup
- If both exist: redirect to /conversations
- Test: `packages/web/src/pages/__tests__/FirstRunRedirect.test.tsx` -- mock API to return no user -> redirects to /setup; mock with user + products -> redirects to /conversations

**Task 7: Delete Onboarding.tsx**
- File: `packages/web/src/pages/Onboarding.tsx` -- delete
- Verify: no imports reference it after router update

#### Track C: Web -- Settings Redesign

**Task 8: Create settings section components**
- Files (all new):
  - `packages/web/src/settings/SettingsProfile.tsx`
  - `packages/web/src/settings/SettingsOrgChart.tsx`
  - `packages/web/src/settings/SettingsNotifications.tsx`
  - `packages/web/src/settings/SettingsAppearance.tsx`
  - `packages/web/src/settings/SettingsProducts.tsx`
  - `packages/web/src/settings/SettingsBackend.tsx`
  - `packages/web/src/settings/settings-types.ts` -- SettingsSectionId type + SETTINGS_SECTIONS constant
- Each component is standalone with its own data fetching and save logic
- SettingsProfile: uses useCurrentUser() for pre-fill, calls PATCH /api/users/:id to save
- SettingsOrgChart: fetches GET /api/org, renders edge table, add/delete via PUT/DELETE
- SettingsNotifications: extracts content from existing NotificationsTab, uses useSettings().save()
- SettingsAppearance: extracts content from existing AppearanceTab, uses useTheme() + localStorage for density
- SettingsProducts: extracts content from existing ProductsTab
- SettingsBackend: reads client config (when bridge available), shows mode badge + switch button
- CredentialsTab stays in its current location and is imported directly

**Task 9: Refactor AppShell for settings overlay**
- File: `packages/web/src/layouts/AppShell.tsx`
- Add: `activeSettingsSection` state (type SettingsSectionId, default "profile")
- Change: when `settingsOpen`, pass settings children to `<Submenu>`:
  - Title = "Settings"
  - Children = NavItem list for each section + Back button
  - No filters, no search, no count
- Change: when `settingsOpen`, render active section component instead of `<Outlet>` in the main area
- Change: Rail gets `opacity-60 pointer-events-none` classes when settingsOpen
- Change: handleViewChange closes settings before navigating
- Change: Escape handler closes settings (keep existing behavior)
- Remove: `<SettingsPanel>` component import and render
- Remove: the `settings` local state object (sections manage their own state)
- Remove: `handleSettingsSave` callback (sections save independently)
- Keep: `settingsOpen` state, `handleAvatarClick`, `?settings=open` param handler, `onOpenSettings` bridge callback, Command-K interceptor for settings-open state

**Task 10: Density persistence**
- File: `packages/web/src/hooks/useDensity.ts` (new)
- Hook that reads/writes density to localStorage key `hyperidle:density`
- Returns `{ density, setDensity }` where setDensity persists to localStorage
- Used by SettingsAppearance for the select control
- AppShell's `useAutoDensity` reads the initial value from localStorage
- Verify: `packages/web/src/hooks/useAutoDensity.ts` -- check if it already reads from localStorage or only component state

**Task 11: Delete old SettingsPanel**
- File: `packages/web/src/components/SettingsPanel.tsx` -- delete the component function and all internal tab components (ProfileTab, ProductsTab, AgentsTab, NotificationsTab, AppearanceTab)
- Keep: exported types that other files import (SettingsData, ProfileSettings, etc.) -- move to a shared types file if needed
- Update: all imports that reference SettingsPanel

#### Track D: E2E Tests

**Task 12: Playwright E2E for SetupFlow**
- File: `packages/web/e2e/setup-flow.spec.ts`
- Tests: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-10

**Task 13: Playwright E2E for Settings overlay**
- File: `packages/web/e2e/settings-overlay.spec.ts`
- Tests: AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-21, AC-22, AC-23, AC-24, AC-25, AC-26

---

### Task Dependency Graph

```
Task 1 (PATCH users) ─────────────────┐
Task 2 (POST users) ──────────────────┤
                                       ├──> Task 4 (SetupFlow page)
Task 3 (settings PATCH stays same) ────┘         │
                                                  ├──> Task 5 (router)
                                                  ├──> Task 6 (FirstRunRedirect)
                                                  └──> Task 7 (delete Onboarding)
                                                              │
Task 8 (section components) ──────────────────────────────────┤
                                                              │
Task 9 (AppShell refactor) ───────────────────────────────────┤
                                                              │
Task 10 (density persistence) ────────────────────────────────┤
                                                              │
Task 11 (delete SettingsPanel) ───────────────────────────────┘
                                                              │
Task 12 (E2E setup) ──────────────────────────────────────────┤
Task 13 (E2E settings) ───────────────────────────────────────┘
```

Parallelization: Tasks 1+2 can run in parallel. Tasks 4+8 can start once 1+2 are done. Tasks 5+6+7 can run once 4 is done. Task 9 depends on 8. Tasks 10+11 can run alongside 9. Tasks 12+13 run last.

---

### Security & Abuse Cases

| Surface | Risk | Mitigation |
|---|---|---|
| POST /api/users (setup) | Unauthorized user creation after setup | Gate: only allow when no human user exists. If human exists, require auth. |
| PATCH /api/users/:id | User modifying another user's profile | Enforce: userId from auth context must match :id param. Return 403 otherwise. |
| PATCH /api/users/:id | XSS via name/email fields | Sanitize: Zod schema validates types. React auto-escapes rendering. No HTML in name/email. |
| SetupFlow API key input | Key displayed in URL or logs | The key is sent via bridge (window.__HYPERIDLE__.credentials.set), never via API. No server round-trip for credential storage. |
| Shared backend URL in setup | SSRF via server-side health check | N/A -- the health check is a client-side fetch (browser → remote server), not a server-side request. The server never connects to the URL the user provides. |
| Repo path input | Path traversal | N/A -- the repo path is stored as a string and used only by the Electron shell for `git` operations. The server never opens the path. |
| Product name/user name | Input length DoS | Zod schema: `z.string().min(1).max(200)` on all string inputs. |

### Protected Tests

```
protectedTests:
  - packages/server/src/routes/__tests__/settings.test.ts
  - packages/server/src/routes/__tests__/status-settings-write.test.ts
  - packages/web/src/components/__tests__/CredentialsTab.test.tsx
```

These test files assert existing contracts that must not break. The settings tests verify notification persistence. The CredentialsTab tests verify the credential catalog UI.

### Migrations

| Symbol | Type | Action | Affected Files |
|---|---|---|---|
| `Onboarding` component | page | delete | `packages/web/src/pages/Onboarding.tsx`, `packages/web/src/router.tsx` (remove import + route) |
| `SettingsPanel` component | component | delete function, keep types | `packages/web/src/components/SettingsPanel.tsx` (remove component + tab functions, keep type exports), `packages/web/src/layouts/AppShell.tsx` (remove import of component, keep type import if needed) |
| `/onboarding` route | route | replace with `/setup` | `packages/web/src/router.tsx` |
| `ProfileTab` function | internal | delete (content moves to SettingsProfile) | `packages/web/src/components/SettingsPanel.tsx` |
| `ProductsTab` function | internal | delete (content moves to SettingsProducts) | `packages/web/src/components/SettingsPanel.tsx` |
| `AgentsTab` function | internal | delete (content moves -- agents/users are a sub-concern, possibly dropped or merged into OrgChart) | `packages/web/src/components/SettingsPanel.tsx` |
| `NotificationsTab` function | internal | delete (content moves to SettingsNotifications) | `packages/web/src/components/SettingsPanel.tsx` |
| `AppearanceTab` function | internal | delete (content moves to SettingsAppearance) | `packages/web/src/components/SettingsPanel.tsx` |
| `handleSettingsSave` | callback | delete from AppShell | `packages/web/src/layouts/AppShell.tsx` |
| `settings` state in AppShell | state | delete (sections manage own state) | `packages/web/src/layouts/AppShell.tsx` |
| `useSettings` hook usage in AppShell | hook | reduce scope (only used for density/theme now, or remove) | `packages/web/src/layouts/AppShell.tsx` |

---

## Phase 3 -- Design-It-Twice

### Decision 1: Where do settings types live?

**Option A: Keep in SettingsPanel.tsx as exports**
The `SettingsData`, `ProfileSettings`, `NotificationSettings`, etc. types stay in SettingsPanel.tsx even after the component is deleted. The file becomes a types-only module.

Trade-off: a types-only file named `SettingsPanel.tsx` is confusing. But no imports break.

**Option B: Move types to packages/shared or a new settings-types.ts**
Create `packages/web/src/settings/settings-types.ts` with all settings types. Update all imports.

Trade-off: import churn, but cleaner naming. The types are web-only (they reference React concepts like component props), so shared is wrong.

**Decision: Option B.** Create `packages/web/src/settings/settings-types.ts`. The import churn is small (SettingsPanel types are imported only in AppShell and useSettings). The new file also houses `SettingsSectionId` and `SETTINGS_SECTIONS` constants.

### Decision 2: How does the settings overlay interact with the Submenu collapse state?

**Option A: Settings always shows Submenu expanded**
When settingsOpen, force `submenuCollapsed = false` regardless of the user's toggle state. Settings needs the sidebar for navigation.

**Option B: Settings respects the current collapse state**
If the user collapsed the Submenu before opening settings, settings shows in collapsed mode too. The user toggles to expand.

**Decision: Option A.** Settings always needs the sidebar. A collapsed settings sidebar with 7 section labels is useless. When settings closes, restore the previous collapse state.

### Decision 3: Agents/Users tab in settings?

The current SettingsPanel has an "Agents" tab showing AI users with autonomy level and pause controls. The P4 spec lists 8 sections but does not include "Agents". The OrgChart section covers the review-routing hierarchy. Where do autonomy controls go?

**Option A: Drop Agents tab entirely**
The autonomy controls are per-user-skill, not a settings concern. They belong in a per-agent detail view (future work).

**Option B: Add an 8th section for Agents**
Keep the current functionality as a settings section.

**Decision: Option A.** The P4 spec explicitly lists 7 sections. The approved design shows 7 NavItems. Autonomy controls are a per-agent concern, not a global settings concern. The Agents tab functionality is not deleted -- it is deferred to a future agent detail view. The PATCH users/:id/skills/:skillId endpoint stays.

---

## Risks & Ambiguities

1. **AppShell complexity.** AppShell is already 800+ lines. Adding settings overlay logic will increase it. Mitigation: the section components are standalone, reducing AppShell's direct responsibility. The settings Submenu children and Main pane switch are small additions (~50 lines).

2. **useSettings hook scope reduction.** The hook currently returns the full SettingsData bundle. With per-section saves, some sections (Profile, OrgChart) do their own fetching. The hook's value decreases but is still needed for notifications data. Consider: leave the hook as-is, but individual sections also make their own API calls for saves. The hook provides initial data; sections manage their own dirty state.

3. **Toast context availability.** Settings section components render inside `<main>` which is inside `<ToastRegion>`. The `useToast()` hook is available. No issue.

4. **First-run race condition.** FirstRunRedirect makes parallel API calls. If the server is still starting (local mode), calls may fail. The current code already handles this by defaulting to /onboarding on error. Update: default to /setup on error.
