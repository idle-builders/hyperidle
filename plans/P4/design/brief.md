# P4 Design Brief -- SetupFlow and Settings Redesign

DESIGN-CLASS: novel  ref=none  pattern=none

## Surfaces

Two UI surfaces with distinct user tasks:

### 1. SetupFlow (first-run boot gate)
- **User task:** "I just installed this. Get me to a working state."
- **Primary state:** Populated (the user is filling in forms). No loading, no empty state.
- **Steps:** BackendMode (defaults to local) -> User Identity (name + email) -> First Product (name + repo path) -> Credentials (optional/deferrable)
- **Blocking:** Steps 1-3 must complete before main UI renders. Step 4 is skippable.
- **Constraint:** Must NOT feel like an onboarding wizard. No progress dots, no oversized cards, no marketing copy. Professional instrument configuration aesthetic.
- **Entry:** Full-page route outside AppShell (like current /onboarding). Rendered when FirstRunRedirect detects incomplete setup.
- **Exit:** After step 3 minimum, navigate to /conversations (main UI).

### 2. Settings Redesign
- **User task:** "Change a specific setting and have it stick."
- **Bug to fix:** Profile edits silently revert (PATCH /api/settings only saves notifications, not profile).
- **Entry:** Avatar click on IconRail (same as today). No new navigation paradigm.
- **8 sections:** Profile, OrgChart, Credentials, Notifications, Appearance, Products, BackendMode
- **Constraint:** Must not be tabs-in-a-modal. Too much content for a modal. Settings is a proper surface.
- **Persistence routes:** Profile -> PATCH /api/users/:id (new), Appearance -> client-local config, Notifications -> PATCH /api/settings, Credentials -> encrypted store via bridge.

## Design Constraints (from spec + design system)

- Desktop-first. No mobile form factor for Settings.
- 8-12px default padding. Density tokens for all spacing.
- Semantic color tokens only.
- Closed radius scale (r0/r1/r2/r3/r-pill).
- No AI-aesthetic patterns: no wizard progress dots, no gradient backgrounds, no hero sections, no marketing copy, no oversized padding.
- Component budget: no new custom components. Both surfaces are page-level compositions using DaisyUI primitives.
- Existing CredentialsTab component reused as-is in both SetupFlow and Settings.
- Shell layout: IconRail | Submenu | Main | Rail. Settings must work within this layout or as an overlay that follows existing patterns (like GlobalSearchPanel).

## Settled Questions

- **SetupFlow is a full-page route** (/setup), not inside AppShell. Same pattern as current /onboarding.
- **Step 4 (Credentials) is optional.** Clear Skip button. Revisitable in Settings.
- **Settings entry point unchanged.** Avatar click in IconRail opens settings.
- **OrgChart v1 is a table/list of edges.** No graphical tree diagram.
- **All state changes explicit.** Save button or immediate-apply with clear feedback.
