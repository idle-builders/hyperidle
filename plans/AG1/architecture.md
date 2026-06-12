# AG1 — Architecture plan: Team screen composes at desktop widths

**Type:** frontend-only spatial recomposition of one page. No DB, no API, no shared-type, no route change.
**Design contract (fixed, do not re-litigate):** `plans/AG1/design/approved.md` — Variant B (summary stat strip) built on Variant A's scroll/gutter/max-width wrapper.

## Required reading (before implementing)
- `plans/AG1/design/approved.md` — the locked visual contract (sections 1–9).
- `packages/web/src/pages/WorkTeam.tsx` — the only source file changed.
- `packages/web/e2e/L13-product-drilldown.spec.ts` — the existing team E2E; mirror its `page.route("**/api/teams/:id", …)` mock shape and testid usage for the new visual spec. **L13 is the precedent for the API-mock shape only — it captures zero screenshots.**
- `packages/web/e2e/U11-hearth-validation.spec.ts` — the repo's only screenshotting spec; the precedent for the screenshot path/naming convention (`test-results/<ID>-NN-*.png`).
- `packages/shared/src/team.ts` (`TeamBurn`, `TeamDetail`, `RosterMember`) — confirms all tile data already exists.
- `.claude/rules/aesthetic-quality.md` — AQ-001/004/006/008/011/012/018/108 are the lint gates.

## Plan reconciliation (spec ⇆ codebase)
| Spec/design assumption | Reality | Plan handling |
|---|---|---|
| Page at `/work/team/:id` is `WorkTeam.tsx` | ✅ confirmed (`router.tsx:77`) | edit in place |
| Page lacks width/scroll/gutter; root is `flex flex-col gap-[12px] h-full` | ✅ confirmed (WorkTeam.tsx:234 + every state branch) | replace root wrapper in all 6 branches |
| AppShell `<main>` is the right place for gutter | ❌ `<main>` is `overflow-hidden`, no padding, shared by all pages | do NOT touch AppShell; WorkTeam owns its gutter+scroll like its siblings (WorkBet/WorkPortfolio/KnowledgeDetail all do `flex-1 overflow-y-auto` + inner `max-w mx-auto p-`) |
| Sibling pages establish the convention | ✅ WorkBet `max-w-[800px]`, WorkPortfolio/KnowledgeDetail `max-w-[960px]` | adopt `max-w-[960px]` per approved.md |
| Burn tile data exists | ✅ `TeamBurn` has costActual/costCap/capacity/activeBets/betCostActual/routineCostThisMonth | tiles read existing fields via existing `formatMoney`; no new data |
| Status tile signal exists | ✅ `RosterMember.healthLevel` + `operationalStatus` present, already consumed by AgentRow | derive healthy/attention + idle count from roster; empty roster → "—" / "No agents"; no new field. Mandatory 4th tile — no 3-tile fallback |
| Existing testids must survive | ✅ 14 of 18 are test-asserted (L13 + AA1/AB2/AB3); 4 are rendered-but-unasserted (`agent-context`, `new-routine-btn`, `add-agent-btn`, `hint-create-bet` — grep-confirmed: 0 assertions across the 4 protected tests). All 18 must be preserved verbatim regardless — see Migrations for the asserted/preserve split. | all preserved verbatim — see Migrations |
| No component test asserts burn KV labels or layout classes | ✅ grep found none | KeyValue→tile swap and wrapper change are safe |

**4th-tile naming (resolved):** the 4th tile is **Status** (Healthy/Attention + idle count), per the locked contract `approved.md` §2 + the mockup/screenshot. The stale variant `b-summary-grid/spec.md` previously named it "Bet vs routine"; that spec has been corrected to Status to match the contract. This architecture encodes **Status** — it is the single source of truth for the 4th tile.

**No concept gap. No spec/doc contradiction.** This workpackage is pure presentation.

## Acceptance criteria + verification

