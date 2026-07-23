# AU20 — Requirements (refine, Phase 1)

DOC-CLASS: significant

## 0. Corrective completion reset (third pipeline start — 2026-07-23)

> **Evidence correction.** This section was initially drafted before exhaustive discovery and was provisional. Discovery now reconciles **604/604 declared cases** (227 pass, 137 fail, 143 timeout, 32 skip, 65 unrun). Runtime dispositions: 27 feature regressions, 99 intentional moves, 61 stale test/mocks, 2 missing prerequisites, and **181 unresolved**; separately, four review obligations are open, one is child-blocked, and two desktop proof gaps are open. `plans/AU20/problem-analysis.md`, `browser-analysis.md`, and both machine ledgers are fixed input. Execution state is not a disposition; signature-derived causality is forbidden.

> **Gate before design/architecture.** Seven isolated probes narrow the remaining 181 unknowns without inventing causal edges. Twenty-one coherent primary registers now partition all 364 browser non-passes: 14 design-owned, seven architecture-owned, with zero missing IDs, duplicate ownership, passing contamination, or pairwise intersection. Each includes evidence/counter-evidence, current state distribution, confidence, targeted proof, and one owner. Independent problem-framing review must accept this mechanically reconciled partition before design or architecture.

### Why AU20 is back at refine

AU20 delivered a real 31→23 Service reduction and a live implementation census of 1277→412 exports, but it has **not** delivered a demonstrably working system. The founder revoked prior implementation authorization and returned this same work package—not a new AU—to the beginning of the pipeline. Prior approvals remain history, not permission to skip gates.

The mandatory fresh review at `/Users/tg/hyperidle/.worktrees/AU20-review/.pipeline/work/AU20/review.md` is incorporated in full. Its five critical and four warning findings are binding completion obligations:

1. per-Service demand package stale and not reproducibly generated;
2. server shutdown does not await durable runtime teardown;
3. harness-registry lacks approved MCP dependency isolation;
4. knowledge retro hypothesis snapshots mutate;
5. aggregate verification red, including 9-versus-10 disposer contradiction and real-harness failures;
6. notification secret writes swallow unexpected encryption failures;
7. filesystem watcher failure looks healthy and may emit unhandled `EMFILE`;
8. committed census evidence contradicts the executable census;
9. ownership comments describe deleted packages as live.

The wider application/E2E run also produced hundreds of failures plus skipped, timed-out, and unrun cases. Counts are not yet trustworthy because product regressions, intentional UI moves, stale mocks/assertions, harness defects, missing prerequisites, and environment blockers are intermingled. First deliverable is trustworthy diagnosis, not mass test rewriting.

### Sharpened corrective goal

**Value and audience.** Maintainers and fast-moving users regain confidence that AU20's simplification preserved the actual product: browser and desktop journeys work, durable state is not lost, service contracts remain true, and every green lane proves what it claims.

**Observable success.** A fresh checkout reproduces current service/demand evidence, boots and stops cleanly, exercises canonical browser and desktop journeys, and runs isolated lanes whose results account for every discovered test. Each prior failure traces to one evidence-backed disposition and then a corrected product, test, harness, or explicit external blocker. Nothing disappears through deletion, weakening, blanket rebaseline, timeout inflation, or silent skip.

**Scope.** Correct AU20 regressions, false/stale validation, and all review findings while preserving accepted Service simplification. Reconcile tests with authoritative product contracts where features intentionally moved. Restore proof for clean server boot, shutdown, real backend, harness discovery/MCP, desktop, accessibility, and current UI journeys.

**Non-goals.** No new feature program, UI redesign, replacement E2E framework, arbitrary surface target, speculative hardening, or opportunistic refactor. AU22 remains the later no-fixed-number complexity challenge. AU20 removes more code only where diagnosis proves it obsolete or a smaller correction is coherent.

### Guide draft — evaluating AU20 completion

Run the inventory command architecture defines to enumerate all cases in each validation lane. Run lanes in isolation from the AU20 worktree. The committed ledger records case identity, lane, observed outcome, artifacts, disposition, authoritative contract, corrective increment, and final proof.

For a **feature regression**, preserve/add failing behavior or visual proof, then fix production. For an **intentional move**, cite the newer canonical product/design contract and update the test to exercise the same capability at its current location. For a **stale test/mock**, prove application contract independently before changing fixture/assertion. For a **harness defect**, prove runner/config/routing/isolation caused a false failure or unrun case, then repair it. For a **missing prerequisite**, fail fast naming it. For an **environment blocker**, retain reproducible blocked evidence; never convert it into pass or silent skip.

Corrections follow reviewed architecture order. Service-local changes remain separate green commits per Service. Lifecycle, E2E harness, desktop, or evidence-generator changes are separate named increments. Review checks ledger lineage, red-before-green proof, rendered evidence, all review findings, and unchanged measurement semantics.

### Required pipeline order

1. Revised requirement → independent `/refine-critique` → human requirement gate.
2. `/design` performs a **light contract-reconciliation pass** over canonical journeys and rendered states. AU20 is no longer design-exempt because failed acceptance now includes UI/desktop behavior.
3. `/architecture` defines inventory/ledger, lane boundaries, boot/teardown ownership, mock/real-backend contracts, prerequisites, diagnostics, and bounded landing sequence; it incorporates all nine review findings.
4. Independent design/architecture critiques → human concept gate.
5. `/write-tests` establishes failing proof. Only then `/write-code` changes implementation. `/review` default-rejects unexplained test disappearance or weakened proof.

### Failure-disposition contract

Every failed, skipped, timed-out, or unrun case has exactly one primary disposition:

