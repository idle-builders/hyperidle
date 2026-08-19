# AU20 — Redesign every Service as its own product (collapse the export sprawl into a small set of well-structured general interfaces)

*(**Third return to pipeline start — 2026-07-23. Founder declared the refactor unfinished** after the fresh review at `.worktrees/AU20-review/.pipeline/work/AU20/review.md` found five critical and four warning defects and application/E2E validation proved unreliable. Prior requirements/concept approvals record real completed analysis and reductions, but no longer authorize implementation. AU20 returns to refine → independent requirement critique → requirement gate → light design + architecture → independent concept critique → concept gate → write-tests → write-code → review. The corrective phase must establish a finite, evidence-backed disposition for every failed, skipped, timed-out, or unrun test before changing it. No exploratory branch is accepted as implementation evidence.)*

*(**Second redirect — 2026-07-17. Founder REJECTED the concept gate** for the prior version and sent this WP back through refine + architecture, then **sharpened** the reframe. The prior version framed the audit around **call-site counts** — keep/merge/inline/delete each export by usage, judge a Service's existence by "owns a table / has a loop." That frame is discarded: caller-counting *as the verdict* is the wrong question, and table-ownership is an implementation artifact, not a product reason. This version reframes the WP around **architectural coherence + product purpose, per Service, holistically, at MVP tier** — each Service treated as its own product with an OUTSIDE lens (what it offers) and an INSIDE lens (how it stays clean and evolvable), designing a small set of well-structured general interfaces **informed by (not dictated by, not ignoring) real usage**, and stress-tested against a **sub-linear scaling** thought-experiment ("add dozens more services and hundreds more calls — do we need hundreds more methods?"). The call-site counter survives as a **data input** to each per-Service analysis; the three named correctness bugs survive as a **secondary** track. See `requirements.md` §1 (goal), §3 (the per-Service process), §4 (the four load-bearing nouns), §8 (what changed + the four sharpenings). This note supersedes the prior redirect note.)*

## Work package

**Work package.** As a maintainer continuing the simplification AU19 started, I want the Service layer's exposed surface **collapsed into a small set of coherent, well-structured, general interfaces per Service** and every Service's **existence justified from product purpose**, calibrated to the product's actual **MVP** engineering tier. AU19's mechanical scan found **1218 exported symbols across 31 Services** (`knowledge` 138, `notifications` 89, `work` 84, `harness-registry` 79). For an MVP tool, that number is itself the finding — over-fragmentation, a bespoke narrow method carved to fit each individual call site ("a specific method for every call is absolute garbage"). Knip cannot see this: knip removes only *dead* code, and a one-caller method is *used*, not dead — so over-fragmentation of live code is invisible to it, and usage must be **read and reasoned about**, not deferred to knip. Two things get reduced, judged on the same standard — **architectural coherence, not usage-as-verdict:**

- **(PRIMARY) Per-Service clean-architecture audit — each Service as its own product.** Every Service, indexed and analyzed **holistically from its own perspective**, across two lenses. **OUTSIDE:** what do I offer / expose? Read what consumers actually request of me (the call-site/demand data) to understand the *real demand*, then design a small set of **well-structured general interfaces that serve many occasions** — *not* an interface per use case. **INSIDE:** how do I keep a clean architecture so building new features, changing behaviour, and adapting to new needs stays cheap? And, spanning both: *why does this Service exist from a product standpoint, is that valuable, and does it belong as its own Service given the layer boundaries* (`core-api` app domains — Work / Conversation / Knowledge / Users / Settings — or `agent-orchestration`, or `agent-execution`)? The question is never "is this method called" *as a verdict* (knip settles *dead*; over-fragmentation of live code is a design judgment); it is "do these exports make sense from the lens of the Service and a clean architecture." Usage informs the interface shape; it does not command a method per request, and it is not ignored.

- **(SECONDARY) Three named correctness bugs.** Tier-independent fixes AU19 already code-verified — `log_task`'s lost-update race, the duplicate `getTeamMembersById` read, the duplicate `getUserById` read across the session chain. They ride alongside the audit.

When this ships: every Service has a written holistic analysis (product purpose + layer position + existence verdict + OUTSIDE and INSIDE coherence) and a redesigned deliberate public API — a small set of well-structured general interfaces informed by real demand — with the coherent reductions applied; each Service's API passes the **scaling test** (new demand composes, does not multiply methods); each analysis was independently critiqued at MVP tier (against product purpose, coherence, and the scaling thought-experiment) before applying; a scripted per-Service data input (current exports + where each is called + what consumers request, DI-port-resolved) informs each analysis as input, not judgment; the aggregate exposed surface drops materially from 1218 toward a coherent MVP-tier surface with the suite green; the three named bugs are fixed.

**Why this matters.** The 1218-export surface is not a hunch — it is a measured, mechanically-extracted fact from AU19, and for an MVP tool it reads as engineering garbage, not product richness. The concrete test of "is the engineering bullshit" is the scaling thought-experiment: if adding dozens more services and hundreds more calls would force hundreds more methods, the API is fragmented, not clean. The fix is not to catalogue how often each method is called, nor to defer to knip (blind to live over-fragmentation) — but to reason, per Service, as its own product, from real consumer demand and the Service's place in the layers, about a small set of general interfaces and a justified existence, then collapse the sprawl to match. At MVP tier the bar is deliberately anti-enterprise: fewer, more general, more meaningful interfaces; no boundary or method kept for tidiness or a future need.

**Type.** backend.

**What exists today.** `plans/AU19/service-catalog.md` (every Service's complete current API + what each does + AU19's "why it's separate" prose) and `plans/AU19/dependency-graph-data.json` (machine inventory, from `scripts/generate-dependency-graph.ts`) give an exhaustive mechanical inventory. `plans/AU19/architecture.md` §9 records fold-candidate self-critique — a starting signal, not a rubric. What neither produces: a per-Service **data package** (current surface + each export's consumers and what they request, DI-port-resolved) to inform a holistic per-Service product analysis, and the analysis itself — the deliberate general API (outside) + evolvable-internals account (inside) + existence verdict reasoned from product purpose and layer position.

**What's genuinely missing.** (1) Extend `scripts/generate-dependency-graph.ts` (not a throwaway sibling) into a re-runnable per-Service **data input**: each Service's current exports + where each is called + what each consumer requests, resolved through DI-port indirection so the demand picture is accurate. (2) For every Service, a holistic product analysis from its own perspective → existence verdict (keep / fold / dissolve, from product value + layers) + a deliberate general public API (a small set of well-structured interfaces, OUTSIDE) + an evolvable-internals account (INSIDE), passing the scaling test. (3) An independent critique of each Service's analysis at MVP tier (product purpose + coherence + scaling test) before applying. (4) The coherent reductions applied in code, suite green, no behavior change. (5) The three named bugs fixed.

**Depends on.**
- **AU19** — needs the real Service package boundaries, the mechanical extraction script, the service catalog + "why separate" prose, and the edge-audit findings this WP builds on.

**Complexity.** L — 31 Services each analyzed holistically as its own product (existence + outside general API + inside evolvability) with reductions applied, plus the named bug fixes. The per-Service passes are parallelizable and share one data-input engine. The breadth (31 analyses + 31 critiques) and the apply axis both need `/architecture` to depth-tier or sequence them to stay honestly L-sized (`requirements.md` §7 Q1).

**Engineering tier.** mvp — **declared for this WP**, grounded in `ETHOS.md` §1 (Build for the Fast, Not the Enterprise), matching AU21's per-plan declaration. The global `pipeline.config.yml engineering.tier: mvp` default is only *landing* via PR #454 (open, unmerged) — the config on this branch (working tree and HEAD) has **no** `engineering` block, so the tier is asserted per-plan here from ETHOS, not read from config. HyperIdle targets a functional beta, the opposite end of the spectrum from enterprise. This calibrates every judgment: fewer, general, meaningful interfaces that scale sub-linearly with demand; internals kept evolvable; no export or Service preserved for a future need or for tidiness; "is it called," "owns a table," "clean name for a concept" are not valid keeps. The three named correctness bugs are fixed regardless of tier.

**Pre-build gates.**
- **Refinement:** Required — corrective v3 in progress. Prior v2 refinement remains historical input; `requirements.md` §0 reframes completion around trustworthy whole-system proof and all fresh-review findings.
- **Design:** **Required (light corrective pass).** The original backend-only exemption is superseded because AU20 completion now includes diagnosing and proving browser/desktop journeys, intentional UI moves, responsive behavior, and accessibility.
- **Architecture:** Required anew — validation-lane ownership, boot/teardown, mock/real boundaries, prerequisites, evidence generation, nine review findings, and bounded corrective increments must be settled before `/write-tests`.

**Human review gates.** Yes — mandatory: the requirement gate (Phase 3) judges this revised spec; the concept gate (Phase 6) — **the gate the prior version failed** — after the critiques; the final review (Phase 10) before ship. Expect founder attention on whether the per-Service reasoning genuinely treats each Service as its own product (both lenses), designs general interfaces (not method-per-request), passes the scaling test, and reasons existence from product purpose + layers (not usage); and on any Service fold or observable-correctness fix (`log_task`).

**Plan calls.** Index every Service, analyze each holistically from its own perspective as its own product (a per-Service planner with the Service's data package), reason a clean minimal architecture per Service — a small set of well-structured general interfaces informed by real demand, plus evolvable internals — and critique each hard (a reviewer, a different agent) against product purpose, coherence, and the scaling thought-experiment. Reason from the layer boundaries and product value — never from call counts or table ownership as the verdict. Calibrate to MVP: fewer, general, meaningful interfaces; a Service or interface that only earns its keep under enterprise/future-proofing assumptions, or that would grow a method per new use case, does not earn it here.

**Contracts / constraints.**
- No product behavior change except where fixing a named, verified bug. Reductions collapse *surface* into general interfaces, not behavior.
- Every retained public export must be justifiable as a general capability serving many occasions, from the Service's own lens; every retained Service must have a real product purpose + defensible layer position.
- Each Service's target API must pass the scaling test — new callers/use-cases compose from existing interfaces, they do not each spawn a new method.
- Usage is an input reasoned FROM (understand real demand, design a general API for it) — never a verdict, never a mandate for a method per request, never ignored/deferred-to-knip.
- The extended script is the standing per-Service data input — do not fork a one-off duplicate of `generate-dependency-graph.ts`'s AST-scan.
- Any Service fold moves its owned tables and DI ports with it and keeps every cross-Service port and owned-table invariant green — verified by the suite, never assumed.

**Out of scope.**
- **A per-method usage-disposition rubric** (keep/merge/inline/delete decided by call-site count) — this is the **rejected frame** and is explicitly not the deliverable. Call-site data is an input that informs per-Service design, never the verdict.
- **A usage-driven method-per-request API** — catering to each consumer request with a bespoke method is the anti-pattern being removed; the target is a small set of general interfaces serving many occasions.
- **Judging a Service's existence by table ownership or caller count** — an implementation artifact, not a product reason. Existence is judged from product purpose + layer position.
- **The `agent-orchestration → core-api` edge-count/structure** — that's AU21. AU20 is each Service's own surface + existence, not the cross-Service coupling graph (shared findings — `log_task`, the duplicate reads — cross-reference AU21, never double-fix).
- **A from-scratch re-partition of the domain data model** — a fold moves its tables/ports with it, but AU20 does not redesign which domain owns which table beyond what a specific fold necessarily entails.

## Acceptance criteria

### Corrective completion criteria (2026-07-23; additive and mandatory)

- A committed, reproducible **validation ledger** inventories every test in every AU20-relevant lane (unit/component, service integration, real-harness integration, default mocked-browser E2E, real-backend E2E, cassette/live-agent E2E, and desktop smoke). Every failed, skipped, timed-out, or unrun case receives exactly one evidence-backed disposition: **feature regression**, **intentional move**, **stale test/mock**, **harness defect**, **missing prerequisite**, or **environment blocker**. No test is deleted, skipped, weakened, rebaselined, or moved between lanes without its ledger entry and newer authoritative contract evidence.
- Architecture and light design are completed and independently reviewed **before** corrective tests or code change. Architecture must define lane ownership/isolation, clean boot and teardown, mocked-versus-real boundaries, prerequisites, deterministic diagnostics, desktop proof, and service-scoped landing order. Light design must reconcile the current canonical Work, Conversations, Knowledge, Settings, setup, responsive, and accessibility journeys so moved UI is distinguished from broken UI by rendered evidence.
- Every accepted correction starts with executable proof: a failing runtime test for behavior, Playwright/screenshot proof for visual behavior, or lint/type/static guard for a static contract. Exploratory commits on `fix/e2e-recovery` are untrusted hypotheses only and must be independently reproduced from the AU20 baseline before reimplementation.
- All five critical findings in `.worktrees/AU20-review/.pipeline/work/AU20/review.md` are resolved and independently verified: reproducible current per-Service demand package; awaited durable runtime teardown; isolated harness-registry MCP entry/dependencies; immutable knowledge-retro hypothesis snapshots; and aggregate verification green, including an explicit resource-ownership decision for the 9-versus-10 disposer contradiction and real-harness prerequisites/discovery.
- All four warnings in that review are resolved and independently verified: notification encryption suppresses only the documented missing-root-secret case; filesystem watcher setup/runtime failure is observable and correctly handled; committed census evidence is regenerated from the executable tool; and ownership comments/docs name only current packages.
- The original AU20 service reductions and three correctness fixes remain intact. Corrective implementation lands in bounded, independently reviewed commits; service-specific corrections are committed separately by service, while cross-cutting harness/application corrections use their own explicit increments. Every commit is green for its affected lane and no gate/measurement script is altered to obtain green.
- AU20 completes only when the ledger has no unexplained/unrun entry, all available required lanes are green, prerequisite-dependent lanes fail fast with an explicit reproducible blocker rather than silently skip, desktop and real-backend user journeys have visually inspected evidence, and `npm run check`, `npm run lint`, `npm run test`, service integration, real-harness integration, full E2E, build, desktop build/smoke, census, and demand-package regeneration are independently reviewed. Environment blockers may explain unavailable external credentials; they do not excuse application, harness, or deterministic replay failures.

- Every one of the 31 Services has a written **holistic analysis, treating the Service as its own product across both lenses** — OUTSIDE (what it offers/exposes) and INSIDE (how it stays clean and evolvable so future features / behaviour changes / new needs are cheap) — plus its product purpose, its correct layer position, and an **existence verdict** (keep / fold into a sibling / dissolve) reasoned from product value + layer boundaries, explicitly **not** from table ownership or caller count. (The existence bar for infrastructural `agent-orchestration` / `agent-execution` Services — whose value is mediated, not user-facing — is defined by `/architecture`; see `requirements.md` §7 Q6.)
- Every Service has a **redesigned deliberate public API that is a small set of well-structured, general, composable interfaces**, **informed by the real demand its consumers express**, with every retained interface justified as a meaningful capability serving many occasions, and every narrow per-caller / shape-specific export collapsed into a general interface or made internal. An interface-per-use-case surface is a defect the redesign removes. (Usage informs the shape; it never dictates a method per request, and it is not ignored — knip is blind to over-fragmentation of live one-caller methods.) A **"keep unchanged" verdict is not an exemption** — a Service judged already coherent carries the identical burden: every retained interface justified as serving many occasions + the explicit scaling argument.
- Each Service's target API **passes the scaling test**: the analysis explicitly argues that adding dozens more services and hundreds more calls would compose from the proposed interfaces rather than requiring hundreds more methods (sub-linear scaling). A proposal that would still grow a method per new use case fails. (North-star heuristic: an interface parameterized by intent/filter is general; a method per intent grows per use case — `requirements.md` §4.)
- The coherent reductions are **applied**, not just proposed: the aggregate exposed surface drops materially from 1218 toward a coherent MVP-tier surface (reduction is a consequence of general design, not a target number), the full suite stays green, and no product behavior changes.
- A scripted per-Service **data input** — each Service's current exports + where each is called + what each consumer requests of it, resolved through DI-port indirection — exists as the re-runnable input that **informs** each per-Service analysis. It is data reasoned FROM: not the judgment, and not ignored.
- Each Service's analysis is **independently critiqued** (a reviewer, a different agent than the per-Service planner) against product purpose, architectural coherence, and **the scaling thought-experiment** at MVP tier **before** its reductions are applied.
- The three named concrete bugs are fixed regardless of tier (correctness): the `log_task` lost-update race (atomic single-statement append, mirroring `work-service.ts`'s existing atomic-write precedent, with a real concurrency test), the duplicate `getTeamMembersById` read, and the duplicate `getUserById` read across the session chain — resolved, not re-litigated. The full existing test suite passes (or is updated to newly cover the fixed race); any Service fold keeps its tables, ports, and callers green.

## Validation scenarios

- Given the per-Service data-input script runs against the full monorepo, when a Service's data package is inspected, then it lists that Service's complete current exports and, per export, its DI-port-resolved consumers and what they request — accurate enough for a planner to understand the real demand and reason a general API from it.
- Given a Service whose current surface is dominated by narrow per-caller exports, when its holistic product analysis + redesigned general API are produced and critiqued, then the target API is a smaller set of well-structured general interfaces (each justified as serving many occasions), the per-caller exports are collapsed/internalized, the written scaling-test argument shows new demand composing rather than multiplying methods, and applying it leaves the suite green.
- Given the scaling thought-experiment is applied to a Service's proposed API ("add dozens more services and hundreds more calls"), when the reviewer critiques it, then an API that would still grow a method per new use case is rejected and sent back, and only a sub-linearly-scaling design passes.
- Given a Service whose existence verdict is "fold into a sibling" (no defensible standalone product purpose at MVP tier), when the fold is applied, then its owned tables, DI ports, and every caller are migrated and the suite stays green.
- Given `log_task` is called twice concurrently against the same task, when the atomic-append fix lands, then no note is lost (a real concurrency test that fails on today's read-modify-write and passes after the fix).

---

# Reopened as a destroyer pass (2026-08-17)

The first pass shipped but predates the code graph, so nothing was ever traced to a real door, and the
`packages/` → `layers/`+`framework/` restructure killed every path in its analysis.

Re-run as 38 agents — one per service, one per framework package, one for the entry-door surface — each
tracing every export to a UI, agent-harness or scheduler door against a standing bar: a method survives
only if it proves a core value. **1,713 rows, one verdict each, nothing sampled**: 423 delete, 21 plugin,
22 finish, 72 merge, 327 simplify, 848 keep.

## Three founder rulings reshaped it, and they outlive this work package

1. **The product runs as a shared backend** for a team and an organisation of teams. Identity arrives
   through an OIDC provider, not invitations. Nothing may be judged as though the product had one user.
   Fifteen packages were re-audited on this basis.
2. **Events are an extension surface.** Everything that happens emits an event and plugins attach
   triggers, so "nothing internal subscribes" is never evidence of death. No event type may be deleted
   for lack of an in-repo listener.
3. **Knowledge-management ritual leaves core and becomes a plugin.** The test is whether something is
   the machinery of working or a ritual *about* the work.

## What the corrected premise found

Defects the single-user lens had hidden, none of which were the audit's own targets: two direct-message
dedupe paths that cannot see each other and fork threads between the same pair; an unscoped conversation
list returning every human's direct messages to any caller; approval rates aggregating all humans into
one number; ship confirmations addressed to a hardcoded first-human-by-insertion-order; and a proposed-call
path that hardcodes every call irreversible — the gate-by-default classifier the ethos forbids, sitting
inside a feature the product intends to finish.

## Corrections to this work package's own claims

Recorded because they were wrong and were acted upon before being caught:

- The propagation retry tick is **not** bookkeeping. Task-to-bet is a real database transition healed
  only there, and it survives.
- Agent completion text already arrives from all four harnesses and is silently dropped, which makes a
  live session view a missing case arm rather than a feature build.

## The audit contradicts itself in places

The service destroyer and the door destroyer judged the same features differently — the org-edge matrix
convicted as an approval chart while the routes serving the org chart were kept; knowledge merge and split
convicted as unreachable while their doors were marked for the plugin. The delete pass was briefed on the
service verdicts alone, which is how three user-facing surfaces were deleted while marked KEEP. Anyone
acting on the remaining rows must read **both** sides for a feature before touching it.

## Where the evidence lives

The full audit, the per-package verdicts, the revised verdicts, the census and the tooling were committed
during the pass and removed at ship. Recover them from the `au20-audit-evidence` tag (PR #505 was squash-merged, so the commit is not reachable from `main` — the tag is what keeps it alive), under
`.pipeline/work/AU20/destroy/`.
