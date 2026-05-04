# /design-critique — Variant C (anchored-strip)

Scoring against the 9-dimension rubric.

---

| Dimension | Score | Notes |
|---|---|---|
| Visual hierarchy (V) | 8/10 | The left gutter rule running the full height of artifact + action strip is a strong unifier — eye reads "this artifact and these buttons are one unit." The danger-coloured rule on the active review pulls the eye to the blocking message. The artifact is the visual centre. Title sits above; reasoning sits below as a quoted note. **One concern:** the resolved review with the verdict strip embedded inside the anchor frame is visually similar to the active one — a casual glance might not distinguish "settled" from "needs decision." The verdict strip uses a different chrome (`status-chip done` + actor + time) but the gutter rule is the same default colour. |
| Spacing / density (S) | 7/10 | Anchor frame internal padding matches artifact's existing 8/10px. Reasoning blockquote indent (12px + 2px border-left) is GitHub-conventional. Action strip 8/10 padding. The thin top header is 6/16 padded — appropriately compact. **One miss:** when both a thin header AND a host banner are stacked, that's two rows of chrome above the stream; the founder direction wanted to push toward elimination of the top header. The spec acknowledges this; still the only variant with both. |
| Typography (T) | 8/10 | Title 15px weight 600. Mono caps on REASONING / REVIEW / VERDICT labels. The thin top header uses 12px `--text-lo` for non-essential context, `--text-hi` weight 500 for the host title — appropriate. Same tabular-nums opportunity on timestamps. |
| Color / contrast (C) | 8/10 | All tokens. The gutter rule uses `--text-lo` (default) and `--danger` (blocking) — the only "colour-coded affordance" in the design and it earns it. The verdict strip uses `--ok` `StatusChip` for approved verdicts. Diff-line tints from `color-mix`. No hex, no Tailwind palette. |
| Coherence (Co) | 6/10 | **Adds two new components (`AnchorFrame` + `AnchoredActionStrip`).** Spec justifies `AnchoredActionStrip` with 3-context reuse (review verdict, questionnaire answer, future per-block discussion) — that justification is real. `AnchorFrame` is more of a layout wrapper; could be a CSS class. Spec acknowledges this and defends keeping it as a component because of the sticky-strip positioning rules. Honest, but it's still two new shapes vs. A's zero. |
| States completeness (St) | 8/10 | Empty / loading / error / populated / resolved / overflow described. The sticky-within-message behaviour for long artifacts is the most thoroughly designed in the spread. Multiple-rich-message handling is clean (each message has its own sticky scope). Resolved state is clear. **Gap:** the spec admits cross-browser sticky concerns (iOS Safari) — the architect needs to absorb this. The mockup demonstrates resolved state next to active state, which is exactly what stress-tests the visual distinction. |
| Accessibility (A) | 7/10 | `role="toolbar"` on action strip; `<blockquote>` semantics for reasoning. Sticky positioning is well-supported by screen readers (announced as "in viewport"). **Gaps:** the gutter rule is a purely visual signal; redundant signal for blocking state must come from the host banner's `StatusChip blocked` (which is there — fine) and ideally an `aria-label="Blocking review"` on the rich CommentRow when the message is the blocking one. No keyboard verb shortcuts as required. |
| Anti-slop (As) | 7/10 | No emoji, no purple gradients, no oversized padding, no glass. **Two concerns:** (1) the thin top header carries `< back · host · sender@time` on one line — borderline "chrome above the message content" from the founder filter. (2) The reasoning blockquote uses GitHub-quoted-note styling — it's not an AI tell, but it is a borrowed visual that the rest of the design system doesn't have. New visual vocabulary unique to L11. |
| Concept fit (F) | 6/10 | Rich messages render inline; verdict commits via L7. **But:** the variant *preserves a top header* (the thin one). The story spec explicitly says: "the current top header... is reduced to a thin presentation header (title + sender + back-to-queue) **or eliminated entirely**." This variant takes the "reduced to thin" option, which is allowed but soft on the founder direction. The artifact + action surface being structurally one unit (anchor frame) is a strong "the action is part of the message" signal — it's just that the top header partially undercuts the message. |

**Total: 65 / 90 (avg 7.2)**.

**Strengths.** Strongest action-surface findability when the artifact
is taller than the viewport (sticky-within-message). Best
unification of artifact + verdict via the gutter rule. Familiar
grammar for users coming from GitHub.

**Weaknesses.** Two new components (highest budget cost in spread).
Top header preserved (soft on founder direction). Cross-browser
sticky risk. Gutter rule is the signature, but it's also a new visual
vocabulary the design system doesn't have elsewhere.

**Verdict.** Advances to comparison. Strong on artifact-action
unification; soft on coherence (most chrome of the three) and
concept fit (top header retained).
