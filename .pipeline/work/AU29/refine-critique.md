# AU29 — Refine critique

Reviewed `.pipeline/work/AU29/requirements.md` against `.pipeline/work/AU29/plan.md` (authority),
grounded in the live tree at `bbe82e9a` (`governance/*.json`, `scripts/lib/governance-model.ts`,
`scripts/lib/governance-attacks.ts`, both applications' boot paths, every claimed consumer set) and
`.pipeline/work/AU28/founder-rulings.md`. A live `governance-lint` run reproduced the artifact's
census. Verdict at the bottom.

## Verification of the load-bearing claims

**Census and §7 group inventory — exact.** Live lint: 221 production + 67 development known
violations, 38 baseline groups; the `db:unknown` NOTE lists exactly the 4 symbols with the reasons
§2/§3.4 state (`readSystemPromptTemplate`, `readSystemPromptTemplateForRole`,
`SYSTEM_PROMPT_TEMPLATE_FILES` — module unmapped; `seed` — "not present in the database package's
re-export list"). Every §7 count matches `governance/baseline.json` site-by-site: 1+6+1+2+15+2+2+1 =
30 production, 1 development. (The lint run here showed 12 `no-stale-build-artifacts` errors, all
from untracked local `scripts/lib/*.js|.d.ts` files in this checkout — machine state, not repo
state; the "runs green" claim holds for the committed tree.)

**Consumer sets — real and complete.** `escapeLikePattern`: exactly the 7 claimed files (4 service,
3 `core-api` route), nothing else. `resolveProfile`/profile types: only
`applications/remote-server/src/create-server.ts` (import at :77, use at ~:417) and `setup-cli.ts`;
repo-wide grep for `DbDriver`/`SandboxAdapterKind`/`ResolveOptions`/`ProfileDefaults` finds no other
namer. `resolveAgentScaffoldSpecs`: the 3 route files + `tool-definitions.ts:22,1037,1132`, with
`ports.ts:50-60` documenting the deliberate leaf import, as claimed.
`readSystemPromptTemplateForRole`: `agents.ts:32` is a real external production consumer.
`system-prompt-templates.ts` imports only `node:fs`/`node:path` — zero SQL, schema, or connection.

**"Only legal home is `framework/shared`" — holds under the enforced registries.** For the
dual-audience symbols (a `core-api` route file AND an `agent-orchestration` service),
`architecture.json` leaves exactly two `reach: everyone` targets; AC 2 excludes `db`. `api-contract`
(`reach: [layer]`) excludes the service; `design-system` excludes both; homing in a `core-api`
service would make `tool-definitions.ts`'s import a forbidden cross-layer service reach (clause 9).
A new framework package is possible but is a registry/audience decision — the artifact says so
rather than hiding it. The `setup-cli`-as-tooling argument also checks out: clause 9's
`acrossFromARoot` branch requires `target.role === "layer"`, so tooling → application is
`forbidden` — a tool cannot import `remote-server` for the deployment defaults.

**`seed` phantom — confirmed.** `framework/db/src/index.ts` exports `seedDemoWorld`, never `seed`;
`applications/desktop/__tests__/migrate.test.ts:28-36` mocks a `seed` into `@hyperidle/db` and
:63-69 destructures it back out. The assertion protects against a function that cannot exist.
Fixing the test is required by AC 1's letter (zero `db:unknown` symbols), so the one development
entry in §7 is AC-derived, not scope creep.

**First boot — the highest-consequence claim is true.** `applications/desktop/src/main.ts`
(~:449-456) is the only production-process caller of `applyFactoryBootstrap` in the repo (grep over
applications/layers/framework/tools/deploy; the only other callers are integration tests and
`__testing__/seed-pg-cli.ts`). `applications/remote-server/src/index.ts` goes straight to
`createServer` — no bootstrap. The Helm chart (`deploy/chart/values.yaml:30-35`) runs only the
`migrate-pg.ts` init-container; `bootstrap-pg.ts`'s "second init-container" doc comment is unwired
aspiration, and `docs/deployment/shared-backend.md:70` records the gap, exactly as §3.5 states.
`deploy/bin/setup:6` and the root scripts (`setup`, `db:seed:pg`, `db:bootstrap:pg`) are the cited
repoint sites.

**Legality lattice (§4) — every leg verified against `governance-model.ts`.** Clause 2 allows only
tooling or the owner on a table target; applications and composition roots are forbidden, and an
unowned table "has no legal accessor". The baseline generator refuses new groups and raised counts
(README), and the plan's no-re-key contract closes the `--adopt` loophole. One stronger consequence
the artifact implies and the baseline confirms: desktop `main.ts` cannot even take direct service
imports for the bootstrap — `application → service [import]` is a baselined group and a new
`main.ts` site would raise it — so "behind their layers' public faces" is not a preference, it is
the only landing shape. The `agentRunConfig` feasibility flag is real:
`writeAgentRunConfig` (`agent-run-config-store.ts:121`) fills absent insert fields from
`DEFAULT_AGENT_RUN_CONFIG` while the bootstrap's `upsertRunConfig` (`factory-bootstrap.ts:33-55`)
inserts nulls — row-identity under AC 7 genuinely needs architecture-time verification, and the
fallback is correctly parked as an explicit plan amendment, not a silent decision.

**§3.7 (`framework → layer [di]`) is AC 5's letter, not scope creep.** AC 5: "Every `framework → *`
… production entry is gone." The baseline group `framework → layer [di] production`
(`tool-provider-bindings.ts:65`, `toolsForRoleShared(allToolDefinitions, role)`) is literally such
an entry. The plan prose failed to enumerate it; the requirement is right to pull it in and right to
say so explicitly. `toolsForRole` at `tool.ts:398-403` and the second caller
(`harness-registry/src/tool-registry.ts:70`) confirmed.

**Bus sites (§3.6) — confirmed.** `reportAdmissionFailure` consumers are exactly the two sibling
services; its own doc comment (:40-51) records why it sits in `shared`. The dispatcher's only
production wiring is `layers/core-api/src/observability-runtime.ts`; `bus.on("*")` at
`dispatcher.ts:473`. Clause 4 (`publish-anyone-but-the-bus-host`) permits any non-framework
publisher, as claimed. Event-type declarations staying is grounded in
`architecture.json` `eventBus.typesModule`.

**Founder-ruling alignment.** Ruling 12.3's own follow-up list names these exact moves (db:util out
of `db`, system-prompt templates out of `db`, dispatcher out of `shared`); Ruling 12's
end-state-never-migration discipline is respected throughout (no shims, surface entries deleted not
emptied); Ruling 7 grounds the CLI-as-tooling path. §5's registry consequences are real:
`decided-rules.json` holds 3 `db:util` + 3 `db:bootstrap` rows; the attack table's
`reexport-narrow-surface` case overlays `escapeLikePattern` and a deep-import case uses
`readSystemPromptTemplate` — both break on the move, so the §5 warning is earned. `shared` has zero
`fs.readFileSync` in production code today, as claimed.

**Scope discipline.** Nothing crosses the declared out-of-scope areas: table-ownership work is
deferred (the one fallback is amendment-gated), the shared split is deferred with the audience
question named honestly, the 10 framework/db test-write sites are untouched, and the deploy-chart
gap is explicitly not closed. AC 7's widening to include `agentRunConfig` rows is a justified
reading of "the same state it produces today" (factory-bootstrap writes that table), not new scope.

## BLOCKING

None.

## NON-BLOCKING DEFECTS

1. **§6 miscounts the legal `db:util` service importers.** "the three service files whose `db:util`
   imports are legal today" — there are five: `knowledge-repository.ts`, `user-store.ts`,
   `work-service.ts`, `dependency-watcher.ts` (all `escapeLikePattern`) and
   `tool-definitions.ts` (`resolveAgentScaffoldSpecs`). §3.1/§3.3's own enumerations are correct,
   and §6's governing sentence ("every consumer import of every moved symbol") covers all of them,
   so no work is lost — but the count is wrong as written.
2. **§3.3 misattributes a `SYSTEM_PROMPT_TEMPLATE_FILES` consumer, hiding a second knip risk.**
   `agents.ts:32` imports only `readSystemPromptTemplateForRole`; `SYSTEM_PROMPT_TEMPLATE_FILES`
   appears there only in a comment. Post-move, `SYSTEM_PROMPT_TEMPLATE_FILES`'s consumers are the
   module itself plus the relocated tooling bootstrap — the same `knip:production` exposure §8 flags
   for `readSystemPromptTemplate` applies to it symmetrically. §8's general sentence ("no moved
   export may end up consumed only by tests or tooling") covers the class; the named enumeration
   misses this symbol.
3. **§3.7 lists `mcp/mcp-bridge.ts` as a `toolsForRole` caller; line 141 is a comment, not a call.**
   The real second caller is `harness-registry/src/tool-registry.ts:70`. Harmless to the settled
   direction.

## FOLLOW-UP / NOTES

- **The referenced worktree is not a git worktree.** `/Users/tg/hyperidle/.worktrees/pipeline-AU29`
  contains only `.pipeline/work/AU29/requirements.md`; branch `pipeline/AU29` exists at `bbe82e9a`
  with zero commits, and neither `plan.md` nor `requirements.md` is committed on it. The artifact's
  claims all reproduce against `bbe82e9a`, so this does not undermine the content — but the build
  phase must start from a real checkout of the branch and commit the pipeline artifacts (this has
  bitten before: plans sitting uncommitted through a whole WP).
- §7's "~30" vs the track registration's "~31": the exact sum is 30. Both are within their tildes.
- §8's "110 assertions": ~117 `expect(` calls across the six named suites — right order, all six
  files exist where claimed.
- §9's path-accuracy sweep should not be read as a complete inventory: besides the two deployment
  docs, `docs/guides/developer/commands.md:10`, `docs/guides/developer/getting-started.md:50`,
  `docs/deployment/laptop.md:8`, `docs/deployment/self-hosting.md:30,42` and
  `docs/agent-layer/agent-model.md:53` also cite `framework/db/src/` paths that move. The
  DOC-CLASS: update classification itself is right.
- The §3.5 "one source of truth" requirement is a derived constraint, not a plan AC — it serves
  AC 7's both-paths row-identity and correctly leaves the mechanism to architecture; carrying it as
  binding is reasonable, just know its provenance.
- Landing five modules in `framework/shared` grows the package the shared-split successor exists to
  shrink; the artifact defends this correctly (only legal home under the current registries,
  audience narrowing is that WP's deliverable), but that WP's measured module census will shift.

## VERDICT

**PASS** — no blockers. The artifact settles the three open destinations with verifiable,
registry-grounded reasoning, adds no outcome the plan does not own, keeps every declared non-goal
out, and its three factual slips (above) do not change any settled direction.
