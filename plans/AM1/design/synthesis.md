# AM1 Conversation Experience — Synthesis

Input: the three variants (`{quiet-stream,two-pane,calm-document}/spec.md` + components), the reviewer's authoritative critique (`design-critique.md`), and the re-screenshotted, embodiment-fixed renders. The critique's recommendation is the decision; this doc records the synthesis it mandates.

## Strongest base — Variant C "Calm Document"

C is the base. Two reasons, and they are precisely the two reasons AM1 exists:

1. **Richest inline embedding.** AM1's central founder ask is "embed what a message refers to, beautifully, read inline." C renders the diff, the referenced block, and the session reference full-bleed in-column — the founder judges the actual change *in place*, not via a chip they must click away to see. A's compact chips and B's side-panel both make you leave the column to read substance; C does not. (Critique: embed richness C > B > A.)
2. **Clearest source-agnostic Part-model factoring.** C's spec defines the explicit `Part[]` renderer with exhaustive-discriminant dispatch + `unknown` fallback, derived from `Message[]`, with stated AM3 reuse. That source-agnostic Part stack is the load-bearing thing the WP ships and the AM1↔AM3 uniformity contract. (Critique gate #6: strongest stated Part-model factoring.)

C's lower raw score (7.4 vs B 7.8 / A 7.7) was dominated by a single coherence-5: the composer rendered mid-thread. That is an **embodiment bug, now fixed** (composer is a single bottom-of-stack wrapper; the faint loading skeleton is now 3 visible sender-turn rows), **not a structural flaw**. With the bug removed, C is the strongest base on the dimensions that matter for this WP.

## Graft from B — interaction rigor (not its layout)

- **The focus contract, verbatim.** `aria-pressed` on any toggle/open-elsewhere control; focus returns to the triggering element when an opened surface closes; column (then any secondary surface) tab order follows reading order. B specs the most rigorous a11y of the three; apply it to C's fold toggles, embed headers, and verdict buttons.
- **B-grade skeletons.** Loading renders 3 sender-turn skeleton rows that actually read as rows (avatar + name + body bars), not faint dots. Already applied to C's and A's stories in this pass.
- **The chip→detail / side-surface affordance — reserved ONLY as the overflow escape.** When a full-bleed embed exceeds a height budget, its Fold's "expand" may route to a B-style detail/side surface rather than growing the column without bound. This is the *overflow* fallback, never the default reading mode. Carry B's *active-accent + `aria-pressed`* affordance for that "open elsewhere" action; do NOT carry B's panel as the default.

## Graft from A — reuse-first discipline

- **`plain` and `verdict` Parts map straight onto `CommentRow`** — sender-grouped, mention/redaction-aware — add nothing. A proves these are pure reuse.
- **Keep NEW renderers to the minimum:** `DiffEmbedPart` + `BlockEmbedPart` (the two that genuinely need a new full-bleed layout contract the compact embeds can't provide) + the standalone `Fold` + `SessionReferenceEmbed`. Every additional document-grade renderer must justify itself against "could `CommentRow` / an existing embed do this compact?" — A's restraint is the calm guardrail held over C's richness.

## Explicit rejection list (prevents re-litigation)

- **Reject B as the base.** Its column is a terse scannable *index*, not a calm reading column — it trades the brief's primary adjective ("calm") for messages-per-screen. Keep B's interaction *parts*, not its layout.
- **Reject the two-pane / side-panel as the default embed-open strategy.** The Part model needs no panel; the panel is a desktop-only second region with the most state and the worst mobile story, and it is conversation-specific — AM3 would not reuse it, weakening the load-bearing Part-model-reuse contract. Side-surface is permitted only as the overflow escape, never the default.
- **Reject A's compact-chips-as-ceiling.** Chips you must click away to read under-deliver "embed beautifully." Compact is the *overflow* fallback, not the default; full-bleed inline is the default.
- **Reject C's old mid-thread composer** (replaced with a single bottom-pinned composer outside/after the Part stack) **and C's old faint loading skeleton** (replaced with B-grade 3-row sender-turn skeletons, `--border-strong` so the pulse stays visible).

## Net

Base **C** (composer-fixed, skeleton-fixed), with **A's reuse discipline on the simple Parts** and **B's focus contract + skeleton fidelity + open-elsewhere affordance reserved for overflow.** This yields the embedding richness and Part-model factoring AM1 is *for*, the calm A proves is reachable, and the a11y rigor B specs best — without importing B's panel or A's compact-only ceiling.
