# Track AZ: UI Coherence

Make the shipped interface behave and look like one product. The palette, the type scale and the token system are sound; what is missing is enforcement — the same idea is spelled four or five different ways across the app, and a handful of real defects sit on the paths a user walks first. This track fixes the defects, then collapses the duplicate vocabularies onto the primitives the design system already ships.

**Key narrative.** The design system is not underbuilt, it is under-adopted. A thread row, a composer, a statistic tile, a compact empty state and a status-to-presentation mapping all exist and are bypassed by the surfaces that need them most. Most of this track is therefore a deletion exercise: adopt what exists, remove the forks, and make the contract enforceable so the next page cannot fork again. Where a rule is already documented (the scroll contract, one heading per page, one shape per meaning), the gap is that nothing fails when a page ignores it.

**Constraint.** `npm run verify` must pass after each work package merges. No work package may introduce a new component whose job an existing design-system export already does — the design-system rule treats that as a critical finding. Documented rules (page anatomy, heading contract, aesthetic scales) are the reference; where a rule and the shipped code disagree, the work package resolves the disagreement rather than silently picking a side.

**Engineering tier.** `mvp` — founder decision, 2026-08-11. Recorded here because `pipeline.config.yml` declares no `engineering.tier`; every work package in this track inherits `mvp` unless it records a reason to differ.

**Execution procedure — human-approved, 2026-08-11.** This track does not run the standard pipeline. The procedure is fixed by complexity and is recorded in each work package's own plan; an orchestrator reads it there and does not add phases to it.

| Complexity | Procedure |
|---|---|
| `S` | Skip the pipeline. **One agent**, single session: its own planning → tests → code. No refinement, design, critique or architecture phase. No mid-build human gate. Then **one fresh agent reviews, one round only**. |
| `M` | **One agent** runs an **architecture round** and stops. **Founder reviews and approves it** before any code is written. The same agent then builds in a single session: tests → code. No refinement, design or critique phase, and no further human gate after the architecture approval. Then **one fresh agent reviews, one round only**. |

The only difference between `S` and `M` is the architecture round and its human approval. Review is one round in both — a fresh agent, not the one that built.

**Where the pre-build phases went.** Four work packages were registered with a `/refine` or `/design` trigger: AZ6 (what an artifact preview may render, and under what isolation — a safety decision), AZ7 (the canonical word per status), AZ11 (one content width and breadcrumb treatment), AZ13 (whether the secondary sidebar list earns its space). Under this procedure those phases do not run separately — **each decision is made in that work package's architecture round and approved by the founder there**, before any code. The decisions are not dropped; they moved to one gate. Each plan records this in its `Pre-build` field.

**Provenance.** Registered 2026-08-11 from the consolidated UI audit at `plans/reviews/ui-audit-consolidated.md`, which merges two independent passes — one driving the running app, one reading the source — and records the seven places they disagreed and how each was settled live. Every finding cited by a work package in this track was verified in the running application, not inferred from source.

**Before building — two known input defects.** Both mislead a builder that trusts them:

1. `.claude/rules/frontend.md` — a *binding* rule slot — still specifies a "forest green accent". The Crème Lemon change replaced forest green with lemon (fill) and cocoa (text); `framework/design-system/src/tokens.css` is the truth. Any work package touching colour must not follow the rule file's palette.
2. `layers/core-ui/src/layouts/AppShell.tsx` is detected as binary (`file` reports `data`) because of a literal control byte at line 92 inside a regex that rejects control characters. grep, ripgrep and code search silently skip it, so a builder searching that file gets a false negative. Fix it in the first work package that touches the file, or as a standalone chore.

---

## Work package registry

