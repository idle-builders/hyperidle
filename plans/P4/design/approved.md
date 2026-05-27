# P4 Approved Design -- SetupFlow and Settings Redesign

Based on synthesis: Variant B (Split Pane Overlay) as the base, with SetupFlow from Variant A (single scroll) and styling from Variant C (quiet density).

---

## 1. SetupFlow

### Layout

Full-page route at `/setup`, outside AppShell. Single centered column, all 4 sections visible, user scrolls.

```
 ┌─────────────────────────────────────────┐
 │                                          │
 │   HyperIdle Setup                        │
 │                                          │
 │   BACKEND MODE                           │
 │   [Run locally          v]               │
 │                                          │
 │   YOUR IDENTITY                          │
 │   Name  [________________________]       │
 │   Email [________________________]       │
 │                                          │
 │   FIRST PRODUCT                          │
 │   Name  [________________________]       │
 │   Repo  [folder] [___________________]   │
 │                                          │
 │   API CREDENTIALS                        │
 │   Anthropic API Key [________________]   │
 │   Without a key, agents cannot run.      │
 │                                          │
 │   [Skip credentials]   [Start HyperIdle] │
 │                                          │
 └─────────────────────────────────────────┘
```

### Component Mapping

| Element | Component / Primitive | Props / Classes |
|---|---|---|
| Page wrapper | `div` | `flex items-start justify-center min-h-screen bg-[var(--surface-0)]` |
| Content column | `div` | `w-full max-w-md py-16 px-[var(--density-page-gutter)]` |
| Page title | `h1` | `text-[var(--density-text-h1)] font-medium text-[var(--text-hi)] mb-8` -- "HyperIdle Setup" in mixed case |
| Section label | `h2` | `text-xs font-heading uppercase tracking-wider text-[var(--text-lo)] mb-3` |
| Section gap | wrapper `div` | `space-y-6` (24px between sections) |
| BackendMode | DaisyUI `select select-sm select-bordered w-full` | Options: "Run locally", "Connect to shared backend" |
| Shared fields | `div` (conditionally rendered) | `mt-2 space-y-2` -- URL input, key input, Test button |
| Test button | DaisyUI `btn btn-ghost btn-xs` | "Test Connection" -- inline status after click |
| Text inputs | DaisyUI `input input-sm input-bordered w-full` | `text-[var(--text-hi)]` values |
| Field labels | `label > span.label-text` | `text-[var(--text-mid)]` |
| Folder picker | SVG button + input | Reuse pattern from current Onboarding.tsx |
| Credential input | DaisyUI `input input-sm input-bordered w-full` | `type="password"` |
| Credential hint | `p` | `text-sm text-[var(--text-lo)]` -- "Without a key, agents cannot run." |
| Skip button | DaisyUI `btn btn-ghost btn-sm` | `text-[var(--text-mid)]` -- "Skip credentials" |
| Start button | DaisyUI `btn btn-primary btn-sm` | "Start HyperIdle" -- disabled until name + email + product name filled |
| Footer | `div` | `flex justify-between items-center mt-8 pt-4 border-t border-[var(--border-subtle)]` |

### States

**Initial:** Backend select shows "Run locally". Identity and Product fields empty. Credential field empty. Start button disabled. Skip button enabled.

**Shared backend selected:** Below the select, three fields appear: Server URL (input), Shared Backend Key (password input), Test Connection (btn btn-ghost btn-xs). Test button fires a health check. Inline status: "Connected" (text-ok/text-mid depending on monochrome philosophy) or "Connection failed" (text-error/danger).

**Fields filling:** As the user types, validation runs on blur. Required: name, email, product name. Email must match a basic format. Product repo is optional. Start enables once name + email + product name are non-empty. If shared backend mode: URL must be provided and health check must pass.

**Validation error:** Below the relevant field: `p.text-sm.text-error` with the error message. "Name is required", "Invalid email format", "Product name is required".

**Submitting:** Start button shows `loading loading-spinner loading-xs` + disabled. On success: creates config, creates user row, creates product, navigates to /conversations.