| Disposition | Required evidence | Permitted correction |
|---|---|---|
| Feature regression | Current contract + failing runtime/rendered proof | Production fix; retain capability proof |
| Intentional move | Newer canonical route/interaction contract + working current capability | Move assertion; preserve capability coverage |
| Stale test/mock | Independent current behavior + obsolete fixture/assertion provenance | Correct fixture/assertion without weakening behavior |
| Harness defect | Reproduction that runner/config/routing/isolation caused false/absent result | Repair harness; rerun affected inventory |
| Missing prerequisite | Named required binary/credential/service detected before execution | Fail fast; execute when available |
| Environment blocker | Reproducible external condition after in-scope alternatives exhausted | Keep blocked evidence; never silently pass/skip |

Known exploratory observations—legacy `/work/portfolio` or `/work/teams`, Knowledge creation at `/knowledge/new`, Settings full-page sections, route mocks bypassing fallback, query-glob misses, server boot migration, light-theme contrast, desktop proxy/preload, AH6 replay, session overlay interception—are leads, not verdicts. Architecture/design must verify them against docs and runtime. Three `fix/e2e-recovery` commits are untrusted POCs and must not be cherry-picked as proof.

### Corrective AC alignment

| Corrective AC | Requirement coverage | Current gap |
|---|---|---|
| Finite ledger + individual disposition | Guide and disposition contract define lineage/evidence | Architecture must define schema, commands, inventory boundary |
| Architecture + light design first | Required order makes both mandatory | Neither corrective artifact/review exists |
| Red proof before correction | Guide defines behavior, visual, static proof | `/write-tests` awaits concept approval |
| Five critical findings resolved | All listed as binding | Architecture must settle teardown, MCP seam, disposer ownership, demand writer, prerequisites |
| Four warnings resolved | All listed as binding | Architecture must define failure semantics/evidence regeneration |
| Reductions/fixes preserved; scoped commits | Scope and guide preserve accepted work/isolation | Build plan must be revised after architecture |
| Fully accounted green system | Success covers browser, desktop, backend, harness, service, evidence | Current system is red/unreliable by definition |

### Corrective validation scenarios

- Complete configured validation inventory yields stable case IDs; final results account for every ID as passed or explicitly blocked by a real external prerequisite, with nothing silently unrun.
- Every failed/skipped/timed-out/unrun case has artifacts and current-contract evidence sufficient for a fresh reviewer to reproduce and agree with exactly one disposition before test or production changes.
- Canonical Work, Conversations, Knowledge, Settings, setup, accessibility, and responsive journeys have reviewed current routes/interactions; Playwright plus inspected screenshots prove painted results and intentional moves retain coverage.
- Clean browser-backend and desktop profiles apply prerequisites/migrations, reach the correct backend, and await durable runtime disposal before DB/process teardown.
- Mocked, cassette, live-binary, inherited-discovery, and MCP harness paths run in explicit isolated lanes; absent credentials/binaries fail fast while deterministic paths need no unrelated secrets.
- Focused red-before-green proofs and independent aggregate rerun resolve all nine fresh-review findings, including snapshot immutability, observable watcher/encryption errors, isolated MCP dependencies, current demand/census, and correct ownership docs.
- Each bounded corrective increment is green before its separate commit; final review confirms no capability weakened and all command/rendered evidence is current.

### Additional required reading for corrective phases

- `plans/AU20/problem-analysis.md`, `validation-inventory.json`, `browser-validation-ledger.json`, `system-validation-ledger.json` — exhaustive discovery evidence and unresolved-case inventory.
- `/Users/tg/hyperidle/.worktrees/AU20-review/.pipeline/work/AU20/review.md` — full fresh review; every critical/warning binding.
- `.pipeline/work/AU20/plan.md`, `build-plan.md`, `progress.json` — plan and explicit history to revise, never erase.
- `packages/web/playwright.config.ts`, `playwright.ah1.config.ts`, `playwright.ah5.config.ts`, `playwright.ah6.config.ts`, `e2e/fixtures.ts`, all `e2e/*.spec.ts` — lanes and inventory.
- `docs/information-architecture/app-shell-always-present.md`, `conversations-view.md`, `work-view.md`, `knowledge-view.md`, `cross-view-navigation-map.md`.
- `docs/human-interface-layer/the-three-views.md`, `open-contract.md`, `part-model.md`.
- `docs/deployment/index.md`, `laptop.md`, `releases.md`; `docs/architecture/system-overview.md`, `as-implemented-domain-architecture.md`, `data-flow-examples.md`, `run-unit-model.md`, `credential-model.md`, `connection-model.md`.

No apparent doc/test contradiction is adjudicated during refine. Newer authoritative contract wins only after design review confirms it; passing implementation alone does not rewrite product intent.

> **Historical material below.** The retained v2 requirement records why the Service redesign was approved and what must remain preserved. Its “done,” “suite green,” open-question, and “no contradiction” statements are superseded by corrective §0 and cannot authorize design, architecture, test changes, or implementation.

*(Second redirect — 2026-07-17. The founder **REJECTED the concept gate** for the prior version and sent this WP back through refine + architecture, then **sharpened** the reframe. The prior version framed the whole audit around **call-site counts** — count callers, then keep/merge/inline/delete each export by usage, and judge a Service's existence by "owns a table / has a loop." That frame is discarded. This version reframes the WP around **architectural coherence + product purpose, judged at MVP tier, per Service, holistically** — where each Service is treated as its own product designing a small set of well-structured general interfaces, **informed by (not dictated by, and not ignoring) real usage**, and stress-tested against a **sub-linear scaling** thought-experiment. See §8 for exactly what changed vs. the rejected version, and the founder's four sharpenings folded in. The prior redirect note is superseded by this one. `DOC-CLASS` is `significant` — a twice-redirected, founder-rejected reframe of the judgment criteria for the whole Service layer, gated by the mandated Phase 6 concept gate.)*

