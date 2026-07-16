# AU20 — Challenge every Service's exposed method surface (reduce, don't just document)

## Work package

**Work package.** As a maintainer continuing the simplification AU19 started, I want every Service's exposed API (its `src/index.ts` barrel exports) audited method-by-method for whether each one earns its place, and reduced where it doesn't — not just documented. AU19's mechanical extraction script (`scripts/generate-dependency-graph.ts`) found 1194 named exports across 31 Services (`work` alone exposes 84). A number that large is itself a finding: either the product genuinely has that much distinct, reachable surface area, or a large fraction is micro-methods carved out for one narrow caller's exact shape — over-fragmentation that `knip` cannot see, because a method with exactly one real caller is still "used," not dead. When this ships, every Service's exposed method has an explicit disposition (kept as genuinely load-bearing, merged with a sibling, inlined into its sole caller, or deleted/redesigned), and the extraction script is extended to make this a re-runnable, mechanical audit rather than a one-time hand pass.

**Why this matters.** This WP exists because the AU19 dependency-graph work already surfaced concrete, verified evidence of the problem it's meant to fix, not because of a hunch. The adversarial edge-audit workflow run during AU19 (112 `agent-orchestration → core-api` capabilities individually challenged) found real, code-verified cases of exactly this pattern: `tool-handlers`' `log_task` reads a task's full row, string-concatenates a note, and writes it back — with zero transaction, zero row lock, zero CAS predicate, so two concurrent calls silently clobber each other's note — when the same file already has the right primitive (`transitionTaskState`'s CAS-guarded update) two functions away, and the fix collapses two Service calls into one atomic SQL statement. `cost`'s `getTeamMembersById` gets called twice back-to-back in the same function with zero mutation in between, purely duplicating a row the caller already had in scope. `context-assembly`'s `getUserById` re-fetches a row `session-provisioning.ts` already fetched moments earlier in the same request chain. None of these are hypothetical — each was independently re-verified against the real call site by a second, adversarial reviewer before being counted. If this pattern shows up this often in the 139 edges AU19's audit already covered, the exposed-method surface (1194 exports, most never touched by that audit) is very likely carrying the same debt at a larger scale.

**Type.** backend.

**What exists today.** `plans/AU19/service-catalog.md` (every Service's complete exposed API, one sentence per export) and `plans/AU19/dependency-graph-data.json` (machine-readable, produced by `scripts/generate-dependency-graph.ts`) already give an exhaustive, mechanically-verified inventory of what every Service exposes. What neither produces yet: how many real call sites each exported method actually has, which is the load-bearing signal for "is this method earning its keep or is it a one-off." The AU19 edge-audit workflow (`plans/AU19/as-is-dependency-graph.md`'s "Why 5 of 8 against-grain edges are permanent" section and the underlying 112-capability challenge run) already proved the adversarial-review pattern works at the edge level and surfaced 11 UNJUSTIFIED + 52 QUESTIONABLE findings largely *because* of exactly this fragmentation (many capabilities exist to serve one specific caller's narrow need).

**What's genuinely missing.** (1) Extend `scripts/generate-dependency-graph.ts` (or a sibling script) to count real call-site references per exported function, not just its existence — reusing the same AST-scan technique, now counting usages instead of just declarations. (2) For every method with a single external call site (or zero — a `knip`-missed case if one exists), an explicit, evidence-backed disposition. (3) The concrete bugs the AU19 audit already found and did not fix (`log_task`'s race condition chief among them — flagged there as real and unresolved) get fixed here, not re-discovered.

**Depends on.**
- **AU19** — needs the real Service package boundaries, the mechanical extraction script, and the edge-audit findings this WP directly builds on.

**Complexity.** L

**Engineering tier.** production — matches the repo default forecast (HyperIdle: core platform shipped, actively developed); this WP fixes live concurrency-correctness bugs in a shipped system, not prototype exploration. `pipeline.config.yml` has no `engineering.tier` key yet (the tier field is unreleased in this repo), so this is the maintainer's explicit call for this WP rather than an inherited default — confirm/override before build if the tier feature lands with a different repo-wide default in the meantime.

**Pre-build gates.**
- **Refinement:** Required — needs to settle the actual criteria for "does this method earn its place" (single-call-site alone isn't automatically wrong; some genuinely narrow operations are correctly narrow) before an architecture pass can apply it at scale across 1194 exports.
- **Design:** Not required — backend refactor, no UI surface.

**Human review gates.** Yes — mandatory for every work package under the current plugin: the requirement gate (Phase 3) after `/refine-critique`, the concept gate (Phase 6, design + architecture) after the critiques, and the final review (Phase 10) before ship all still run. Forecast is low-friction: internal refactor, no user-facing surface, so the concept gate should be a quick pass except where a fix changes observable correctness (e.g. `log_task`'s race condition).

**Plan calls.** Reuse the AU19 adversarial workflow shape (explain from real code → independently challenge, defaulting to skepticism) but scoped per-method rather than per-edge, since that's the actual unit of concern here. Start from the concrete findings AU19's audit already produced rather than re-running a blind sweep first — those are free, verified evidence, not something to re-derive.

**Contracts / constraints.**
- No product behavior change except where fixing a named, verified bug.
- Reductions must preserve every genuinely-needed capability — verified by the full test suite plus the call-site count, not assumed safe because a method "looks small."
- The extended script becomes the new standing tool for this kind of audit — do not build a one-off, throwaway script duplicate of `generate-dependency-graph.ts`'s AST-scan approach.

**Out of scope.**
- Re-litigating Service *boundaries* themselves (which Service owns what) — already settled by AU19. This WP is about method-level granularity within already-settled boundaries.
- The `agent-orchestration → core-api` edge-count/structure question — that's AU21's job; this WP is about the methods *within* a Service's exposed surface, not the cross-Service edges themselves (though the two will share findings, e.g. `log_task`, and should cross-reference rather than duplicate fixes).

**Effort.** L (~5-7d) — smaller than AU19's 8-10d (no new Application/Layer/Service boundaries to build, reuses AU19's proven adversarial method) but still spans 1194 exports across 31 Services plus fixing the named concrete bugs.

## Acceptance criteria

- `scripts/generate-dependency-graph.ts` (or an extension of it) mechanically reports a real call-site count per exported method across the whole monorepo, re-runnable on demand — not a one-time hand count.
- Every method with exactly one real call site outside its own package has an explicit, written disposition (keep/merge/inline/delete), not a silent pass.
- The `log_task` race condition (no transaction, no CAS, lost-update on concurrent calls) is fixed using the same atomic-SQL-append pattern `transitionTaskState` already establishes in the same file, closing the exact gap the AU19 audit found and left open.
- Every other concrete redundancy the AU19 audit already named (duplicate `getTeamMembersById`, duplicate `getUserById` reads across `context-assembly`/`session-lifecycle`, the `dispatch→work`/`dispatch→conversation` reads whose claimed freshness need was refuted) is resolved, not re-litigated from scratch.
- No externally-observable behavior changes except where a named bug is being fixed — a reduction in method count or calls, not a feature change.
- The full existing test suite passes unchanged (or is updated to newly cover a fixed race condition, e.g. a concurrency test for `log_task`).

## Validation scenarios

- Given the call-site-count script runs against the full monorepo, when its output is compared against a hand-spot-check of 5 known Services, then the counts match.
- Given `log_task` is called twice concurrently against the same task, when the fix lands, then no note is lost (a real concurrency test, not just a unit test of the happy path).
- Given a method previously flagged single-call-site, when its disposition is applied (merge/inline/delete), then every real caller is confirmed updated and the test suite stays green.
