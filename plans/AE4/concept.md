# AE4 Concept Check: Mobile & Responsive Access

## Verdict: No new or reshaped primitives

AE4 is a form-factor adaptation. Every noun in the spec maps to an existing stable concept:

| Noun | Classification | Existing location |
|---|---|---|
| **Sidebar** | Stable | `packages/web/src/shell/Sidebar.tsx` |
| **Drawer** | Presentation mode of Sidebar | Not yet built; not a new primitive |
| **View** (Conversations, Work, Knowledge) | Stable | `shell-types.ts` ViewId |
| **Review flow** (Thread + Verdict) | Stable | ThreadShell + verdict actions |
| **Touch target** | Stable rule | AQ-015 (44px minimum) |
| **CORS origin** | Infrastructure config | `packages/server/src/middleware/cors.ts` |
| **PWA manifest** | Web platform standard | Not yet present; no domain concept |

The Sidebar gains a responsive behavior (drawer mode at <= 768px) but its identity, props interface, composition, and authority do not change. It remains a Tier 3 shell composition rendering Conversations/Work/Knowledge sections with sub-items.

## Critical: Doc contradiction — "Desktop-only" stance

The existing docs state "Desktop-only -- no mobile companion" in **9 locations**:

1. `docs/human-interface-layer/one-app-two-form-factors.md` line 3
2. `docs/human-interface-layer/what-the-meta-layer-actually-ships-at-this-layer.md` line 8
3. `docs/human-interface-layer/decisions.md` line 3
4. `docs/human-interface-layer/the-three-views-the-rail.md` line 247
5. `docs/requirements/usability-requirements.md` lines 9, 71, 85
6. `docs/requirements/decisions.md` line 9
7. `docs/architecture/decisions.md` line 11
8. `docs/architecture/the-human-interface-the-factory.md` line 5

AE4 changes this product stance: the web app becomes accessible from mobile browsers. The builder must update these 9 doc locations as part of the workpackage. The new stance is:

> Desktop is the primary form factor (Electron + browser). The same web app is accessible from mobile browsers for review triage and unblocking agents. No native mobile app. No offline support.

This is a product decision, not a concept change. The domain primitives (Thread, Block, Artifact, Bet, Task, Verdict) are unaffected.

## Required reading for downstream skills

Downstream agents (`/design`, `/architecture`, `/pipeline`) must read:

- `docs/human-interface-layer/one-app-two-form-factors.md` -- current form factor doc (to be updated)
- `docs/information-architecture/app-shell-always-present.md` -- shell layout spec
- `docs/ui-design/` index -- Hearth design system constraints
- `packages/design-system/DESIGN.md` -- component inventory (19 custom components)
- `packages/design-system/AESTHETICS.md` -- AQ rules (especially AQ-005 mobile input size, AQ-015 touch targets)
- `packages/web/src/hooks/useViewportBreakpoint.ts` -- existing viewport hook (returns `{ sidebarMobile: boolean }` at <= 768px)
- `packages/web/src/shell/Sidebar.tsx` -- current sidebar implementation
- `packages/web/src/layouts/AppShell.tsx` -- current shell layout
- `packages/server/src/middleware/cors.ts` -- current CORS middleware

## Vocabulary

No new terms introduced. Existing terms used as-is:

| Term | Definition | Aliases not to use |
|---|---|---|
| **Sidebar** | 200px fixed-width vertical navigation | nav, menu, side panel |
| **Drawer** | Mobile presentation of the Sidebar (slides over content) | hamburger menu, mobile nav, sheet |
| **Scrim** | Semi-transparent overlay behind the drawer | backdrop, overlay (overloaded) |
| **Viewport breakpoint** | The 768px threshold where sidebar becomes drawer | mobile threshold, responsive point |

## Self-critique

- **Is the rejection list needed?** No new primitives means no rejection list to write. The only conceptual decision is "drawer is a presentation mode, not a new component" -- which is correct because the Sidebar's identity (props, data flow, authority) doesn't change.
- **Does "drawer" collide with anything?** DaisyUI has a `drawer` component class. The builder should evaluate whether to use DaisyUI's drawer or build with raw Tailwind. This is a design/architecture decision, not a concept one.
- **Is the doc contradiction actually critical?** Yes. An agent reading `usability-requirements.md` line 9 ("Desktop-only. No mobile form factor.") would correctly refuse to implement mobile features. These docs must be updated.
- **Are there hidden concept changes?** No. The review flow on mobile uses the same ThreadShell, same verdict actions, same API. The only differences are presentation (layout, touch targets, sidebar-as-drawer). The interaction grammar is identical.
