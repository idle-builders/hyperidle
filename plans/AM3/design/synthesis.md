# AM3 dial-in — synthesis

## Strongest base: A — Side panel (slide-over)

A best satisfies the load-bearing AM3 constraint — *dial-in is lower-level, entered when needed, and must NOT promote session activity into first-class conversation content*. A docked, dismissible slide-over reads as "a drawer you opened beside the conversation", never as a place the session got promoted to. It also uniquely serves the **steer-while-reading** use case (the default model/effort is wrong → open panel, change it, keep reading) because it does not block the conversation the way a modal (C) does.

C scored marginally higher (8.3 vs 8.0) on free behavior, but its modal-blocking is wrong for *steering*: you often want to glance at the conversation while you tune the session. B scored lowest and carries the highest cost AND the highest risk — a dedicated `/session/:id` route is exactly the "first-class session surface" the spec warns against.

## Pull in from C
- **DS-grade dismissal semantics:** Escape closes, focus moves into the panel on open and returns to the originating `session-reference` Fold on close, scrim-free but focus-restoring. (C gets these from DS `Dialog`; A should replicate the *behavior* without the modal scrim — a non-modal slide-over, not a Dialog.)
- **Inline-compact config band** for the collapsed/dense state: when config is shown in the narrow 420px panel, the `layout="inline"` wrapping band (from C) packs model + effort + mode + permission more tightly than the 112px-label stacked rows. Use stacked labels at panel width when room allows, inline when collapsed-dense — but ship ONE: the inline band reads cleanly at 420px and is the simpler build.

## Pull in from B
- **Breadcrumb-style "back to conversation" affordance** is unnecessary for a slide-over (the conversation is right there), so drop B's breadcrumb. Keep only B's lesson: the activity column wants a generous reading width — so the panel widens (target 460–480px) over the cramped 420px when the viewport allows, and config collapses to give activity the height.

## Rejected (do not re-litigate)
- **B — dedicated `/session/:id` route.** Rejected: a full route reads as a first-class session surface, brushing the spec's "must not promote session activity into first-class content" constraint, and is the heaviest build (new route + param resolution + layout). Deep-linking a session is a real future want, but not at the cost of promoting it now. (If deep-link is later needed, it can permalink to "open this conversation with the session panel open", not a standalone session page.)
- **C — modal Dialog as the primary placement.** Rejected as the *primary* shape: modal-blocking defeats steer-while-reading and "sustained auditing in a modal" is poor. Its *behavior* (focus, escape, dismiss) is pulled into A; its *modal scrim* is not.
- **Promoting session activity into the conversation column.** Hard-rejected by spec and AM1 concept (hard-rule 3): a session appears only as a `session-reference` Embed; opening it is the dial-in. Activity NEVER becomes conversation Parts.
- **A second/parallel renderer for activity.** Rejected: activity renders through `PartList` + `derivePartsFromSession()` only (AC3, AM1↔AM3 uniformity). No duplicated renderer.
- **Per-backend control branching.** Rejected: controls render from the descriptor's declared options only (AC2). Undeclared option ⇒ absent.

## Result
A non-modal right **slide-over** dial-in: header (session · agent · status) · collapsible inline config band rendered from the capability descriptor · `What happened` activity via `PartList`. Conversation stays mounted and readable at left. Entered from the `session-reference` Fold; dismissed via ✕/Escape with focus restore.
