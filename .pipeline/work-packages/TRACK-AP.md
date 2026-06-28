# Track AP: Overengineering Audit Cleanup

Source: the overengineering audit of 2026-06-24/25 — a multi-agent pass (15 subsystem auditors over all production code + architecture docs, then per-finding adversarial verification where an independent agent tried to find the justification for each flagged item). 68 raw findings → **19 adversarially-confirmed**, 47 judged justified, 2 uncertain. Full findings and rejection rationale live in `plans/overeng-audit/overengineering-audit.md` and `plans/overeng-audit/code-composition.md`.

This track records the **19 confirmed findings** as cleanup work packages, grouped by theme. The dominant theme was **infrastructure shipped without consumers** — well-built, fully-tested modules wired into nothing, stranded when a RED/scaffold phase landed the machinery but the integration step never happened. Secondary themes: single-implementation abstractions, dead computation in a live scoring path, and docs that outran the code they describe.

**Scope rules.** Every WP here is verifiable cleanup. No WP introduces new behaviour **except AP2**, which intentionally changes relevance-scoring weights (the founder should review that one most closely). `npm run verify` must pass after each WP merges; `npm run knip` (unused exports/files) and `npm run lint` are the primary nets for dead-code removal — a static codebase property is enforced by knip/lint, not by a runtime test (per CLAUDE.md). No WP introduces or reshapes a load-bearing noun (**Concept: Not required** across the whole track) and no WP has a rendered surface (**Design: Not required** across the whole track), so none parks for human design review.

**Sequencing.** All six WPs are independent (no inter-dependencies) and can be built in any order or in parallel. AP2 (fabric scoring) and AK9 (fabric Kernel-infra extraction) touch *different* parts of `packages/fabric` — scoring/Strategy vs Kernel infra — so they do not conflict and need no ordering.

**Out of this track.** The fabric package-cohesion split (Kernel infra leaving the Strategy package) is **AK9**. The deeper "what is a Strategy/plugin" question is a separate `/pipeline:refine`. The audit's Part-4 "bonus" items are **not overengineering** and are deliberately excluded here — most notably the **reviews-route regression** (a real DB-backed route silently reduced to a fixture in a cleanup commit), plus a stale propagation-log lore comment, three built-but-unwired design lint rules, and a `riskTier` column duplication. These should be tracked as correctness/bugfix work, not audit cleanup — flagged to the founder separately.

**Reference docs:** `plans/overeng-audit/overengineering-audit.md` (the confirmed findings, themed), `plans/overeng-audit/code-composition.md` (LOC composition by package and the fabric/db breakdowns).

---

### AP1 — Remove dead infrastructure that has no consumers

**Workpackage.** As a maintainer, I want the modules the audit confirmed are wired into nothing to be removed from the codebase, so the next person (human or agent) doesn't waste time reasoning about machinery that never runs, and so static-analysis nets (`knip`, lint) stop reporting it as live surface. Today five separate pieces of fully-built, often-tested infrastructure sit with zero production callers, each stranded when a scaffold/RED phase landed the code but the integration step never followed.

**Why this matters.** Dead infrastructure is worse than missing infrastructure: it reads as real, so agents extend it, lint rules reference it, and reviewers assume it's load-bearing. Concretely, an ESLint rule currently tells contributors that `validateBody()` "integrates with the response-validator" and flags `apiFetch` as "legacy" in favour of an `apiClient` that **nothing uses** — actively misleading guidance. The maintainer benefits directly (≈800 LOC + a dead 13.6k-line archive removed, less surface to understand). Cost of not removing: the codebase keeps accreting plausible-looking dead code and the misleading lint signals persist.

