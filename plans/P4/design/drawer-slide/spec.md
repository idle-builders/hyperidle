# Variant C -- Drawer Slide (Linear-inspired)

**Constraint:** Take inspiration from Linear's settings UX: a full-viewport route with a fixed sidebar and scrollable content, where each section occupies its own scroll region. Linear treats settings as a workspace within the app -- not an overlay, not a modal -- with section-level save semantics.

**Thesis:** A proven interaction grammar (Linear settings) shortens the learning curve for power users who already use Linear, Notion, or similar tools. Settings is a place you go, not a thing you open.

---

## SetupFlow

**User story:** First-time founder configures HyperIdle with an efficient, form-dense single page.

### Layout

A single centered column with all four sections visible, separated by subtle spacing. Unlike Variant A's divider-heavy approach, this uses whitespace and section headings as the only hierarchy signal. The page is quiet -- more like a system preferences pane than a web form.

Each section is a fieldset-style block: section label left-aligned in text-lo, form content below. Sections have 24px vertical separation (density-page-gutter). No dividers.

```
 ┌─────────────────────────────────────────────────┐
 │                                                  │
 │   HyperIdle Setup                                │
 │                                                  │
 │   BACKEND MODE                                   │
 │   [Run locally          v]                       │
 │                                                  │
 │                                                  │
 │   YOUR IDENTITY                                  │
 │   Name  [________________________]               │
 │   Email [________________________]               │
 │                                                  │
 │                                                  │
 │   FIRST PRODUCT                                  │
 │   Name  [________________________]               │
 │   Repo  [folder] [___________________]           │
 │                                                  │
 │                                                  │
 │   API CREDENTIALS                                │
 │   Anthropic API Key [________________________]   │
 │   Without a key, agents cannot run.              │
 │                                                  │
 │   [Skip credentials]           [Start HyperIdle] │
 │                                                  │
 └─────────────────────────────────────────────────┘
```

### Component Composition