| # | AC | Verification method |
|---|---|---|
| AC-1 | 1280–2560px: every section visible, no clipped text, no row exceeds a readable measure | E2E `AG1-team-composition.spec.ts`: at 1280/2000/2560 viewports, assert `work-team-page`, `team-burn-vs-cap`, `team-active-bets`, `team-routines`, `team-agents` all `toBeVisible()`; assert the content column's `boundingBox().width <= 960 + 1` (cap holds); screenshot each width for visual review. |
| AC-2 | Related values read paired | E2E: for the summary section, assert each tile's label and value share one bounding column — assert tile value box `x` is within its tile's box (not at window edge); screenshot review confirms label-over-value. Section header: assert title + action button bounding boxes are adjacent (gap ≤ column width), not opposite-edge. |
| AC-3 | Empty team looks intentional | E2E: mock a team with `activeBets:[]`, `routines:[]`, `roster:[]`; at 2000px assert all 4 tiles render (`team-burn-vs-cap` visible, summary renders), assert the Status tile reads `"—"` + `"No agents"` (NOT "Healthy"), assert `team-active-bets-empty` + `team-routines-empty` + `team-agents` empty (`No agents` EmptyState) visible; screenshot `AG1-NN-empty-*.png` for the "intentional, not abandoned" visual review. See approved.md §4 for the full empty-state composition target. |
| AC-4 | Narrow layout + all behaviors unchanged | (a) Existing component tests `WorkTeam.AA1/AB2/AB3` stay green (`npm run test`). (b) Existing E2E `L13-product-drilldown.spec.ts` stays green (breadcrumb, empty, 404, dialogs reachable). (c) New spec: open "+ New routine" and "+ Add agent" → dialog appears (behavior preserved). |
| AC-5 | Visual proof + zero AQ violations | (a) `npm run lint` zero `design/*` violations (AQ enforced). (b) Screenshots at 1280/2000/2560 for empty + populated captured by the new spec and visually reviewed. |

## Ordered tasks

**T1 — Write failing E2E visual spec (red).** `packages/web/e2e/AG1-team-composition.spec.ts`.
- Mirror L13's hermetic `page.route("**/api/teams/:id", …)` mock pattern (no DB). Two fixtures: `makePopulatedTeam()` (bets + routines + roster, like L13's detail response plus `routines` and `betCostActual`/`routineCostThisMonth`) and `makeEmptyTeam()` (empty arrays).
- For each of `[1280, 2000, 2560]` × `[populated, empty]`: `page.setViewportSize({width, height:1100})`, `page.goto('/work/team/:id')`, `waitForSelector('[data-testid="work-team-page"]')`, assert sections visible, assert content-column width ≤ 961px, `page.screenshot({ path: 'test-results/AG1-NN-<state>-<width>.png', fullPage: false })`. **Screenshot path/naming convention:** `test-results/AG1-NN-*.png`, matching the repo's only screenshotting spec, `U11-hearth-validation.spec.ts` (verified: U11 writes `test-results/U11-01..10-*.png`; `e2e-output/` is used nowhere in the repo). Number the AG1 frames sequentially (`AG1-01` … `AG1-06`) so the reviewer can scan them in order.
- Pairing assertions per AC-2.
- Behavior assertion: click `new-routine-btn` → routine dialog visible; click `add-agent-btn` → add dialog visible.
- Proves: AC-1, AC-2, AC-3, AC-4(c), AC-5(b). **Fails until T2.**

**T2 — Recompose WorkTeam.tsx (green).** Single file.
- **T2a — Root wrapper, all 6 branches.** Replace `<div className="flex flex-col gap-[12px] h-full" data-testid="work-team-page">` in the loading, error(non-404), 404, null-data, malformed, and populated branches with:
  ```
  <div className="flex-1 overflow-y-auto" data-testid="work-team-page">
    <div className="max-w-[960px] mx-auto w-full p-[24px] flex flex-col gap-[24px]">
      …
    </div>
  </div>
  ```
  Keep `data-testid="work-team-page"` on the OUTER div in every branch. Loading skeletons, ErrorState, EmptyState, 404 EmptyState all move inside the inner column.