**What exists today.** Five confirmed-dead items: (1) **22 judge factory functions** in `packages/eval/src/judges.ts` with no callers since X8 (~550 LOC; two are exact duplicates of other judges); (2) the **response-validator middleware** (`packages/server/src/middleware/response-validator.ts`, ~117 LOC) never mounted in `app.ts`, with `registerResponseSchema()` never called outside tests; (3) the **prefetch write-path** in `packages/pipeline/src/brief.ts` (`writePrefetch`/`truncatePrefetch`, ~79 LOC) whose consumer hook was never registered in `.claude/settings.json` and which has no producer (its read side, `readPrefetch`, is live and stays); (4) the **typed Hono RPC client** `packages/web/src/api/client.ts` (~44 LOC) with zero callers — the promised `apiFetch`→`apiClient` migration never happened; (5) the **`packages/db/drizzle-sqlite-archive/` directory** (29 files, ~13.6k LOC) left over from the SQLite→PGLite migration (#139), referenced only in one guard-script ignore list, with no SQLite dependency anywhere in the repo.

**What's genuinely missing.** Nothing is missing — this is removal. The delta is the deletion of these five items plus the now-orphaned references to them (the misleading ESLint rule for the response-validator, the `apiFetch`-is-legacy lint message, and the guard-script ignore entry for the SQLite archive).

**Depends on.** None.

**Complexity.** M

**Pre-build gates.**
- **Concept:** Not required — pure removal; no nouns touched.
- **Design:** Not required — no rendered surface.

**Human design review.** No — deletion of backend/tooling code, no UI.

**Acceptance criteria.**
- The five confirmed-dead items no longer exist in the codebase, and `npm run knip` + `npm run lint` + `npm run check` report no references to them.
- `npm run verify` is green after removal, proving no production path depended on them.
- The lint guidance that referenced the removed modules (response-validator "integration", `apiFetch`-as-legacy) is corrected so it no longer points at deleted code.
- The prefetch read path (`readPrefetch`) still functions (returns gracefully when no prefetch exists); only the write/truncate side is removed.
- No production behaviour changes — the same API responses, the same eval scenarios pass.

**Validation scenarios.**
- Given the branch with these removals, when `npm run verify` runs, then it passes with no type, lint, knip, or test failures.
- Given the eval suite, when it runs, then every scenario that previously passed still passes (no scenario depended on a removed judge factory).
- Given a contributor reads the lint output, when they look for `apiClient`/response-validator guidance, then no rule points at a deleted module.

**Plan calls.** Backend/tooling cleanup — skip `/design`. Standard `/architecture` pass to confirm each item's caller-set is empty before deletion and to identify orphaned references; expect deletions plus small lint-rule/guard edits. Treat each item independently; a single item turning out to have a hidden consumer is a finding to surface, not a blocker for the others.

**Contracts / constraints.**
- Removal only — no behaviour change to any live path; `readPrefetch` semantics preserved.
- Verify the caller-set is genuinely empty before deleting each item (the audit confirmed this, but re-confirm against current `origin/main`).
- No weakening of lint rules to make removal pass — correct the misleading rules, don't disable them.

**Out of scope.** The fabric Kernel-infra extraction (AK9). Any item the audit judged *justified* (e.g. the gated `DockerSandboxAdapter`, `IsolatedHarnessAdapter`, `RemoteHarnessAdapter`, `EventBusAdapter`) — those are forward-infra, not dead, and must NOT be removed here.

**Effort.** M (~3h)

---

### AP2 — Repair dead-weight in relevance scoring

**Workpackage.** As a maintainer of the knowledge fabric, I want the relevance scorer to spend its weight budget only on signals that can actually fire, so that context assembly ranks knowledge items by signals that mean something rather than wasting half its weight on factors that are structurally guaranteed to be zero or unreachable. Today two of the relevance factors are dead in the live path yet carry 50% of the total scoring weight between them.

**Why this matters.** This is the highest-impact correctness item in the audit even though its blast radius is small. `computeTagMatch` carries the **highest weight in the formula (0.35)** but its only production input, `taskTags`, has been hardcoded to `[]` since B6 — so it returns 0 on every real call. `computeRoleMatch` (weight 0.15) has a partial-match (0.5) branch that is unreachable because items are pre-filtered by scope equality at fetch time. Together, **half the relevance weight is dead**, which means the *live* signals (recency, confidence, layer proximity, attention) are silently compressed into the remaining budget — the scorer is quietly mis-ranking. The maintainer and, downstream, every agent that receives assembled context benefits from ranking that reflects real signals. Cost of not fixing: context assembly keeps ranking on a budget that's half noise, and the dead knobs invite "tuning" that can't possibly help.

**What exists today.** `packages/fabric/src/relevance-scoring.ts` (`computeTagMatch`, `computeRoleMatch`, `scoreItem`) and the `ScoringContext` it consumes, fed at the single production callsite in `context-assembly.ts`. Weights are loaded from `factory_settings` via `scoring-config.ts` (the tuning infrastructure itself was judged justified — it stays). `scoreItem` is exported for acceptance tests (`relevance-scoring.integration.test.ts`) and stays exported.

**What's genuinely missing.** A relevance formula whose factors can all actually fire, with the freed weight (0.35 + the unreachable role-match branch) redistributed across the live signals so the composite is normalized and meaningful. The `taskTags` field and the unreachable role-match branch should be removed, not left as zero-valued knobs.

**Depends on.** None. (Independent of AK9 — scoring is Strategy and stays in `packages/fabric` regardless of the Kernel-infra extraction.)

**Complexity.** M

**Pre-build gates.**
- **Concept:** Not required — relevance/attention scoring nouns are settled in `docs/knowledge-architecture/relevance-and-attention.md`; this reshapes the *implementation* of an existing factor set, not the concept.
- **Design:** Not required — no rendered surface.

**Human design review.** No — backend scoring logic.

**Acceptance criteria.**
- The relevance score is computed only from signals that can fire for real inputs — no factor contributes a structurally-guaranteed-zero value, and no scoring weight is allocated to a dead signal.
- The unreachable role-match partial branch is gone; role affinity is expressed only where it can actually differ.
- The live signals' weights normalize to a coherent total (a maximal item scores at the expected ceiling; relative ranking of two items reflects only live signals).
- The change to ranking behaviour is captured by tests that assert the *new* intended ranking, and the reviewer can confirm the old dead-weight behaviour is gone by reverting the fix and seeing the test go red (no mock-validation).
- The `factory_settings` tuning path still works for the surviving weights — overrides take effect, invalid values fall back safely.

**Validation scenarios.**
- Given two knowledge items differing only in a live signal (e.g. recency), when they are scored, then the more-relevant one ranks higher by the expected margin (not diluted by a dead 0.35 weight).
- Given an item with maximal live signals, when it is scored, then it reaches the expected score ceiling.
- Given a `factory_settings` override for a surviving weight, when scoring runs, then the override changes the ranking as expected.

**Plan calls.** Backend scoring — skip `/pipeline:design`. Standard `/pipeline:architecture` pass; this intentionally **changes scoring output**, so the plan must define the new normalized weight set and the tests that pin the new ranking. Apply the mock-validation guard: the proof must exercise the real scoring path, and reverting the fix must turn a test red.

**Contracts / constraints.**
- Intentional behaviour change to relevance ranking — this is the point; document the new weight set in `docs/knowledge-architecture/relevance-and-attention.md`.
- The `factory_settings` tuning mechanism is preserved for surviving signals (it was judged justified).
- `scoreItem` stays exported for acceptance testing.
- Do not silently re-add the removed signals as zero-weight knobs — remove them; if tags/role-affinity are wanted later, they return with a real input source and an e2e proof.

**Out of scope.** Re-introducing task→tags derivation (a future feature with its own input source and proof). The attention-scoring 8-signal surface (audit "uncertain" U1) — a separate look. The relevance tuning infrastructure itself (justified — stays).

**Effort.** M (~4h)

---

### AP3 — Collapse single-implementation abstractions

**Workpackage.** As a maintainer, I want abstractions that promise polymorphism but only ever have one concrete shape to be collapsed to the concrete thing, so the code says what it means and a reader doesn't hunt for a second implementation that doesn't exist. Today three interfaces/unions model a choice that is never actually made at runtime.

**Why this matters.** A `T | U` union or an interface with one implementor is a standing invitation to look for the other case — it costs every reader the time to confirm the polymorphism is fake. None of the three carries its weight: the DB driver is fixed per profile at startup (no runtime choice), and the two desktop interfaces each wrap a single object literal. The maintainer benefits from code whose type structure matches its actual variance. Cost of not fixing: phantom flexibility that future changes have to keep satisfying for no reason.

**What exists today.** (1) The **PGlite/Postgres dual-driver** behind the `HyperIdleDb` union in `packages/db/src/connection.ts` + `profiles.ts` — dispatch is fixed per profile at startup, the schema is Postgres-only, and tests run PGlite-only, so no runtime driver choice exists. (2) `SafeCredentialsManager` in `packages/desktop/src/safe-credentials.ts` — an interface for one factory returning an object literal, no alternate impl. (3) `ServerHandleLike` in `packages/desktop/src/main.ts` — a restrictive subset of the real `ServerHandle`, used in one function that only calls `.dispose()`. (Note: `SafeStorageLike` in the same desktop area is justified by a real 5-test suite and must NOT be collapsed.)

**What's genuinely missing.** Each abstraction reduced to its single real shape: the DB profile selects its concrete driver directly without a runtime union; the two desktop interfaces inlined to their concrete return/parameter types.

**Depends on.** None.

**Complexity.** M

**Pre-build gates.**
- **Concept:** Not required — no nouns reshaped; type-structure simplification only.
- **Design:** Not required — no rendered surface.

**Human design review.** No — backend/desktop type cleanup.

**Acceptance criteria.**
- The DB layer selects its concrete driver per profile without a runtime union that implies a choice the system never makes, and both profiles (PGlite for tests/desktop, Postgres for server) still connect and run.
- The two single-implementation desktop interfaces are gone; the concrete types are used directly, and the desktop app still boots and disposes its server handle cleanly.
- `SafeStorageLike` is left intact (it has a real test contract).
- `npm run verify` is green; no behaviour change to DB connectivity or desktop lifecycle.

**Validation scenarios.**
- Given the PGlite profile, when the DB connects, then queries run as before; given the Postgres profile, when the server boots, then it connects as before.
- Given the desktop app, when it starts and then quits, then the server handle is created and disposed exactly as today.
- Given the code after collapse, when searched, then no single-implementation interface/union remains for these three (excluding `SafeStorageLike`).

**Plan calls.** Backend/desktop cleanup — skip `/pipeline:design`. Standard `/pipeline:architecture` pass to confirm the DB union truly has no runtime branch and to choose the concrete-type shape for the desktop inlines.

**Contracts / constraints.**
- No behaviour change to DB connectivity or desktop lifecycle.
- Both DB profiles remain supported — collapsing the union must not drop PGlite or Postgres support, only the false runtime-choice modelling.
- `SafeStorageLike` is explicitly preserved.

**Out of scope.** The other harness/sandbox adapters (`Docker`/`Isolated`/`Remote`/`EventBus`) — those have documented multi-impl futures and were judged justified.

**Effort.** M (~3h)

---

### AP4 — Drop unused parameters and config slots

**Workpackage.** As a maintainer, I want parameters and config fields that nothing reads to be removed, so a reader can trust that a declared input is actually used and so telemetry/config doesn't advertise capabilities that don't exist. Today several route factories accept dependencies they never use, a DB profile type carries deployment fields read only by tests, and an OTEL span declares attributes that are never set.

**Why this matters.** An unused parameter is a small lie that compounds: it implies the function emits events or reads a DB when it doesn't, and it forces callers to thread a dependency for nothing. The OTEL case is worse — six span attributes are declared but never set, and the explaining comment cites a plan file (`plans/token-efficiency-blocks.md`) that has never existed in git history, so a reader chasing the rationale finds nothing. The maintainer benefits from signatures and telemetry that mean what they say. Cost of not fixing: misleading signatures and dashboards that promise dimensions they'll never populate.

**What exists today.** (1) Unused `_eventBus` parameters on route factories in `packages/server/src/routes/search.ts`, `settings.ts`, and unused overloads/`_db` in `recipients.ts` — these factories emit no events. (The `coach.ts` `_eventBus` is justified by lore L21 and stays.) (2) `sandboxAdapter`, `requiresDockerCompose`, and `ports` in `packages/db/src/profiles.ts` (`ProfileDefaults`) — ~half the type, read only in test assertions; Docker detection and ports are hardcoded elsewhere. (3) Six `HYPERIDLE` span attributes in `packages/pipeline/src/otel.ts` (`storyComplexity`, `storyPattern`, `phase`, `replanCount`, `toolCallsParallel`, `cacheHitRatio`) that are declared but never set, with a comment citing a non-existent plan file.

**What's genuinely missing.** Signatures and config that declare only what is actually used: the unused route-factory params removed, the prod-unread topology fields removed from the DB-package profile type (deployment topology doesn't belong in the db package), and the six never-set OTEL attributes removed (to return when the instrumentation that sets them ships).

