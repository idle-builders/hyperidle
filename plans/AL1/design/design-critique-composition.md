# AL1 — Design critique: the review COMPOSITION (3 variants)

Reviewer critique. Scope: how the per-artifact building blocks compose into ONE whole review. Evaluated from the renders (`comp/briefing.png`, `comp/stage.png`, `comp/focus-home.png`, `comp/focus-focus.png`) + sources (`ReviewComposition{Briefing,Stage,Focus}.tsx`) against `review-system.md §3`, `components-brief.md §1-7`, and the carried founder constraints (3-layer layering · navbar+2-sections MAX · big 16:9 artifacts need real room · result-first · relevance-ordered · tool-grounded · Hearth+CP1).

The model (review-system.md §3): one review = **FRAME** (outcome/intent/needs-you) → **SUBJECT** (relevance-ordered building-block stack) → **CONVERSATION** (anchored) → **VERDICT** (resolves the whole Subject). The artifact is the *examine* layer, not the whole review.

---

## A — Variant A: "Briefing" (single reading column)

Render: one ~860px column on `--surface-page`. Frame header (breadcrumb · Atlas→You · Awaiting·Blocking · tool logos · cost) → outcome sentence + done-conditions (3✓/1✗) + 2 red Needs-you chips → artifact stack (code expanded inline into the **real ReviewCodeDiff**, 3 others collapsed) → conversation → pinned verdict bar.

### 9-dim score

| Dim | Score | Justification (from the render) |
|---|---|---|
| Hierarchy | 8 | Cleanest top-to-bottom flow-of-understanding of the three. Result-first (outcome sentence leads), needs-you floats, code expanded, trivia collapsed. The whole §3 model reads in document order — frame→subject→conversation→verdict. The one weakness: the expanded ReviewCodeDiff is so much denser than the 3 collapsed rows that the stack's visual rhythm breaks (one giant block, three thin rows). |
| Spacing | 8 | Disciplined 6px grid (`px-[24px] py-[18px]` section rhythm, `gap-[9px]/[12px]/[18px]`). Section dividers (`border-subtle`) give clean bands. Column maxed at 860px keeps measure readable. |
| Typography | 8 | Tokened scale {12,13,15,20}, weights {400,500,600,700}, tabular-nums on cost/counts, uppercase section labels with `--tracking-caps`. Outcome at 15px/1.55 `max-w-[72ch]` is a proper reading paragraph. |
| Color | 8 | All semantic tokens. Needs-you = `--status-error`+`-dim`; action kind tinted with `color-mix` over `--status-warning`; agent avatar green-distinct (AQ-012). `text-white` only on `--accent-primary` fills (matches ReviewCodeDiff). |
| Coherence | 9 | This is the variant's strongest dimension — it visibly *composes the building blocks into one surface*: the code row's L3 literally mounts the real `<ReviewCodeDiff />`, proving the frame+block contract. Reads as ONE review, not four panels. |
| States | 7 | Populated shown; empty/loading/error/needs-you specified in the trailing comment block. needs-you IS the populated state (good). But collapsed non-code rows show only `row.summary` on expand — they do NOT mount their real building block (honest comment admits it), so the "examine deeply" promise is only proven for code. |
| A11y | 7 | `aria-expanded` on rows, `aria-label="Breadcrumb"`, `aria-hidden` on glyphs, real `<button>`/`<nav>`/`<header>`. Needs-you "Jump ↓" is a button. Gap: no visible focus ring spec, and the chevron/check rely on `aria-hidden` with no row-level accessible name beyond the title text. |
| Anti-slop | 8 | No gradients, no `rounded-3xl`, no centered body, no emoji icons, real fixture copy. `Chevron`/`CheckGlyph` are tiny inline SVGs reused — fine. |
| Premium-polish | 8 | Calm, dense, editorial. Pinned verdict bar with `--shadow-elevated` + blocking pill is a confident close. Single-column risks feeling like a long doc when many big artifacts pile up. |