**Credential validation:** After entering API key, an inline "Validate" button appears (btn btn-ghost btn-xs). On click: spinner, then "Valid" or "Invalid -- check your key" inline.

### Behavior

- **Route:** `/setup` -- outside AppShell, same slot as current `/onboarding`
- **Keyboard:** Tab through all fields in order. Enter on Start submits.
- **Focus:** BackendMode select auto-focused on page load.
- **Motion:** No transitions. Static page. Shared backend fields appear instantly (no animation).
- **Scroll:** Natural browser scroll.
- **Exit:** After successful submit, navigate to `/conversations`. The setup route is not revisitable once setup is complete.

### Mobile

Not designed for mobile per spec. Desktop-only.

---

## 2. Settings Redesign

### Layout

Settings is an **overlay mode** on AppShell. Avatar click flips `settingsOpen` state. When true:
- The Submenu renders settings section NavItems instead of view-specific content
- The Main pane renders the active settings section's form instead of the Outlet
- The Rail stays visible but dimmed (opacity 60%, pointer-events disabled) -- same treatment as the current SettingsPanel modal
- The IconRail stays fully interactive. View icons close settings and navigate. Avatar shows active state.

```
 ┌──────┬──────────────┬───────────────────────────────┬──────┐
 │ Icon │  SETTINGS    │  PROFILE                      │ Rail │
 │ Rail │              │                                │(dim) │
 │      │  > Profile   │  Name  [________________]      │      │
 │      │    OrgChart   │  Email [________________]      │      │
 │      │    Credentials│                                │      │
 │      │    Notifs     │              [Save Profile]    │      │
 │      │    Appearance │                                │      │
 │      │    Products   │                                │      │
 │      │    Backend    │                                │      │
 │      │              │                                │      │
 │      │  [<- Back]    │                                │      │
 └──────┴──────────────┴───────────────────────────────┴──────┘
```

### Component Mapping

**AppShell changes:**

| Element | Change |
|---|---|
| `settingsOpen` state | Already exists. Keep it. |
| `activeSettingsSection` state | New. Type: `SettingsSectionId`. Default: `"profile"`. |
| Submenu content | When `settingsOpen`: render settings NavItems instead of view-specific items. Title becomes "Settings". |
| Main pane content | When `settingsOpen`: render settings section component instead of `<Outlet>`. |
| Rail | When `settingsOpen`: add `opacity-60 pointer-events-none` classes. |
| Avatar | When `settingsOpen`: show `active` indicator (primary left bar on the avatar button). |
| Close triggers | Avatar re-click, Escape key, clicking any view icon (Conversations/Work/Knowledge). |
| Submenu footer | When `settingsOpen`: render a "Back" button that closes settings. |

**Settings Sections:**

Each section is a standalone component that receives its required data and callbacks.

| Section | Component | Entry point |
|---|---|---|
| Profile | `SettingsProfile` | `GET /api/settings` (profile), `PATCH /api/users/:id` (save) |
| OrgChart | `SettingsOrgChart` | `GET /api/org`, `PUT /api/org/edges`, `DELETE /api/org/edges/:id` |
| Credentials | `CredentialsTab` (existing) | Window bridge API |
| Notifications | `SettingsNotifications` | `GET /api/settings` (notifications), `PATCH /api/settings` |
| Appearance | `SettingsAppearance` | `useTheme()`, client-local config |
| Products | `SettingsProducts` | `GET /api/settings` (products), product update API |
| Backend | `SettingsBackend` | Client-local config, window bridge |

### Section: Profile

```
Profile

Name  [________________________]
Email [________________________]

                   [Save Profile]
```

- Fields: name (text), email (email). Pre-filled from GET /api/settings profile data.
- Save: `btn btn-primary btn-sm` "Save Profile". Calls `PATCH /api/users/:id` with `{ name, email }`. The user ID comes from useCurrentUser().
- Feedback: Toast "Profile saved" on success, "Failed to save profile" on error.
- Dirty tracking: Save button enabled only when fields differ from last-saved values.

