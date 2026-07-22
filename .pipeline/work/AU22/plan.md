# AU22 — Challenge and collapse internal Service complexity

## Work package

**Work package.** As a maintainer of HyperIdle, I want every internal path in the combined AU20 + AU21 Service tree challenged for whether it earns its code, so that future agents carry only the machinery the product genuinely needs. AU20 simplified what Services expose and AU21 simplifies how they depend on each other; AU22 starts only after both are complete and treats their combined result as the immutable baseline. This work collapses or removes unused, duplicated, speculative, and over-specialized implementation code while preserving the product capabilities that real consumers and end-to-end journeys need. Completion means substantially less production code exists because evidence supported deleting it—not because a predetermined quota forced capability loss, and not merely because code was renamed, moved, generated, or hidden.

**Why this matters.** Maintainers and implementation agents currently pay the cost of roughly 43,700 production Service lines even after the public surface was reduced sharply. That slows every future feature, makes reviews unreliable, and leaves too much machinery for an MVP whose behavior is already pinned by a large test suite. Not doing this means AU20's cleaner API can conceal most of the original implementation complexity rather than eliminating it.

**Type.** backend

**What exists today.** AU19 created the Layer and Service package boundaries. AU20 reduces the public and implementation-site Service surface and records per-Service census and line-count baselines. AU21 reduces questionable agent-orchestration-to-core-api dependencies and locks the final cross-Layer boundary. The repository already has unit/component tests, service integration tests, real-harness integration tests, Playwright E2E tests, implementation-site surface census tooling, and generated dependency-graph data that together can pin required behavior while code is destroyed.

**What's genuinely missing.** The internal implementation remains much larger than its public API: AU20 reduced Service production lines far less than exported declarations, especially in run-orchestration, harness-registry, knowledge, and work. There is no completed capability-by-capability deletion pass that proves which internal modules, branches, adapters, compatibility paths, and abstractions are genuinely necessary after both AU20 and AU21 settle the external shape.

**Depends on.**
- **AU20** — AU22's before measurements and completeness contracts must use AU20's final Service APIs; starting earlier would optimize code that AU20 is still rewriting.
- **AU21** — AU22's internal simplification must use AU21's final dependency graph; starting earlier would preserve or delete machinery against edges AU21 is still changing.

**Complexity.** L

**Engineering tier.** mvp

**Pre-build gates.**
- **Refinement:** Not required — the goal is explicit deletion of internal complexity against the combined AU20 + AU21 baseline; no new domain noun or product capability is introduced.
- **Design:** Not required — backend/internal simplification with no intended UI change.

**Human review gates.** Yes — deletion across every Service is high-blast-radius and the founder must review the requirement, the capability-preservation concept, and the final before/after evidence.

**Plan calls.** Pure-backend multi-increment architecture pass. Pin the exact combined AU20 + AU21 baseline first, establish a capability-completeness contract before deletion, then plan a Service-by-Service destructive queue with independent review and green gates after every separately committed increment. Prioritize the largest internal implementations and the worst surface-to-LOC mismatches. Set no aggregate deletion quota: challenge aggressively, but let real behavior and consumer demand—not a target number or metric gaming—decide what survives.

**Contracts / constraints.**
- The baseline is the combined final state of AU20 and AU21; neither predecessor may still be moving when AU22 begins.
- Physical deletion is required. Moving, renaming, un-exporting, code-generating, or hiding implementation does not count as complexity reduction.
- No fixed percentage or line-count target overrides capability evidence; the objective is the maximum honest collapse each Service can sustain.
- Every Service increment is separately committed, net-negative in production code, independently reviewed, and green before the next Service starts.
- No real product capability may be lost. Consumer demand, atomic/concurrency guarantees, service integration behavior, real-harness behavior, and critical browser journeys must be pinned before destructive changes.
- Tests may be consolidated but never weakened or deleted merely to make removed behavior appear acceptable.
- Measurement and guard tooling is read-only to builders; metric disagreement is escalated rather than edited around.
- No enterprise hardening, speculative abstraction, compatibility layer, or future-use machinery is added to compensate for deletion.

**Out of scope.**
- New product features or UI redesign.
- Reopening AU20's public API design or AU21's final dependency-boundary decisions without a proven capability defect.
- Reducing test coverage as a way to reduce repository line count.
- Counting generated files, vendored code, documentation, or tests toward the production-code deletion result.

**Effort.** L (~8-12d)

## Acceptance criteria

- The exact combined AU20 + AU21 baseline records, per Service and in total, production LOC, implementation methods/types, files/modules, dependency edges, and the behavior suites that protect it.
- Every current Service receives a completed destructive pass; each increment physically removes internal code, is net-negative in production LOC, is separately committed, and has an independent accept/revise verdict.
- The completed AU22 production diff is net-heavily-negative and the final production Service LOC is lower than the combined AU20 + AU21 baseline; the exact reduction is an observed result of the evidence-backed challenge, not a preset quota. Implementation methods/types and dependency edges do not regress upward merely to trade one form of complexity for another.
- Removed code is proven unnecessary or replaced by a smaller composition of retained capabilities; no deletion is credited for relocation, renaming, un-exporting, generated substitution, or test weakening.
- `npm run check`, `npm run lint`, unit/component tests, service integration tests, real-harness integration tests, and the full Playwright E2E suite pass at completion, except only explicitly recorded predecessor baselines reproduced unchanged on the combined AU20 + AU21 tree.
- Final generated evidence shows before/after numbers and Git churn per Service, names every deleted module or capability path, and identifies any large implementation that survived with its evidence-backed reason.

## Validation scenarios

- Given the final AU20 + AU21 tree, when AU22 records its baseline, then every Service has reproducible production-LOC, surface, dependency, and behavior measurements before any implementation code changes.
- Given a Service increment, when its diff is reviewed, then production code is physically net-negative, removed behavior is either proven unnecessary or still delivered through a smaller retained path, and all affected behavior suites remain green before commit.
- Given the completed AU22 branch, when the full static, unit, service-integration, real-harness, and browser-E2E lanes run, then required product journeys and atomic/lifecycle guarantees still work while the production diff remains net-heavily-negative without a quota-driven capability deletion.
- Given the final before/after report, when a reviewer audits any claimed reduction, then the source deletion, per-Service churn, preserved capability proof, and reason for any surviving large subsystem are directly traceable.
