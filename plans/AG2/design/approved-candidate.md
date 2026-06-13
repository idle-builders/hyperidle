# AG2 Approved-Candidate Design — Portfolio Arrival & Honest Filters

> Designer's settled direction. Reviewer approves in Phase 2. Zero new components.

## Direction
**Variant A — Persistent Frame with Docking Honest Filters.** The portfolio header is an invariant frame at every data volume; filter controls dock into a single filter zone only when they can change the result set; the empty portfolio states its purpose and offers a prominent create affordance.

---

## Surface: `/work/portfolio` (`packages/web/src/pages/WorkPortfolio.tsx`)

### Header frame (always present, `shrink-0`, `px-[24px] py-[18px]`, `border-b border-[var(--border-subtle)]`)

Row 1 — `flex items-center gap-[12px] flex-wrap`:
- **Title** `h2` "All bets" — `text-[20px] font-[600] tracking-[-0.01em] text-[var(--text-primary)]`. Present at every state. (Unchanged from today.)
- **Count sub-line** — only when `bets.length > 0`: `text-[13px] text-[var(--text-tertiary)]`, e.g. `"3 bets · 1 team"` (pluralized; team count = distinct teamIds among bets). The existing routine/agent summary spans (AA1/AB2) stay where they are, after the sub-line, gated on their own data as today.
- **"New bet" button** — `btn btn-sm btn-primary ml-auto`, `data-testid="new-bet-btn"`. **Present at every state including zero** (this is the frame invariant that satisfies AC-4). Opens `BetCreateDialog`.

Row 2 — **Filter zone** (`mt-[12px]`, `flex items-center gap-[12px] flex-wrap`). **Rendered only if at least one filter control passes its gate** (see gates). When no control qualifies, the entire row is omitted — no empty bar.

### Filter honesty gates (the core of AG2)

| Control | Appears when | Rationale |
|---|---|---|
| Status segmented (`All/Active/Completed/Draft`) | `≥2 distinct statuses` exist among current bets (treating completed+killed as one "Completed" bucket) | A single status can't be narrowed. |
| Team pills | bets span `≥2 distinct teams` | A single team can't be narrowed. |
| Verdict pills (`Validated/Refuted/Partial/Inconclusive/Not evaluated`) | `≥1 bet has outcomeVerdict !== null` | Verdicts only exist on completed/killed bets; before any are recorded the zone is dead chrome. **This is the founder's complaint, fixed.** |

- Status segmented control: existing inline segmented pill control (kept as-is, made conditional). `data-testid` on the group.
- Team pills + Verdict pills: existing inline pill style (kept), made conditional. `data-testid="team-pill-filters"` / `data-testid="verdict-filter-pills"`.
- **Docking transition:** when a control's gate flips true (e.g. first outcome recorded), it enters via `opacity` + `translateY(4px→0)` over `--motion-default`, honoring `prefers-reduced-motion` (AQ-014 — only opacity/transform animated). The frame above does not reflow vertically beyond the filter row growing.

### AC-3 honesty interpretation — accepted, do NOT re-litigate (WARNING-design-1)

AC-3 ("every filter control shown can change the visible result set given the current data") is satisfied at **two different granularities**, and this is the **accepted interpretation** for AG2 — recorded here so Phase 4 does not flag it as a bug:

- **Status + Team controls: per-control honesty.** Each control family is gated such that it can always narrow (status shown only at ≥2 distinct buckets, team shown only at ≥2 distinct teams).
- **Verdict pills: ZONE-level honesty.** The verdict pill *group* appears as a unit when **≥1 bet has a recorded outcome** (`outcomeVerdict !== null`). Once shown, all five pills (`Validated/Refuted/Partial/Inconclusive/Not evaluated`) render for vocabulary completeness — even though, e.g., a portfolio with a single `validated` bet shows `Refuted/Partial/Inconclusive` pills that narrow to the empty-result state. This is **intentional and honest at the zone level**: the zone cannot appear unless ≥1 outcome exists, so the verdict zone as a whole can always change the set. Showing the full vocabulary lets the founder reason about the verdict space; filtering to only-present verdicts (rejected alternative #2) hides that vocabulary.

The founder's actual complaint — dead verdict chrome on a *zero-outcome* portfolio — is fully fixed by the zone gate. Phase 4: treat zone-level verdict honesty as the contract, not per-pill honesty.

### Body (`flex-1 overflow-y-auto`)

Three mutually exclusive body states:

**Exactly TWO empty states (no third).** The current code has a `selectedTeamId ? "No bets for this team" : "No bets yet"` branch inside the single empty block — a third empty meaning. **Decision (mirrors architecture WARNING-arch-1): the team-scoped "No bets for this team" copy is RETIRED.** A team filter that excludes all bets is a *filter-excluded* result, not a distinct condition. The three-way collision (zero-bets vs team-scoped vs filter-excluded) is pinned to **portfolio-empty** and **filter-excluded-empty** only.

1. **Empty portfolio** (`bets.length === 0`) — `portfolio-empty` (centered `EmptyState`):
   - `icon` = existing plus-in-square svg, `iconBg="rgba(217,119,6,0.08)"`.
   - `title="No bets yet"`.
   - `description` = existing pitch copy ("Bets are time-boxed commitments with a budget. Shape a pitch, commit it to a cycle, and your agents will break it into tasks and start building.").
   - `action` = `btn btn-sm btn-primary` with the button label literally **"Create bet"** → opens dialog. This is the visual hero; the header button is the persistent anchor of the same action. Both primary — same action, not competing. (Pitch prose above the button may read "Create your first bet" as non-button copy, but the button's own label is "Create bet" — see R2 contract.)
   - `data-testid="portfolio-empty"` on the EmptyState.
   - **R2 contract (CRITICAL-2/3):** the create affordance additionally carries `data-testid="create-bet-cta"` and the CTA button's accessible name is the literal label **"Create bet"** — pinned to satisfy `/create bet/i`. "Create your first bet" and "Create a bet" both FAIL `/create bet/i` (intervening words break the adjacency `RegExp.test` requires; verified). The active e2e spec `R2-work-first-landing.spec.ts` asserts `getByTestId("create-bet-cta")` and `getByRole("button", {name:/create bet/i})` on this exact surface; emitting the testid AND the literal "Create bet" label makes R2 pass without editing R2. Phase 4 must enforce both the testid and the exact label. Because the empty state only renders at `bets.length === 0`, R2's "CTA hidden when bets exist" assertion also holds.

2. **Empty result set** (`bets.length > 0` but `filteredBets.length === 0`) — `filter-excluded-empty` (centered `EmptyState`):
   - `title="No bets match these filters"`, `description="Adjust or clear the filters to see your bets."`, `action` = ghost button "Clear filters" that resets status→all, team→null, verdict→∅. `data-testid="portfolio-no-matches"`. **Never the onboarding pitch.** Covers ALL filter-excluded cases including a team filter that excludes all (the retired team-scoped copy folds into this).

3. **Populated** (`filteredBets.length > 0`): existing 2-col `BetCard` grid, `max-w-[960px] mx-auto`, `gap-[18px]`, `p-[18px_24px]`. Unchanged.

### Loading
Existing skeleton header (title only) + 3 `SkeletonCard`s. No filter controls during load. Unchanged.

---

## State enumeration (rubric "states" dimension)

| State | Header title | New-bet btn | Sub-line | Status ctrl | Team ctrl | Verdict ctrl | Body |
|---|---|---|---|---|---|---|---|
| Loading | yes | no | no | no | no | no | skeletons |
| Empty (0 bets) | yes | yes | no | no | no | no | EmptyState pitch + CTA |
| 1 bet, 1 team, 1 status, no outcome | yes | yes | yes | no | no | no | grid (no filter row at all) |
| Several bets, 2+ statuses, 1 team, no outcome | yes | yes | yes | **yes** | no | no | grid |
| Bets across 2+ teams, no outcome | yes | yes | yes | maybe | **yes** | no | grid |
| ≥1 recorded outcome | yes | yes | yes | maybe | maybe | **yes** | grid |
| Filters exclude all | yes | yes | yes | (active) | (active) | (active) | "No matches" + Clear |

---

## Token / AQ compliance
- Spacing: `12/18/24` only (on-grid). `mt-[12px]` filter zone, `gap-[12px]`. No off-grid.
- Type: `20/13/12` from scale. Sub-line `13`, pills `12`.
- Color: warm tokens only; verdict/team active pill uses existing `--accent-primary` + `rgba(22,118,79,0.08)` tint (already in source). No cool grays, no hardcoded hex beyond the existing tinted-bg literals already present (AQ-008 — keep parity with existing pills; do not introduce *new* hex).
- AQ-104 no hero, AQ-106 `text-center` only inside EmptyState, AQ-108 not a 3-col identical grid (2-col bet cards, distinct content), AQ-015 44px touch targets at ≤1024px on every pill/button.
- Motion: `--motion-default`, opacity/transform only, reduced-motion honored.

## Component budget impact
**Zero new components.** Composes EmptyState, BetCard, SkeletonCard, Button/DaisyUI btn, and the existing inline segmented + pill controls. AG5's canonical dropdown has not landed; AG2 does **not** introduce a new control — it keeps the existing pill/segmented chrome and only makes it conditional. When AG5 lands, the filter controls migrate to it (noted for AG5, not done here).

## Rejected (do not re-litigate)
1. **Title-only empty header (Variant B)** — appearing New-bet button at 0→1 is the exact "reassembly" AC-4 scrutinizes. Rejected.
2. **Verdict pills filtered to only present verdicts** — hides the vocabulary the founder needs to reason; the zone-level gate already enforces honesty. Rejected.
3. **Render an empty filter bar when no control qualifies** — that's dead chrome by another name. Filter row omitted entirely.
4. **Onboarding pitch on empty-result-set** — misleads (implies no bets exist). Distinct "no matches / clear" state instead.
5. **New "Portfolio" landing card / dashboard tiles** — AQ-104/AQ-108; the portfolio is a bet list, not a dashboard.

## Open questions for the architect
1. Derive the three gates as pure predicates over the bet list (`hasMultipleStatuses`, `hasMultipleTeams`, `hasAnyRecordedOutcome`) — memoized, single source so render and tests agree.
2. "Clear filters" must reset all three filter states atomically.
3. Count sub-line pluralization + distinct-team count helper.
