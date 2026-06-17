# AL1 — Approved Review Experience Design

**DESIGN-CLASS: novel** · **Status: APPROVED** by the founder on 2026-06-18, after 4 `/human-design-review` rounds on the rendered TSX at `:8099`. This is the **input contract to `/architecture`** — the visual hierarchy, component vocabulary, interaction grammar, and the canvas-selection model below are fixed; `/architecture` plans the data shapes, routes, and wiring, it does **not** re-decide them.

Read with: `plans/AL1/concept.md` (locked nouns), `plans/AL1/review-information-architecture.md` (the IA), `plans/AL1/design/review-system.md` (the system model), `plans/AL1/design/spectrum-review-needs.md` + `tool-ecosystem-and-canvases.md` (the cross-functional + tool grounding), `components-brief.md` (the design language §1-7), and the two critiques (`design-critique-components.md`, `design-critique-composition.md`).

---

## The design in one picture
A review is **one Subject (a set of artifacts), one verdict**, rendered as a **composition that wraps building-block proof canvases**:

```
REVIEW (ReviewCompositionRefined) — the whole thing you approve
├─ FRAME HEADER  breadcrumb (Bet › Task) · agent→reviewer · ● Blocking (dot+text)
│                · tool mini-logos · cost · VERDICT right (Approve · Request changes · ⋯)
├─ § THE TASK    where we came from: the bet/task + the real PROMPT + a link to the source
├─ § RESULT      what we did: outcome + glanceable KPIs + a VISIBLE proof (before→after)
│                · "met the task: 3 of 4" (the intent demoted to one line)
├─ § NEEDS YOU   quiet status dot + text, each a JUMP link to the relevant artifact
├─ § ARTIFACTS   thin opener rows (muted kind badge · tool logo · title · badge · Open →)
├─ § CONVERSATION  one global thread; a comment may carry a reference chip (on file:line)
└─ RIGHT PANE    opens on a clicked artifact → its building block at full size + a close ✕;
                 center narrows, close returns full width. Big 16:9 artifacts get the room here.
```

---

## Two locked layers

### 1. The composition (the whole review) — `ReviewCompositionRefined.tsx`
The approved shape: **center review column + an opening right pane** (the converged "Stage" direction). Properties, all founder-confirmed:
- **Dual-anchor, made concrete and visible.** Lead with **§ The Task** (the bet/task + the real *prompt* the work is judged against, with a link to the source record) and **§ Result** (the outcome + glanceable KPIs + a *visible* proof you can see — here a before→after checkout). The abstract intent done-conditions checklist is **demoted to a single "met the task: N of M" line** (it "doesn't fit the research" as the lead).
- **Examine in a right pane, not downward.** Artifact rows are **thin openers**; clicking one opens its building block at full size in a ~620px right pane; the center narrows; **✕ closes and returns full width**. No building-block-in-a-row nesting.
- **Conversation is ONE global thread, on the content.** No per-artifact second thread. A comment may carry a **reference chip** (e.g. "on `PromoField.tsx:118`") to point at an artifact/spot as context. *(This thread is intentionally lightly styled — it will adopt the AM-track conversation redesign; see Open Questions.)*
- **Verdict lives in the header, never floating.** Primary **Approve** + secondary **Request changes** + a **⋯ overflow** (Approve-with-comments · Edit · Reject). Always reachable; never a sticky bar over the content.
- **Calm color.** Kind badges are **neutral** (color reserved for meaning); status is a **dot + text**, not a saturated pill-blob. Clear quiet-caps section headers + generous spacing (air).

### 2. The building blocks (the proof, per family) — the canvases
One review element **per proof family** (the Examination layer). Each is **tool-grounded** (a `ToolLogo` mini-logo + a `CanvasSourceHeader` naming the app + an "Open in <app> ↗" link to the source record) and has **3-layer drill-down** (L1 summary → L2 proof → L3 on-demand detail), drawn from the T3 reference language:

| Family | Component | Signature |
|---|---|---|
| Frame lead | `ReviewOutcomeSummary` | result-first, tools logo'd, needs-you risk chips (function-agnostic) |
| Record/field change-set | `ReviewFieldChangeSet` | before→after field grid, per-field source + approve |
| Action/operation | `ReviewActionOperation` | pre-commit *receipt*: amount loud · blast-radius · undo · gate |
| Rendered-in-context | `ReviewRenderedInContext` | the asset as its recipient sees it (email-in-inbox → full render → flags); + an **EmailBody** basic |
| Metrics-moved / data-diff | `ReviewMetricsMoved` | materiality-sorted deltas · tie-out ✓ · per-figure provenance |
| Visual before→after | `ReviewVisualDiff` | design-vs-build compare + flagged regions |
| **Code diff (must-win)** | `ReviewCodeDiff` | T3 relevance-ranked file cards (logic→tests→**Minor** collapsed) · CI inline · gutter diff · PR message + per-file "why" |
| Batch / per-item | `ReviewBatch` | rollup · flagged-pinned · routine-collapsed · approve-all-except |
| Basic (browser) | `ReviewBrowserPreview` | a plain browser window around a rendered page — "just look at it" |

