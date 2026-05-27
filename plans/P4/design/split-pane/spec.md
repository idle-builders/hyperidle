# Variant B -- Split Pane Overlay

**Constraint:** Optimize for the single most common power-user task: change one setting quickly and return to work. Cut everything from the primary view that doesn't serve quick-tweak.

**Thesis:** Density and speed beat completeness. The settings surface is an overlay panel (not a modal, not a full page) that slides in from the right, taking over the Main pane but keeping the IconRail visible. The user stays oriented in the app. SetupFlow uses the same split-pane layout in full-page mode.

---

## SetupFlow

**User story:** First-time founder configures their HyperIdle installation in a focused, sequential flow.

### Layout

A full-page two-column layout. Left column (240px) shows section labels as a fixed sidebar. Right column (flex-1, max-w-lg) shows the active section's form. Only one section is visible at a time. The user completes a section and clicks "Next" to advance. Completed sections show a checkmark in the sidebar.

```
 ┌──────────────────┬─────────────────────────────────┐
 │                  │                                  │
 │  HYPERIDLE       │  BACKEND MODE                    │
 │  SETUP           │                                  │
 │                  │  How should HyperIdle run?       │
 │  [x] Backend     │                                  │
 │  [ ] Identity    │  ( ) Run locally                 │
 │  [ ] Product     │      Embedded server, no setup   │
 │  [ ] Credentials │                                  │
 │                  │  ( ) Connect to shared backend    │
 │                  │      [Server URL________]         │
 │                  │      [Shared Backend Key___]      │
 │                  │      [Test Connection]             │
 │                  │                                  │
 │                  │                      [Next ->]    │
 │                  │                                  │
 └──────────────────┴─────────────────────────────────┘
```

### Component Composition

- Page wrapper: `div.flex.h-screen.bg-base-100`
- Sidebar: `div.w-60.bg-[var(--surface-1)].border-r.border-[var(--border-subtle)].flex.flex-col.p-[var(--density-pad-x)]`
- Sidebar title: mono uppercase heading, text-lo
- Sidebar items: list of section labels with completion indicators. Not NavItem (no click navigation until completed). Plain text with a leading indicator: empty circle (pending), checkmark (done), filled circle (active).
- Content area: `div.flex-1.flex.items-start.justify-center.py-16`
- Content column: `div.w-full.max-w-lg`
- Section heading: `h2.text-[var(--density-text-h2)].font-medium.text-[var(--text-hi)].mb-1`
- Section description: `p.text-sm.text-[var(--text-mid)].mb-6` -- one line, factual, no marketing
- Form fields: DaisyUI `form-control` + `label` + `input input-sm input-bordered`
- Next button: `btn btn-primary btn-sm` aligned right
- Back link: `btn btn-ghost btn-xs` left of Next button (hidden on step 1)
- Skip button: `btn btn-ghost btn-sm` on step 4 only, left-aligned. Text: "Skip -- I'll add this in Settings"

### Section Navigation

- **Step 1 (Backend):** Pre-selects "Run locally". Next advances to step 2. If "Connect to shared" is selected, health check must pass before Next enables.
- **Step 2 (Identity):** Name and email fields. Both required. Next advances to step 3.
- **Step 3 (Product):** Name required, repo optional (with folder picker). Next advances to step 4.
- **Step 4 (Credentials):** Optional. "Skip" button + "Finish" button (replaces Next). Skip also navigates to main UI.
- **Sidebar:** Completed steps show a check. User can click completed steps to go back and edit. Cannot skip forward to uncompleted steps.

### Information Hierarchy

1. **Section heading** -- text-hi, font-medium. The user knows what this step is about.
2. **Section description** -- text-mid, one line. Contextual but not promotional.
3. **Form fields** -- full weight, text-hi inputs.
4. **Navigation** -- bottom-right, primary accent. Clear forward momentum.

### States

- **Initial (step 1):** Backend radio pre-selected to "Run locally". Next enabled.
- **Shared backend:** URL + key fields appear. "Test Connection" button. Status indicator: spinner during test, "Connected" on success, "Connection failed" on error. Next disabled until test passes.
- **Step transition:** No animation. Instant swap. The sidebar indicator updates. The content area replaces.
- **Validation:** Per-field inline errors. Next disabled while validation fails.
- **Step 4 skip:** Skip navigates to main UI. "Your agents won't be able to work without an API key. Add one in Settings > Credentials anytime."

### Behavior

- **Keyboard:** Tab through fields. Enter submits the current step (triggers Next).
- **Focus:** Content area auto-focuses the first field on each step.
- **Motion:** No transitions between steps. Instant content swap.
- **Back:** Browser back returns to the previous step (URL changes per step: /setup/backend, /setup/identity, /setup/product, /setup/credentials).

### Signature

**Sequential focus.** One thing at a time. The sidebar shows progress without being a "wizard" -- it is a table of contents with completion state, not a progress bar. The user can revisit completed steps but cannot skip ahead.

