# Track AZ: UI Coherence

Make the shipped interface behave and look like one product. The palette, the type scale and the token system are sound; what is missing is enforcement — the same idea is spelled dozens of different ways, and a handful of real defects sit on the paths a user walks first.

**Key narrative.** The design system is not underbuilt, it is under-adopted. A thread row, a composer, a statistic tile, a compact empty state and a status-to-presentation mapping all exist and are bypassed by the surfaces that need them most. Most of this work is therefore deletion: adopt what exists, remove the forks, and make the contract enforceable so the next page cannot fork again.

**Constraint.** `npm run verify` must pass after each merge. No work may introduce a new component whose job an existing design-system export already does. Where a documented rule and the shipped code disagree, resolve the disagreement rather than silently picking a side.

**Engineering tier.** `mvp` — founder decision, 2026-08-11. Recorded here because `pipeline.config.yml` declares no `engineering.tier`.

---

## How this track is split

Founder decision, 2026-08-11: **the pipeline is the wrong mechanism for most of this.** Ceremony was costing more than the fixes.

The dividing line is **decision vs. doing** — not severity, and not size. Severity cuts wrong here: the unscrollable Work page is a P0 that is one class name. Size cuts wrong too: "one content width" is a small change that every page must then obey.

| | Goes to a **work package** | Goes to the **bug list** |
|---|---|---|
| Test | Closes a contract other work must obey, or needs the founder to choose between real alternatives | Correct end state already obvious; verifiable by looking; nothing downstream depends on the choice |
| Count | 14 active/complete registrations | ~110 |
| Where | `work/<id>/plan.md`, registered below | [`AZ-bugs.md`](work/AZ-bugs/AZ-bugs.md) |

**The bug list is the main artifact of this track.** One agent picks the next unchecked item, fixes it, proves it in the running app, ticks it, moves on — no refine, no design, no architecture, no review gate. Batch several per session where they share a file.

**Execution procedure for the work packages — human-approved, 2026-08-11.** The original packages use their recorded procedure. The AZ11 amendment approved 2026-08-13 replaces its failed combined run with two sequential packages, each receiving fresh detailed architecture and critique before tests and code. AZ11-O builds and merges first; AZ11-G starts from fresh `main` afterward. AZ17–AZ21 were registered after AZ13 established the shared shell; each plan states the pre-build work its domain genuinely needs.

---

## Work package registry