References `.pipeline/work/AU20/plan.md` (the seeded WP spec — plan of record, revised in this pass: title, Work package, Acceptance criteria, Out-of-scope, Validation scenarios). This refine settles the load-bearing judgment the plan turns on — **what a clean, deliberate, general Service API looks like at MVP tier, and why a Service earns its existence** — so `/architecture` can design the per-Service analysis process it mandates.

---

## 1. Sharpened goal

**The founder's frame (source of truth).** The rejection: *"A specific method for every call is absolute garbage. A service needs to define what it wants to export and how — what are meaningful things to share and what are not. We don't need to think 'is it called' but we need to think 'do these exports make sense from the lens of the service and a clean architecture.' We are building an MVP of a tool right now and we have more methods than 99.99% of tools on earth — that does not sound healthy but like engineering garbage… We need every service indexed. Each analyzed holistically from the perspective of the service… a planner reasons what would be a clean architecture for this service — what is needed, what makes sense. And the reviewer critiques that hard. Reference level: we are at MVP stage."* The four sharpenings (folded in): (1) *"the audit ALSO judges usage — you need to be informed by your users but not blindly follow them."* (2) *"each service should be turned into a coherent product of what do I offer, what do I expose, and how do I keep a coherent and clean architecture that allows me as a service to be efficient in the future in building new features and changing my behaviour or adapting to new needs. Each service needs to think like its own product, thinking about both outside and inside means."* (3) *"typically the answer is not an interface per use case but rather a set of well structured interfaces that help in many occasions."* (4) *"just imagine we add dozens more services and hundreds more calls — do we need hundreds more methods?"*

**The number IS the finding.** AU19's mechanical scan found **1218 exported symbols across 31 Services** — `knowledge` alone exposes 138, `notifications` 89, `work` 84, `harness-registry` 79. For an **MVP tool**, that surface is not a sign of a rich product; it is over-fragmentation — a bespoke, narrow method carved out to fit each individual call site. **Knip cannot see this:** knip only removes *dead* code, and a one-caller method is *used*, not dead — so over-fragmentation of *live* code is invisible to it. That is exactly why usage still has to be **read and reasoned about**, not deferred to knip. This WP does not need to *discover* whether the sprawl is a problem (the number already says so); it needs to **collapse it into a small set of coherent, well-structured, general Service interfaces** and, along the way, decide which Services should exist at all.

**Value & audience.** The maintainer (and every agent that will read and extend these Services) gets, per Service treated **as its own product**: (1) an **OUTSIDE lens** — what do I offer / expose? A deliberate public API that is a small set of well-structured general interfaces serving the real demand across many occasions, not a bespoke method per request; (2) an **INSIDE lens** — how do I keep a clean architecture so building new features, changing behaviour, and adapting to new needs stays cheap in future? and (3) a **product-purpose-and-layer verdict** on whether the Service should exist as its own Service at all. The system ends up with far fewer, far more meaningful, far more general exports — a surface that scales **sub-linearly** as demand grows, not one that grows a method per new use case.

**Two tracks — one primary, one secondary.**
- **PRIMARY — the per-Service clean-architecture audit, each Service as its own product.** Every Service, indexed and analyzed **holistically from its own perspective** across the two product lenses:
  - *Existence + product purpose (why + where):* why does this Service exist from a product standpoint, is that valuable, and does it belong as its own thing given the layer boundaries (`core-api` app domains — Work / Conversation / Knowledge / Users / Settings — or `agent-orchestration`, or `agent-execution`)?
  - *Outside + inside coherence:* **read what its consumers actually request of it** (the call-site / demand data) to understand the **real demand** — then design a small set of well-structured general **interfaces** (OUTSIDE) that serve that demand across many occasions, backed by a clean, evolvable internal architecture (INSIDE) so future needs compose from those interfaces rather than spawning new methods.
  The judgment is **architectural coherence and product design**, informed by usage but never dictated by it — and never ignoring it either.
- **SECONDARY — three named correctness bugs.** Tier-independent fixes AU19 already code-verified (`log_task` lost-update race, duplicate `getTeamMembersById`, duplicate `getUserById`). They stay in scope but are no longer the headline; they ride alongside the audit.

**Success — observable once shipped.**
1. **Every one of the 31 Services carries a written holistic analysis, as its own product:** its product purpose for existing, its correct layer position, an **existence verdict** (keep / fold into a sibling / dissolve) reasoned from **product value + layer boundaries** (not table ownership or caller count), and an explicit account of both its **OUTSIDE** coherence (what it offers) and its **INSIDE** coherence (how it stays clean and evolvable for future features / behaviour changes / new needs).
2. **Every Service carries a redesigned deliberate public API that is a small set of well-structured, general, composable interfaces** — **informed by the real demand its consumers express** — with every retained interface justified as a meaningful, reusable capability serving **many occasions**, and every per-caller / narrow-shape export collapsed into a general interface or made internal. The positive target is explicit: replace N bespoke per-caller methods with a small set of general interfaces; an interface-per-use-case surface is the defect the redesign removes. A **"keep unchanged" verdict is not an exemption** — a Service already judged coherent carries the identical justification burden (every retained interface justified as serving many occasions + the explicit scaling argument).
3. **Each Service's API passes the scaling test:** the analysis explicitly argues that adding dozens more services and hundreds more calls would **compose** from the proposed interfaces rather than requiring hundreds more methods — i.e. the API scales **sub-linearly** with demand. A proposal that would still grow a method per new use case fails the test.
4. **The reductions are applied, not just proposed:** the collapses land in code, the aggregate exposed surface drops materially from 1218 toward a coherent MVP-tier surface (reduction is the *consequence* of general design, not a number to hit), the full suite stays green, and no product behavior changes.
5. **Each Service's analysis is independently critiqued** (a reviewer, a different agent than the per-Service planner) hard against product purpose, architectural coherence, and **the scaling thought-experiment** at MVP tier — **before** its reductions are applied.
6. **A scripted per-Service data input exists** — each Service's current exports + where each is called (DI-port-resolved) + *what each consumer actually requests of it* — as the **re-runnable input that informs each per-Service analysis.** It is data you reason *from* to understand demand: it is not the verdict, and it is not ignored.
7. **The three named bugs are fixed** (not re-discovered), with a real concurrency test for `log_task` that fails on today's code and passes after the fix.

