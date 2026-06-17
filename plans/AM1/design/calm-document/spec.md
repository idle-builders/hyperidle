# AM1 Variant C — "Calm document" (spec)

Embodiment: `packages/web/src/components/Am1ConversationCalmDocument.tsx` (+ `.stories.tsx`). Renders the brief's canonical fixture. Honors the locked concept: deliberate messages only; session = a reference Embed (never an inlined work-log); within Thread/Message/verdict; nothing named "Block"/"blocked".

## User workpackage
The founder scans and steers a deliberate agent thread that reads like a living document — embeds render full-bleed inline so the founder judges the actual change in place, then approves the deploy.

## Component composition (production reuse mapping)
The variant is hand-rolled for reliable rendering; production maps onto the new **Part model** primitive plus catalogued components:

- **Part model wrapper** (NEW — the WP's primitive): a source-agnostic `Part[]` renderer — single calm column, exhaustive discriminant dispatch with an `unknown` fallback Part. Derived from `Message[]`, never stored. AM3 reuses it for session events.
- **Plain Part** → `CommentRow` (sender-grouped, mention/redaction aware). Variant C's document body text + sender lead-in are `CommentRow` in a generous-column skin.
- **Review Part + verdict bar** → `RichMessageCard` (idle/saving/error/resolved, foldable reasoning, verdict actions). Reused verbatim; the verdict line is its resolved state.
- **Verdict Part** → `CommentRow` verdict rendering (`verdictDecisionLabel` / `verdictDecisionToStatus` from `shared/thread.ts`).
- **Composer** → `Composer` (textarea + send, Cmd/Enter). NO model/effort pills — those are AM3 dial-in.
- **Avatar / role tint** → `Avatar`; **host banner** → `ThreadHostBanner`; **kind chips** → `Tag` / `StatusChip`; **cost/tool meta** → `KeyValue` (tabular-nums).
- **Artifact-diff Embed** → `ArtifactEmbed` + `ArtifactPreview` + `kinds/code-renderer` (`text_diff` shape). EXTEND: today renders compact; Variant C needs a **full-bleed inline foldable diff Part renderer** (`DiffEmbedPart`) wrapping the existing `code-renderer` — extension impossible inline because the existing embed is sized for a compact card, not an in-column document block with its own fold state.
- **Referenced-block Embed** → `BlockRefEmbed` (web) → `Block` + `renderPayload`. EXTEND: a **document-grade block Part renderer** (`BlockEmbedPart`) that renders the block's real content inline with a quote-rule, not a compact chip. New because no existing component renders a referenced block at document scale in-column.
- **Session-reference Embed** (NEW, small): `SessionReferenceEmbed` composing `Avatar` + `KeyValue` + `Button`. A calm card (avatar · model · cost · tool-call count · "Open session →") that routes to the AM3 dial-in. NEW because no component points at a Session without inlining activity — and that non-inlining is concept hard-rule #3.
- **Fold device** (NEW, small): generalize `RichMessageCard`'s reasoning fold into a standalone `Fold` usable on any Part (the "Worked for 1m 12s" work-fold, the diff, the reasoning).

NEW document-grade renderers needed: `DiffEmbedPart`, `BlockEmbedPart`, the standalone `Fold`, `SessionReferenceEmbed`. Extension is impossible because each existing surface is sized/shaped for a compact reference, whereas Variant C's thesis is full-bleed inline document content — a different layout contract.

## Information hierarchy (top → bottom)
1. Host banner — "Bet · Passkey login" (what this thread is attached to).
2. Sender turns, separated by quiet 1px rules (document rhythm, not boxes).
3. Each turn: sender lead-in (avatar + name + role chip + timestamp), then body Parts.
4. Plain Parts: generous 15px / 1.7 leading body text on the page surface, no card chrome.
5. Embeds: full-bleed inline cards on `--surface-elevated` with `--shadow-default`, foldable.
6. Work-fold: prominent collapsed summary "Worked for 1m 12s · 14 steps", expands to the work narrative.
7. Review Part: elevated card, accent left-rule, foldable reasoning, inline diff embed, verdict bar.
8. Verdict: quiet resolved line (avatar + APPROVED chip + subject).
9. Composer: sticky bottom, elevated, textarea + Send.

## All states
- **Empty** — `EmptyState`: "No messages yet" + "Start a deliberate message to Atlas — embed a diff, a plan, or a session it should work from." Centered in the column.
- **Loading** — `SkeletonList`: 3 sender-turn skeletons (avatar circle + name bar + two body lines), pulse animation.
- **Error** — `ErrorState`: "Couldn't load this conversation" + retry `Button`.
- **Populated** — the full canonical fixture (all Part types + four Embeds + work-fold + review/verdict).
- **Overflow** — long agent reasoning and completed work collapse via `Fold` to one-line summaries; embeds never become a wall (the diff folds; the block shows §-scoped content, not the whole doc). Many turns scroll the column; the composer stays sticky.

## Behavior
- **Fold transitions:** chevron rotates 0→90deg and the panel expands over `--motion-default` with `--motion-ease`; respects `prefers-reduced-motion` (durations collapse to ~1ms via tokens). Animate transform/opacity only.
- **Hover:** session-reference card and fold headers get a subtle `--surface-container` hover (`--motion-fast`); body text rows reveal a timestamp/anchor affordance on hover.
- **Focus:** every fold toggle, embed header, verdict button, and composer is a real focusable control with `aria-expanded` on folds; visible focus ring from the token system.
- **Keyboard:** Cmd/Enter sends from the composer; Enter/Space toggles a focused fold; Tab order follows reading order top→bottom.

## Mobile adaptation (3-tab layout)
The Conversations tab hosts a single full-width column: max-width drops to 100% with `--space-4` (12px) side padding; the 760px cap is desktop-only. Embeds stay full-bleed inline (already full-width). The work-fold and diff default collapsed on mobile to keep the column short. Composer is sticky at the bottom above the tab bar; inputs use ≥16px font (AQ-005). Sender lead-ins wrap the timestamp under the name when width is tight.

## The signature
**Full-bleed inline embeds + document typography + the prominent work-fold.** The most embedding-rich of the three variants — the conversation reads like a curated, living document where you see the actual diff/plan/session in place, not a log of bubbles. The "Worked for 1m 12s" Fold is a first-class calm-making device borrowed from the t3code reference.

## Trade-offs
- **Tall column.** Full-bleed inline embeds make turns long; relies on disciplined folding (work-fold + diff fold default-collapsed on overflow) to stay scannable. Without folding, a busy thread scrolls far.
- **Most new rendering code.** Four new document-grade renderers (`DiffEmbedPart`, `BlockEmbedPart`, `Fold`, `SessionReferenceEmbed`) vs sibling A's reuse-only column — higher build + maintenance surface, but it is exactly the embedding richness the founder asked for and the Part-model primitive the WP exists to ship.
- **Discipline-dependent calm.** The "document" feel degrades if embeds default open; correctness hinges on fold defaults and per-Part overflow rules.
