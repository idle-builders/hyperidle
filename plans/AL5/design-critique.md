# AL5 — Design critique: the adopt/browse surface

**Reviewer:** reviewer agent (cold eval, producer/evaluator separation).
**Date:** 2026-06-25.
**Artifact:** `plans/AL5/design/adopt-surface.md` (DESIGN-CLASS: routine — one variant).
**Verdict: PASS — 8/10. DESIGN-CLASS routine confirmed; no human-design-review gate fires.**

The rendering side adds **no new screen** (an adopted surface fills the exact `<Canvas artifact={…}/>` slot in `ExaminePane`). The only new pixels are (1) Settings → Review surfaces (an instance of the AN1 Connections list) and (2) a one-line "rendered by X · swap" affordance in the examine-pane header. Both reuse solved, founder-approved patterns. Confirmed against code: `ExaminePane` already has the header row (`KindBadge` + `ToolLogo` + title + "Comment on this" + close) the affordance slots into; `SettingsConnections.tsx` exists as the cited skeleton.

## 9-dimension rubric

| # | Dimension | Score | Note |
|---|---|---|---|
| 1 | Problem framing | 9 | "One decision: which surface renders this situation?" is crisp; entry-points (Settings + in-review) well-justified. |
| 2 | Layout / IA | 8 | Grouped `ItemList` (Adopted / Available) mirrors AN1 exactly. "Base — floor" rows-as-populated-state (not empty state) is the right call and answers concept hard-rule #3 visibly. |
| 3 | Interaction model | 8 | Browse/Adopt `Dialog` = AN1 `AddConnectionDialog`; Swap = Adopt pre-bound. No new interaction primitive. |
| 4 | Visual / token discipline | 8 | Zero new design-system components (budget explicitly stated). Composed from catalogued primitives only. Cannot fully score paint without TSX (deferred to build), but the component budget is correct. |
| 5 | States | 7 | Per the no-skeleton-in-initial-designs memory, only populated state is designed; loading/empty/error explicitly deferred to builder. Correct process. |
| 6 | Accessibility | 8 | Esc-closes-dialog (reuses `ReviewComposition` Escape convention), arrow-key list nav, focus-return-to-trigger, two-click destructive confirm. Concrete and reuses existing conventions. |
| 7 | Reuse / consistency | 9 | The strongest dimension. Verbatim AN1 shape; reuses `ToolLogo`, inline `TrustTag`/`ServiceMark` per the AN1 `@lore NIT-4` duplicate-don't-promote convention; `:8098` viewer for preview. |
| 8 | Anti-slop | 8 | No AI tells flagged; the preview iframe is the existing viewer, not a new surface. |
| 9 | Scope honesty | 8 | One-variant justification is sound — no layout fork to explore; multi-variant would re-litigate approved AN1 IA. Correctly notes the human-design-review gate fires if reviewer re-classes novel (it does not). |

**No new design-system component. Render side adds no new screen. Both confirmed.**

## Findings

- **NIT-D1 (preview iframe trust).** The "load-bearing trust affordance" is an `<iframe>` to the `:8098` TSX viewer rendering the surface's `.stories.tsx` against bundled sample data. `:8098` is a dev-server viewer — the design doc should flag that in a packaged/desktop build the preview path needs a story-render route that exists in production, or the preview silently breaks. Architecture §6.2 mentions the story; neither doc names the production preview transport. Build-time concern, not a design defect — flag for the builder.
- **NIT-D2 (degrade visibility).** "Base canvas (`<base>`) · surface unavailable" in `--status-warning` is the right answer to "which surface rendered this is always answerable." Good — keep it. (No change.)
- **NIT-D3 (Available-row "adoption count").** `cells = adoption count across known situations` implies the client knows global adoption counts; the GET `/api/surface-registry` shape (arch §5) returns manifests only, no counts. Either drop the count cell or add it to the view shape. Minor data-shape mismatch between design and architecture.

**Design verdict: PASS (8/10).** Routine classification correct; no unresolved CRITICAL. Findings are NITs for the builder.
