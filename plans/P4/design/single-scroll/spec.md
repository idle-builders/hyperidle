# Variant A -- Single Scroll

**Constraint:** Smallest possible component count. Reuse existing DaisyUI primitives without inventing anything new. Both SetupFlow and Settings are single scrollable pages with section anchors.

**Thesis:** Prove the feature ships with zero new shapes. Everything is `form-control` + `input` + `btn` + `divider` arranged vertically. The user scrolls.

---

## SetupFlow

**User story:** First-time founder configures their HyperIdle installation in one continuous scroll.

### Layout

A single full-page scroll with four labeled sections stacked vertically. No sidebar, no progress indicator, no step navigation. The page heading is terse: "Configure HyperIdle". Each section has a mono uppercase label (font-heading) and a border-subtle bottom divider.

The page is vertically centered on first paint (the first section starts at ~40% viewport height). As the user fills in fields and scrolls, the page content grows naturally.

```
 ┌─────────────────────────────────────────┐
 │                                          │
 │   CONFIGURE HYPERIDLE                    │
 │                                          │
 │   ── BACKEND ──────────────────────────  │
 │   ( ) Run locally (default)              │
 │   ( ) Connect to shared backend          │
 │       [Server URL________] [Test]        │
 │                                          │
 │   ── IDENTITY ─────────────────────────  │
 │   Name  [________________]               │
 │   Email [________________]               │
 │                                          │
 │   ── FIRST PRODUCT ────────────────────  │
 │   Name  [________________]               │
 │   Repo  [folder] [_______________]       │
 │                                          │
 │   ── CREDENTIALS (optional) ───────────  │
 │   Anthropic API Key [________________]   │
 │   [Skip]                    [Validate]   │
 │                                          │
 │                         [Start HyperIdle]│
 │                                          │
 └─────────────────────────────────────────┘
```

### Component Composition

- Page wrapper: `div.flex.items-start.justify-center.min-h-screen.bg-base-100`
- Content column: `div.w-full.max-w-lg.py-16` (max-w-lg = 512px -- tight)
- Page heading: `h1` with `text-[var(--density-text-h1)] font-heading uppercase tracking-wider text-[var(--text-lo)]`
- Section labels: `div.divider.text-xs.text-[var(--text-lo)]` (DaisyUI divider with text)
- Form fields: DaisyUI `form-control` + `label` + `input input-sm input-bordered`
- Radio group (BackendMode): DaisyUI `radio` + `label` stacked vertically
- Shared backend URL field: conditionally shown when "Connect to shared" selected. `input` + `btn btn-ghost btn-xs` for "Test" health check.
- Folder picker: SVG folder icon button (reuse from Onboarding.tsx) + input
- Skip button: `btn btn-ghost btn-sm text-[var(--text-mid)]`
- Primary CTA: `btn btn-primary btn-sm` -- "Start HyperIdle" (disabled until steps 1-3 complete)
- Validation errors: `p.text-sm.text-error` below the relevant field

### Information Hierarchy

1. **Section labels** -- mono uppercase, text-lo, divider treatment. The user knows where they are.
2. **Input fields** -- full visual weight, text-hi values. The user is filling these in.
3. **CTA** -- primary accent, bottom of page. Visible only after scrolling through all sections.

### States

- **Initial:** All sections visible. Backend defaults to "Run locally" (radio pre-selected). Identity and Product fields empty. Credentials section has descriptive hint: "Add your Anthropic API key so agents can start working. You can do this later in Settings."
- **Partial:** User fills in identity. Product fields appear at natural scroll position. CTA stays disabled.
- **Complete (step 3):** Name + email + product name filled. CTA enables. Text changes to "Start HyperIdle" if no credential, or "Start HyperIdle" always (credential is not gating).
- **Shared backend selected:** URL field appears with a "Test" button. Health check runs on blur or Test click. Shows inline status: "Connected" (text-ok) or "Connection failed -- check URL" (text-error).
- **Error:** Per-field validation. "Name is required", "Invalid email format", "Product name is required". Shown below the field in text-error.
- **Credential validation:** After entering API key, "Validate" button fires validation. Shows "Valid" or "Invalid -- check your key" inline.

### Behavior

- **Keyboard:** Tab through all fields in document order. Enter on the last field or CTA submits.
- **Focus:** No focus trap (not a modal). Standard page focus behavior.
- **Motion:** None. No transitions, no animations. The page is static.
- **Scroll:** Natural browser scroll. No smooth-scroll-to-section.

### Mobile Adaptation

Not applicable -- SetupFlow is desktop-only per spec.

### Signature

**Everything visible at once.** No step transitions, no reveal, no animation. The user sees the entire configuration surface and fills it in top to bottom. The "professional instrument" feel comes from the absence of theater -- there is nothing to animate because there is nothing hidden.

