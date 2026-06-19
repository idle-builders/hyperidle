## Design Critique: ReviewAnchoredComment / AL4

DESIGN-CRITIQUE: variant=A score=7/10  rounds=1  axes: H:8 S:7 T:8 C:8 Co:8 St:7 A:6 AS:9 PP:7

### CRITICAL
- [packages/design-system/src/ReviewAnchoredComment.stories.tsx:83] Gutter `+` button is `rounded-[6px]`; approved.md:38 specifies `--r-subtle` (10px), violating the closed Hearth radius scale (AQ-011). Fix: `rounded-[var(--r-subtle)]`.
- [approved.md:38] The gutter `+` spec calls for "white text" instead of the semantic `--text-on-accent` token, inviting a hardcoded-color regression (AQ-008). Fix: specify `text-[var(--text-on-accent)]`.

### WARNING
- [packages/design-system/src/ReviewAnchoredComment.stories.tsx:67] The warm-tint hover background is applied to the diff hunk header, not to the target code line itself; approved.md:37 says the *code line* gets the warm-tint hover. Fix: move the `bg-[color-mix(...)]` rule to the `group/line` row or add an equivalent line-hover class.
- [packages/design-system/src/ReviewAnchoredComment.stories.tsx:83] The gutter `+` button is 16×16 px, which will fail AQ-015 at viewports ≤1024 px unless the mobile line-row tap fully replaces it. Fix: ensure the mobile contract in approved.md:99-101 gives a 44+ CSS px target and verify the button hit area is not active on touch.
- [packages/design-system/src/ReviewAnchoredComment.stories.tsx:121-123] The anchored-thread card places the 6px forest dot inside a top header row; approved.md:52 says the dot belongs on the left edge of the card. Fix: move the dot to the left edge and keep the label inside the header row.
- [packages/design-system/src/ReviewAnchoredComment.stories.tsx:100-102] Spot-label chip renders "on" in `--text-tertiary` and the actual label in `--text-secondary`; approved.md:46 calls for the whole chip in `--text-tertiary`. Fix: align the story with the approved token or update approved.md with a deliberate two-tone rationale.
- [packages/design-system/src/ReviewAnchoredComment.stories.tsx:95] The anchor-to-composer hairline is `w-[2px]`; approved.md:44 calls for 1.5px. Fix: use `w-[var(--bw-default)]` with `bg-[var(--border-strong)]` so width and color both trace to tokens.

### SUGGESTION
- [packages/design-system/src/ReviewAnchoredComment.stories.tsx:70] Code line uses literal `leading-[1.55]`; replace with `leading-[var(--leading-body)]` to keep line-height tokenized.
- [approved.md:89-92] Accessibility lists focus-trap/`Esc` behavior but does not specify the visible focus treatment. Fix: add a line requiring the composer textarea to use `--motion-fast` input-glow and the gutter `+` to use the control-ring `focus-visible` outline.
- [approved.md:78-80] Sending state is described but not rendered in the story. Fix: add a "Sending" story state (disabled textarea, "Sending…" pill) so the snapshot net covers it.

### What's Working Well
- Strong reuse of existing Tier-2 primitives (`CommentRow`, `Composer`) keeps the vocabulary coherent and the implementation surface small.
- Content-following anchoring is expressed with Hearth tokens and micro-motion, avoiding AI-aesthetic chrome.
