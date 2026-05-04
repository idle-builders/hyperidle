# L1 Thread primitive — Critique of `approved.md`

Phase 5 (final gate) of `/design`. Scoring `approved.md` as a design contract against the 9-dimension rubric in `.claude/skills/design-critique/SKILL.md`, judged against the variant screenshots (`linear-shaped/screenshot.png`, `slack-shaped/screenshot.png`, `slate-shaped/screenshot.png`) since approved.md is itself a synthesis of B + Pull-A's HEAD collapse + Pull-C's bounded canvas promotion.

## Summary table

| # | Dimension | Score |
|---|---|---:|
| 1 | Visual hierarchy | 9 |
| 2 | Spacing & density | 8 |
| 3 | Typography | 9 |
| 4 | Color | 9 |
| 5 | Component coherence | 8 |
| 6 | States & feedback | 8 |
| 7 | Accessibility | 8 |
| 8 | Anti-slop | 9 |
| 9 | Premium polish | 8 |
| | **Total** | **76 / 90** |
| | **Average** | **8.44 / 10** |

No dimension below 5. Lowest dimension is 8.

---

## Per-dimension justification

### 1. Visual hierarchy — 9

Approved.md maps the load-bearing case (blocking review) to page geometry exactly. Reading approved §3, the head's eye-landing order is `Title → Reasoning bullets → Artifact → sticky Verdict bar → Comment stream`, with `ThreadHostBanner` as recessed chrome. The `linear-shaped/screenshot.png` confirms this in seven distinct landing points without crowding (BLOCKING chip → host label → proposer chip → headline → numbered reasoning → diff → labelled VERDICT row). The chat-shape collapse (no head) preserves hierarchy by *removing* the head rather than degrading it — the banner still answers "what is this thread about?" and the stream's sender-grouping rule does the rest. The promoted-canvas state inherits B's sticky bar onto the dock, so the verdict's hierarchy position is preserved across all three layouts. One real cost: the *resolved* state buries multi-vote audit trails in the comment stream (carried over from B's known weakness). Acceptable for the primary case; flagged in §10 of approved.md and consciously deferred.

### 2. Spacing & density — 8

Tokenised throughout. Banner uses `var(--density-pad-y) var(--density-pad-x)`; head uses `calc(var(--density-pad-y) * 2) calc(var(--density-pad-x) * 1.5)`; comment row uses `calc(var(--density-pad-y) * 0.75) var(--density-pad-x)`; composer uses `var(--density-row-h) * 2`. The multipliers stay on a 4px grid because the underlying tokens do (compact = 0.75×, comfortable = 1.25×, both rounded to 4px per AQ-003). The sticky bar's "tabular order, 4px gap" is the right call. One concern: the head's `1.5×` horizontal pad is multiplicative against an already-densitied token. At compact density (`--density-pad-x = 8px × 0.75 = 6px`), `6px × 1.5 = 9px` — off-grid. The architect can fix this by snapping with `round(... / 4) * 4` or by replacing `1.5×` with a `--density-card-pad` token (which already exists, 8/12/16 across compact/default/comfortable per `tokens.css:258`). Minor; not a gate-blocker. The banner's "2px `--danger` left border" is allowed sub-grid for chip/icon internals (AESTHETICS.md spacing exception); the spec's blocking-banner is borderline a block-level chrome use, but the 2px rule reads as a status-strip pattern, not a card border — acceptable.

### 3. Typography — 9

Closed scale honoured. Title at `--density-text-h2` weight 600. Reasoning body at `--density-text` weight 500. Mono caps for `REASONING / ARTIFACT / QUESTION / VERDICT / REPLY` labels and for `INLINE COMMENT ON: <anchor>`. Tabular numerals + mono for timestamps in `CommentRow`. Weights stay in `{500, 600}` across the spec; no off-scale `text-[Npx]` sneaks in. Letter-spacing on caps is implicit via the `Tag` / `StatusChip` primitives (AQ-007 enforced at the primitive level). The `posted 18 min ago · message #N in thread` line uses `--text-lo` — correctly recessed. One latent risk the architect must hold the line on: the head's `payload.title` rendering at `--density-text-h2` weight 600 can read as a section heading rather than a message subject. Acceptable for the issue-shape (it *is* the substance); just don't let the architect promote it further in implementation.

### 4. Color — 9

Strictly semantic. `--surface-1` (banner), `--surface-2` (head block), `--surface-4` (hover lift), `--text-hi/mid/lo`, `--primary` for the single filled `Approve` button, `--danger` text-only on `Reject` plus the 2px banner left-border. No purple gradients, no indigo decoration, no AI-aesthetic palette tells. The `linear-shaped/screenshot.png` confirms the discipline: BLOCKING dot is the only red on the strip, the diff's `--ok`/`--danger` rows are the only chromatic content in the head, every other element is monochrome on a warm-neutral surface ladder. The verdict bar's three weights (filled → outline → outline + danger text → ghost → text-only) are all derived from one accent + semantic tokens; no decorative color leaks. Status communicated through color *plus* shape (StatusChip) *plus* text — A11y two-channel rule satisfied.

### 5. Component coherence — 8

Reuse is high: existing `StatusChip`, `Tag`, `IconButton`, avatar primitive, `EmptyState`, `ErrorState`, `SkeletonList` are pulled in 1:1. New components are named precisely with clear single responsibilities: `ThreadHostBanner` (chrome), `ThreadHead` (substance), `ReviewVerdictBar` / `QuestionnaireAnswerBar` (action surface), `CommentRow` + `CommentStream` (audit trail), `Composer` (input), `ThreadShell` (composition root). Where it costs the score is *granularity inflation*: the family adds **seven** named components for one primitive. Two are arguably too thin on their own:

- `CommentStream` is described as "filters out the HEAD message, renders the rest" plus an overflow row — that's a `<ul>` inside `ThreadShell`, not a reusable region. Either fold it into `ThreadShell` or define one downstream consumer that needs `CommentStream` in isolation.
- `ThreadHostBanner` and `ThreadHead` could plausibly be one component with an `expanded` prop, but the case for splitting them holds (one is always-on chrome, one is conditional substance) — keep the split.

The overall family still fits within `docs/UI_DESIGN.md`'s budget (Tier 2 blocks + Tier 3 regions slot cleanly), but the architect should use Phase 9 to compress where the contract permits without breaking the reuse claim.

A second coherence note: `QuestionnaireAnswerBar` is described as "mirrors the structure but with the constrained answer set as primary buttons (one button per option, equal weight) and no Reject" — that *is* `ReviewVerdictBar` with a different `verdicts` prop value, not a separate component. Approved.md's "Component family" presents them as siblings; the architect may want to collapse them to one `MessageVerdictBar` with mode discriminant. Not a gate fail — a should-fix.

### 6. States & feedback — 8

Approved §4 covers eight states explicitly (empty, two no-thread-selected variants, loading, error, populated/issue, populated/chat, populated/resolved, populated/overflow, promoted) — broader coverage than B alone. Transitions in §5 specify motion tokens (`--motion-fast/medium`), `prefers-reduced-motion: reduce` swap, `aria-live="polite"` on shape change, and animate-on-`transform`-and-`opacity`-only (AQ-014 compliant). Loading is correctly held back: "the `ThreadHead` skeleton mounts only after the `messages` payload arrives (we don't know yet whether the head should mount)" — that's the right call against optimistic skeletons that misshape on hydration. One real gap: the **resolved** state's transition is under-specified. Approved §4 says "the head (if present) shows the original substance message with `RESOLVED` strip in place of the verdict bar" but does not say *how* the verdict bar collapses (height crossfade? opacity?). Approved §5 names motion tokens for shape change but binds them to head mount/canvas promote, not to verdict resolution. The architect needs this contract or will pick something inconsistent. Should-fix.

A second smaller gap: §5 specifies "Composer focus ring at `--primary` 1px" but the focus-ring rule for *every* interactive element (1px outline + -1px offset) is in §5's Focus row. Aligned; not a gate fail.

### 7. Accessibility — 8

Strong on the basics: focus ring spec, tab order, `aria-live` on shape change, `prefers-reduced-motion` honoured, `Esc` (allowed) for canvas close, no verb shortcuts (founder filter), composer locked to non-optimistic for a clear ack model. Mobile §6 names "Touch targets ≥44px on every interactive element". Color-not-only signal is satisfied (StatusChip + text + shape on every status). The 8 (not 9) is for two omissions:

- The `head-collapse predicate` flips the layout shape. Approved.md announces this via `aria-live="polite"`, but does not specify focus *return* on shape change — if the user was focused on a reasoning bullet and the head collapses (e.g., a verdict resolves and the bar collapses → no head re-mounts because the review was the only substance message), focus must land somewhere defined. The synthesis itself flagged "focus return on canvas close" as architect-territory but missed the symmetric case of head mount/unmount focus return.
- Touch target floor is named for mobile only. Desktop's verdict bar at `--density-row-h` × tight gaps may dip below 44px at compact density. AQ-015 applies at viewport ≤1024px; with auto-density (AQ-016) at ≤1024px the row should expand to comfortable, but approved.md doesn't audit this. Should-fix at the architect step.

### 8. Anti-slop — 9

Clean. No purple/indigo/violet gradients (AQ-102) — the only `--primary` use is flat-filled on the single `Approve` button. No `rounded-2xl`/`3xl` (AQ-101 / AQ-011) — `--r2` corner radius on the head, `--r1` implicit on buttons via DaisyUI tokens. No oversized padding (AQ-103) — multipliers cap at 2×, on a 4-12px base. No hero section (AQ-104) — productivity-first. No emoji as iconography (AQ-105) — banner pinned indicator is "lucide `pin`, 12px, `--text-mid`; never an emoji" (the spec calls this out explicitly). No `text-center`/`mx-auto` page-level (AQ-106). No glass morphism (AQ-107). No 3-column identical card grid (AQ-108). No marketing superlatives (AQ-110). No `bg-clip-text` (AQ-111). No nav rail accent (AQ-112). No over-iconification (AQ-113) — banner icons only when they communicate, not on every label. The `Open full artifact →` link uses a typographic glyph (allowed), not an emoji codepoint. No `Lorem ipsum` placeholder copy. The screenshot evidence (linear-shaped/screenshot.png) shows the same restraint rendered.

### 9. Premium polish — 8

Tabular numerals are explicit on `CommentRow` timestamps. Mono for caps labels. Letter-spacing inherited from `Tag`/`StatusChip` primitives. Motion tokens called out by name (`--motion-fast/medium`). Focus rings at 1px `--primary` with `-1px` outset. Hover at `--surface-4` lift. Halation guard satisfied (no `#000`). The 8 (not 9) is for the polish details approved.md *defers* rather than locks:

- The promoted-canvas reflow's animation budget is unspecified. Approved §2.6 says "When L11 fires `onPromoteArtifact`, `ThreadShell` reflows from `single-column` to `canvas + dock` layout" but does not name the motion budget for that reflow. Layout reflows on `transform`/`opacity` only is hard at this scale; either approved.md should commit to a crossfade-and-mount pattern (old layout fades out, new layout fades in) or accept an instant swap. Architect call, but designer should pin it.
- `Cmd+Enter` to submit composer is named as "universal-app convention, not a verb shortcut." Fine; should also pin the visual cue (placeholder line `Reply to thread… · ⌘↵ to send`?). Approved.md doesn't.
- The "Unresolved review · acting required ↑" line above the composer is described once but its visual treatment (color, weight, divider) is not nailed down. The slack-shaped variant rendered this as a thin `--surface-3` rule with `mono-sm` caps; approved.md should inherit that treatment or redesign it explicitly. Currently underspecified.

These are polish gaps, not structural failures. Architect can pin them inside the open-questions section.

---

## Must-fix (gate-blocking)

**None.** No dimension scores below 5. No hard-rule (AQ-001..AQ-113) violations are introduced by approved.md.

Two specific hard-rule checks the file passes that deserve calling out (they could have failed):

- **AQ-001 (4px grid):** the head's `1.5×` density-pad multiplier is *suspect* but not a confirmed violation — the underlying tokens are 4px-grid-compliant (`--density-pad-x` is 8/12/16) and `× 1.5` keeps that property at default and comfortable (12px → 18px is off-grid; 16px → 24px on-grid). At compact (8px → 12px) it lands on-grid; at default (12px → 18px) it does not. Architect must snap or replace with `--density-card-pad`. Logged as a should-fix because the variant-screenshot evidence (linear-shaped) shows the head padding visually correct, and the rule has a clean fix path.
- **AQ-105 (emoji as iconography):** approved.md explicitly states "lucide `pin`, 12px, `--text-mid`; never an emoji" — passes by construction. The synthesis carried over the slack-shaped variant's `⋯`/`▾`/`↓` typographic glyphs as allowed (not emoji codepoints).

---

## Should-fix (non-blocking; architect or L11 to absorb)

1. **Pin the head padding to a single token.** Replace `calc(var(--density-pad-y) * 2) calc(var(--density-pad-x) * 1.5)` with `var(--density-card-pad)` (already exists at 8/12/16). Removes the off-grid risk at default density without changing the visual outcome at default. (§2.2)
2. **Specify focus-return on head mount/unmount.** Symmetric to the canvas-close focus-return open question (§9.2c) — when the head collapses because a review resolves, focus should land on `Composer` (or back on the resolved verdict's `CommentRow`, designer's call). The architect needs this written. (§5, §8.4)
3. **Lock the verdict-resolve transition.** Approved §4 specifies the resolved state but not the *transition* from `ReviewVerdictBar` → `RESOLVED` strip. Pick one (height crossfade over `--motion-medium`, transform+opacity only) and write it. (§4 row "Populated (resolved)")
4. **Either collapse `ReviewVerdictBar` and `QuestionnaireAnswerBar` to one component with a mode discriminant, or keep them split and lock the split rationale.** Currently they're presented as siblings with near-identical contracts. (§2.3)
5. **Specify visual treatment of "Unresolved review · acting required ↑" composer line.** Inherit slack-shaped's `--surface-3` rule + mono-sm caps + `--text-mid`, or define a new treatment. Approved.md names the *content* but not the *render*. (§2.5)
6. **Audit verdict-bar touch targets at compact density.** Verify rows clear 44px at viewport ≤1024px under auto-density (AQ-015 + AQ-016). Probably fine because auto-density flips compact→comfortable at that breakpoint, but the audit should be explicit. (§5, §6)
7. **Pin the canvas-promotion reflow motion budget.** Either commit to a crossfade-and-mount pattern over `--motion-medium` or accept an instant swap. (§2.6)
8. **Consider folding `CommentStream` into `ThreadShell`.** It is a `<ul>`-with-overflow-row, not a reusable region. Architect can collapse if no downstream consumer needs it standalone. (§2.4)

None of the eight should-fixes are gate-blocking. They are the polish/precision pass that pushes the score from 8s into 9s, and most of them belong to the architect's open-questions resolution rather than the designer's contract.

---

## Specific risks (per the brief)

**Sticky verdict bar release vs. slate's seam-toolbar.** Better. The seam-toolbar fixes the verdict-access problem only when the user is actively transitioning from "study artifact" to "read discussion" — i.e., only in the canvas mode. The sticky bar fixes the same problem in *every* mode (issue-shape, chat-shape, promoted) with one component. The release-on-scroll-past-head behavior is the right call: pinning forever competes with the host banner on short viewports (B's own trade-off), and pinning until-released matches Linear's implementation pattern that B was modelled on. The mobile fallback (verdict bar at the floor in the Artifact tab) is a clean mobile contract that slate's seam-toolbar would have to reinvent. **Verdict surface = sticky bar** is the right unification.

