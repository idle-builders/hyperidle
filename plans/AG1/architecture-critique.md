# Architecture Critique: AG1

Reviewer (Phase 2). Scored `plans/AG1/architecture.md` against the 9-dimension
architectural rubric. Every claim in the plan's "Plan reconciliation" table was
spot-checked against the actual code (`WorkTeam.tsx`, sibling pages,
`layouts/AppShell.tsx`, the four protected test files, `playwright.config.ts`) —
not trusted blind.

ARCHITECTURE-SCORE: 8/10  rounds=0  score-line: SA:9 LI:10 AC:9 DM:n/a N:9 MD:8 FMC:8 V:7

(Data-model dimension is N/A — frontend-only, no schema/API/type change. Average
taken over the 8 applicable dimensions.)

## Claim verification (plan reconciliation vs. reality)

| Plan claim | Checked | Result |
|---|---|---|
| Root is `flex flex-col gap-[12px] h-full` in every branch | `WorkTeam.tsx` 107/121/131/140/156/234 | ✅ true — 6 branches confirmed (loading, error, 404, null, malformed, populated) |
| AppShell `<main>` is `overflow-hidden`, no padding, shared by all pages | `layouts/AppShell.tsx:538-543` | ✅ true — `flex-1 flex flex-col overflow-hidden ... min-w-0`, no gutter |
| Siblings establish `flex-1 overflow-y-auto` + `max-w mx-auto` convention | WorkBet:1151/1155, WorkPortfolio:129/131, KnowledgeDetail:739/740 | ✅ true — but WorkPortfolio uses `p-[18px_24px]`, not `p-[24px]` (plan §reconciliation slightly over-generalizes the family gutter) |
| Burn tile data exists (costActual/costCap/capacity/activeBets/betCostActual/routineCostThisMonth) | `WorkTeam.tsx:199,270-281` | ✅ true — all consumed today via KeyValue |
| Status signal exists (`healthLevel` + `operationalStatus`) | `WorkTeam.tsx:535-537` (AgentRow already derives these) | ✅ true — 4-tile Status derivation is cheap |
| KeyValue burn labels NOT asserted by any test | grep across all 4 protected tests | ✅ true — no "Bet cost"/"Total cost"/"Cap"/"Capacity"/"Burn vs Cap" assertions |
| protectedTests paths exist | `ls` | ✅ all 4 present at cited paths |
| 18 testids "asserted by L13 + component tests" | grep each testid in the 4 tests | ⚠️ **overclaim** — see WARNING. 4 of the 18 (`agent-context`, `new-routine-btn`, `add-agent-btn`, `hint-create-bet`) are in source but NOT asserted by any protected test. |
| Screenshots use repo convention `e2e-output/` | `playwright.config.ts`, U11 spec | ⚠️ **wrong path** — established convention is `test-results/U11-NN-name.png` (U11 spec); L13 captures none. See WARNING. |

No spec/codebase drift of the CC-007 kind: every file, route, type, and testid
the plan references actually exists. The reconciliation table is honest on the
load-bearing facts; the two inaccuracies are in rationale, not in the change.

## Dimension scores

- **Spec Alignment 9** — all 5 ACs map to tasks (T1 E2E proves AC-1/2/3/4c/5b; T2 implements; T4 verifies AC-4a/4b/5a). No scope creep: the plan changes exactly one file and explicitly refuses AppShell (AG4), KeyValue (AG6), and any shared primitive (AG6). Matches `approved.md` field-for-field. Docked one point only for the AC-5 qualitative half being deferred to the human/`/review` pass (acknowledged in §Risks 3 — legitimate, but it means the plan does not *itself* close AC-5).
- **Layer Integrity 10** — pure Human-Interface-layer change, one page component. No layer reached past. No package boundary crossed (no `packages/server` touch). Exemplary.
- **API Contracts 9** — N/A for routes (none added/changed); plan correctly states so in §route-checklist. The one new symbol — `StatTile({ label, value, sub }): JSX.Element` — is fully typed with an explicit return type. Clean.
- **Naming 9** — `StatTile` is honest and local (not exported, not shadowing a primitive). No generic `Manager`/`Service` names. "summary stat strip" / "summary bar" consistent across plan and approved.md. Note the design-doc naming snag carried from the design layer (see WARNING) — the 4th tile is "Status" per approved.md but "Bet vs routine" per the stale variant spec; the architecture correctly encodes Status, so the plan resolves the ambiguity, but it should say so explicitly.
- **Module Depth 8** — `StatTile` is a thin display helper (small interface, trivial body) — appropriate, not over-abstracted. The Design-it-twice section (§wrapper level: per-branch wrapper vs. `<TeamPageShell>` component) is genuine, not theatre: both options are real, the rejection of the shared shell is well-reasoned (loading/error branches have different inner content; the shared part is two divs). Docked one point: T2a duplicates the same two-div wrapper across 6 branches by hand — the plan accepts this for consistency with siblings, which is defensible, but it is real repetition the builder must apply identically 6× (a copy-paste risk the plan should flag as a place to be careful, not just as "chosen").
- **Failure-Mode Coverage 8** — the Security & abuse block addresses all five CC-003 axes (rate-limit, input-trust, secret-handling, path-traversal, SSRF) each marked N/A with a correct reason (no mutations, no new untrusted rendering, no path/URL input). Honest and complete for a display-only change. Empty/loading/error/404/malformed states are all enumerated and inherit the new wrapper. Docked one point: the plan does not specify what the Status tile renders when `roster` is empty (empty team) — approved.md §4 says "0 idle agents / Healthy" by implication but the plan's §T2b derivation `roster.some(...)` returns `false` on `[]` → "Healthy", which is arguably wrong signal for a team with zero agents. Minor, but a defined edge.
- **Verifiability 7** — the lowest dimension. T1 names concrete Playwright assertions (sections `toBeVisible()`, `boundingBox().width <= 961`, dialog-open behavior) — good, these are real and testable. **But**: (a) the screenshot path/convention is wrong (see WARNING), (b) the AC-2 "paired" assertion ("tile value box `x` within its tile's box") is real but weak — it proves nothing was placed at the window edge, not that label sits directly above value; the true pairing proof is the visual review, which the plan correctly routes to `/review`, so the E2E assertion is partly decorative; (c) `protectedTests` is populated (good — beats CC-008) but the plan should note that the new spec's *screenshots* are review artifacts, not assertions, so a green E2E run does NOT prove AC-5's aesthetic half.

