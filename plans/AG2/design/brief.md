# AG2 Design Brief — Portfolio arrival and honest filters

## Classification: routine surface, one novel axis

The portfolio screen, BetCard grid, status tabs, team pills, and EmptyState all exist. This is **not** a net-new surface — it is a re-composition of an existing one. The **novel** decision is the *progressive-disclosure arrival behavior*: controls must appear only when they can change the result set, the layout must read as the same place at 0/1/50 bets, and it must not "reassemble itself" as data grows. That single axis is contested enough to warrant two variants; everything else (tokens, grid, card, dialog) is fixed by what exists. Per `/design` gating: **2 variants on the contested axis, 1 settled.**

## User task
A founder clicks into the portfolio (from the team-screen `← Portfolio` breadcrumb or the sidebar Work header). They want to (a) understand what this screen is the moment they land, (b) act on it — create the first bet, or narrow an existing set — and (c) never feel the controls lying to them (offering a filter that can't filter anything).

## What wastes their time today
- Empty portfolio strips ALL chrome → screen looks broken/different-app on arrival.
- Five verdict pills render the instant one bet exists, even though no young bet has a recorded outcome → permanent dead chrome the founder himself can't interpret.
- Layout reassembles: title-only → title+5 control clusters appear at once when the first bet lands.

## Design constraints (load-bearing)
- **Honesty rule** (from concept): a control appears iff it can change the visible set *given current data*. Concretely:
  - Status filter: appears when ≥2 distinct statuses exist among bets (one status can't filter anything).
  - Team filter: appears when bets span ≥2 teams.
  - Verdict filter: appears when ≥1 bet has a recorded outcome (`outcomeVerdict !== null`). Never on mere existence.
- **Same-place identity:** the header frame (title + persistent primary action) is constant from 0 bets up. Controls dock into a stable filter zone; they do not push the title around or restructure the page.
- **Two empties distinguished:** empty *portfolio* (zero bets) shows purpose + prominent create. Empty *result set* (filters exclude all) shows "no matches — clear filters," never the onboarding pitch.
- Hearth tokens only; AQ hard rules; no new bespoke chrome; reuse shared control primitives (AG5 boundary — but AG5 hasn't landed, so AG2 keeps the existing pill/segmented controls and does NOT invent new ones).
- No `text-center`/`mx-auto` on body (AQ-106) except inside EmptyState. No hero (AQ-104). Work pages.

## Component inventory (zero new components)
- `EmptyState` (Tier 2) — empty portfolio + empty-result states.
- `BetCard` (Tier 2) + grid — unchanged.
- Existing inline segmented status control + inline filter pills — kept, made conditional.
- `Button` / DaisyUI `btn-primary` — "New bet" primary action.
- `SkeletonCard` — loading.

## The 9-dimension rubric (target ≥8 each, premium-polish the tiebreaker)
hierarchy · spacing · typography · color · coherence · states · a11y · anti-slop · premium polish.

## Open question carried to architecture
Where does the persistent primary action live in the empty state vs populated state, and is it one affordance or two? The variants answer this differently — see comparison.