**MVP-tier calibration (load-bearing for every judgment).** The bar is a small, coherent, general, evolvable design matched to an MVP tool — the opposite end of the spectrum from enterprise (`ETHOS.md` §1). The tier is **declared for this WP**, grounded in `ETHOS.md` §1 (Build for the Fast, Not the Enterprise) — the same per-plan declaration AU21 makes; the global `pipeline.config.yml engineering.tier: mvp` default is only *landing* via PR #454 (open, unmerged — no `engineering` block exists on this branch yet), so MVP is asserted here from ETHOS + this plan, not read from config. None of these is a valid reason to keep an export public or keep a Service separate: "it's called from somewhere," "it's clean to have a name for this concept," "we might need it later," "it's tidy." A retained interface must be a **general capability the Service deliberately chooses to offer, serving many occasions**; a retained Service must have a **real product purpose and a defensible layer position**. Usage *informs* the shape of a good interface; it never *dictates* a method per request, and it is never ignored. The one exception: the three named correctness bugs are fixed regardless of tier.

**Scope.** All 31 Services, each treated as its own product and analyzed holistically for existence + deliberate general API (outside) + evolvable internals (inside), with the coherent reductions applied — plus the three named bug fixes. The unit of work is **the Service, reasoned about as a whole product**, not the individual method judged by its call count.

**Non-goals (bounding exclusions).**
- **Not a usage census, and not usage-driven method-carving — but usage is not ignored either.** Do not produce, and do not judge from, per-method "keep/merge/inline/delete by call-site count" dispositions; and do not cater to each consumer request with a bespoke method. Usage is a legitimate **input you reason FROM**: each Service reads what its consumers actually request to understand the real demand, then designs a coherent *general* API that serves that demand well. Knip removes only dead code and is blind to over-fragmentation of live code — so usage still has to be read and reasoned about, not deferred to knip. Usage informs the shape; it is not the deliverable, not the verdict, and not a mandate for a method per use case.
- **Not the `agent-orchestration → core-api` edge count/structure** — that is **AU21**. AU20 is each Service's own surface + existence, not the cross-Service coupling graph. (Shared findings — `log_task`, the duplicate reads — cross-reference AU21; never double-fix.)
- **Not a from-scratch re-partition of the domain data model.** Folding a Service moves its tables/ports with it, but AU20 does not redesign which domain owns which table beyond what a specific fold necessarily entails.
- **Not a feature change.** Every reduction preserves every genuinely-needed capability — verified by the suite. Reductions collapse surface into general interfaces; they do not remove behavior.
- **Not a throwaway script.** The per-Service data input extends AU19's `scripts/generate-dependency-graph.ts`, sharing its AST-scan approach.

---

## 2. Guide draft (dev-facing — "how a maintainer uses this once it ships")