- **T2b — Summary stat strip.** Replace the burn-vs-cap `<section>` body: keep `aria-label` + `data-testid="team-burn-vs-cap"` on the section; replace the `KeyValue` list with a `flex gap-[12px] flex-wrap` row of `StatTile`s (local helper component in this file). **Ship exactly 4 tiles. The Status tile is mandatory — it is variant B's reason for winning (the morning health read answered before scroll). The data (`RosterMember.healthLevel` + `operationalStatus`) is confirmed present and already consumed by `AgentRow` (WorkTeam.tsx:535-537), so the derivation is cheap. There is no 3-tile fallback.**
  - Burn → `formatMoney(burn.costActual)`, sub `bets {formatMoney(betCostActual)} · routines {formatMoney(routineCostThisMonth)}/mo`.
  - Cap → `formatMoney(burn.costCap)` or "—"; sub `{Math.round(capPercent*100)}% used` or "no cap".
  - Capacity → `${burn.activeBets} / ${burn.capacity}`; sub "active bets".
  - **Status** → derive from `roster`:
    - **Empty roster (`roster.length === 0`):** value `"—"`, sub `"No agents"`. An agentless team MUST NOT read "Healthy" — there is nothing to be healthy. `"—"` is a neutral, non-signaling value (carries no false-positive health meaning); the `"No agents"` sublabel carries the state, matching the existing agentless phrasing in WorkTeam.tsx:425 (`EmptyState title="No agents"`). This satisfies AQ-010 (meaning in text, not color) and AC-3 (empty team reads intentional, not hollow).
    - **Non-empty roster:** value `roster.some(m => (m.healthLevel ?? "healthy") !== "healthy") ? "Attention" : "Healthy"`; sub `{count idle} idle agents` (idle = `(m.operationalStatus ?? "idle") === "idle"`). Value is text; color via token only as accent (forest for "Healthy", `--status-warning` amber for "Attention"), the text label always carries the meaning — AQ-010 / not color-alone.
  - Keep the existing `capPercent` calc and BOTH `<progress>` branches verbatim, rendered full-width BELOW the tile row with `mt-[12px]`.
- **T2c — Section spacing cleanup.** Inter-section spacing now comes from the column's `gap-[24px]`; the per-section `mb-2` on headers stays (intra-section). Remove now-redundant outer section wrappers' own vertical margins only if they double up. The breadcrumb `mb-1` stays.
- **T2d — Drop unused `KeyValue` import** if no longer referenced (knip will flag). Keep all other imports.
- All BetRow / RoutineRow / AgentRow / ArtifactSection / dialog code UNCHANGED.

**T3 — Update stories.** `packages/web/src/pages/WorkTeam.stories.tsx` — verify the populated + empty stories still render under the new layout; add a wide-viewport note if the story harness supports it. No new component file → no new `.stories.tsx` required (StatTile is a private in-file helper, not a design-system export).

**T4 — Verify.** `npm run check` (types) + `npm run lint` (AQ gates) + `npm run test` (component tests green: AA1/AB2/AB3) + `npm run test:e2e -- AG1-team-composition L13-product-drilldown` (new spec green, L13 not regressed). Visual-review the 6 screenshots.

## Type signatures
No new exported types. One private helper inside WorkTeam.tsx:
```ts
function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }): JSX.Element
```
(Display-only; `value`/`sub` already-formatted strings.)

## Design-it-twice — the wrapper level
- **Option A: wrapper inside each branch's return** (6 edits). Trade-off: more repetition. Reject reason: but it's explicit and matches how WorkBet/WorkPortfolio already structure their state branches (each branch returns its own `flex-1 overflow-y-auto` body). **Chosen** — consistent with siblings, zero indirection.
- **Option B: a `<TeamPageShell>` wrapper component** all branches render into. Trade-off: DRY. Reject reason: introduces a new component for a one-page concern (component-budget pressure), and the loading/error branches have genuinely different inner content; the shared part is two divs. Over-abstraction for 6 short returns. Rejected.

## Security & abuse cases
- Rate-limit on POST/PATCH — **N/A**, no mutations added/changed.
- Input-trust boundary for agent-authored fields — **N/A for new code**; team name / bet titles already `truncate` + React-escaped; the recomposition adds no new rendering of untrusted strings (tiles render numeric `formatMoney` output + derived enum labels).
- Secret handling — **N/A**.
- Path traversal — **N/A**; `teamId` from route already sanitized upstream; no new path input.
- SSRF — **N/A**; no outbound URL.

## route-checklist
N/A — no routes added, removed, or guarded. `/work/team/:teamId` mount unchanged.

## Migrations (testid / symbol preservation — this is a rename-sensitive change)
The recomposition MUST preserve every existing anchor. No call sites need updating because no testid/route/symbol is renamed — but the builder must NOT drop any of these while moving DOM. The list splits into two risk tiers (grep-verified across the 4 protected tests on 2026-06-12):