### Trade-offs

- **Bad at:** Long scroll on small screens (but desktop-only per spec). No sense of progress or completion -- the user just scrolls down. The credential section is always visible even though it is optional, which may create a false sense of obligation.
- **Bad at:** Discoverability of the shared backend option -- it is a radio button inline, not a prominent choice point.
- **Good at:** Zero complexity. Zero state. Zero transitions. Ships fast. Nothing can break.

---

## Settings

### Layout

Settings becomes a full-page route at `/settings`. Avatar click navigates to `/settings` instead of opening a modal. The page uses the AppShell layout: the Submenu shows the 8 settings sections as NavItems, and the Main pane shows the selected section's form.

```
 ┌──────┬──────────────┬───────────────────────────────┬──────┐
 │ Icon │  SETTINGS    │  PROFILE                      │ Rail │
 │ Rail │              │                                │      │
 │      │  > Profile   │  Name  [________________]      │      │
 │      │    OrgChart   │  Email [________________]      │      │
 │      │    Credentials│                                │      │
 │      │    Notifs     │  [Save]                        │      │
 │      │    Appearance │                                │      │
 │      │    Products   │                                │      │
 │      │    Backend    │                                │      │
 │      │              │                                │      │
 │      │  [<- Back]    │                                │      │
 └──────┴──────────────┴───────────────────────────────┘──────┘
```

### Component Composition

- Route: `/settings` and `/settings/:section` nested under AppShell
- Submenu: reuses existing Submenu component. Title = "Settings". Items = 8 NavItems for sections.
- Back button: `btn btn-ghost btn-xs` at bottom of Submenu. Navigates to previous view.
- Main pane: section-specific form content. Each section is its own component.
- Section heading: `h2` with `text-[var(--density-text-h2)] font-heading uppercase tracking-wider text-[var(--text-lo)]`
- Form fields: DaisyUI `form-control` + `label` + `input/select/toggle`
- Save button: `btn btn-primary btn-sm` per section (not a global save). Each section saves independently.
- Feedback: Success/error via ToastRegion (already exists in AppShell)

### Section Details

**Profile:** Name + Email fields. "Save" button calls PATCH /api/users/:id. No avatarUrl field (no upload exists yet).

**OrgChart:** Table of edges with columns: From (user name), Mechanism (direct/function/team), Target (user/role/team name). "Add edge" button opens an inline row with three selects. Delete button per row. Reads from GET /api/org, writes via PUT /api/org/edges and DELETE /api/org/edges/:id.

**Credentials:** Reuses existing CredentialsTab component as-is. Already handles catalog display and validation.

**Notifications:** Identical to current NotificationsTab content. Alert toggles + quiet hours + muted products. Saves via PATCH /api/settings.

**Appearance:** Theme select + Density select. Theme saves to localStorage via useTheme(). Density saves to client-local config. Both apply immediately (no save button needed -- use immediate-apply).

**Products:** List of products with active/archived toggle per product. Same as current ProductsTab.

**BackendMode:** Shows current mode (Local/Shared). If shared, shows server URL. "Switch to local" / "Switch to shared" button with restart warning: "Switching backend mode requires restarting HyperIdle." No inline switch -- the button triggers the mode change and shows a "Restart required" message.

### States

- **Loading:** Skeleton placeholder matching the form layout.
- **Error:** ErrorState with retry button.
- **Populated:** Form fields pre-filled with current values.
- **Saving:** Save button shows loading spinner. Disabled while saving.
- **Success:** Toast "Settings saved" via ToastRegion.
- **Validation error:** Inline per-field errors in text-error.

### Behavior

- **Navigation:** Clicking a NavItem in the Submenu navigates to `/settings/:section`. URL reflects the active section.
- **Keyboard:** Tab through form fields. Escape does nothing (not a modal anymore).
- **Back:** Back button returns to the previous view (conversations/work/knowledge). Browser back also works naturally.
- **Save:** Per-section save buttons. No global save. Each section persists independently.
- **Immediate-apply:** Appearance (theme + density) applies immediately on change. No save button for appearance.

### Signature

**Settings as a proper view.** Settings has its own route, its own Submenu section, its own URL. It is not a modal overlay -- it is a first-class surface in the app. The user navigates to it and navigates back.

### Trade-offs

- **Bad at:** Context switch. Opening settings means leaving the current view entirely. The user loses their place in conversations/work/knowledge. The "quick tweak" use case (change one toggle and go back) requires a full navigation round-trip.
- **Bad at:** The IconRail needs a 4th view icon for Settings, or the avatar click navigates away from the current view which breaks the mental model of "avatar = overlay".
- **Good at:** Full screen real estate for complex sections (OrgChart table, credential management). URL-addressable sections (deep links). No modal/overlay complexity.
