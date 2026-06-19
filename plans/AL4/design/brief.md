# AL4 — Design brief: Inline anchored review comments

DESIGN-CLASS: routine-low-conf

Justification: the anchoring pattern is already proven in `HostThreadSection`/`KnowledgeBody` (`blockId` → inline message slot) and `ReviewCodeDiff` already draws the hover `+` affordance; `ReviewComposition` only replaces the textual reference-chip placeholder. AL4’s remaining design surface is the exact interaction for creating and rendering an anchored comment inside a review canvas. No new primitive, no new color language, no layout rewrite.

---

## Required input from AL1 / AL4 concept

- `plans/AL1/design/approved.md` §1-2: one Subject, one verdict, one global thread, right-pane examine.
- `plans/AL4/concept.md`: anchors are `artifactId + blockId + optional spotLabel`, never coordinates. Anchored comments are plain Thread messages.
- `packages/design-system/PRINCIPLES.md`, `AESTHETICS.md`, `DESIGN.md`, `src/tokens.css`: Hearth tokens and motion vocabulary.
- `packages/design-system/src/CommentRow.tsx`, `Composer.tsx`: Tier-2 message + input primitives.
- `packages/web/src/pages/review/ReviewCodeDiff.tsx`, `ReviewComposition.tsx`, `review-composition.ts`, `review-composition.fixture.ts`: existing review canvas and placeholder.
- `packages/web/src/pages/KnowledgeDetail.tsx` / `packages/web/src/shell/HostThreadSection.tsx`: the implemented “hover a block → Discuss → prefill chip” anchor pattern.

---

## Reuse inventory

| Visual element | Existing component to reuse | How AL4 wires it |
|---|---|---|
| Message row (author, time, body, agent badge) | `CommentRow` | Reused unchanged; a new `inlineAnchor` label above the body shows the anchored spot (already present in props). |
| Composer input + send affordance | `Composer` | Compact inline variant: same pill send, same `Cmd/Ctrl+Enter` submit, but rows=1 and wrapped by the anchor spot chip. |
| Hover/selection of a block | `BlockActionsPopover` / `BlockHandle` | For prose/block canvases, the existing block hover handle can expose “Comment on this block.” |
| Code-line hover affordance | `ReviewCodeDiff` gutter `+` button | Escalate the existing presentational `+` into the real create-comment trigger. |
| Inline anchored message display | `KnowledgeBody.AnchoredMessages` pattern | Upgrade from simple text bubbles to full `CommentRow` render in the canvas slot. |
| Global conversation | `HostThreadSection` / `ThreadShell` | Anchored comments are just `plain` messages with `blockId` + `refs`; no new conversation primitive. |
| Jump chip | `ReviewComposition` reference-chip button | Turn the placeholder `on PromoField.tsx:118` chip into a clickable scroll-to-anchor action. |

---

## Out of scope / rejection list

- No per-spot or per-artifact side thread. One global Thread per Subject.
- No coordinate/offset anchors. `spotLabel` is optional and canvas-resolved (line/paragraph/step/region/cell).
- No suggestion-mode / inline patch editing. AL4 is comment + reply only.
- No new verdict grammar or per-artifact verdict.
- No new on-disk content dialect; payload remains `PlainPayloadWithBlockId`.
- No AI-aesthetic chrome. All anchored UI uses Hearth tokens (`--surface-elevated`, `--border-subtle`, `--accent-primary`, `--r-subtle`, `--r-pill`, `--motion-fast/default`).

---

## Screenshot note

A presentational story file is created at `packages/design-system/src/ReviewAnchoredComment.stories.tsx`. The viewer was started and a screenshot attempted; outcome is recorded at the bottom of `approved.md` (or a failure note if Playwright/the viewer was unavailable).