| ID | Title | Type | Complexity | Depends | Status |
|---|---|---|---|---|---|
| AZ2 | Every page scrolls to its end | frontend/contract | M | — | **shipped** — `PageScaffold` component + `design/no-handrolled-page-scaffold` lint rule at `error`; 15 page files migrated; 21/21 e2e green. Two corrections made during the build: (1) `min-h-0` on a scrolling body is a no-op (overflow-y-auto already supplies the automatic flex-item min-size 0); the original plan's "30+ sites survive by luck" framing was wrong — those sites were correct as written, and the migration existed only to enable a flat-prohibition rule. (2) A second broken page, `/artifacts/:id` (`ArtifactPermalink.tsx`), was found and fixed (no root height — shape E). Both corrections supersede the cause stated in the original plan and audit. See `work/AZ2/plan.md`. |
| AZ6 | Artifacts render as content | frontend | M | — | **built, in review** — PR open against `main` from `claude/pipeline-az6-12697d`. Prose artifacts render as documents (the panel no longer imposes its caption typography on the content it wraps), `html` artifacts run as their own interactive document inside a two-layer sealed frame, and the unrenderable case is a designed state that tells the truth about why. The isolation decision — what a preview may render and under what seal — is recorded in `work/AZ6/round.md` §3 and is an MVP with an enumerated set of closed channels, not a proof that nothing escapes; §3.8 names what stays possible and what triggers revisiting it. Three review rounds, two real holes found, both closed. See `work/AZ6/plan.md`, `round.md`, `review.md`, `progress.json`. |
| AZ7 | Close the visual system | frontend/contract | M | — | **shipped, four review rounds** (three NOT-DONE, then DONE with no blocking findings) — five closed sets (Button, Input, filled surfaces, radius, status), each enforced (`design/radius-token-only`, `design/no-handrolled-control`, `design/no-hardcoded-color` promoted, `design/no-local-status-builder` wired for the first time — all at `error`). Radii, inputs and status close fully (28/28 chrome-carrying raw text controls migrated; zero production `rounded-full` sites); buttons close for the 63-site DaisyUI + accent-fill union, per the founder-approved scope line, with 3 genuine sites inside that union left behind a documented `eslint-disable` (SetupFlow.tsx's preset-picker toggle, ReviewCodeDiff.tsx's two 16–18px inline affordances — none fit `Button size="icon"`'s 32px floor). The remainder (59 hand-rolled control sites + 44 hand-rolled chip sites, core-ui) is enumerated in `work/AZ7/migration-backlog.md`, meant to fold into `AZ-bugs.md` Batch D — the count is generated, not hand-counted (see `npm run design:backlog:check`), so it stays correct as the code moves. Round 2 found the repair that fixed round 1's B1 (a broken `@source` glob) made ~198 previously-dead CSS rules live for the first time, which un-hid `CommentRow.tsx`'s `rounded-full` avatar chrome — `radius-token-only` was blind to it because the class string sat in a `const` variable before reaching `className`. Fixed, and the rule now follows a same-file `const` to its initializer (`createConstIdentifierResolver` in `tools/eslint-plugin-design/src/util.ts`) so the same shape can't recur silently; a repo sweep found no other production site carrying the same defect. See `work/AZ7/plan.md` (as-built section, §1–§8) and `progress.json`; the combined-round and four-round review records are folded into plan.md at ship. |
| AZ11 | One page geometry | frontend/contract | M | AZ2 | **superseded 2026-08-13** — two failed implementation reviews showed the combined package joined independently reviewable orientation/document-outline and geometry outcomes, while an omnibus lint/E2E mechanism overclaimed runtime proof and crossed the repository complexity warning. Founder approved replacement by AZ11-O then AZ11-G. The failed-run artifacts remain under `work/AZ11/` as evidence. |
| AZ11-O | Page orientation and document outline | frontend/contract | M | AZ2 | **built, founder-approved for ship** — the one allowed review found five blockers; all received red-first repairs and direct verification on 2026-08-13. Founder explicitly approved the no-second-review ship exception. Approved breadcrumb identity, header-first one-H1 contract, authored-heading semantics, runtime ledger, and painted geometry evidence are green. See consolidated `work/AZ11-O/plan.md` and `progress.json`. |
| AZ11-G | One page geometry | frontend/contract | M | AZ11-O | **planned** — applies approved centered 1120px Option B across standard and managed surfaces after AZ11-O establishes every PageHeader substrate; preserves 680/760 measures and Block internal geometry. See `work/AZ11-G/plan.md`. |
| AZ13 | Sidebar navigation is one system | frontend | M | — | **implemented, shipping** — the founder-approved shell is a 276px fixed desktop bar and 300px mobile drawer: HyperIdle identity + grouped Search/Assistant entry, four stable domain switches, one large domain-owned navigator, and icon-only Settings. Primary navigation persists through Settings; mobile detail routes keep Back and Menu. Domain richness is deliberately split into AZ17–AZ21. See `work/AZ13/plan.md`. |
| AZ14 | One rule for opening and editing an object | frontend/contract | M | — | **planned** — registered 2026-08-11 from the founder walkthrough. Routines and agents open a split pane; bets, tasks, knowledge, threads and artifacts take the page; notifications, assistant and search float above it — nothing about the objects explains the grouping. Editing splits the same way: a bet's pitch is an always-live inline editor, a knowledge item is read-only behind an Edit button. A work package because the rule, once set, governs every object. See `work/AZ14/plan.md`. |
| AZ15 | Spacing and elevation hold across the product | frontend/contract | M | — | **shipped** — numeric spacing vocabulary and subtle/default/elevated shadow gates landed at error in PR #494 (`72ccfc9b5`). See `work/AZ15/plan.md`. |
| AZ16 | Every design token is enforced | frontend/contract | M | — | **planned** — registered 2026-08-12 after AZ7's post-ship durability review: AZ7 gated radius, color vocabulary, controls and status at `error`, but the typography, motion and border families still sit where AZ7's population sat before it — `no-off-scale-font-size` and `no-raw-tailwind-color` at `warn` for core-ui (never executed: `npm run lint --quiet` skips warn rules entirely), `no-hardcoded-tracking` and `no-off-scale-duration` unwired for core-ui, and no rule at all for font family, weight, line height, easing or border width. Promotes/wires the existing rules with populations cleared, adds rules for the ungated families, and makes the gate set total over `tokens.css` — a token family with no gate fails verification. Spacing and shadow tokens stay AZ15's axis. See `work/AZ16/plan.md`. |
| AZ17 | Notifications navigator | frontend | M | AZ13 | **planned** — make attention scanning, organization and destination-opening native to the domain-owned navigator; retire redundant notification navigation only after parity. See `work/AZ17/plan.md`. |
| AZ18 | Conversations navigator | frontend | M | AZ13 | **planned** — move conversation scanning, resuming and organization into the navigator under one ordering contract; retire the full list only after its retained journeys are covered. See `work/AZ18/plan.md`. |
| AZ19 | Work navigator | frontend | M | AZ13 | **planned** — settle team scope, work-object structure and truthful status in the navigator, with any list-page retirement gated on equivalent access. See `work/AZ19/plan.md`. |
| AZ20 | Knowledge navigator | frontend | M | AZ13 | **planned** — replace the arbitrary five-row head with a scalable, canonical browse structure suitable for deep knowledge sets and phone drawers. See `work/AZ20/plan.md`. |
| AZ21 | Search and Assistant entry surface | frontend | M | AZ13 | **planned** — turn AZ13's visually grouped triggers into one coherent intent entry while preserving the distinct Search and Assistant outcomes. See `work/AZ21/plan.md`. |

## Dependency graph

- `AZ11-O` → `AZ2`: AZ2 settles the PageScaffold header/body and scroll substrate used by the orientation/document-outline contract.
- `AZ11-G` → `AZ11-O`: Setup, NotFound, and Artifact need AZ11-O's PageHeader/outline substrate before all 17 header/body relationships can be implemented and verified.
- `AZ17`, `AZ18`, `AZ19`, `AZ20`, `AZ21` → `AZ13`: each follow-up needs AZ13's stable domain switcher and dynamic navigator region before it can own domain content or the shared header entry.
- Every other work package is independent.

**Sequencing preferences (not dependencies).**

- `AZ7` early — it closes the sets a large share of the bug list migrates onto. Doing bug-list Batch D before AZ7 means adopting a status treatment AZ7 will change.
- `AZ15` after `AZ7` if convenient — closing the control set removes noise from the spacing measurement.
- `AZ16` after `AZ15` if convenient — both promote rules in the same severity table, and AZ15's spacing decisions may move nearby populations. Not a dependency.
- `AZ6`, `AZ13`, `AZ14`, `AZ15` each carry a real decision; get those artifacts in front of the founder early so their builds are not gated waiting on approval.
- `AZ17`–`AZ21` may proceed independently after AZ13. Their list-page removals are outcomes to prove per domain, not a track-wide big-bang migration.
- The bug list runs in parallel with all of it. Batches A and B touch nothing a work package decides.

## Retired registrations

Registered 2026-08-11 and demoted the same day when the decision-vs-doing line was drawn. **None of the work is dropped** — every item moved to [`AZ-bugs.md`](work/AZ-bugs/AZ-bugs.md), where it is worked without ceremony. Plans remain in git history.

| Was | Title | Now |
|---|---|---|
| AZ1 | Overlays accept input | `UI-001`, `UI-002` |
| AZ3 | Loading, empty and failure are told apart | Batch B (`UI-010`–`UI-021`) |
| AZ4 | No machine data in the interface | Batch C (`UI-030`–`UI-049`) |
| AZ5 | No dead or lying controls | Batch A (`UI-004`–`UI-007`) |
| AZ8 | One message composer | `UI-062`–`UI-064` |
| AZ9 | Lists and tiles use the shared primitives | Batch D (`UI-060`–`UI-074`) |
| AZ10 | The interface responds to the pointer | Batch E (`UI-080`–`UI-089`) |
| AZ12 | Dark mode borders hold | `UI-160` |

Each was a real finding; none needed a decision. AZ1 is the clearest case — two dead overlays, one known cause, one fix, and a full pipeline run around it would have been pure overhead.

---

**Provenance.** `plans/reviews/ui-audit-consolidated.md` — three passes: one driving the running app, one reading the source, one founder walkthrough. It records where the passes disagreed and how each conflict was settled live. Every finding cited here was verified in the running application.

**Before building — one input defect.** `.claude/rules/frontend.md` is a *binding* rule slot and still specifies a "forest green accent"; Crème Lemon replaced it. `tokens.css` is the truth. Tracked as `UI-171`.
