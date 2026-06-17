# AM1 Variant C — "Editorial" (spec)

Embodiment: `packages/web/src/components/Am1ConversationCalmDocument.tsx` (+ `.stories.tsx`, single `Populated` export). Renders the brief's canonical fixture. Honors the locked concept: deliberate messages only; session = a reference Embed (a quiet line that opens the dial-in, never an inlined work-log); within Thread/Message/verdict; nothing named "Block"/"blocked".

**REDO v2.** Rebuilt to the founder's bar against the t3code reference. v1 ("Calm document") was the right column but too busy and misaligned. This version pushes restraint and alignment much further: it kills all per-message chrome and lands on one calm embed treatment, one alignment grid.

## User workpackage
The founder scans and steers a deliberate agent thread that reads like a beautifully typeset article — embeds render full-bleed inline so the founder judges the actual change in place — then approves the deploy. The decision: *do I follow this, and do I approve the proposed change?*

## Component composition (production reuse mapping)
The variant is hand-rolled for reliable rendering; production maps onto the new **Part model** primitive plus catalogued components:

- **Part model wrapper** (NEW — the WP's primitive): a source-agnostic `Part[]` renderer — single calm column, exhaustive discriminant dispatch with an `unknown` fallback Part. Derived from `Message[]`, never stored. AM3 reuses it for session events.
- **Plain Part** → `CommentRow` (mention/redaction aware). In Variant C a plain agent/human turn renders as **bare prose** (no avatar/name/timestamp row); identity is carried at most once per turn by a quiet section label. Production keeps `CommentRow` but skins it to the editorial mode (sender chrome suppressed, body text promoted to 15px / `--leading-relaxed`).
- **Review Part + verdict bar** → `RichMessageCard` (idle/saving/error/resolved, foldable reasoning, verdict actions). Reused; rendered inside the one calm embed frame rather than its own shadowed card. The verdict line is its resolved state, rendered as a quiet `Approved` label.
- **Verdict Part** → `CommentRow` verdict rendering (`verdictDecisionLabel` / `verdictDecisionToStatus` from `shared/thread.ts`), styled as a one-line uppercase label.
- **Composer** → `Composer` (textarea + send, Cmd/Enter), bottom-pinned. NO model/effort pills — those are AM3 dial-in.
- **Kind / status labels** → `Tag` / `StatusChip` in their uppercase `--tracking-caps` mode, used sparingly as section labels (not per-message badges).
- **Cost / tool meta** → `KeyValue` (tabular-nums) — but in Variant C the session reference is a single inline line, so the meta is a flat `model · $cost · N tool calls` string, not a `KeyValue` grid.

New Part renderers (the WP's deliberately-minimal new shapes) and why each is NEW rather than an extension:

- **`DiffEmbedPart`** (NEW) — wraps the existing `kinds/code-renderer` (`text_diff`) but as a **full-bleed in-column foldable block** with its own caption (`Diff · auth/passkey.ts · +124 −18`) and fold state. NEW because the existing `ArtifactEmbed`/`ArtifactPreview` are sized for a compact reference card, not an in-column document block.
- **`BlockEmbedPart`** (NEW) — wraps `BlockRefEmbed` → `Block` + `renderPayload` to render the referenced block's **real content** inline (heading + body) under a quiet `Knowledge · Auth migration plan · §2` caption. NEW because no existing component renders a referenced block at document scale in-column.
- **`SessionReferenceEmbed`** (NEW, small) — a single **quiet inline line** (`Session · Atlas · Opus 4.8 · $0.42 · 14 tool calls · Open session →`) that routes to the AM3 dial-in. NEW because no component points at a Session *without* inlining its activity — and that non-inlining is concept hard-rule #3. Note: deliberately NOT a card-with-avatar (that was the v1 busyness sin); a calm line aligned to the column edge.
- **`Fold`** (NEW, small) — generalizes `RichMessageCard`'s reasoning fold into a standalone device usable on any Part. In Variant C its closed-state IS a quiet uppercase section label (`RESPONSE · WORKED FOR 1M 12S · 14 STEPS` + `SHOW`) — the calm-making device, not a heavy fold card.

A single shared **`EmbedFrame`** (hairline `--border-subtle`, `--r-subtle`, no shadow, no accent rail) gives every embed ONE consistent calm treatment aligned to the column edge — the discipline that fixes v1's varied embed chrome.

## Information hierarchy (top → bottom)
1. **Host line** — `Bet · Passkey login`, typographic (quiet uppercase kind label + 20px title), no badge soup.
2. **Turns separated by whitespace only** — `--space-12` (36px) vertical rhythm between turns; no rules, no boxes, one shared left edge.
3. **Founder plain turn** — pure prose, zero chrome (reads as the article's body).
4. **Agent work-turn** — marked once by a quiet uppercase section label `RESPONSE · WORKED FOR 1M 12S · 14 STEPS` (the Fold); expands to the work narrative as prose.
5. **Plain Parts** — 15px / `--leading-relaxed` body text on the page surface, bold inline lead-ins; no card chrome.
6. **Embeds** — full-bleed inline inside the one `EmbedFrame`; quiet uppercase caption (`DIFF`, `KNOWLEDGE`) + name; the diff shows real `+/−` lines, foldable.
7. **Session reference** — a single quiet inline line that opens the dial-in (never a work-log).
8. **Review Part** — inside the same frame: section label, 17px title (the document heading), foldable reasoning, inline diff, verdict bar (Approve / Request changes / Reject).
9. **Verdict** — a one-line `APPROVED` accent label + subject.
10. **Composer** — bottom-pinned, one clean rounded `--r-default` elevated input with generous padding; no pills.

## Behavior
- **Fold transitions:** the work-fold toggles via its `SHOW`/`HIDE` label; the diff and reasoning use a chevron that rotates 0→90° over `--motion-default` with `--motion-ease`. Respects `prefers-reduced-motion` (durations collapse via tokens). Animate transform/opacity only.
- **Hover:** the session-reference line's `Open session →` and fold labels get a subtle color/`--surface-container` shift over `--motion-fast`. Bare prose turns carry no hover chrome (editorial calm).
- **Focus:** every fold toggle, diff header, session line, verdict button, and the composer is a real focusable control with `aria-expanded` on folds; visible focus ring from the token system.
- **Keyboard:** Cmd/Enter sends from the composer; Enter/Space toggles a focused fold; Tab order follows reading order top→bottom.
- **Fold defaults:** the work-fold is collapsed (it IS the quiet label); the headline diff is open (it is the thing the founder asked to see); review reasoning is collapsed; the review's nested diff is open. Overflow stays scannable because completed work folds to one line and the session never inlines its log.

## Mobile adaptation (3-tab layout)
The Conversations tab hosts a single full-width column: max-width drops to 100% with `--space-4` (12px) side padding; the 720px cap is desktop-only. Embeds stay full-bleed inline (already full-width). The work-fold and headline diff default collapsed on mobile to keep the column short. The session-reference line wraps its meta under the name when width is tight. Composer is bottom-pinned above the tab bar; inputs use ≥16px font (AQ-005).

## The signature
**Full-bleed inline embeds rendered through ONE calm frame, in an editorial column with almost no per-message chrome.** The richest embedding of the three variants — you see the actual diff/plan/session in place — but disciplined: a single embed treatment, one alignment edge, identity carried by quiet uppercase section labels (the `RESPONSE · WORKED FOR 1M 12S` Fold) instead of avatars + role badges + timestamps on every line. The conversation reads like a typeset article, not a log of bubbles.

## Trade-offs
- **Tall column.** Full-bleed inline embeds make turns long; relies on disciplined folding (work-fold collapsed, session never inlined) to stay scannable. Without folding, a busy thread scrolls far.
- **Identity is quiet.** Killing per-message avatars/names/timestamps is what makes it read editorially, but in a many-participant thread "who said this" is less glanceable than sibling B's named soft turns. Mitigation: the section label names the agent on work-turns; a fast scan still distinguishes founder prose from agent embeds. Acceptable for the typical 1-human + 1-agent deliberate thread; weaker for a crowded multi-agent thread.
- **New rendering code.** Four new Part renderers (`DiffEmbedPart`, `BlockEmbedPart`, `Fold`, `SessionReferenceEmbed`) + the shared `EmbedFrame` vs sibling A's reuse-only column — higher build/maintenance surface, but it is exactly the embedding richness the founder asked for and the Part-model primitive the WP exists to ship.
- **Discipline-dependent calm.** The "editorial" feel degrades if embeds gain per-variant chrome or fold defaults flip open; correctness hinges on the single `EmbedFrame` treatment and the fold defaults above.