### Section: OrgChart

```
Org Chart

Edges define who is responsible for whom.

FROM             MECHANISM      TARGET
─────────────────────────────────────────────
You              [direct]       code-architect     [x]
You              [team]         alpha-team         [x]
code-architect   [function]     engineer           [x]

[+ Add Edge]

(inline add form when expanded:)
From   [select v]  Mechanism [select v]  Target [select v]  [Add]  [Cancel]
```

- Table: HTML table with mono column values. Mechanism values in surface-ghost badge (`span` with `px-[6px] py-[1px] rounded-[var(--r1)] bg-[var(--surface-ghost)] font-mono text-xs text-[var(--text-mid)]`).
- Delete: `button` per row, shows `x` glyph. Calls `DELETE /api/org/edges/:id`.
- Add: "Add Edge" button below table. Expands inline form with three controls:
  - From: `select` populated from users list (GET /api/org users).
  - Mechanism: `select` with options "direct", "function", "team".
  - Target: context-dependent control. "direct" -> user select, "function" -> role select, "team" -> team select. Falls back to text input if no teams/roles exist.
  - Add button: `btn btn-primary btn-xs`. Calls `PUT /api/org/edges`.
  - Cancel button: `btn btn-ghost btn-xs`. Collapses the form.
- Empty state: "No edges defined. All reviews will be sent to all human users."
- Data: reads from GET /api/org (returns edges + denormalized users).

### Section: Credentials

Reuse existing `CredentialsTab` component unchanged. It already handles the catalog display, validation, and bridge API.

### Section: Notifications

```
Review alerts      [toggle]
Cost alerts        [toggle]
Blocker alerts     [toggle]

QUIET HOURS
Start [22:00]  End [08:00]

MUTE BY PRODUCT
Product A          [toggle]
Product B          [toggle]

                [Save Notifications]
```

- Same content as current NotificationsTab.
- Save: `btn btn-primary btn-sm` "Save Notifications". Calls `PATCH /api/settings` with `{ notifications: { ... } }`.
- Validation: Quiet hours must be valid HH:MM format. Inline error below the field.

### Section: Appearance

```
Theme       [System v]
Density     [Auto v]
```

- Theme: `select select-sm select-bordered w-full`. Options: System, Dark, Light. Applies immediately via `useTheme().setTheme()`. No save button.
- Density: `select select-sm select-bordered w-full`. Options: Auto, Compact, Default, Comfortable. Applies immediately. Persists to client-local config (via window bridge if available, otherwise localStorage).
- Hint below each: "Applied immediately" in `text-xs text-[var(--text-lo)]`.

### Section: Products

```
NAME                    STATUS
──────────────────────────────────
My App                  [active/archived toggle]
Other App               [active/archived toggle]
```

- Each product row: name (text-hi) + toggle (DaisyUI toggle). Toggle changes product phase between active and archived.
- Changes apply immediately. No save button.

### Section: BackendMode

```
Current mode: Local

The app is running an embedded server on this machine.

[Switch to Shared Backend]

Switching requires a restart.
```

- Shows current mode as inline badge (surface-ghost background, mono text).
- Description: one factual sentence about the current mode.
- Switch button: `btn btn-ghost btn-sm`. Clicking expands a form below: Server URL input, Shared Backend Key input, "Save and Restart" button.
- Restart warning: `text-xs text-[var(--text-lo)]` -- "Switching requires a restart."
- On save: writes to client-local config. Shows "Configuration saved. Restart HyperIdle to apply."

### States (all sections)

| State | Behavior |
|---|---|
| **Loading** | Skeleton matching the form layout (DaisyUI `skeleton`). Submenu section list renders immediately (static). |
| **Error** | ErrorState with retry button in the Main pane. |
| **Populated** | Forms pre-filled from API/config. |
| **Saving** | Save button disabled with `loading loading-spinner loading-xs`. Other sections navigable during save. |
| **Success** | Toast via ToastRegion -- "Profile saved", "Notifications saved", etc. |
| **Validation error** | Inline `p.text-sm.text-error` below the relevant field. Save button stays enabled but shows errors on click. |
| **Dirty** | Save button enabled only when form values differ from last-saved state. |
| **Clean** | Save button disabled (greyed out). |