**Depends on.** None.

**Complexity.** S

**Pre-build gates.**
- **Concept:** Not required — no nouns reshaped.
- **Design:** Not required — no rendered surface.

**Human design review.** No — backend signature/config cleanup.

**Acceptance criteria.**
- No route factory declares a dependency parameter it does not use (excluding the lore-justified `coach.ts` `_eventBus`), and all affected routes behave identically.
- The DB-package profile type no longer carries deployment-topology fields that production never reads; the profile still resolves its driver and URL correctly.
- The pipeline OTEL span declares only attributes that are actually set; the misleading comment citing the non-existent plan file is gone.
- `npm run verify` is green; no behaviour change.

**Validation scenarios.**
- Given the affected routes, when they handle requests, then responses are unchanged from before the parameter removal.
- Given each DB profile, when it resolves, then the correct driver + URL are produced without the removed fields.
- Given the pipeline emits a span, when its attributes are inspected, then every declared attribute has a real value and none is a permanently-unset placeholder.

**Plan calls.** Backend cleanup — skip `/pipeline:design`. Standard `/pipeline:architecture` pass; confirm each parameter/field/attribute is genuinely unread in production (tests-only reads count as unread for production purposes) and decide where the DB topology fields move if still needed by tests.

**Contracts / constraints.**
- No behaviour change to routes, DB resolution, or emitted telemetry values.
- Preserve the lore-justified `coach.ts` `_eventBus`.
- Deployment-topology concerns must not live in the `db` package — relocate rather than retain if a test genuinely needs them.

