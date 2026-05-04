# L15 Variant B — `inspector-drawer` — Design Critique

**Score: 6.7 / 10** — fails ≥ 7 gate. Has one structural fix path that brings it to ~7.5.

## Per-dimension scores

| Dimension | Score | Notes |
|---|---|---|
| 1. Visual Hierarchy | 8 | Selected card → drawer header → message preview → verb chips → reply input. Reading order is correct. Selected card's left-border + shared-radius signals "drawer is part of this card". |
| 2. Spacing & Density | 7 | Uses density tokens but introduces one ad-hoc value (drawer 12px padding). Verb chips at 4px/10px are on grid. Drawer adds visible chrome — by design — but the 6px gap between drawer and next card is tight. |
| 3. Typography | 8 | All sizes from scale (10, 11, 12, 13). Mono caps for header strip and message-row meta. |
| 4. Color Usage | 8 | Tokens only. Selected card uses `--primary` border + `--surface-3` (good — shows selection without looking AI-purple). Verb-chip-danger uses `--danger` border on hover (red-only-for-danger rule respected). |
| 5. Component Coherence | 5 | **Proposes a new Tier-3 region (`TaskInspector`)**. Component budget is closed at 19. Adding a region requires retiring one or proving 2+ contexts. Inspector might map onto `Submenu` semantics, but Submenu lives in the IconRail|Submenu shell — not inline within a kanban column. **This is the biggest critique gap.** |
| 6. State Coverage | 8 | Default / selected / empty / loading / populated / error / after-send (verb) / after-send (reply) / drawer collapse on alt-card-select — all covered. |
| 7. Accessibility | 7 | aria-expanded + aria-controls on cards. Drawer is a `region` with aria-label. Tab order is sane. One concern: the drawer sits visually inside a Kanban column, so screen-readers must understand it as nested-related-content; the current ARIA is acceptable but worth user-testing. |
| 8. Anti-slop | 7 | No AI-aesthetic tells, but the message-preview rows look a bit "stock thread UI" — risk of the column starting to read like a 3-pane chat client. The `--primary` left-border on the selected card is the only visible chroma — restraint is good. |
| 9. Verifiability | 7 | All testable. Layout-reflow (height animation via grid-template-rows) is a known technique; `prefers-reduced-motion` opt-out is specified. Mockup matches spec. |

## CRITICAL

- **C-1** — Component budget. Either retire a Tier-3 component, OR redefine `TaskInspector` as a **layout pattern of an existing primitive** (composition of `RichMessageCard` + `Composer` inside a card body, no new shell-tier component). The spec already nods to this open question; synthesis needs to resolve it.

## WARNING

- **W-1** — Layout reflow. Expanding a card mid-column shifts every card below it by ~280px. In a 4-column kanban with mixed columns, this can cause visual jank. Mitigation: cap drawer height at 320px with internal scroll. The spec states this; the mockup approximates it but doesn't actually scroll.
- **W-2** — Mobile bottom-sheet diverges from desktop drawer. Two mental models for the same affordance. Variant A and C have a single mental model.
- **W-3** — Hot-path conflict. Variant B optimises for "click → see thread". But L15's primary verb is "request a state change". The drawer puts those verbs after the message preview — a power user pursuing the verb-only path scrolls past the messages every time. Could be inverted (verbs first, preview second), but that fights the "the thread is the context" thesis.

## SUGGESTION

- **S-1** — The verb chip row should adopt `Tag` (Tier 1) styling rather than custom chips. They're conceptually tags-with-actions.
- **S-2** — `Reply in thread…` placeholder is the right register. Avoid "Send a message" — too generic.

## Verdict

Strongest at the "see the thread fast" hot path; weakest at component-budget discipline. If the synthesis resolves C-1 by treating the inspector as a pattern (not a primitive), the score rises to ~7.5 and this becomes a viable choice on its own. As specified — fails the gate by 0.3.