> **Each Service is now its own product — with a deliberate general API and a reason to exist.** After AU20, opening any Service's `src/index.ts` shows a small set of well-structured, general interfaces the Service *means* to offer (OUTSIDE) — not an accreted pile of one-caller getters. Each Service also carries a one-paragraph record of **why it exists** (the product capability it owns and why that is valuable), **where it sits** in the layer model, and how it stays **evolvable inside** (INSIDE) so building new features, changing behaviour, and adapting to new needs stays cheap. If a Service could not answer "what product value do I own, and why am I my own Service given the layers," it was folded into the sibling that does own that value, its tables and ports moving with it.
>
> **How the redesign was reasoned — per Service, holistically, informed by real demand.** A scripted analysis produced, for each Service, its complete current surface (every export, what it does) and its consumers (where each export is called and *what each consumer actually requests of it*, resolved through DI-port indirection so the demand picture is accurate). That data is the *input* — you read it to understand the real demand on the Service (knip can't help here: a one-caller method is *used*, so knip is blind to the over-fragmentation). Then, for each Service, a planner designed the Service as a product: **outside**, a small set of general, composable interfaces that serve that demand across many occasions rather than one method per request; **inside**, an architecture kept clean so future features compose from those interfaces. The output — a target public API plus an existence verdict — was hard-tested against a scaling thought-experiment ("if we add dozens more services and hundreds more calls, do we grow hundreds more methods, or do they compose?") and independently critiqued before anything was applied.
>
> **What "clean at MVP tier" meant.** Fewer, more general, more meaningful interfaces. A capability is worth exposing when it is a genuine, reusable thing the Service owns that serves many occasions — a general write path into an owned table, a state-machine or scoring engine the Service *is*, a real cross-Service contract. It is *not* worth exposing when its only justification is that one caller wanted exactly that shape. Usage informed the shape of each interface; it never dictated a method per use case, and it was never ignored. "Might need it later" and "it's tidy" never kept an interface or a Service.
>
> **Re-running the picture.** `scripts/generate-dependency-graph.ts` still emits each Service's surface + consumer demand on demand — the standing input for the next time this reasoning is repeated. It answers "what does this Service currently expose and what do consumers ask of it," which informs a design judgment; it does not answer "keep or cut," which is a product-design decision a human/planner makes.

---

## 3. The per-Service process (requirement level — the shape `/architecture` must design toward)

The founder mandated the process explicitly: *"every service indexed… each analyzed holistically from the perspective of the service… a planner per service which has all the relevant data of what the service exposes and where it is called… then for each service individually a planner reasons what would be a clean architecture for this service… and the reviewer critiques that hard,"* with each Service thinking *"like its own product — thinking about both outside and inside means."* At requirement level the shape is:

1. **Index (scripted data input).** Extend `scripts/generate-dependency-graph.ts` to emit, per Service, a **data package**: the complete current exposed API (every export + what it does), and each export's consumers (where it is called, and *what the consumer actually requests of it*, resolved through DI-port indirection so the demand map is accurate). Plus the Service's owned tables, its layer position, what it consumes, and AU19's "why it's separate" prose. This is the input every per-Service analysis reads **to understand the real demand** — an input reasoned *from*, never the judgment, and never skipped.
2. **Per-Service product reasoning (one analysis per Service — parallelizable).** For each Service, a planner reasons from that Service's own perspective, **as its own product across both lenses**, and produces: (a) an **existence verdict** — product purpose + layer position → keep / fold / dissolve; (b) a **deliberate general public API (the OUTSIDE lens)** — read the demand, then design a small set of well-structured general interfaces that serve it across many occasions, with every narrow/per-caller export collapsed into a general interface or internalized; and (c) an **inside-coherence account (the INSIDE lens)** — how the Service stays clean and evolvable so new features / behaviour changes / new needs compose from existing interfaces. The planner must explicitly argue the **scaling test** (adding dozens more services / hundreds more calls composes, does not multiply methods).
3. **Independent critique.** A reviewer (a different agent than the per-Service planner) critiques each Service's analysis hard against product purpose, architectural coherence, and — explicitly — **the scaling thought-experiment** at MVP tier: is the existence verdict reasoned from product value and layers (not tables/callers)? Is the API a genuinely general set of interfaces serving many occasions, or did the planner just re-shape the status quo or cater a method per request? **Would this API still grow a method per new use case if we added dozens more services and hundreds more calls?** Does each retained interface earn its place as a general, reusable capability? Is the inside kept evolvable?
4. **Apply.** Land the coherent reductions in code — collapse the per-caller sprawl into the general interfaces, fold any Service whose verdict says so (tables + ports move with it), suite green, no behavior change.

`/architecture` owns the mechanics: how the data package (incl. per-consumer demand) is produced, how the 31 per-Service passes are sequenced/parallelized within L effort, how a fold migrates tables/ports/callers, and how "a small set of well-structured general interfaces" + the scaling test are made concrete and checkable per Service. It must **not** reintroduce a per-method usage-disposition rubric, nor a usage-driven method-per-request design, as the judgment.

---

## 4. Load-bearing nouns (Phase 3 — pin, don't model)

Four analysis nouns downstream phases must not drift on. All are audit vocabulary calibrated to MVP tier. **The prior version's central noun — "real call site" as a *judgment* criterion — is explicitly retired:** call-site data survives only as an input that **informs** the design (§3.1), never as what decides an export's or a Service's fate, and never as a mandate for a method per request — but also never ignored.

### A Service as its own product (the two lenses)
**Is:** the frame for every per-Service analysis — each Service is reasoned about as its own product with two lenses: **OUTSIDE** (what do I offer / expose? — a coherent product surface for consumers) and **INSIDE** (how do I keep a clean architecture so building new features, changing behaviour, and adapting to new needs stays cheap?). Both lenses must be answered for every Service.
**Is NOT:** a bag of functions grouped by package; nor an outside-only surface exercise that ignores whether the internals can evolve cheaply; nor an inside-only cleanup that ignores what the Service offers.
**Hard rule:** every Service's analysis must explicitly reason from **both** lenses. An analysis that redesigns the exposed API but says nothing about internal evolvability (or vice-versa) is incomplete.

### A Service's deliberate public API
**Is:** a **small set of well-structured, general, composable interfaces** a Service intentionally offers for the rest of the system to depend on — designed from the Service's own responsibility and its layer position, **informed by the real demand its consumers express**, so each exported interface is a meaningful, reusable capability that serves **many occasions**. The positive target: replace N bespoke per-caller methods with a small set of general interfaces that help in many occasions.
**Is NOT:** an interface per use case; the union of every function some caller happened to need (accretion / method-per-caller); nor the Service's internal implementation surface (private helpers, narrow shape-specific reads carved for one call site) leaking out of the barrel.
**Hard rule:** every retained public export must be justifiable as a **general capability serving many occasions, from the Service's own lens.** If its only reason to be public is "one caller needs exactly this shape," it is not a deliberate-public-API member — collapse it into the general interface it fragments, or make it internal. **The scaling test binds it:** the API must scale sub-linearly — adding dozens more services and hundreds more calls must compose from the existing interfaces, not spawn a new method each; **an API that would still grow a method per new use case fails.** **Worked heuristic (the reviewer's north star):** an interface **parameterized by intent/filter** — one `list(filter)` / `find(query)` / `transition(from,to)` serving many occasions — is general; **a method per intent** — `listActiveByTeam`, `listPinnedByHost`, `listByRecency`, … one per caller's exact shape — grows per use case and fails. Prefer the parameterized form unless a distinct method carries a genuinely distinct capability (a real invariant, a different owned-table write path). **A "keep unchanged" verdict is not an exemption:** a Service whose analysis concludes its current surface is already right carries the identical burden — every retained interface justified as serving many occasions + the explicit scaling argument. An all-keep outcome that skips that justification is a degeneracy the reviewer rejects (the architecture-critique already caught an all-keep degeneracy once). Usage informs the interface shape; "is it called" and "a caller asked for this shape" are never the test.