**Out of scope.** The full OTEL/observability strategy (a separate concern). Any parameter that *is* read in production.

**Effort.** S (~1h)

---

### AP5 — Web cleanup: duplication and an over-built hook

**Workpackage.** As a maintainer of the web app, I want a duplicated helper consolidated and a speculative hook right-sized to its single real caller, so the web layer carries one source of truth for shared helpers and doesn't maintain machinery (caching, retries, six host kinds) for a breadth that doesn't exist yet. Today one helper is copy-pasted across components and one hook is built for a generality it never reached.

**Why this matters.** Duplication drifts: an `initialsOf` copy that diverges from the canonical one produces subtly different avatars in different places. And an over-built hook (session-lifetime cache, retry/degraded states, six host kinds with only two implemented, and a known field-name bug) costs maintenance for a single out-of-scope caller. The maintainer benefits from one helper and a hook scoped to reality. Cost of not fixing: silent divergence and dead branches that the next feature has to reason around.

**What exists today.** (1) A duplicate `initialsOf` in `packages/web/src/components/ConversationSurface.tsx` that already exists, exported, in `PartList.tsx` (`SessionView` imports the canonical one correctly). (2) `packages/web/src/hooks/useBlockResolution.ts` (~186 LOC) with one caller (`AssistantOverlay`, out-of-scope post-AM1), a session-lifetime cache, retry/degraded states, six host kinds with only two implemented, and a field-name bug (`pitch` vs `description`).

