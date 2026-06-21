# Variant comparison — Inline anchored comments

| Dimension | Variant A: Inline at anchor | Variant B: Persistent side-rail |
|---|---|---|
| **Signature** | Hover line/block → `+`/`Discuss` → composer opens at the anchor → thread renders directly under the spot it references. | Hover line/block → click selects → persistent side-rail lists threads; hovering thread highlights source line. |
| **Component count** | Low: reuses `CommentRow`, `Composer`, existing `+`/Popover affordances. Adds only a tiny inline composer wrapper + connector line. | Higher: needs rail shell, rail thread list, source-highlight wiring, collapse toggle, and a composer prefill chip. |
| **Density** | High near anchors; content gets pushed down by long threads. | Low; canvas stays compact, comments live separately in a rail. |
| **Primary action surface** | The canvas itself (hover affordance) becomes the creation surface. | The rail becomes the creation surface; you must first select a target, then type in the rail. |
| **State strategy** | Local: each anchor owns its own `isComposing` / `isExpanded` state. | Scoped to the canvas: selected target + rail open + thread list + optional `showAll`. |
| **Motion budget** | Micro: composer height/opacity, thread card slide, line-hover tint. | More extensive: rail width/translate, source highlight, thread-in-rail slide; also reflows the canvas width. |
| **Best at** | Code diffs and any case where “the thing and the comment must be inseparable.” Matches the established block-anchor mental model. | Prose/docs and tables with many comments, where the canvas must remain scannable. |
| **Worst at** | Artifacts with many comments become vertically noisy; composer can obscure the next line in a diff. | Code-line-level precision is indirect; violates the AL1 “examine + converse” duality by adding a third pane inside a pane. |
| **Phase-2 critique score** | 8 / 10 | 5 / 10 |

## Why the gap

- **Variant A** only has one real weakness (vertical clutter on dense artifacts), and that tradeoff is acceptable because the global thread already carries all comments; the inline view is an opt-in focused lens.
- **Variant B** introduces a new, heavy pane and breaks the “comment at the thing” convention the rest of the product just taught in `KnowledgeBody`/`WorkBet`. It is better suited to a future option than to the default Hearth path.

Score reasoning: Phase 2 (self-critique) judged by AL1/Hearth principles: clarity of action, proximity of comment to anchor, reuse of existing vocabulary, and respect for the fixed center+right-pane composition.