## CRITICAL
- None. The plan is correctly scoped, single-file, AC-complete, and free of CC-007 spec drift. No blocking issue.

## WARNING
- [plan §reconciliation row "Existing testids must survive" + §Migrations + §protectedTests] **The "18 testids, all asserted by L13/AA1/AB2/AB3" claim is inflated.** Grep shows 4 of the listed testids — `agent-context`, `new-routine-btn`, `add-agent-btn`, `hint-create-bet` — are rendered in `WorkTeam.tsx` but **not asserted by any of the 4 protected tests**. Preserving them is still correct (they may be used elsewhere or by future tests), but the plan presents them as test-protected when they are not. → Fix: in §Migrations, split the list into "test-asserted (must not drop — breaks a green test)" vs. "rendered, preserve for safety". This matters for the builder's risk model: dropping a truly-asserted testid fails CI immediately; dropping a non-asserted one fails silently.
- [plan §T1 + §Risks 3] **The screenshot path/convention is wrong.** T1 writes screenshots to `e2e-output/AG1-<state>-<width>.png` and calls it "the repo screenshot convention." The actual convention in this repo is `test-results/U11-NN-name.png` (the U11 visual-validation spec — the *only* existing spec that screenshots). L13 (the spec T1 says to mirror) captures **zero** screenshots. → Fix: change T1 to write `test-results/AG1-<state>-<width>.png` to match U11, and stop citing L13 as a screenshot precedent (L13 is the precedent for the `page.route("**/api/teams/:id")` mock shape only, which IS correct).
- [plan §T2b + approved.md §2] **Status-tile fallback ("ship 3 tiles if derivation is awkward") undermines the chosen variant.** Both the plan (§Risks 2) and approved.md sanction silently dropping to 3 tiles. But the 4th (Status) tile is variant B's reason for winning — the morning health read answered before scroll. The data (`healthLevel`/`operationalStatus`) is confirmed present and already consumed by AgentRow, so the derivation is cheap and the fallback should not trigger. → Fix: make the plan commit to 4 tiles; demote the 3-tile fallback to "emergency only, not a free choice," so the builder doesn't take the easy path and quietly ship the weaker layout. (Carried from the design critique — same finding, both layers should reflect it.)
- [plan §T2b / approved.md §4] **Empty-team Status derivation is undefined.** `roster.some(m => healthLevel !== "healthy")` returns `false` for an empty roster → renders "Healthy" + "0 idle agents" for a team with no agents. AC-3 requires the empty team to "look intentional"; a zero-agent team showing "Healthy" may read as wrong/hollow. → Fix: define the empty-roster Status value explicitly (e.g. "—" or "No agents") in §T2b so the empty-team screenshot the reviewer must approve isn't ambiguous.

## SUGGESTION
- [plan §reconciliation, sibling gutter] Sibling pages do **not** all use `p-[24px]` — WorkPortfolio uses `p-[18px_24px]`. The plan adopts `p-[24px]` (matching WorkBet/KnowledgeDetail), which is fine and on-grid, but the "the family does X" generalization is slightly loose. Cosmetic.
- [plan §T2a] Six hand-copied wrapper edits is a copy-paste hazard (one branch silently keeping `h-full` would reintroduce the bug in that state). Suggest the builder add an E2E assertion that the **loading** and **404** states also render inside a capped column (boundingBox width ≤ 961), not just the populated state — currently T1 only asserts width on the populated/empty data states. This catches a missed branch.
- [plan §T3] T3 says "verify stories still render … add a wide-viewport note if the harness supports it." `WorkTeam.stories.tsx` exists (confirmed). Since the whole workpackage is about wide-viewport composition, the plan should require a populated story rendered at a wide viewport so the design surface is reviewable at `/designsystem` without running E2E. Minor.

## What's Working Well
- The Security & abuse block is a model of CC-003 discipline for a display-only change: all five axes present, each N/A with a *specific* reason ("tiles render numeric `formatMoney` output + derived enum labels" — i.e. no new untrusted-string rendering). Many plans skip this block on "it's just CSS" changes; this one didn't, and got it right.
- Scope containment is excellent and verified: one file, no AppShell, no KeyValue, no shared primitive, no schema/route/type. The plan repeatedly and correctly hands AG4/AG5/AG6 concerns back to those workpackages (§sharedFiles, §Design-it-twice, §reconciliation). This is exactly the boundary discipline TRACK-AG demands of AG1.

---
**Score: 8/10. Verdict: PASS** (≥7, no CRITICAL).