| ID | Title | Type | Complexity | Depends | Status |
|---|---|---|---|---|---|
| AZ1 | Overlays accept input (global search + mobile drawer) | frontend/defect | S | — | **planned** — registered 2026-08-11. Both surfaces render inline inside the application root while requesting modal behaviour, so they mark themselves inert. Verified live: hit-test at the search input returns `<body>`, typed characters do not land, Escape does not close, drawer nav items cannot be activated. One fix serves both. Highest severity in the track: on a phone this is the *only* navigation. See `work/AZ1/plan.md`. |
| AZ2 | Every page scrolls to its end | frontend/defect | M | — | **planned** — registered 2026-08-11. The Work page clips 538px at 1440×900 and 706px at 1024×768 with zero scroll containers; the agent roster and artifacts section are unreachable on desktop. Latent under nearly every other page — the scroll contract is documented but unenforced. Proof vehicle for AZ11. See `work/AZ2/plan.md`. |
| AZ3 | Loading, empty and failure are told apart | frontend/defect | M | — | **planned** — registered 2026-08-11. With every request failing, knowledge renders "Your knowledge base is empty · Create first item"; the sidebar claims "No teams yet" while requests are merely in flight. The product asserts a user's data does not exist when the server is down. Trust defect, not cosmetic. See `work/AZ3/plan.md`. |
| AZ4 | No machine data in the interface | frontend/defect | M | — | **planned** — registered 2026-08-11. Thread headlines are database keys; team feeds print their record id twice. Also raw enums, ISO timestamps, markdown source in previews, a relative age that can read `0mo` (the ladder switches to months at 28 days but divides by 30), and a count hardcoded to a plural noun. See `work/AZ4/plan.md`. |
| AZ5 | No dead or lying controls | frontend/defect | S | — | **planned** — registered 2026-08-11. "Open review" — the primary action on the core plan → interact → review loop — is a documented silent no-op when its destination cannot be built. A disabled filter renders identically to enabled siblings and keeps a pointer cursor. See `work/AZ5/plan.md`. |
| AZ6 | Artifacts render as content | frontend | M | — | **planned** — registered 2026-08-11. The flagship artifact kind renders as a parser error plus its own source, uppercased and centred because preview chrome written for a placeholder caption styles the content it wraps. The safety decision — what a preview may render, under what isolation — is made and founder-approved in this package's architecture round (see execution procedure). See `work/AZ6/plan.md`. |
| AZ7 | One status vocabulary | frontend/consistency | M | — | **planned** — registered 2026-08-11. Five presentations of status on one scroll of one page; the words disagree too (header says BLOCKED, the card beside it says "Attention"). A shared chip and a status mapping already exist and are bypassed. Canonical wording is decided and founder-approved in this package's architecture round. Sequence before AZ9 so the queue is not restyled twice. See `work/AZ7/plan.md`. |
| AZ8 | One message composer | frontend/consistency | M | — | **planned** — registered 2026-08-11. Three composers: conversations, task/knowledge/artifact, and the design system's own — used only in review threads. The most repeated action in the product is a different control each time, and the composer covers the last message on both desktop and phone. See `work/AZ8/plan.md`. |
| AZ9 | Lists and tiles use the shared primitives | frontend/consistency | M | — | **planned** — registered 2026-08-11. The conversation queue is hand-rolled while global search renders the same threads through the shared thread row — the primary surface is poorer than search for identical data. Includes the shared row's interactive branch shrink-wrapping instead of filling its container (three widths in one section, ragged separators), which is plausibly why pages forked away from it. See `work/AZ9/plan.md`. |
| AZ10 | The interface responds to the pointer | frontend/consistency | S | — | **planned** — registered 2026-08-11. Zero `<a href>` elements app-wide: no new tab, no copy link, no middle-click. Eleven of eighteen interactive elements show the default arrow cursor, including all primary navigation; the conversation queue has no hover response at all. Cheapest change with the largest effect on whether the product feels real. See `work/AZ10/plan.md`. |
| AZ11 | One page geometry | frontend/consistency | M | AZ2 | **planned** — registered 2026-08-11. Content width declared five ways; header and body left edges miss by ~200px on every page; three breadcrumb treatments with the back control overlapping the text; onboarding banners render above the page header on three surfaces. One page renders two top-level headings and three render none. One width across dense lists, prose and forms is decided and founder-approved in this package's architecture round. See `work/AZ11/plan.md`. |
| AZ12 | Dark mode borders hold | frontend/tokens | S | — | **planned** — registered 2026-08-11. Dark reads flat for one measurable reason: the border token sits 8.9 units of lightness from the card surface in light but only 2.0 in dark. The surface ladder is sound and near-identical across themes (5.3 vs 5.2). One token pair, disproportionate effect. See `work/AZ12/plan.md`. |
| AZ13 | Sidebar navigation is one system | frontend | M | — | **planned** — registered 2026-08-11. A second unlabelled list truncated to ~14 characters duplicates the main list in a different order; opening settings removes primary navigation entirely, leaving one unlabelled icon as the way back. Docs still describe a brand mark the sidebar does not render. Whether the secondary list earns its space is decided and founder-approved in this package's architecture round. See `work/AZ13/plan.md`. |

## Dependency graph

- `AZ11` → `AZ2`: AZ2 settles the page scaffold and its scroll contract; deciding geometry inside a scaffold still being repaired would be done twice. This is the only hard dependency in the track.
- Every other work package is independent and can run in any order or in parallel.

**Sequencing preferences (not dependencies).** These reduce rework; none blocks:

- `AZ7` before `AZ9` — the shared thread row surfaces status, so adopting it before the vocabulary is decided means restyling the queue twice.
- `AZ1`, `AZ2`, `AZ5` first — the three defects that leave a user with no path forward (no navigation on a phone, no reachable content, no working primary action).
- `AZ12` is independent and small enough to batch with any neighbouring `S` work.
- `AZ6`, `AZ7`, `AZ11` and `AZ13` each carry a decision inside their architecture round; get those rounds in front of the founder early so their builds are not gated waiting on approval.
