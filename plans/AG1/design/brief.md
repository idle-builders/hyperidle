DESIGN-CLASS: novel  ref=WorkTeam.tsx (existing surface, no analogous composed layout)  pattern=none (no html/ mockup for a team dashboard)

# AG1 — Team screen composes at desktop widths — interrogated brief

## The task in one sentence
A founder opening a team's Work screen (`/work/team/:id`) at desktop widths (1280–2560px) must be able to **scan the team's state — burn, bets, routines, agents — at a glance**, with metric labels sitting next to their values, section headers never clipped, and an empty team still looking intentional. Pure spatial recomposition of existing content; nothing functional added or removed.

## Root-cause diagnosis (read of the code, not the screenshot)
1. **No width constraint.** WorkTeam's root is `flex flex-col gap-[12px] h-full` with no `max-w`, no `mx-auto`. Every section is full-bleed.
2. **`KeyValue` is `justify-between`.** At any width the burn label pins left, the value pins right. In a full-bleed pane at 2560px the label and amount sit ~2000px apart — the founder's "cost labels and values at opposite window edges." This is not a `KeyValue` bug; it's `KeyValue` placed in an unconstrained container. (AG6 owns a shared row primitive; AG1 must NOT change `KeyValue` — only the container it sits in.)
3. **No gutter; headers clip.** AppShell's `<main>` is `overflow-hidden` with **zero internal padding** and **no scroll**. WorkTeam renders `h-full` flush to the pane's edges, so section headers (`mb-2`, no left padding) clip into the pane edge and long content can be cut off vertically with no scroll.
4. **Empty sections render bare `EmptyState`s stacked** with no surrounding composition, so an empty team reads as "abandoned," not "intentional."

## The established convention WorkTeam is the lone violator of
Every sibling Work/Knowledge page already uses: a `flex-1 overflow-y-auto` scroll body wrapping an inner content column `max-w-[Npx] mx-auto w-full p-[...]`.
- WorkBet: `max-w-[800px] mx-auto w-full p-[24px]`
- WorkPortfolio: `max-w-[960px] mx-auto w-full p-[18px_24px]` (2-col bet grid)
- KnowledgeDetail: `max-w-[960px] mx-auto w-full p-[24px]` (main + 240px sidebar)
WorkTeam has none of these. **The fix is to bring WorkTeam onto this convention and decide the column/grid composition within it.** That decision is what the three variants explore.

## Constraints locked before variants
- **Layer:** the fix lives entirely in `WorkTeam.tsx` (and possibly its render helpers). AppShell stays untouched — changing `<main>` would affect every other page. WorkTeam owns its own gutter + scroll + max-width, exactly like its siblings.
- **No `KeyValue` change** (AG6 scope). AG1 fixes the *container* so paired label/value read adjacent. Options: cap the KeyValue column width, or switch burn metrics to a stat-tile layout that pairs label-over-value.
- **No new shared primitive** (AG6 scope). Compose from existing design-system components + literal Hearth-grid Tailwind.
- **Hearth tokens only.** Spacing from `{3,6,9,12,18,24,36,48}`. Radius scale only. Warm tokens only. No off-scale type. AQ-001/004/008/011/012/018 are lint-enforced.
- **No behavior change.** Dialogs (routine create, agent add/edit), hints (`create-bet`, `review-agents`), breadcrumb, navigation, ArtifactSection all keep working with identical data-testids.
- **Narrow viewport unchanged.** At ≤768px AppShell renders the mobile branch; the recomposition must collapse to the existing single-column stack so mobile behavior is identical.

## Probes (resolved — autonomous mode, evidence-backed reads)
1. **Who/what decision?** A founder doing a morning scan of one team. The decision: "is this team healthy / is anything stuck / do I need to act?" → burn-vs-cap and agent health are the highest-scan-value blocks; bets/routines are the work surfaces. My read: hierarchy should land the eye on team identity + burn first, then work. Confirmed by the spec's "scan the team's state (burn, bets, routines, agents) at a glance."
2. **Primary state?** Populated (a working team) is most common in daily use, but the empty-team state is the explicit AC ("still looks intentional"). Both must be designed; populated drives the layout, empty must not collapse it.
3. **What truncates when dense?** Bet titles, agent names, routine names (all already `truncate`). Burn metric values are short money strings — they should never truncate; the label/value pairing is the real risk, not overflow.
4. **Which width is canonical?** 1280px is the narrow desktop end (the founder's actual window). 2560px is the stress case where full-bleed breaks. The readable measure must hold across the whole range — the content column caps, the pane gutter grows. Screenshots required at 1280 / 2000 / 2560.

## The 9 critique dimensions to score against (Phase 2)
hierarchy · spacing · typography · color · coherence · states · a11y · anti-slop · premium polish.

## Anti-convergence requirement
Three variants must differ on at least 3 axes. Planned spread:
- **A (Constrained reading column):** single capped column, minimal change — proves the fix can ship inside the existing convention with zero new shapes. Hierarchy: linear top-to-bottom. Density: medium. Composition: one column.
- **B (Summary header + content column):** burn becomes a horizontal stat-tile strip (KeyValue → label-over-value tiles) sitting under the team identity as a "team summary bar"; bets/routines/agents stack below in a capped column. Hierarchy: summary-first, eye lands on the stat strip. Density: high in the header, medium below. Composition: stat grid + column.
- **C (Two-column instrument):** at ≥1536px a primary content column (bets + routines + agents + artifacts) sits beside a fixed 280px right-hand "team status" rail (identity, burn-vs-cap, capacity) — mirrors KnowledgeDetail's main+sidebar. Hierarchy: parallel — status always visible while scrolling work. Density: high. Composition: two columns, collapses to one below 1536px and on mobile.
