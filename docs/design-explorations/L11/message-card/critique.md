# /design-critique — Variant B (message-card)

Scoring against the 9-dimension rubric.

---

| Dimension | Score | Notes |
|---|---|---|
| Visual hierarchy (V) | 9/10 | The card surface lift (`--surface-2` against `--surface-1`) creates immediate "this is the decision" recognition. Title is the largest element inside the card; the artifact is centred; the action footer is divided from the artifact by a rule. Eye lands on the card → reads title → scans artifact → finds verdict. The danger left-border on the blocking card is a clean blocking signal. **Best-in-spread on hierarchy.** |
| Spacing / density (S) | 8/10 | Card padding 8/12px depending on slot. Reasoning is collapsed by default (saves 30-40px vertical). Action footer separated by 1px rule + 10px pad. Internal density is right. The `margin-left: 36px` aligning the card with row body column is a nice touch — keeps the visual rail consistent with `CommentRow`. Reasoning toggle pill is a 4/8 padded chip that sits in its own row — could feel slightly chrome-heavy when reasoning is short (1 line); designer-call to expand inline if reasoning is ≤1 line. |
| Typography (T) | 8/10 | Title 16px weight 600 — appropriately heavier than rich-row title in A. Mono caps on the REVIEW / RESOLVED tags. Card metadata strip is 12px. Verdict label inside the resolved strip uses `--ok` mono caps. All weights are 400/500/600. **Same tabular-nums miss on timestamps** as A. |
| Color / contrast (C) | 8/10 | All tokens. Card surface lift uses `--surface-2`. Resolved-state collapsed strip uses `--surface-2` background, no chrome change. Verdict colour family (`--ok` for approved) is consistent with the design system. Danger left-border on blocking card uses `--danger`. No hex, no Tailwind palette. |
| Coherence (Co) | 6/10 | **Adds one new component (`RichMessageCard`).** Justified by 2-context use (review + questionnaire) but it's a budget hit. The card chrome introduces a second container shape inside the message stream — which also contains rows. Two container shapes (row + card) coexist; this is intentional but it does add a visual vocabulary the user must learn. The spec is honest about this. |
| States completeness (St) | 9/10 | Empty / loading / error / populated / resolved / re-expanded / overflow / multi-rich-message all described. The collapsed-resolved single-line summary is a state worth its own design — this variant has it. The reasoning toggle has its own state (collapsed/expanded). The mockup shows three live states (resolved, blocking-active, questionnaire). |
| Accessibility (A) | 7/10 | `role="toolbar"` on action footer; `aria-expanded` on reasoning toggle; `aria-label="Re-expand"` on the resolved-state chevron. **Gaps:** resolved-state `Re-expand` is a button with text label and chevron glyph — fine. The card itself isn't a `<button>` but it also isn't expected to be — clicking the card body doesn't activate anything; only the toggle and the verdict buttons do. Focus-trap inside the card during the verdict dispatch is a concern the architect should handle. |
| Anti-slop (As) | 8/10 | No emoji, no oversized padding, no purple gradients, no glass morphism. The card surface (`--surface-2`) and the 1px border are restrained. **One concern:** `box-shadow: 0 1px 0 rgba(0,0,0,0.2)` on the card is a small drop shadow — the design system's AQ-012 says "cards use the surface ladder, not shadow." This 1px shadow is borderline — it's not the AI-tell heavy shadow (`shadow-lg`/`xl`) but it's also not pure surface. **Designer fix:** drop the shadow, lean on the `--surface-2` lift alone. |
| Concept fit (F) | 7/10 | Rich messages render **inline** in the stream as cards. The action surface is **inside the card's footer** — no separate top-level action bar. Verdict commits via L7. **But:** the card chrome itself is arguably "chrome above the message content" — the founder direction was that "ThreadActionBar inline with the messages, not on top — it's part of the thread." The card lifts the rich message *out* of the row chrome and gives it its own surface. Is that "part of the thread"? Yes — the card is a row in the stream, not a sibling header. The footer-locked action surface is inside the message it belongs to. The concept fit is solid; loses 1 point because some readings of "inline" want zero surface differentiation (which is what A delivers). |

**Total: 70 / 90 (avg 7.8)**.

**Strengths.** Best visual hierarchy in the spread. Eye finds the
decision instantly. Resolved-state collapse is honest. State coverage
is the most complete.

**Weaknesses.** One new component (Tier 2 cost). The 1px box-shadow
should go (anti-slop fix). Surface lift introduces a card-vs-row
visual vocabulary that needs to be learned (small cost).

**Verdict.** Advances to comparison. Strong on hierarchy + states;
soft on coherence (component-budget cost).
