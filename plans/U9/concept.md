# Concept: U9 — Screen Layouts: Conversations, Work, Knowledge

**Workpackage:** U9 (Track U: Hearth — Design Language & UX Rewrite)
**Status:** No new concepts — all nouns are stable
**Date:** 2026-06-01

---

## Assessment

U9 is a pure layout/styling workpackage. It composes existing primitives into page layouts using the Hearth aesthetic. Every concept U9 touches was locked in the U0 concept doc (`plans/U0/concept.md`).

### Nouns scanned

| Noun | Classification | Concept source |
|---|---|---|
| Thread, Message, Block | Stable | L1/L2 primitives |
| Bet (description, status, at_risk) | Stable | U0 concept (Noun 2) |
| Team | Stable | U0 concept (Noun 1) |
| Sidebar + Filter Pattern | Stable | U0 concept (Noun 3) |
| Knowledge Item | Stable | Fabric layer |
| Canvas removal | UI decision locked in U0 | U0 concept (Noun 2, Key Simplification #3) |

### Canvas removal rationale

The spec says "Canvas/Kanban views removed or replaced with the bet grid." This follows from U0's locked decision: "No Canvas/Kanban betting view. The work view shows a grid of bet cards, not a kanban board with columns for shaped/committed/active." The Canvas component (`packages/web/src/shell/Canvas.tsx`) currently renders a draft/active two-column drag-drop board. U9 replaces this with a simple bet card grid — no drag-drop, no column states.

### BetCreateDialog update rationale

The spec says BetCreateDialog should accept "description (not pitch)" and assign to a team. The current implementation already does this (U1 renamed pitch to description, R2 removed appetite fields). The remaining work is Hearth styling, not concept change.

---

## Required reading for downstream agents

- `plans/U0/concept.md` — locked concept doc (Team, Bet, Sidebar, Hearth Theme)
- `packages/design-system/03-hearth.html` — Hearth design reference
- `packages/design-system/DESIGN.md` — design system token reference
- `packages/design-system/src/tokens.css` — Hearth tokens
- `packages/web/src/shell/Sidebar.tsx` — sidebar from U6
- `packages/web/src/layouts/AppShell.tsx` — app shell from U6
- `docs/information-architecture/conversations-view.md` — conversations view spec
- `docs/information-architecture/work-view.md` — work view spec
- `docs/information-architecture/knowledge-view.md` — knowledge view spec

---

## Conclusion

No concept doc update needed. No ground-truth doc changes. The U0 concept is the authoritative source for all nouns U9 uses. Proceed directly to `/design`.