### Product purpose for existence
**Is:** the reason a Service exists, stated from the **product/value** standpoint — what product capability it owns and why that is valuable — together with its correct position in the layer model (`core-api` app domain / `agent-orchestration` / `agent-execution`).
**Is NOT:** an implementation-artifact justification. "It owns a table," "it has a loop," "it has a clean name for a concept," "it's reached from N places" are **not** reasons a Service exists. Owning a table is a *consequence* of a real boundary, not a reason for one.
**Hard rule:** a Service kept as its own Service must have a **real product purpose AND a defensible layer position.** A Service justified only by architectural tidiness, future-proofing, or caller count fails at MVP tier and is a fold/dissolve candidate — even if AU19 gave it a clean boundary on paper. A fold moves the Service's owned tables and DI ports with it and keeps every cross-Service port and owned-table invariant green.
**Infra Services are PLATFORM / FRAMEWORK products (founder resolution of the former Q6 open question, 2026-07-17).** The ~14 `agent-orchestration` / `agent-execution` Services deliver value to **other Services**, not to end users — that is still a product: a platform/framework product whose **customers are other Services.** They are held to the **same** product bar as user-facing domains, stated with internal consumers: *what platform capability do I deliver, and to which consuming Services?* A small infra Service that delivers no distinct value on its own does not clear the bar. **The abundance of infra Services is itself a signal to interrogate** ("why do we have so many?") — and part of the answer is that some should become **one larger, consolidated Service.** `/architecture` still owns *how* the bar is operationalized per infra Service, but the bar itself is settled: platform-product-value-to-named-consumers, not a weaker or separate standard.

**Consolidation across Services is in scope (founder, 2026-07-17).** The unit of analysis may be a single Service **or a group of Services.** A Service's existence verdict is `standalone` / `consolidate` (fold together with sibling(s) into one larger Service) / `dissolve` (absorb into a sibling). Consolidating several small, individually-value-less Services into one coherent larger Service is a first-class outcome, not just per-Service surface reduction.

### Architectural coherence at MVP tier
**Is:** the single standard both the public-API redesign and the existence verdict are judged against — a small, deliberate, general, **evolvable** design matched to an MVP tool, where the whole system carries far fewer, far more general exports than 1218, and where adding demand grows the surface sub-linearly. It is the anti-thesis of "a specific method for every call."
**Is NOT:** production/enterprise completeness; not "preserve every method/Service just in case"; not usage accounting; not a method-per-request API.
**Hard rule:** MVP calibration bites on every decision — fewer, general, meaningful interfaces; internals kept clean so new needs compose cheaply; no export or Service preserved for a hypothetical future need or for tidiness. **The scaling thought-experiment is a required lens:** if hundreds more calls would force hundreds more methods, the design is not coherent — this is the concrete, testable version of "is the engineering bullshit." Reductions collapse *surface* into general interfaces, never *behavior*: the suite stays green, so correctness is preserved while the exposed API shrinks to what is deliberate, general, and meaningful.

---

## 5. The three named bugs — secondary track, fixed regardless of tier (correctness)

AU19's adversarial edge-audit already code-verified these; AU20 fixes them from that evidence rather than re-deriving. Grounded locations for `/architecture`:

| Bug | Location | Nature | Fix direction |
|---|---|---|---|
| `log_task` lost update | `packages/agent-orchestration/tool-handlers/src/log-task.ts` | `getTaskById` → string-concat note → `updateTaskById`, zero transaction / row lock / CAS. Two concurrent calls silently clobber each other's note. | Append atomically in one SQL statement (a new `appendTaskNote`-style `work` primitive replacing the read-modify-write pair), mirroring the atomic-write precedent `work-service.ts` already uses (`incrementBetCost`). Ships with a real concurrency test (two overlapping calls, no note lost). |
| Duplicate `getTeamMembersById` | `packages/agent-orchestration/cost/src/cost-cap.ts` | Same `teamMembers` row fetched twice back-to-back with no mutation between. | Fetch once, pass the row down. No behavior change. |
| Duplicate `getUserById` | `packages/agent-orchestration/context-assembly/src/session-context.ts` re-fetches the agent row the session request chain already loaded. | Row re-fetched across the request chain with no mutation between. | Thread the already-loaded row through. Verify against the *real* chain — the two `session-context.ts` hits (task-session vs routine-session) are in **different** functions and are NOT the duplicate. |

The `dispatch→work` / `dispatch→conversation` refuted-freshness reads sit on **AU21's** edge. AU20 owns the method-level duplicate-read fixes named above; AU21 references them rather than re-fixing. Cross-reference, never double-fix (per `.pipeline/AU.md`).

---

## 6. AC alignment

