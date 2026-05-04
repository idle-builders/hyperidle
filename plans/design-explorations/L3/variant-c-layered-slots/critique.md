# Design Critique — Variant C (layered surface + slots)

**Reviewed:** `mockup.html`, screenshot at `screenshot.png`.

## Score: 6.6 / 10

(H:8 S:7 T:8 C:6 Co:5 St:6 A:7 AS:9 PP:6)

| # | Dimension | Score | Notes |
|---|---|---|---|
| 1 | Visual Hierarchy | 8 | Same hierarchy strategy as A and B. The page-variant header is identical to B's. |
| 2 | Spacing & Density | 7 | Density tokens used. The composition-tag chip in section labels is decorative chrome — small, but present. |
| 3 | Typography | 8 | Same scale as A and B. |
| 4 | Color Usage | 6 | Same monochrome + danger. The `composition-tag` chip is visual chrome that adds nothing the section label doesn't already say. |
| 5 | Coherence | 6 | The four variants share `.identity-strip` and the four sub-primitives, but each variant has its own per-variant block of layout-specific class overrides (`.artifact-surface[data-variant="block"] .as-title { ... }`). The CSS is, in effect, four implementations stitched into one selector tree. The visual result is identical to variant B, but the *promise* of "one component" is undermined by the per-variant complexity inside the base. |
| 6 | States | 6 | Same gap as A and B. |
| 7 | Accessibility | 7 | Same level as A and B. |
| 8 | Anti-Slop | 9 | No purple gradients, no rounded-2xl, etc. Six kinds (gallery includes comm_draft and design — variant-unique kinds). One placeholder. |
| 9 | Premium Polish | 6 | Tabular-nums on cost/timestamps. Letter-spacing on tags. The `composition-tag` next to section labels is *promotional* — it tells the reader "look how clever the API is" rather than serving the design itself. Premium UI doesn't show off the API surface. |

### CRITICAL

- **The "layered + slots" promise leaks complexity into the base.** Visually, variant C produces an output indistinguishable from variant B. Architecturally, it spreads the chrome rules across four `[data-variant="..."]` blocks of CSS that re-implement what variant B's separate components state more cleanly. The composition recipe is documentation, not enforcement. **The closed-view-family hard rule from §4.5 — "the view family is closed at four layouts" — is the WEAKEST in this variant.** Anyone with `<ArtifactSurface variant="block" preview={…} />` can compose a fifth recipe by mixing slot semantics. This is the L3 spec's literal hard rule #2; variant C makes it harder to enforce.

### WARNING

- **States demonstration missing.** Same gap as A and B — placeholder only.
- **`composition-tag` next to section labels** ("variant=block", etc.) is internal-API chatter on the design surface. Premium UI doesn't expose its prop names in the chrome. This is mockup-presentational only — the production component wouldn't render it — but it indicates a values mismatch: we're celebrating the API instead of the user surface.
- **Slot semantics are silent on the wrong variant.** `discussion={…}` passed to `variant="block"` is silently ignored. Fail-loud > fail-silent, but the `<ArtifactSurface>` API has no warning mechanism. Variant B can't make this mistake; variant C can.

### SUGGESTION

- **First-class export of sub-primitives** (kind badge, cost chip, timestamp) is the strongest part of variant C — and it's portable. Whichever variant wins, those four sub-primitives should ship as exports for consumers (notification rows, search results, knowledge mentions).
- **The per-variant `[data-variant="…"]` selector blocks** could be replaced by extracting four "slot container" components inside the base — but at that point you've reinvented variant B with extra steps.

### What's Working Well

- **Sub-primitives exposed as first-class.** ArtifactKindBadge, ArtifactCostChip, ArtifactTimestamp, ArtifactPreviewSurface as exported primitives is genuinely useful.
- **The page variant retains the discussion sidebar** the same way variant B does — strong parity.
- **Comm-draft and design are featured** in the gallery (kinds variants A and B did not include), exercising the kind catalog more broadly.
- **The embed contributes only an identity strip + slot** — same as A and B — proving the "no chrome" rule survives composition.

### Risks

The composition pattern is a step backward in *enforcement*. The L3 concept says (§4.5 hard rule #2) "the view family is closed at four layouts. Adding a fifth requires a concept-doc update first." A composition-based primitive has no place to mount that enforcement — the closure becomes a docs concern that can drift. Variant B has it as a TypeScript export boundary; variant A has it as a string-literal prop. Variant C has it as a recipe in markdown.

### Iteration plan (max 1 round)

The CRITICAL is structural — fixing the mockup wouldn't address the closure-enforcement problem. This variant is unlikely to win on the autonomous criteria (closure-enforcement, lowest fit risk with the locked concept). Recommend keeping the sub-primitive idea and folding it into whichever variant wins.
