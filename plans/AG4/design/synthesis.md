# AG4 — Synthesis

## Strongest base: Variant A (in-pane header)
Highest critique score (8.2), least AppShell surgery, keeps chrome below content (Hearth Content-First), zero AI tells, root screens stay clean. The founder's complaint was specifically about *drilling into detail screens* feeling like a one-way door — A solves exactly that where it hurts.

## Pulled in from B
1. **Back/Forward consistency.** B's strength is "always in the same spot." Pull this in *without* the permanent band: the history cluster sits at the **start of the breadcrumb row** on every detail screen, in the same left-aligned position each time — same muscle-memory benefit, no global toolbar.
2. **One consolidated breadcrumb owner.** B forced full uniformity (deleting all four hand-rolled breadcrumbs). Adopt this regardless of placement — the `Breadcrumb` DS component is the single owner; WorkTeam's `← Portfolio` chip outlier is replaced too.
3. **The root-screen Back gap (A's worst-at).** B exposes Back on roots. Resolve the gap *minimally*: root/list screens (portfolio, knowledge list, conversations) get **no visible cluster** but Back/Forward remain reachable via ⌘[ / ⌘]. Rationale: a founder who jumped to a root via ⌘K is rare; the keyboard path satisfies the AC ("traverse history mouse-free") and avoids putting a lone disabled chevron on every list (the AG2 dead-chrome lesson). This is a deliberate, documented trade — not an oversight.

## Chosen design = A + B's consistency/consolidation
Detail screens: `[← →]  Crumb / Crumb / Current` as the first row of the existing bordered header. Back enabled iff history exists; Forward shown only when forward history exists; breadcrumb always present (Up never lies). One `Breadcrumb` component everywhere. Global keyboard: ⌘[ Back, ⌘] Forward, ⌘1/2/3 views — all guarded against text inputs.

## Explicitly rejected (do not relitigate)
- **Persistent shell-level NavStrip on every screen (full Variant B).** Rejected: +40px permanent chrome, reads as dead on roots (AG2 burn), pulls eye to chrome above content, more generic. Its one real benefit (always-same-spot) is captured by left-aligning the cluster within each detail header.
- **Wiring Up/breadcrumb to `navigate(-1)`.** Concept hard rule. Up is always an explicit parent path.
- **Visible Back/Forward on root/list screens.** Keyboard-only there by design (avoids lone-disabled-chevron chrome).
- **Hiding Back when no history (instead of disabling).** On detail screens Back renders disabled (stable layout, honest signal). Only Forward is conditionally *absent* (forward history is genuinely transient and a phantom forward button confuses).
- **A new breadcrumb-trail data model / per-route metadata registry.** Segments computed from `location.pathname` + already-loaded entity data, as today.
- **Electron `globalShortcut` for ⌘1/2/3/[/].** (Architecture decides, but design intent: these are in-window navigation, not OS-global hotkeys — renderer-level keydown, like `useCommandK`.)