- Page wrapper: `div.flex.items-start.justify-center.min-h-screen.bg-[var(--surface-0)]`
- Content column: `div.w-full.max-w-md.py-16.px-[var(--density-page-gutter)]` (max-w-md = 448px -- tighter than Variant A's 512px)
- Page heading: `h1.text-[var(--density-text-h1)].font-medium.text-[var(--text-hi)].mb-8` -- "HyperIdle Setup" in mixed case, not uppercase mono. This is a page title, not chrome.
- Section labels: `h2.text-xs.font-heading.uppercase.tracking-wider.text-[var(--text-lo)].mb-3`
- Section spacing: `div.space-y-6` (24px gap between sections via utility)
- BackendMode: DaisyUI `select select-sm select-bordered w-full` instead of radio buttons. Two options: "Run locally" and "Connect to shared backend". Select is more compact than radio.
- Shared backend fields: Collapse/expand below the select when "Connect to shared" is chosen. `input` for URL, `input type=password` for key, `btn btn-ghost btn-xs` for "Test Connection".
- Identity fields: `input input-sm input-bordered`
- Product fields: Same as Onboarding.tsx -- name input + repo input with folder picker
- Credentials: Single `input type=password` for Anthropic key. One-line hint below in text-lo.
- Footer: `div.flex.justify-between.items-center.mt-8`. Skip on the left, Start on the right.
- Skip: `btn btn-ghost btn-sm text-[var(--text-mid)]` -- "Skip credentials"
- Start: `btn btn-primary btn-sm` -- "Start HyperIdle"

### Key Design Decision: Select vs Radio for BackendMode

A select dropdown instead of radio buttons for BackendMode. Rationale: radio buttons take 2 rows. A select takes 1 row. The 95% case is "Run locally" (the default) -- the user never interacts with this control. A select communicates "this is a preference" better than radio buttons for a binary choice.

### Information Hierarchy

1. **Page title** -- text-hi, font-medium. The only large text on the page.
2. **Section labels** -- uppercase mono, text-lo. Wayfinding without weight.
3. **Input values** -- text-hi, the focal point.
4. **Hints** -- text-lo, minimal. Only where the user genuinely needs context.
5. **Footer actions** -- Skip (ghost) and Start (primary). Clear asymmetry.

### States

- **Initial:** Backend select shows "Run locally". Identity and Product fields empty. Credentials empty. Start disabled until name + email + product name filled.
- **Shared backend:** Select changes. URL + key + test button appear below the select with 150ms expand (motion-medium). Test button triggers health check. Inline result: "Connected" or error.
- **Filling in:** As the user fills fields, Start enables once the minimum is met (name + email + product name). No per-step gating.
- **Validation:** On blur. Name, email, product name are required. Email must be valid format. Inline error below field in text-error.
- **Credential hint:** "Without a key, agents cannot run." -- factual, not promotional. Shown in text-lo below the credential input.

### Behavior

- **Keyboard:** Tab order: Backend select -> Name -> Email -> Product name -> Product repo -> Credential key -> Skip -> Start. Enter on Start submits.
- **Focus:** Backend select auto-focused on page load.
- **Motion:** Shared backend fields expand with motion-medium (150ms height transition on the container). Everything else is instant.

### Signature

**Quiet density.** The page is a single tight column with generous section spacing but compact field spacing. No dividers, no borders, no cards. Just labels and inputs on a flat surface. The setup feels like editing a config file with a nice GUI.

### Trade-offs

- **Bad at:** The select for BackendMode hides the shared option behind a click. A user who specifically wants shared mode must discover it in the dropdown.
- **Bad at:** All sections visible means the optional credential section is always in view, which may pressure the user to fill it in.
- **Good at:** Tightest layout of all three variants. Fits entirely above the fold on most desktop screens.
- **Good at:** No step transitions, no state machine. The simplest possible implementation.

---

## Settings

### Layout

Settings is a full-page route at `/settings` that replaces the AppShell layout entirely (like current /onboarding). It has its own two-column layout: a fixed sidebar (200px) and a scrollable content area. The sidebar shows section labels. The content area shows the active section.

This is the Linear model: settings is a separate workspace. You navigate there, do your configuration, and navigate back.

```
 ┌────────────────────┬────────────────────────────────────────┐
 │                    │                                         │
 │  Settings          │  Profile                                │
 │                    │                                         │
 │  > Profile         │  NAME                                   │
 │    Org Chart       │  [________________________]             │
 │    Credentials     │                                         │
 │    Notifications   │  EMAIL                                  │
 │    Appearance      │  [________________________]             │
 │    Products        │                                         │
 │    Backend         │                        [Save Profile]   │
 │                    │                                         │
 │                    │                                         │
 │                    │                                         │
 │  [<- Back]         │                                         │
 │                    │                                         │
 └────────────────────┴────────────────────────────────────────┘
```

### Component Composition

- Route: `/settings` and `/settings/:section` -- outside of AppShell, like /onboarding. Own layout component: `SettingsLayout.tsx`.
- Sidebar: `aside.w-[200px].h-screen.sticky.top-0.bg-[var(--surface-1)].border-r.border-[var(--border-subtle)].flex.flex-col.justify-between.p-[var(--density-pad-x)]`
- Sidebar title: `h1.text-sm.font-heading.uppercase.tracking-wider.text-[var(--text-lo)].mb-4` -- "Settings"
- Section links: `nav > a` styled as plain links. Active section: `text-[var(--text-hi)]` with `bg-[var(--surface-4)]` left-bar indicator (2px). Inactive: `text-[var(--text-mid)]`. Each link has min-h matching density-row-h and horizontal padding matching density-pad-x.
- Back button: `btn btn-ghost btn-xs text-[var(--text-mid)]` at the bottom of the sidebar. "<- Back" navigates to the last non-settings route.
- Content area: `main.flex-1.overflow-y-auto.p-[var(--density-page-gutter)]`
- Section heading: `h2.text-[var(--density-text-h2)].font-medium.text-[var(--text-hi)].mb-4`
- Field labels: `span.text-xs.font-heading.uppercase.tracking-wider.text-[var(--text-lo)]` -- same treatment as SetupFlow section labels.
- Form fields: DaisyUI `form-control` + `input input-sm input-bordered`
- Save buttons: Per-section. `btn btn-primary btn-sm` aligned right.

### Section Details

**Profile:**
```
Profile

NAME
[________________________]

EMAIL
[________________________]

                   [Save Profile]
```
Fields read from GET /api/settings (profile section). Save calls PATCH /api/users/:id with the human user's ID. Success toast. Error toast.

**Org Chart:**
```
Org Chart

Edges define who is responsible for whom. The system uses these to
route reviews and approvals.

FROM             MECHANISM      TARGET                 
────────────────────────────────────────────────────────
You              direct         code-architect     [x]
You              team           alpha-team         [x]

[+ Add Edge]

From     [You________v]
Type     [direct_____v]
Target   [____________v]
                           [Add]    [Cancel]
```

The table is a simple HTML table with monospace values for alignment. Add Edge expands an inline form below the table. Mechanism select filters the Target control: "direct" shows a user select, "function" shows a role select, "team" shows a team select.

**Credentials:** Existing CredentialsTab.

**Notifications:** Same as current. Save button at bottom.

**Appearance:**
```
Appearance

THEME
[System_________v]

DENSITY
[Auto___________v]
```
Both apply immediately on change. No save button.

**Products:**
```
Products

NAME                    STATUS
────────────────────────────────
My App                  [active v]
Other App               [archived v]
```
Status is a select with "active" and "archived". Changes immediately on select.

**BackendMode:**
```
Backend

Current mode: Local
The app is running an embedded server.

[Switch to Shared Backend]

Switching requires a restart.
```
Button shows a confirmation step inline: URL + key fields appear below. "Save and Restart" triggers config write + restart instruction.

### States

- **Loading:** Skeleton in content area.
- **Error:** ErrorState with retry.
- **Populated:** Pre-filled forms.
- **Saving:** Button disabled with spinner.
- **Dirty:** Save button enables when fields differ from fetched values.
- **Success:** Toast.
- **Section switch:** Instant. No transition. Content area scrolls to top.

### Behavior

- **Section navigation:** Click section link in sidebar. URL changes to /settings/:section. Content area renders the section.
- **Keyboard:** Tab through form. No global keyboard shortcuts (not inside AppShell).
- **Back:** Bottom sidebar button or browser back. Navigates to the previous non-settings route. AppShell remembers the last route.
- **Close:** There is no close button. Settings is a place, not a dialog. You leave by navigating away (Back button or browser back).

### Signature

**Settings is a workspace.** Full-page, own layout, own sidebar. Feels like macOS System Settings or Linear Settings. No modal semantics, no overlay, no dimming. The user is "in settings" as a distinct place in the app.

### Trade-offs

- **Bad at:** Full context switch. Leaving the current view entirely. The Rail, Submenu, and Main pane are all gone. The user loses all ambient context.
- **Bad at:** Requires managing "last route" state so Back works correctly. If the user refreshes on /settings, there is no "back" target.
- **Bad at:** Two different layout systems -- AppShell for the main app, SettingsLayout for settings. More code, more testing surface.
- **Good at:** Maximum content space. No width constraints from modal or Submenu sharing.
- **Good at:** URL-addressable sections. Deep-linkable.
- **Good at:** Clean mental model. Settings is a place with its own navigation. No overlay state to manage.