Shared: `ToolLogo` (mini provider logos — prod swaps for simple-icons/Logo.dev), `CanvasSourceHeader` (app name + jump-off link). Fixtures: `review-subject.fixture.ts` (the composition Subject), `review-fixtures.ts` (per-canvas).

---

## The selection / templating model (settled — `/architecture` builds against this)
- **Canvas selection is automatic, by artifact KIND.** The producing agent declares each artifact's kind (the LLM is the universal router; the family vocabulary is ~7). `kind → standard family canvas`. **No exhaustive tool registry.**
- **3-tier resolution (first match wins):** (1) tool-shipped canvas via **MCP Apps** `ui://`; (2) per-tool / community **manifest** template; (3) the **standard family canvas** (the floor — always exists; `FallbackRenderer` for the unclassifiable).
- **The artifact is the examine layer**, never the whole review. One verdict resolves the whole Subject.

---

## States (per the "populated-only in design" rule, the rest are spec for build)
- **Composition:** `Overview` (pane closed — the whole review) and `Examining` (pane open on an artifact) are the rendered states. Empty (no needs-you → a calm "nothing needs you"), loading (skeleton), error, and resolved (verdict rendered) are deferred to build.
- **Canvases:** each renders its populated/needs-you state; loading/empty/error are a build concern.

## Behavior · motion · keyboard
- Pane open/close: center width transition; content cross-fade (`transform`/`opacity`, `--motion-default`). Section + artifact expand at `--motion-fast/default`. Reduced-motion respected.
- Verdict overflow is a menu; needs-you items + artifact rows + reference chips are jump/open affordances.
- Keyboard (spec for build): `A` approve · `R` request-changes · the overflow opens with the more-menu; `j/k` across artifacts; `Esc` closes the pane. (Quiet kbd hints, not a feature surface — founder filter.)

## Mobile adaptation
The center column maps to a single scroll; the right pane becomes a **full-screen sheet** (an artifact opens over the review, ✕ returns). Verdict → a bottom sheet. Per the navbar + ≤2-section budget, no third persistent pane.

---

## Rejection list (do NOT re-litigate in `/architecture` or `/write-code`)
- **The 3 standalone composition variants** — `ReviewCompositionBriefing`, `ReviewCompositionStage`, `ReviewCompositionFocus` — were the exploration; **superseded by `ReviewCompositionRefined`** (kept in the catalog for reference only). Briefing's pinned/floating verdict bar, Focus's one-at-a-time examine that loses the whole, and Stage's result-burying sidebar are all rejected.
- **The 3 earliest variants** (Verdict Brief / Examination Bench / Reasoning Ledger) were deleted earlier (flat layering, no reference grounding).
- **Floating / sticky verdict bar** — rejected; verdict is in the header.
- **Per-artifact + global dual conversations** — rejected; one global thread with reference chips.
- **Diff-first / code-as-the-lead** — rejected; the result + the ask lead, code is one drill-down family (still must-win).
- **Per-artifact verdicts** — rejected; one verdict over the Subject.
- **Colorful per-kind badges / saturated status blobs** — rejected; neutral badges, dot+text status.
- **Intent done-conditions checklist as the lead** — rejected; the real prompt + the visible result lead, the checklist is one demoted line.
- **Founder filter (carried):** no keyboard-verb-shortcut bragging UI, no optimistic-UI flourishes, no drag-reorder, no emoji-as-iconography, no search-modifier mini-language.

## Open questions for `/architecture`
- **Data shapes:** the Subject / Intent (prompt) / Rationale / Anchor / staged-operation schemas; how the agent declares an artifact's `kind`; the `resultKpis` + headline-proof shape; the needs-you derivation (server vs client).
- **Route / placement:** the Review destination (reachable from the work item + the reviewer's attention space; the queue is a lighter secondary surface, not designed here).
- **Canvas resolution wiring:** the kind→family registry + the 3-tier override (MCP Apps `ui://`, the community manifest), and the `ToolLogo` source (simple-icons bundled vs Logo.dev domain-keyed) + the "Open in <app>" deep-link.
- **Inline anchored comments:** the reference-chip → real content-following anchor (block identity) is concept-confirmed not-yet-built — its own build.

## Registered / parked follow-ups (not part of this build)
- **AL2 — Harness review-return hooks** (registered): force every agent turn to end with an accepted return-to-HyperIdle action.
- **AL3 — Review execution loop** (registered, parked-unbiased concept): approve → the AI executes the staged operation via the tool.
- **AM (Conversation Experience):** the conversation thread here will **adopt AM's redesigned conversation style** when it lands (AM1 registered).
