DESIGN-CLASS: routine-low-conf  ref=Sidebar  pattern=none

# AE4 Design Brief: Mobile & Responsive Access

## User task

A founder away from their desk opens HyperIdle on their phone to check blocked agents, review pending work, and approve/reject verdicts. The interaction is triage — scan, decide, unblock — not deep authoring. The "3-minute morning check" that currently requires a laptop.

## Interrogation (settled questions)

1. **Who and what decision?** A founder on a mobile phone making quick review decisions (approve/reject/request changes). Secondary: scanning Work view for blocked bets, checking Knowledge for triage items. This is settled by the spec.

2. **Smallest UI surface?** The sidebar must become a drawer (the 200px sidebar cannot fit alongside content at 375px). All three views must render at 375px. The review flow (ThreadShell + RichMessageCard + verdict buttons) is the critical path. This is settled by AC-3 and AC-6.

3. **Primary state?** Populated with 1-5 threads needing attention. The founder opens the app when agents are blocked or reviews are pending. Empty state is rare on mobile (if nothing needs attention, you don't open it).

4. **What gets truncated?** Thread titles, team names, bet names must truncate. Verdict buttons must NOT truncate — they're the primary action. Thread row metadata (timestamps, avatars) can compress.

5. **Existing components?** The Sidebar component already returns `sidebarMobile: true` at <= 768px from `useViewportBreakpoint()`. No component currently consumes this flag. The app shell in `AppShell.tsx` renders `Sidebar | main` with no conditional for mobile.

## Key design decisions to explore

1. **Sidebar collapse pattern:** How does the 200px sidebar become mobile-navigable? (Drawer from left vs bottom tab bar vs hamburger icon only)
2. **Drawer trigger:** Where does the hamburger/menu button live? (Top-left of main? Floating? Part of a mobile header?)
3. **Content reflow:** What changes in each view at 375px? (Conversations thread list, thread detail, Work portfolio, Knowledge list)
4. **Review verdict on mobile:** The RichMessageCard verdict buttons (Approve / Reject / Request Changes / Snooze) need to be thumb-reachable at 44px height.
5. **Navigation while in a thread:** On desktop, the sidebar shows which thread is selected. On mobile, the sidebar is hidden. How does the user go back to the thread list?

## Constraints (fixed)

- Desktop must not regress (AC: "Desktop remains primary").
- Touch targets >= 44px (AQ-015).
- 19-component budget. No new design-system primitives — this is shell/layout work.
- Use existing Tailwind breakpoints and `useViewportBreakpoint()`.
- Hearth tokens only. No off-grid spacing, no cool grays, no off-scale radii.
- Mobile inputs >= 16px font (AQ-005, iOS zoom prevention).
- Scrim uses `--surface-overlay` token.
