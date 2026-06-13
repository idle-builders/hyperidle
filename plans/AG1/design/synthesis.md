# AG1 — Synthesis

## Strongest base: Variant B — Summary header + content column (8.6/10)

B wins because it solves all five ACs *structurally* rather than incidentally, at the founder's actual daily width (1280px), with the least risk among the layout-changing options:
- **Label/value pairing (AC-2)** is impossible to break: each metric label sits directly above its value in a narrow tile. A and C make pairing depend on a width cap; B makes it geometry.
- **Health scan (the stated user goal)** lands in one horizontal sweep right under the identity — the morning "is this team healthy?" read is answered before any scroll.
- **Empty team looks intentional (AC-3)**: the summary bar always renders (zeros / no cap), so an empty team is *measured*, not *abandoned* — a stronger answer than A's stacked empties.
- **Consistency**: reuses the 960px `mx-auto` content column the rest of the Work view already uses (WorkPortfolio, KnowledgeDetail), and the stat tiles echo WorkBet's existing `bet-stats-row` stat cards — so the team screen joins the family instead of inventing a shape.

## Pulled in from siblings
- **From A (the load-bearing fix):** the scroll-body + capped-centered-column + gutter wrapper. This is the actual root-cause fix and is identical in A, B, C — B is "A plus a summary bar." Adopt A's wrapper verbatim; it carries no regression risk and the empty/loading/error/404 states inherit it for free.
- **From C:** the *idea* that vitals deserve their own composed block, realized as B's summary bar rather than a rail. Also pull C's discipline of keeping the burn block readable independent of window width.

## Explicitly rejected (do not re-litigate)
1. **C's right rail + `2xl` breakpoint.** Rejected: adds a breakpoint no other Work page uses, leaves the right two-thirds of a 2560px pane empty (max-w 1100), and collapses to single-column at 1280px so its headline win is invisible at the founder's actual daily width. Three layout regimes = most regression surface for the least daily payoff.
2. **Touching AppShell's `<main>` to add the gutter/scroll there.** Rejected: would change every page's content area. WorkTeam owns its own gutter/scroll exactly like its siblings — the change stays in one file.
3. **Changing `KeyValue` to fix pairing.** Rejected: `KeyValue` is AG6's territory and shared across the app. B sidesteps it for the burn block (tiles, not KeyValue) and the pairing problem disappears without touching the primitive.
4. **A new shared row/table/stat primitive.** Rejected: AG6 scope. The stat tiles are local presentation inside WorkTeam, composed from literal Hearth-grid Tailwind, not a new design-system export.
5. **A 3-column identical card grid for the tiles.** Rejected on AQ-108 grounds: 4 tiles of differing content laid out with `flex` (not `grid-cols-3` over an identical `.map`), never in a hero context.
6. **Wider than 960px content column.** Rejected: 960px is the readable-measure ceiling matching the Work view family; wider reintroduces the "opposite edges" drift A still shows mildly.

## Net design = B, built as: A's wrapper + the summary stat strip + the existing sections unchanged below.
