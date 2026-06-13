# Variant A — "Constrained reading column"

**Constraint:** smallest possible change. Bring WorkTeam onto the exact convention its siblings already use (scroll body + capped centered column + gutter), and cap the metric rows so label/value pair. No new shapes, no layout invention.
**Thesis:** the founder's "mess" is 100% a missing width constraint. Prove that adding the convention WorkTeam is the lone violator of fully resolves all five ACs, with the least surface area to review and zero regression risk.

## User task
Morning scan of one team, top to bottom: identity → burn → bets → routines → agents → artifacts.

## Composition
Root becomes: `flex-1 overflow-y-auto` (scroll body) wrapping `max-w-[760px] mx-auto w-full p-[24px] flex flex-col gap-[24px]` (the content column). 760px is the readable-measure cap — wider than WorkBet's 800px would let burn KeyValues drift; 760 keeps label/value visually paired at every width while matching the WorkBet family's feel.

Inside the column, the existing sections render in order, unchanged in content:
1. **Team header** — breadcrumb chip, `h1` name + StatusChip (right), phase/lead subline. (Existing, now inside the gutter so it never clips.)
2. **Burn vs Cap** — existing `--surface-container` rounded card, `p-[18px]`. The KeyValue list stays, but the card now lives in a 760px column so `justify-between` pairs label and value within a readable span (≤~700px), not the full window. Progress bar full-width-of-card.
3. **Active bets** — section title, bet rows (BetRow cards) stacked `gap-[6px]`.
4. **Routines** — section title + "+ New routine" button (paired in a `flex items-center` header), list container card with RoutineRows.
5. **Agents** — section title + "+ Add agent" button, list container card with AgentRows.
6. **Artifacts** — ArtifactSection (unchanged).

## Information hierarchy
1. Team name (text-sm uppercase semibold) + status — identity.
2. Burn vs Cap card — the health read.
3. Active bets — primary work.
4. Routines, Agents — supporting work + roster.
5. Artifacts — trailing evidence.

## States
- **Empty team:** each section shows its existing `EmptyState` inside the same capped column, so empties are centered and gutter-padded, not full-bleed. The column's `gap-[24px]` keeps them rhythmically spaced — reads as "a quiet but composed team," not "abandoned." The create-bet and review-agents hints render in their existing positions within the column.
- **Loading:** the SkeletonCard stack moves inside the same `max-w-[760px] mx-auto p-[24px]` column so skeletons match the loaded layout's width (per Hearth: skeleton matches shape).
- **Error / 404:** EmptyState/ErrorState centered in the column.
- **Overflow:** long bet/agent/routine names keep their existing `truncate`. Column scrolls vertically; never horizontally.

## Behavior
- Hover/focus on rows: unchanged (existing `hover:bg-[rgba(44,36,26,0.02)]`, focus-visible outline).
- All dialogs, hints, navigation: unchanged, same data-testids.
- Scroll: vertical via the `overflow-y-auto` body. Motion: none added.

## Mobile adaptation
At ≤768px the column's `max-w-[760px]` is wider than the viewport, so `mx-auto` is a no-op and `w-full` takes over — the layout is the existing single-column stack with `p-[24px→18px]` gutter. Identical to today's mobile behavior.

## Signature
The whole page reads as **one calm, centered reading column** — the same shape as a bet detail or a knowledge item. WorkTeam stops being the odd one out.

## Trade-offs
- Burn-vs-cap and agent-health are not elevated above the work — the eye still travels top-to-bottom, so "is this team healthy?" takes a scroll on a long team. Lowest information density of the three. At 2560px the right two-thirds of the pane is empty gutter (intentional, but a lot of it).