**Tier 1 — test-asserted (dropping any of these fails a green test immediately — CI catches it).** 14 testids:
- `work-team-page` (outer div, all branches) — asserted by L13.
- `team-burn-vs-cap` (summary section) — L13.
- `team-active-bets`, `team-active-bets-empty` — L13.
- `team-routines`, `team-routines-empty`, `routine-row` — AA1.
- `team-agents` — AB2 + L13.
- `agent-row` — AB2 + AB3 + L13.
- `agent-status` — AB2.
- `agent-customize-btn` — AB2 + AB3.
- `agent-card-category` — AB3.
- `team-breadcrumb-back`, `team-not-found` — L13.
- `hint-review-agents` — AB3.

**Tier 2 — rendered but NOT test-asserted (dropping these fails SILENTLY — no test guards them; preserve for safety + future tests).** 4 testids:
- `agent-context` — rendered in AgentRow; 0 assertions.
- `new-routine-btn` — rendered in Routines header; 0 assertions.
- `add-agent-btn` — rendered in Agents header; 0 assertions.
- `hint-create-bet` — rendered in Active Bets empty state; 0 assertions.

The builder must preserve all 18 verbatim. The split matters for the builder's risk model: Tier-2 testids carry no CI safety net, so the builder must check them by hand when moving DOM (a dropped Tier-2 anchor passes CI green). The new AG1 E2E should additionally assert `new-routine-btn` and `add-agent-btn` (it clicks them per T1's behavior check), upgrading 2 of the 4 to Tier 1.

The `KeyValue` labels in the burn block are NOT asserted by any test (grep-confirmed) → free to replace with tiles.

## protectedTests
- `packages/web/src/__tests__/WorkTeam.AA1.test.tsx`
- `packages/web/src/__tests__/WorkTeam.AB2.test.tsx`
- `packages/web/src/pages/__tests__/WorkTeam.AB3.test.tsx`
- `packages/web/e2e/L13-product-drilldown.spec.ts`
These assert existing team-screen behavior and MUST stay green with assertions unchanged. (`WorkTeam.AA1.test.tsx` also lives at `packages/web/src/__tests__/`; confirm both AA1 paths if duplicated.)

## sharedFiles
- `packages/web/src/pages/WorkTeam.tsx` — owned by AG1; AG6 (shared row primitive) and AH may later touch the same rows, but AG1 ships first and only recomposes layout. No other concurrent AG workpackage edits this file (AG2 = portfolio, AG3 = bet authoring, AG4 = nav chrome).
- No schema/router/shared-type files touched.

## Risks / ambiguities
1. **AQ-108 (3-col card grid tell).** Mitigated: tiles use `flex flex-wrap` (NOT `grid-cols-3`) and 4 tiles of differing content, not an identical `.map` — the lint only fires on `grid-cols-3` + identical-children map; flex strip is clear. The mitigation is structural (flex + differing content), not a tile-count knob; dropping a tile is NOT the AQ-108 remedy and is not an option (see Risk 2).
2. **Status tile is mandatory — no 3-tile fallback.** The Status tile is variant B's reason for winning (health answered before scroll). Its data (`healthLevel`/`operationalStatus`) is confirmed present and already consumed by AgentRow, so derivation is cheap (reads `roster` already in scope; absent `healthLevel` defaults to "healthy" per the existing AgentRow pattern; empty roster → "—" / "No agents", never "Healthy"). Shipping 3 tiles would silently drop the variant's win, turning B into "A with a horizontal burn strip." The builder ships 4 tiles.
3. **Screenshot path / review surface.** The E2E captures screenshots to `test-results/AG1-NN-*.png` (U11 convention — NOT `e2e-output/`, which the repo never uses). These screenshots are *review artifacts, not assertions* — a green E2E run does NOT prove AC-5's aesthetic half. The "review finds it aesthetic" AC is a human/reviewer visual judgment; the reviewer's `/review` closes AC-5's qualitative half. Builder's job: produce green spec + clean lint + captured screenshots.
4. **Mobile gutter.** `p-[24px]` applies at all widths; existing page had no mobile-specific gutter so this is acceptable and on-grid. No `max-md` override needed unless a touch-target/overflow test fails.