| # | Acceptance criterion (from revised `plan.md`) | How the requirement covers it | Gap |
|---|---|---|---|
| 1 | Every Service has a written holistic analysis, as its own product (both lenses): product purpose, layer position, existence verdict (from product value + layers, not tables/callers), + outside/inside coherence | §1 success #1, §3 step 2a/2c, "A Service as its own product" + "Product purpose for existence" nouns | 31-Service breadth + the infra-service existence bar — §7 Q1, Q6 |
| 2 | Every Service has a redesigned deliberate public API = a small set of well-structured general interfaces, informed by demand; per-caller/narrow exports collapsed or internalized; keep-unchanged carries the same justification burden | §1 success #2, §3 step 2b, "A Service's deliberate public API" noun (worked heuristic + keep-unchanged rule), §2 guide | none |
| 3 | Each Service's target API passes the scaling test (sub-linear: new demand composes, does not multiply methods) | §1 success #3, "A Service's deliberate public API" (worked heuristic) + "Architectural coherence" hard rules, §3 steps 2–3 | making it concretely checkable — §7 Q3 |
| 4 | The coherent reductions are applied; aggregate surface drops materially; suite green; no behavior change | §1 success #4, "Architectural coherence at MVP tier" noun (hard rule) | scale of applying across 31 Services — §7 Q1 |
| 5 | A scripted per-Service data input (exports + consumers + per-consumer demand, DI-port-resolved) exists as the re-runnable input that informs each analysis — reasoned from, not the verdict, not ignored | §1 success #6, §3 step 1, §2 guide, "Non-goals" usage line | DI-port resolution accuracy — §7 Q2 |
| 6 | Each Service's analysis is independently critiqued against MVP-tier coherence + product purpose + the scaling test before its reductions apply | §1 success #5, §3 step 3 | orchestration + breadth of the 31 planner+reviewer passes — §7 Q1 |
| 7 | The three named correctness bugs fixed (regardless of tier); `log_task` concurrency test; full suite green; any fold keeps tables/ports/callers green | §1 success #7, §5 | none |

---

## 7. Open questions (for `/architecture`, not blocking)

- **Q1 (the load-bearing scoping question — breadth AND apply).** AC-1/AC-2/AC-3 mandate a written product analysis for **all 31** Services and AC-6 mandates all 31 **independently critiqued** — 62 non-deferrable reasoning artifacts — *plus* the applied reductions. That is large for one L WP on **two** axes, and both need `/architecture` to make it honestly L-sized, not an ocean:
  - **Analysis/critique breadth (not just apply).** `/architecture` must either **tier analysis depth** — deep, full product analysis for the ~8 high-surface Services that hold roughly half of the 1218 exports (`knowledge` 138, `notifications` 89, `work` 84, `harness-registry` 79, `session-requests` 65, `filesystems` 61, `dispatch` 59, `review` 48), with a lighter-touch pass for trivial-surface Services — **or** explicitly **sequence** the breadth across passes. State plainly: the AC-1/AC-6 breadth *itself* (not only the apply step) may need `/architecture` to sequence or depth-tier it.
  - **Apply axis.** Where the line sits between **applying** a reduction now and **recording** a target for a later pass — deep table-moving folds may be sequenced; the safe collapses + the coherent target APIs + existence verdicts are the primary deliverable within L.
- **Q2 (data-input accuracy).** The per-Service data package must resolve DI-port indirection (`ports.<svc>.<method>` traced to the concrete export, including destructured/aliased receivers `const { work } = deps; work.method()`) so the **demand map** each planner reasons from is accurate — a bare name-grep would mislead the design. This is accuracy for *context*, not a judgment gate; the prior version's 5-Service exact-match ceremony can relax to "accurate enough to reason from." `/architecture` sets the bar.
- **Q3 (making "a small set of general interfaces" + the scaling test checkable).** These are design judgments. `/architecture` should define what a per-Service analysis must produce (target interface set + per-interface justification "serves many occasions" + collapse map + an explicit written scaling-test argument) and how the reviewer applies the scaling thought-experiment + the parameterized-vs-per-intent heuristic — so "general / sub-linear / coherent" is concretely reviewable per Service, not hand-waved.
- **Q4 (honest MVP outcome).** MVP does **not** mean "must fold a Service" or "must hit a method count." Some Services will legitimately keep their boundary and a real (but generalized) surface (`work`, `knowledge`, `conversation` are real domains). The reduction comes from replacing per-caller sprawl with general interfaces everywhere and folding the genuinely purpose-less boundaries — not from forcing a merge or a number. `/architecture` should let the evidence decide and state keeps as honestly as folds — with the keep-unchanged justification burden (§4) still met.
- **Q5 (AU21 coordination).** If AU21's concurrent branch lands a shared fix (`log_task`, duplicate reads) first, AU20 rebases onto and references it rather than re-applying — confirm live at build start.
- **Q6 (existence bar for infra / orchestration / execution Services).** "Product purpose for existence" is clear for the 5 user-facing `core-api` domains (Work / Conversation / Knowledge / Users / Settings) but under-defined for the ~14 `agent-orchestration` / `agent-execution` Services (`dispatch`, `harness-registry`, `session-requests`, `cost`, `context-assembly`, `agent-selection`, …) whose product value is **infrastructural/mediated, not user-facing** — two reviewers could split on whether `dispatch` or `harness-registry` "has product purpose." `/architecture` must define the existence bar for runtime/orchestration/execution Services **specifically** — reasoned from their role serving the agent runtime + their layer position — not only for user-facing domains, so the existence verdict is applied consistently across all 31.

---

## 8. What changed vs. the rejected version and why (founder concept-gate rejection + sharpening, 2026-07-17)

The founder rejected the prior version's **entire frame**, verbatim: *"You did not see the boundaries of the layers, you did not understand the purpose of a service and reason from why does this service exist from a product standpoint and is that valuable… having genuine callers was never the question — knip would have deleted them else. The question was if the engineering was bullshit. 1200 methods would be called a broken system in most places. A specific method for every call is absolute garbage. A service needs to define what it wants to export and how… We don't need to think 'is it called' but we need to think 'do these exports make sense from the lens of the service and a clean architecture.'"*