**What's genuinely missing.** A single shared `initialsOf` used by all consumers, and a `useBlockResolution` sized to what its one caller actually needs (or inlined into that caller), with the field-name bug fixed if the hook survives.

**Depends on.** None.

**Complexity.** S

**Pre-build gates.**
- **Concept:** Not required — no nouns reshaped.
- **Design:** Not required — no rendered surface; the rendered output is unchanged (same initials, same resolved blocks).

**Human design review.** No — internal web refactor, no visual change intended.

**Acceptance criteria.**
- There is one `initialsOf` helper; all components that render initials use it, and the rendered initials are unchanged.
- `useBlockResolution` matches its single caller's real needs — unimplemented host kinds and unused states are removed (or the hook is inlined into its caller), and the `pitch`/`description` field-name bug is fixed.
- `npm run verify` is green and the design-system/web snapshot net shows no unintended rendering change.

**Validation scenarios.**
- Given a component that renders avatars, when it renders, then the initials match the previous output (snapshot unchanged).
- Given the single consumer of `useBlockResolution`, when it resolves a block, then it gets the correct field (description, not the buggy `pitch`) and the previously-dead branches no longer exist.
- Given `npm run verify`, when it runs, then it is green.

**Plan calls.** Web cleanup — skip `/pipeline:design` (no visual change intended; the snapshot net guards against drift). Standard `/pipeline:architecture` pass to decide inline-vs-keep for the hook based on its single caller.