### Behavior

- **Entry:** Avatar click sets `settingsOpen = true`. `activeSettingsSection` defaults to "profile".
- **Section switch:** Click NavItem in Submenu. Sets `activeSettingsSection`. Main pane content swaps instantly (no animation).
- **Close:** Avatar re-click, Escape key, or clicking any view icon (Conversations/Work/Knowledge). `settingsOpen = false`. Submenu and Main pane restore to their previous view-specific content.
- **Keyboard:** Escape closes settings. Tab through form fields in the active section.
- **Focus:** First field of the active section receives focus on section switch.
- **Settings via ?settings=open:** Existing URL-param-based opening still works. The param triggers `settingsOpen = true` and is consumed.
- **Settings via menu:** `window.__HYPERIDLE__.onOpenSettings` callback triggers `settingsOpen = true`.

### Copy Register

All copy is terse and factual. No marketing language.

- Section headings: "Profile", "Org Chart", "Credentials", "Notifications", "Appearance", "Products", "Backend"
- Save buttons: "Save Profile", "Save Notifications"
- OrgChart empty: "No edges defined. All reviews will be sent to all human users."
- Backend description: "The app is running an embedded server on this machine."
- Credential hint: "Without a key, agents cannot run."
- Skip: "Skip credentials"
- Start: "Start HyperIdle"

---

## 3. FirstRunRedirect Changes

`FirstRunRedirect` currently checks only for products. It needs to check for setup completion:

1. **Config file exists** -- client-local config has `backendMode` set (not null)
2. **User row exists** -- GET /api/users returns at least one human user
3. **Product exists** -- GET /api/products returns at least one product

If any check fails, redirect to `/setup` instead of `/onboarding`.

---

## 4. Rejected (do not revisit in /architecture or /write-code)

- Settings as a route (/settings) -- stay as overlay mode
- Own layout for settings (SettingsLayout.tsx) -- reuse AppShell
- Step-by-step setup with sidebar navigation
- URL-addressable settings sections -- state-based, not route-based
- 4th view icon in IconRail for Settings
- Global save button across all sections
- Auto-save for non-appearance settings
- Graphical org chart tree diagram (table/list is v1)
- Mobile form factor for settings

---

## 5. Open Questions for Architect

1. **PATCH /api/users/:id** -- needs to be implemented. Only skills PATCH exists today. What fields are writable? Proposed: `{ name?: string, email?: string }`. Only the authenticated user can patch their own profile.

2. **Density persistence** -- currently session-only. The spec says "persists to client-local config." How does this work in the web (non-Electron) case? Proposed: localStorage fallback when window.__HYPERIDLE__ is unavailable.

3. **Setup completion check** -- FirstRunRedirect needs a single API call that returns setup status. Options: (a) a new `GET /api/setup/status` endpoint, (b) client-local config check (Electron-only -- web needs server check), (c) composite check in the browser (config + user + products). Proposed: (c) -- three parallel fetches, no new endpoint.

4. **Setup submission** -- the SetupFlow form needs to call multiple APIs in sequence: (1) write client-local config (BackendMode), (2) POST /api/users to create human user, (3) POST /api/products to create product, (4) optionally set credential via bridge. What is the error recovery if step 2 succeeds but step 3 fails? Proposed: idempotent retries -- user can re-submit and existing resources are not duplicated.

5. **Submenu content swapping** -- what is the cleanest React pattern for conditionally rendering settings content vs view content in Submenu? The Submenu component currently receives `children`. Proposed: AppShell passes different children when settingsOpen is true. Submenu itself does not change.

6. **onOpenSettings bridge callback** -- the existing callback from Electron's application menu should trigger `settingsOpen = true`. This already works with the current modal. Confirm it still works with the overlay pattern.