- **Discarded — the usage-count judgment.** The prior version's core deliverable was a per-method disposition (`keep`/`merge`/`inline`/`delete`) decided by real call-site count, and a per-Service existence disposition decided by real external-caller count + table ownership. That is the rejected frame: caller-counting *as the verdict* is the wrong question, and table-ownership is an implementation artifact, not a product reason. The noun "real call site" is retired as a judgment criterion.
- **Adopted — architectural coherence + product purpose, per Service, holistically.** The judgment per export is now *"does this make sense as a general capability this Service deliberately offers, given a clean architecture?"*; the judgment per Service is *"why does it exist from a product standpoint, is that valuable, and does it belong given the layer boundaries?"*
- **Adopted — the number is the finding.** 1218 exports across 31 Services for an MVP tool is itself the over-fragmentation finding; the goal is to collapse it into coherent minimal general APIs, not to catalogue usage.
- **Adopted — the per-Service holistic process.** Every Service indexed; a planner reasons a clean architecture per Service from the Service's own perspective; a reviewer critiques each hard (§3).

**The four founder sharpenings (folded in — refine, do not contradict, the reframe), each made load-bearing:**
1. **Usage is judged as an INPUT you reason FROM — not a command, and not ignored.** *"The audit ALSO judges usage — you need to be informed by your users but not blindly follow them."* Each Service reads what its consumers actually request (the call-site/demand data), understands the real demand, and designs a coherent *general* API that serves it — never a bespoke method per request, never deferred to knip (knip removes only *dead* code and is blind to over-fragmentation of *live* one-caller methods). Reflected in §1 (the number-is-the-finding paragraph on knip, success #2/#6, calibration), the "Non-goals" usage line, §3 (steps 1–2), and the "deliberate public API" noun.
2. **Each Service = its own product, with an OUTSIDE and an INSIDE lens.** *"Think like its own product… both outside and inside means."* OUTSIDE: what it offers/exposes. INSIDE: how it stays clean and evolvable so future features / behaviour changes / new needs are cheap. Made a named noun ("A Service as its own product (the two lenses)") and threaded through §1 (value & audience, success #1), §2 (guide), §3 (step 2b/2c), and "Product purpose for existence."
3. **The positive design target: a set of well-structured, general interfaces — NOT one interface per use case.** *"Typically the answer is not an interface per use case but rather a set of well structured interfaces that help in many occasions."* Stated positively in the "deliberate public API" noun's "Is:" (with the parameterized-vs-per-intent worked heuristic) and in success #2 — replace N bespoke per-caller methods with a small set of general, composable interfaces serving many occasions.
4. **The scaling test — success criterion + hard rule + critique lens.** *"Just imagine we add dozens more services and hundreds more calls — do we need hundreds more methods?"* A clean API scales sub-linearly; new demand composes from existing interfaces. Baked in three places: (a) success criterion #3 + plan AC-3; (b) hard rules on both the "deliberate public API" and "Architectural coherence at MVP tier" nouns ("an API that would still grow a method per new use case fails"); (c) an explicit thing the per-Service reviewer critiques hard, §3 step 3.

**Reframed (survives) — the call-site counter.** The extension to `scripts/generate-dependency-graph.ts` (each Service's surface + where each export is called + what consumers request) survives strictly as the **data input** that informs each per-Service analysis — reasoned from, never the judgment, never ignored.

**Retained (survives) — the three concrete bugs.** `log_task` race, duplicate `getTeamMembersById`, duplicate `getUserById` are tier-independent correctness fixes and stay in scope — now a **secondary** track behind the primary per-Service audit.

---

## 9. Required reading (downstream agents — `/architecture`, `/pipeline`)

- `.pipeline/work/AU20/plan.md` — the revised WP spec (plan of record).
- `ETHOS.md` — §1 (Build for the Fast, Not the Enterprise) + §3 (Boil the Lake) calibrate every coherence/existence judgment to MVP; §1 is the **source of the MVP-tier declaration** (the tier is declared per-plan from ETHOS, not read from config — see §1 calibration).
- `.pipeline/AU.md` — track frame, layer model, the AU20/AU21 cross-reference-don't-duplicate rule.
- `docs/architecture/as-implemented-domain-architecture.md` — the layer/domain map (core-api app domains Work/Conversation/Knowledge/Users/Settings; agent-orchestration; agent-execution) each existence verdict must reason from.
- `docs/architecture/runtime-simplification.md` — the settled simplification frame AU is executing.
- `plans/AU19/service-catalog.md` — every Service's complete current API + what each does + AU19's "why it's separate" prose (the substrate each per-Service analysis challenges).
- `plans/AU19/dependency-graph-data.json` — machine inventory (31 Services, `exposedApi`, owned tables) the data-input extension consumes/extends.
- `plans/AU19/architecture.md` §9 — fold-candidate self-critique (a starting signal, not a rubric).
- `scripts/generate-dependency-graph.ts` — the AST-scan script to extend for the per-Service data package.
- Bug sites: `packages/agent-orchestration/tool-handlers/src/log-task.ts`; `packages/core-api/work/src/work-service.ts` (atomic-write precedent); `packages/agent-orchestration/cost/src/cost-cap.ts`; `packages/agent-orchestration/context-assembly/src/session-context.ts`.
- `pipeline.config.yml` — the working-tree/HEAD config has **no** `engineering` block on this branch; the `engineering.tier: mvp` global default is landing via PR #454 (open, unmerged). Treat MVP as declared per-plan from `ETHOS.md` §1, not read from this file (matches AU21's per-plan declaration).
- `.pipeline/work/AU21/plan.md` — sibling WP; read for the coordination boundary only (READ-ONLY, never write into `AU21/`).

No spec/doc contradiction found. AU19's shipped-state docs, the layer architecture, both plans, and the code agree; this refine re-bases the judgment criteria, not the facts.