### Trade-offs

- **Bad at:** The sidebar takes up space for only 4 items. Feels over-engineered for a 4-step flow.
- **Bad at:** Step-by-step is inherently slower than single-scroll for a user who knows what they want.
- **Good at:** Focus. The user is never overwhelmed. Each section is isolated and clear.
- **Good at:** URL-addressable steps let the app resume setup if interrupted.

---

## Settings

### Layout

Settings is an overlay panel that replaces the Main pane content, keeping the IconRail visible. The Submenu becomes a settings navigation sidebar. The Rail stays visible but dims. This is the same z-layer treatment as the current SettingsPanel modal but wider and route-integrated.

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
 └──────┴──────────────┴───────────────────────────────┴──────┘
```

The key difference from Variant A: this is NOT a route navigation. The user's previous location is preserved. When they close settings, they return to exactly where they were. Settings state is managed as an overlay state on AppShell, similar to the current modal but using the Submenu + Main pane instead of a floating box.

### Component Composition

- **Entry:** Avatar click on IconRail sets `settingsOpen = true` on AppShell. No route change.
- **Submenu replacement:** When settingsOpen, the Submenu renders settings sections instead of the view-specific content. The Submenu title becomes "Settings". 8 NavItems replace the view items.
- **Main pane replacement:** When settingsOpen, the Main pane renders the active settings section instead of the Outlet content. The Main pane content is swapped, not overlaid.
- **IconRail:** Stays interactive. The avatar shows an "active" state (primary left bar) while settings is open. Clicking another view icon closes settings and navigates.
- **Rail:** Stays visible but content dimmed (opacity 60%) and pointer-events disabled (same treatment as current modal backdrop).
- **Close:** Clicking the avatar again toggles settings off. Or clicking any view icon (Conversations/Work/Knowledge) closes settings and navigates. Escape key closes settings.
- **Section state:** Local React state, not URL. `activeSettingsSection` on AppShell.

### Section Details

**Profile:**
```
Name  [________________]
Email [________________]
            [Save Profile]
```
Save button calls PATCH /api/users/:id. Toast on success/error.

**OrgChart:**
```
RESPONSIBILITY EDGES                    [+ Add Edge]

From            Mechanism    Target          
───────────────────────────────────────────────────
You             direct       agent-1          [x]
You             team         alpha-team       [x]
agent-1         function     engineer         [x]

Add edge:
From   [select v]  Mechanism [select v]  Target [select/input v]  [Add]
```
Table of existing edges. Delete button (x) per row. "Add Edge" expands an inline form row at the bottom. Reads from GET /api/org.

**Credentials:** Existing CredentialsTab component, no changes.

**Notifications:**
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

**Appearance:**
```
Theme       [System v]     <- immediate-apply
Density     [Auto v]       <- immediate-apply
```
No save button. Both apply immediately. Theme via useTheme(), density via client-local config.

**Products:**
```
Product A     [active toggle]
Product B     [active toggle]
```
Toggle calls existing product update API.

**BackendMode:**
```
Current mode: Local

To switch to a shared backend, you will need to restart HyperIdle.
[Switch to Shared Backend]
```
Switch button changes client-local config and shows a message: "Configuration saved. Restart HyperIdle to connect to the shared backend."

### States

- **Loading:** Skeleton in the Main pane matching the form layout. Submenu section list renders immediately (static).
- **Error:** ErrorState in the Main pane with retry.
- **Populated:** Forms pre-filled from API.
- **Saving:** Save button disabled with spinner. Other sections navigable during save.
- **Success:** Toast via ToastRegion.
- **Dirty state:** Save button enabled only when form differs from last-saved values. Navigating away from a dirty section with unsaved changes shows no warning (explicit-save model, not auto-save).

### Behavior

- **Section switch:** Clicking a NavItem in the Submenu swaps the Main pane content. No animation.
- **Keyboard:** Escape closes settings (returns to previous view). Tab through form fields.
- **Focus:** First field of each section receives focus on section switch.
- **Close:** Avatar toggle, Escape, or clicking a view icon. Return to previous Submenu + Main content.

### Signature

**Overlay without a modal.** Settings takes over the Submenu + Main pane but keeps the shell chrome (IconRail, Rail). The user stays inside the app. No dialog, no z-40 overlay, no backdrop. The mental model is "I swapped what I'm looking at" not "I opened a floating box."

### Trade-offs

- **Bad at:** Complexity. Managing the Submenu content swap (settings sections vs view sections) and Main pane swap (settings form vs Outlet) adds state management complexity to AppShell.
- **Bad at:** URL deep-linking to a specific settings section is not possible (state-based, not route-based).
- **Good at:** Speed. The user's position in the app is preserved. Close settings = back to exactly where you were.
- **Good at:** Full Main pane width for forms. No modal width constraint.
- **Good at:** Familiar spatial model. The Submenu has always been a navigation sidebar. Settings just provides different navigation items.