**Average: 7.9**

### Composition verdict
- **(a) Composes into ONE review?** YES — strongest of the three. Document-order frame→Subject→conversation→verdict; the real building block nests inline.
- **(b) navbar+2-sections budget?** YES — it's a single section (one scroll column under the navbar). Most budget-frugal.
- **(c) BIG artifacts room?** WEAK. This is its load-bearing flaw. A 16:9 visual diff or a browser preview expanded inline is capped at the 860px column width — exactly the "narrow pane doesn't do them justice" failure the founder called out. Code is fine at 860px; a side-by-side visual diff is not.
- **(d) fast read + slow read?** Fast read: excellent (scan the column, approve from the pinned bar). Slow read: good for code, unproven for big artifacts (they'd be cramped).
- **(e) 3-layer layering?** YES at composition altitude (L1 frame · L2 outcome+stack · L3 inline block).

---

## B — Variant B: "Outline + Stage" (two-pane)

Render: left rail ~330px on `--surface-container` (identity · condensed outcome · intent 3✓/1✗ · 2 needs-you · Artifacts·4 clickable list · verdict block pinned at rail bottom) + right stage on `--surface-page` (stage header with prev/next + Mark-reviewed · the selected artifact's building block full-width · slim conversation strip beneath).

### 9-dim score

| Dim | Score | Justification (from the render) |
|---|---|---|
| Hierarchy | 7 | Clear orient(rail)/examine(stage) split. But the frame is *compressed into a sidebar* — the outcome sentence, the most important result-first content, is clamped into a 330px rail at 13px secondary text, demoted below the page-title-sized work identity. Result-first weakens: the stage (one artifact) dominates the eye, not the outcome. |
| Spacing | 8 | Rail section rhythm (`RailLabel` uppercase + count, `px-[18px] py-[18px]` bands) is tidy. Stage `px-[24px] py-[24px]`. 6px grid honored. |
| Typography | 7 | Good scale discipline. Rail outcome at 13px/1.5 is borderline small for the lead result of the whole review; in the render it reads as metadata, not headline. |
| Color | 8 | Tokens throughout; warning-tinted needs-you buttons via `color-mix`; active artifact row uses `--surface-elevated`+`--shadow-subtle`. Verdict primary on `--accent-primary` with `--surface-elevated` text. |
| Coherence | 7 | The stage genuinely hosts the real `<ReviewCodeDiff />` full-width — good. But coherence as ONE review suffers: conversation is a strip *under the current artifact* and the verdict lives in the rail, so the four §3 parts are scattered across two panes rather than reading as one whole. You never see frame+subject+conversation+verdict together. |
| States | 7 | Populated shown; empty/loading/error/needs-you specified in trailing comment. **Honest flaw:** non-code artifacts render a *dashed-border placeholder* that literally says "This artifact opens at full stage width…" — it tells rather than shows. The big-room claim is asserted, not demonstrated. |
| A11y | 7 | `aria-current` on active row, `aria-label` on prev/next, `aria-pressed` on Mark-reviewed, sticky stage header. Gap: no focus-ring spec; rail list is keyboard-navigable as buttons but no roving-tabindex/listbox semantics for a pivot list. |
| Anti-slop | 8 | No AI tells. Dashed placeholder is honestly labelled, not a fake. |
| Premium-polish | 7 | Competent IDE/Linear-like two-pane. The persistent rail + stage feels tool-like and professional, but the compressed frame and the placeholder stage rob the render of the "wow" the other two land. |

**Average: 7.3**

### Composition verdict
- **(a) Composes into ONE review?** PARTIAL. The four §3 parts exist but are *spatially fragmented* — frame+verdict in the rail, examine in the stage, converse under the stage. You judge one artifact at a time; you never hold the whole Subject in view. The verdict-resolves-the-WHOLE-Subject hard rule is structurally undercut by a UI that foregrounds a single artifact.
- **(b) navbar+2-sections budget?** YES — rail + stage = exactly 2 sections under the navbar. Clean.
- **(c) BIG artifacts room?** YES — this is its whole reason to exist and its strongest claim. The stage is `flex-1`, full-height, full-width; a 16:9 visual diff / browser preview / wide diff gets real room. **But** the render only *proves* it for code; every other kind is a placeholder, so the payoff is promised not shown.
- **(d) fast read + slow read?** Slow read (examine one big artifact): best of the three. Fast read (approve-at-a-glance): weakest — the result is buried in a sidebar; you must read the rail carefully before the verdict makes sense.
- **(e) 3-layer layering?** YES (rail L1/L2, stage L2/L3) — though L1 is cramped.

---

## C — Variant C: "Focus-flow" (scannable home ⇄ full-screen focus)

Renders: `focus-home.png` — calm ~820px home column (frame header · outcome+intent+needs-you · Artifacts·4 as elevated cards with "Examine →" · slim conversation note pointer · full verdict bar). `focus-focus.png` — full-screen focus on one artifact (back · title · prev/next stepper · Mark-reviewed · building block full-size + a 320px conversation rail anchored to it · compact verdict bar).

> NOTE ON THE RENDER: `focus-focus.png` shows the right conversation/inspector panel populated but the left building-block canvas reads empty in the capture. The source (`FocusBuildingBlock`) mounts the real `<ReviewCodeDiff />` for the code artifact, so this is a capture/state artifact (likely the inspector-overlay home story), NOT a structural hole — but it means the *focus examine surface itself is unproven in pixels*. Re-capture the focus-on-code state before `/human-design-review`.

### 9-dim score

| Dim | Score | Justification (from the render) |
|---|---|---|
| Hierarchy | 8 | Home reads beautifully: result-first outcome, intent, 2 red needs-you, then 4 relevance-ordered artifact cards each with kind badge + ToolLogo + badge + "Examine →". The fast-read hierarchy is the best of the three — clearly approvable at a glance with the verdict bar in view. |
| Spacing | 8 | 6px grid; home cards `px-[12px] py-[12px]` with `--shadow-default` (AQ-012 tactile weight); `gap-[9px]` card list. Focus header `px-[18px] py-[12px]`. Consistent. |
| Typography | 8 | Scale {10,12,13,15,17,20} tokened; outcome 15px/1.55 `max-w-[68ch]`; tabular-nums on badges/counts. Clean. |
| Color | 7 | Tokens throughout — EXCEPT raw `#ffffff` in three inline styles (`ReviewedPill` color, glyph color, verdict primary color, lines 95/100/330) and `text-white` on the rail Send button (line 386). `text-white` on accent matches the building blocks, but the **raw `#ffffff` inline literals are the one hardcoded-color slip** the other two variants avoid (they use `text-white` utility or `--surface-elevated`). Not in ToolLogo → outside the carve-out. |
| Coherence | 7 | Home composes frame+subject+needs-you+verdict in one view (good fast-read coherence). But conversation is demoted to a one-line "Note … N in thread →" pointer on home, and only appears in full inside focus. So the CONVERSATION part of the §3 model is not first-class on the home surface — it's a teaser. The whole review reads as two surfaces, not one. |
| States | 8 | Per-artifact reviewed state, home⇄focus surface state, prev/next disabled at ends (`disabled:opacity-40`), empty/loading/error specified. needs-you floats on home. Richest interaction model of the three. |
| A11y | 7 | Focus stepper `disabled` states, `aria-pressed` on reviewed pill, `aria-hidden` glyphs. **Concern:** home artifact rows use `role="button" tabIndex={0}` with manual Enter/Space handlers on a `<div>` instead of a real `<button>` — works, but re-implements native button semantics (and the brief/rules favor semantic elements). Prefer `<button>`. No focus-ring spec. |
| Anti-slop | 7 | Mostly clean. The `role="button"` div is a mild anti-pattern (hand-rolled button). The `ReviewedPill` `onClick` `stopPropagation` inside a clickable card is necessary glue, not slop. |
| Premium-polish | 8 | The drill-and-return rhythm feels like a real product (Linear issue → full-screen). Elevated home cards + full-screen focus is the most "app-like" of the three. Loses a point for the empty focus capture + the raw-white slips. |

**Average: 7.6**

### Composition verdict
- **(a) Composes into ONE review?** PARTIAL→YES. Home composes frame+Subject+verdict cleanly; conversation is a teaser, and examine lives on a *separate* full-screen surface. It's "one review across two surfaces" — coherent, but the whole §3 stack is never co-visible.
- **(b) navbar+2-sections budget?** BEST. Home is one surface; focus *replaces* it (not a third pane). Under the navbar it's a single section that swaps content — most budget-respecting reading of all.
- **(c) BIG artifacts room?** YES — full-screen focus gives an artifact the entire viewport (minus a 320px conversation rail). A 16:9 visual diff gets more room than Briefing's inline column and comparable to Stage. **But** the render doesn't prove it (empty focus capture), and the 320px rail eats into the 16:9 width — for a true 16:9 the rail should be collapsible.
- **(d) fast read + slow read?** Best dual-mode of the three. Fast read: home is the cleanest approve-at-a-glance. Slow read: full-screen focus is a genuine examine surface. The drill-and-return is the right rhythm for "review a set of big artifacts one at a time."
- **(e) 3-layer layering?** YES at both surfaces (home L1/L2/L3-entry; focus L1/L2/L3).

---

## Head-to-head — "review for anything" (tiny field-change → 16:9 app preview)

The hard requirement is a composition that holds across the **whole artifact-size spectrum** — a one-field CRM write AND a 16:9 browser/visual preview — under navbar+2-sections.

| Criterion | A Briefing | B Stage | C Focus |
|---|---|---|---|
| ONE-review coherence (§3 co-visible) | **Best** | Weakest (fragmented) | Good (2 surfaces) |
| Big 16:9 artifact room | Weak (860px cap) | **Best** (full stage) | Strong (full-screen, rail eats width) |
| Tiny-artifact economy | **Best** (collapsed row) | Wasteful (full stage for a 1-field change is absurd) | Good (card → focus optional) |
| Fast read / approve-at-a-glance | Strong | Weakest (result in sidebar) | **Best** |
| Slow read / examine deeply | Good (code only) | **Best** (one big artifact) | **Best** (full-screen) |
| Budget frugality | Best (1 col) | OK (2 panes) | Best (swap) |
| Proven in the render | **Best** (real block inline) | Weak (placeholders) | Weak (empty focus capture) |

**Where each wins / loses:**
- **A wins** the fast read, the tiny-artifact case, and *proof* (it's the only render that shows real blocks composing). **A loses** the big-artifact case decisively — an 860px inline column cannot do a 16:9 preview justice. That's the founder's explicit red line.
- **B wins** the single-big-artifact examine. **B loses** the fast read (result buried), the tiny-artifact case (a full stage for a 1-field change is grossly disproportionate), and ONE-review coherence (parts scattered).
- **C wins** the dual-mode (clean home + full-screen focus) and budget. **C loses** on conversation being a teaser, the unproven focus capture, and the rail eating 16:9 width.

**The spectrum exposes the real tension:** A is right for *small* artifacts and the fast read; B/C are right for *big* artifacts and the slow read. No single pure variant is right for "anything."

### Hybrid is better — and it's the obvious one
**Briefing-with-focus (A as the base, C's drill as the escalator).** Take Briefing's single-column frame→Subject→conversation→verdict (best coherence, best fast read, best tiny-artifact economy, already proven with real blocks) as the home. For artifacts that need room — visual diff, browser preview, wide diff — the inline row does NOT expand into the cramped 860px column; instead "Examine →" drills to C's **full-screen focus** (with a *collapsible* conversation rail so a true 16:9 gets the full width). Small artifacts (field-change, metrics, tests) expand inline in the column à la Briefing; big artifacts escalate to full-screen à la Focus. The kind decides the affordance — which is exactly the kind→canvas selection model §1 already establishes.

This hybrid resolves every spectrum cell: small = inline (A), big = full-screen (C), one coherent home (A), budget = 1 section that swaps (C). B's persistent two-pane is the loser — it's disproportionate for small artifacts and fragments the §3 model.

---

## Anti-slop / token audit

- **No AI-aesthetic tells** in any variant: no purple/indigo gradients, no `rounded-3xl`, no glass-morphism, no centered body copy, no emoji iconography, no hero, no 3-col identical grid, no marketing superlatives, no Lorem ipsum. Real fixture copy throughout.
- **Hardcoded color — ONE real finding (C/Focus):** raw `#ffffff` in inline styles at `ReviewCompositionFocus.tsx:95, :100, :330` and `text-white` at `:386`. `text-white` on `--accent-primary` matches the established `ReviewCodeDiff` pattern (acceptable, consistent), but the **raw `#ffffff` literals violate AQ-008** and are outside the ToolLogo carve-out. A and B avoid this (they use the `text-white` utility or `--surface-elevated` for text-on-accent). Fix: replace `#ffffff` with `--surface-elevated` (the Hearth on-accent text token used by B's verdict button) or the `text-white` utility for consistency.
- **`color-mix(in oklab, var(--status-*) N%, transparent)`** used in all three for kind/needs tints — this composes ON tokens, not a hardcoded color; acceptable and consistent with the building blocks.
- **Single-use glyph helpers** (`Chevron`/`CheckGlyph`/`ArrowGlyph`) are duplicated across the three variant files. Acceptable for isolated design variants; if a hybrid is built, hoist to one shared module.
- **Motion:** all variants animate only `transform`/`opacity` with `--motion-fast` + `--motion-ease` (AQ-013/014 honored). None spec `prefers-reduced-motion` but they only transform/opacity, so the risk is low; the production build should add the media-query guard.
- **A11y gap common to all three:** no explicit focus-ring treatment is visible/specified. Whichever base is chosen must add a tokened focus ring before build. C additionally should swap its `role="button"` div rows for real `<button>` elements.

---

## Recommendation

**Take A "Briefing" as the base into `/human-design-review`**, with C's full-screen focus grafted on as the big-artifact escalator (the Briefing-with-focus hybrid above). Rationale: A is the only variant that *proves* the §3 composition with real building blocks, wins coherence + fast-read + tiny-artifact economy + budget, and its single decisive weakness (big-artifact room) is exactly what C's full-screen focus solves — and C is already built, so the graft is low-risk. B is not the base: its persistent two-pane is disproportionate for small artifacts, buries the result, and fragments the one-review model.

**Single highest-value fix per variant:**
- **A Briefing:** big artifacts must NOT expand inline in the 860px column — route visual/browser/wide-diff kinds to a full-screen examine (adopt C's focus) so they get real room. This is the one change that makes A "review for anything."
- **B Stage:** the fast read is the gap — surface the outcome sentence as a proper result-first headline (not 13px rail metadata), and/or render real building blocks in the stage placeholders so the big-room claim is shown, not asserted.
- **C Focus:** replace raw `#ffffff` inline literals (`:95/:100/:330`) with `--surface-elevated`/`text-white` utility, swap the `role="button"` div rows for real `<button>`s, make the focus conversation rail collapsible (so a true 16:9 gets full width), and **re-capture the focus-on-code state** — the current `focus-focus.png` shows an empty canvas and cannot be approved on as-is.
