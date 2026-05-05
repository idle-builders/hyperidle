# L18 — Design Critique (Reviewer, Round 1)

Source under review: `plans/L18/design/approved.md` (designer Round-0).

## 9-dim scoring

Bar to advance: every dim ≥ 7. Round 1 of max 4.

| Dim | Score | One-line justification |
|---|---|---|
| 1. Founder fit | 8 | The "discussion lives on the artifact, bet view summarises" call directly honours AC §622. Founder review-without-context-loss is preserved on bet/task/knowledge surfaces (no navigate-away there). |
| 2. Spec fit | 8 | All four host kinds are mounted; volume call is documented; block-anchor reuses L2's affordance per AC §623. Minor gap on spec-named "block-anchored discussion" mechanism — see §Findings. |
| 3. Cohesion (one component family vs. forced unification) | 7 | Three of four mounts are honestly the same shape; the artifact mount carries a metadata strip (kind tag, producing-task link, cost) that the others don't, and the design correctly does NOT push that strip into a shared `HostThreadSection` — it stays at the page level. Good. The `HostThreadSection` Tier-3 shell justifies its existence. |
| 4. Information density | 7 | `ArtifactThreadsSummary` shows count + relative time per row but NOT a snippet of the last message — a click is required to read what is being discussed. The B2 variant (snippet-row) was scored lower but the rejection rationale ("conflates bet-level and artifact-level discussion") is weak: the row-as-snippet is unambiguously about the artifact named in the row. Density is acceptable but not the highest-value variant. See §Findings F1. |
| 5. Discoverability | 7 | The summary section title `ARTIFACT DISCUSSION` and per-row `<count> messages · <time>` is discoverable when the section is visible. But the section hides entirely when no artifact has messages (designer's deliberate call) — a founder seeing zero in the summary cannot tell "is the bet free of artifact discussion" vs "the section was suppressed". A subtle "no artifact discussion yet" footnote would solve this. See §Findings F2. |
| 6. State coverage (empty/loading/error/populated/overflow) | 7 | Empty/loading/error/populated covered for `ArtifactThreadsSummary`. Overflow ("bet has 100+ artifacts each with threads") is not addressed visually — designer punts on pagination of the summary list. Acceptable for v1; needs a row-cap with "+N more" affordance. See §Findings F3. |
| 7. Accessibility | 8 | Keyboard order is documented (page → actions → stream → composer). Section uses `aria-label="Discussion"`. No critical gaps; one nit: the new `discuss-block` action's announce-on-open is not specified (does the popover keep the existing copy-feedback live region?). |
| 8. Anti-slop | 9 | No emoji, no marketing copy, no purple gradients, no 3-col card grid, no hero. Tokens-only. Density-aware. |
| 9. Premium polish | 7 | Sheet-width grow to `min(640px, 90vw)` for TaskSheet is a real ergonomic improvement. The "sticky region quirks" rationale for rejecting Variant A3 is sound. The `ArtifactThreadsSummary` row-shape is described but not visualised — borderline; an HTML mock would lift this to 8. |

**Round 1 verdict.** Pass — every dim ≥ 7. The findings below are advisory polish items, not blockers. Designer can revise OR accept-as-noted.

## Findings (advisory; not blocking)

### F1 — Density: include the last-message snippet on the summary row

The summary row currently reads: `[kind tag] [artifact title] <count> messages · <relative-time>`. The bet view loses the actual content of recent discussion — every check-in becomes a click. The rejected B2 variant ("Recent discussion across artifacts") had snippets and was only one point lower in total. **Suggested resolution:** keep the B1 surfacing decision (per-artifact rows on the bet view) but adopt the snippet display from B2. Each row: `[kind tag] [title] · "<first ~80 chars of last plain message>" · <relative-time>`. Stays scannable, doesn't drown, doesn't navigate-away to read the most-recent line.

(The architecture already returns `lastMessageSnippet` in the endpoint shape, so the data is there — the design simply omits rendering it.)

### F2 — Discoverability: render an "always-on" stub when the section would be empty

A bet view with zero artifact-thread activity should still tell the founder "no artifact discussion yet" — a deliberately-quiet absence reads the same as a bug to a new user. **Suggested resolution:** if the bet has artifacts but none have thread messages, render a single muted line `No artifact discussion yet.` under the `ARTIFACT DISCUSSION` header. If the bet has zero artifacts, hide the section entirely (current behaviour).

### F3 — Overflow: cap rendered rows + "+N more" affordance

For a bet with 50 artifacts each with active threads, the summary list runs 50 rows. The designer doc does not bound this. **Suggested resolution:** show top 10 rows ordered by `lastMessageAt` desc; render a `View all (47 more) →` link that links to `/artifacts?betId=…` (which already exists per the route inspection). This survives until L12's artifact aggregate absorbs the section.

### F4 — Block-anchor copy on the popover item

Designer specifies the action label "Comment on this block" on `BlockActionsPopover`. The L2 `BlockActionsPopover` items are short verb phrases (`Copy permalink`, `Delete`, etc.). "Comment on this block" is verbose by that standard. **Suggested resolution:** label `Discuss` (or `Comment`); use the action `id` `discuss-block` as planned. The reduced label keeps the popover calm.

### F5 — Composer prefill UX is under-specified

The design says "selecting `discuss-block` opens the host page's thread composer pre-targeted at this block id". On the bet detail surface, the composer lives at the bottom of the thread; the selected block lives mid-page. The design doesn't say whether the page **scrolls to the composer**, the **composer scrolls into view**, or the **block opens an inline composer**. **Suggested resolution:** on selection, focus the bottom-anchored composer and prefill an `Re: <block excerpt or block-id chip>` indicator above the textarea. This is a 1-2 sentence addition to the design, not a re-litigation.

## Verdict

**ADVANCE.** All 9 dims ≥ 7 on Round 1. Findings F1–F5 are recommendations the designer should incorporate before architecture freezes (architecture already supports F1 in the endpoint shape; F2/F3 are component-level; F4 is one-line; F5 is interaction docs). No re-score needed if the designer accepts as advisory polish.

If F1–F5 are rejected without rationale, only F1 and F3 would push density / state-coverage below 7 in a strict reading; in that case re-score Round 2.