**Contracts / constraints.**
- No visual change — the snapshot net must show no unintended diff; if a diff appears it is reviewed and re-blessed only if intended.
- Fix the field-name bug as part of right-sizing (don't preserve a known bug).

**Out of scope.** Redesigning `AssistantOverlay` or the assistant surface (post-AM1, separate work).

**Effort.** S (~1.5h)

---

### AP6 — Reconcile architecture docs with shipped code

**Workpackage.** As a reader of the architecture docs (a contributor, a new agent, or the founder), I want the docs to describe the system that actually exists, so I can trust them as ground truth instead of discovering they describe an aspirational or superseded design. Today three doc areas contradict the code: a component-budget rule contradicts itself, the five-layer knowledge model documents layers the code simplified past, and a five-shape artifact spec was superseded by a six-kind open vocabulary that the docs never rolled back.

**Why this matters.** Docs that outrun code are a trap: an agent reads `the-five-layers.md` (~50KB) and builds for L0–L2 layers that are scaffolding or not even loaded; a contributor reads two `ui-design` docs that disagree on whether a component-count ceiling exists; the artifact spec still presents a closed five-shape enum while the API moved to a six-kind open vocabulary (AE6), and the code still special-cases an old shape. The reader benefits from docs that match reality. Cost of not fixing: every reader re-derives the truth from code, which is exactly what the docs are supposed to prevent.

**What exists today.** (1) `docs/ui-design/component-budget.md` ("No strict count enforced") vs `component-tree-at-a-glance.md` ("Adding a 20th needs a written reason") — a direct contradiction; the ceiling is not enforced (components were added without an RFC) and counts are stale. (2) `docs/knowledge-architecture/the-five-layers.md` — a fully-designed five-layer (L0–L4) model where only L3+L4 are active, L2 is read-mostly, and L0/L1 are scaffolding (L1 isn't loaded into context assembly). (3) `docs/human-interface-layer/the-three-views-the-rail.md` §4.1 — a five-shape artifact spec (`text_diff` etc.) superseded by the six-kind open vocabulary (AE6); `ARTIFACT_VIEW_SHAPES` is still a closed enum at the API boundary, contradicting the open-vocabulary promise, and `part.ts` still special-cases `text_diff`.

**What's genuinely missing.** Docs aligned with the shipped system: one coherent position on the component budget (enforced-in-CI or dropped, with current counts); the knowledge-layer doc marking L3+L4 as the live model and L0–L2 as forward infrastructure; and the artifact spec rewritten to the six-kind model with the closed-enum/open-vocabulary contradiction reconciled at the API boundary and test fixtures migrated off the old shape names.

**Depends on.** None.

**Complexity.** M

**Pre-build gates.**
- **Concept:** Not required — describing the *existing* model; not reshaping a noun. (If reconciling the artifact enum/open-vocabulary boundary surfaces a genuine concept question, that is a finding to raise, not in-scope to decide here.)
- **Design:** Not required — docs + a small API/type reconciliation, no rendered surface.

**Human design review.** No — documentation and a type/enum reconciliation.

**Acceptance criteria.**
- A reader of the `ui-design` docs gets one consistent answer on whether a component-count ceiling exists, and the stated counts match the actual component set; if a ceiling is kept, it is enforced rather than asserted.
- A reader of the knowledge-layer doc understands which layers are live today and which are forward infrastructure, matching what the code actually fetches and loads.
- The artifact documentation describes the six-kind open vocabulary that ships, and the closed-enum-vs-open-vocabulary contradiction at the API boundary is resolved consistently (the doc, the boundary type, and the special-cased code agree); test fixtures use current kind names.
- `npm run verify` is green (the artifact reconciliation touches code/types/fixtures, not just prose).

**Validation scenarios.**
- Given the two `ui-design` docs, when read together, then they state the same rule on the component budget with no contradiction.
- Given the knowledge-layer doc and the context-assembly code, when compared, then the doc's "live" layers match what the code fetches/loads.
- Given the artifact spec, the boundary enum, and `part.ts`, when compared, then all three agree on the kind model and no old shape name remains in fixtures.

**Plan calls.** Mixed docs + light code reconciliation — skip `/design`. Standard `/architecture` pass for the artifact enum/open-vocabulary reconciliation (it touches `shared`/`server` types + fixtures); the `ui-design` and knowledge-layer items are primarily `/write-docs` work. If the budget item is kept as a rule, plan its CI enforcement; if dropped, remove the claim.

**Contracts / constraints.**
- Docs must describe the shipped system, not an aspiration — where a design is forward-looking, mark it as such rather than presenting it as current.
- The artifact reconciliation must keep one coherent model end-to-end (doc ↔ boundary type ↔ code) — no new divergence.
- Do not silently delete the forward-looking knowledge-layer design; relabel it as forward infrastructure (git history + intent preserved).

**Out of scope.** Actually building the inactive knowledge layers (L0–L2). Redesigning the artifact system. Changing the component set to fit a budget (this WP reconciles the *rule and the docs*, not the components).

**Effort.** M (~3h)
