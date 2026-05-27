# P4 Design Synthesis

## Strongest Base: Variant B (Split Pane Overlay)

Variant B scores highest (73/90) and has the strongest coherence with the existing app architecture. The key insight: **settings is an overlay mode of the existing shell, not a separate destination.** The user clicks their avatar, the Submenu swaps to show settings sections, the Main pane swaps to show the active section's form. When they close settings, they return to exactly where they were. This is the fastest path for the "quick tweak" use case and respects the existing mental model of the avatar as an overlay trigger.

## Elements Pulled from Other Variants

### From Variant A: SetupFlow as single scroll

Variant B's split-pane SetupFlow (sidebar + step-by-step content) is overdesigned for 4 steps. Variant A's single-scroll approach is simpler and more appropriate: all sections visible, no step transitions, no sidebar. The setup flow is a ~1 minute task the user does once. It does not need a navigation system.

**Specific pull:** Use Variant A's SetupFlow layout (single centered column, all sections visible, bottom CTA) but with Variant C's tighter styling (max-w-md, no dividers between sections, section labels as uppercase mono, whitespace as the only separator).

### From Variant C: OrgChart table styling

Variant C's mechanism badge treatment (inline `mech-badge` with surface-ghost background) is cleaner than Variant B's plain text. Pull the badge treatment for mechanism values in the OrgChart table.

### From Variant C: All sections scrollable in content area

Variant C's mockup demonstrates that showing multiple sections in a scrollable content area (rather than strictly one section at a time) can work well for settings pages where sections are small. However, for P4 the section-per-view approach (one section at a time in the Main pane) is cleaner and matches the Submenu navigation pattern. **Rejected:** scrolling through all sections.

## Explicitly Rejected

1. **Settings as a route.** Both A and C move settings to its own route (/settings). This breaks the current mental model where avatar click opens an overlay. The user would lose their position in the app. **Rejected because:** the "quick tweak" use case (change one toggle, go back) is the most common settings interaction, and it should be the fastest.

2. **Own layout for settings (SettingsLayout.tsx).** Variant C introduces a second layout system. This doubles the layout testing surface and creates inconsistency. **Rejected because:** settings content is simple forms, not complex enough to justify a dedicated layout.

3. **Step-by-step setup with sidebar.** Variant B's split-pane setup with completion indicators is too heavy for 4 form sections. **Rejected because:** the user does this once. Simplicity wins over navigation affordance.

4. **URL-addressable settings sections.** Variant C uses /settings/:section. This is nice for deep-linking but adds routing complexity and prevents the overlay pattern. **Rejected because:** nobody deep-links to settings. The avatar click is the entry point.

5. **4th view in IconRail.** Variant A (settings as route) would require either a Settings icon in the IconRail or the avatar to navigate away. **Rejected because:** the IconRail has 3 views (Conversations, Work, Knowledge). Settings is not a view -- it is a configuration surface.

6. **Global save button.** All variants use per-section saves. **Rejected:** a single global "Save all" button that batches changes across sections. Per-section saves are clearer about what persists where.

7. **Auto-save for forms.** **Rejected because:** the spec says "all state changes explicit (save button or immediate-apply with clear feedback)." Immediate-apply is reserved for Appearance (theme + density) because the effect is visible immediately. Everything else uses explicit Save.

## Chosen Direction

**SetupFlow:** Single-scroll centered column (from A), with quiet density styling (from C). Full-page route at /setup, outside AppShell. All 4 sections visible. BackendMode as a select (from C -- more compact than radio for a binary choice). Bottom footer with Skip + Start. No sidebar, no steps, no progress indicators.

**Settings:** Overlay mode on AppShell (from B). Avatar click swaps Submenu content to settings sections and Main pane to the active section's form. Escape or avatar re-click or clicking any view icon closes settings and restores the previous Submenu/Main state. Rail stays visible but dimmed. Per-section save semantics. Appearance applies immediately.