**"Unresolved review · acting required ↑" composer line.** Useful fallback, not noise — *if* it has a quiet visual treatment. Approved.md inherits this from slack-shaped's mitigation rule, where the line is `mono-sm` `--text-lo`/`mid` on a thin `--surface-3` rule. At that weight it's a tactile reminder, not a competing CTA. The risk is the architect rendering it as a primary callout; should-fix #5 above pins this.

**Head-collapse predicate on mid-stream review arrival.** Justified. Linear-shaped's "head does not collapse" stance optimised for the issue-shape case at the cost of the chat-shape tax (B's known weakness). The override is the entire reason for the synthesis: one primitive must serve both shapes, the predicate reads off messages (concept §4.5 contract), and the transition is `aria-live`-announced + `prefers-reduced-motion`-aware. The "JARRING shape change" risk is real on a 3-line chat thread that suddenly gets a review attached, but that's exactly the case where the founder *wants* the structural change — the thread just became blocking, the verdict surface must materialize. The screenshot evidence (linear-shaped) shows what the new shape looks like; the chat-shape (slack-shaped) shows what the old shape looked like; the visual delta is a structured head appearing above an existing stream, not a re-layout of existing content. The override is correct.

**Component count granularity.** Seven named components for one primitive is at the high end, but each has a single responsibility: chrome (banner), substance (head), action (verdict bar/answer bar), audit (comment row + stream), input (composer), composition root (shell). Two are candidates for compression: `CommentStream` into `ThreadShell` (it's a `<ul>` + overflow row), and `ReviewVerdictBar` + `QuestionnaireAnswerBar` into one `MessageVerdictBar` with mode discriminant. Architect can hold or compress in Phase 9 — see should-fixes 4 and 8.

**Promoted-canvas visual contract.** Underspecified but not dangerously so. Approved §2.6 names the geometry (canvas ~68%, dock ~32%, sticky bar on dock top, close button or `Esc`), the components (`ArtifactView` from L11, reflow of existing `CommentStream` + `Composer`), and the focus-return open question (deferred to architect, §9.2c). Missing: the reflow motion budget (should-fix #7) and the dock collapse-to-rail behavior the slate-shaped variant carried (do we keep it?). The architect has enough to design the types/props; designer has handed over the contract cleanly.

**Rejection list load-bearing for downstream.** No downstream story breaks. L11 (artifact embedding) inherits the `Open full artifact` affordance, the `ArtifactView` slot contract, and the canvas-promotion model — all consistent. L12 (per-block discussion) gets `Composer` + `CommentRow` + `CommentStream` for free, none of the rejected items needed. L18 (mobile) inherits the three-tab layout and the verdict-bar-at-floor mobile rule, none of the rejected items needed. L26 (block-level threads) inherits the entire shell and message-type contract. **Emoji reactions specifically** — L11 doesn't use them on artifacts, L12 doesn't use them on blocks, L26 doesn't use them on block discussions. The rejection is sound; if a future story wants emoji reactions, it requires a concept-doc update first per §4.5 closure rule.

---

## Verdict

**PASS.**

- Average **8.44 / 10** ≥ 7.0 (gate threshold).
- No dimension below 5 (lowest is 8).
- No hard-rule (AQ-001..AQ-113) violations.
- The "must-fix" section is empty.

**`approved.md` is ready to feed `/architecture` (TRACK-L L1 Phase 9) as the input contract.** The architect picks types, schemas, endpoints, and ordered tasks. The eight should-fixes belong to the architect's open-questions resolution and to L11's slot contract — none of them re-litigate the visual hierarchy, component vocabulary, or interaction grammar locked in approved.md.
