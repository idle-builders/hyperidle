# AU36 Architecture — reach moves into the connections domain

Base: worktree `.worktrees/AU36`, branch `feat/AU36-reach-permissions`, `origin/main@58b2877a`.
Every citation below verified in this tree. Authorities: `plan.md` (outcomes/ACs), `requirements.md`
(APPROVED — settles noun, destination, four-probe scope), `.pipeline/AU.md`, `.claude/rules/typescript.md`,
`.claude/rules/testing.md`, `tools/governance/README.md`. Feasibility evidence: `feasibility.md`.

---

## 1. AC-to-obligation mapping

| AC | Obligation | Where proven |
|---|---|---|
| AC1 — reach answerable without harnesses; descriptor carries no reach field | Delete `HarnessCapabilityDescriptor.inheritedTools` + `InheritedToolDescriptor` from `framework/harness-capability`; GET /api/connections path reads only connections-domain state (§4). Type system enforces: after deletion, adding any reach field to the descriptor requires editing the framework type — a visible reviewable act (plan validation scenario 3 asks exactly for "review or the type system"; no new lint guard) | `npm run check` + review; service integration test asserts GET path works with zero harness handle |
| AC2 — harness change A→B→A leaves reach identical, proven by exercising both | Reach is machine/user state, never keyed by agent or harness. Exercised in the service-lane wiring test: seed reach facts, GET, switch an agent's `users.harnessType` A→B→A, GET after each step, assert byte-identical response (§7 E2E piece) | `AU36-reach-wiring.integration.test.ts` (service lane) |
| AC3 — Connections view unchanged, verified on the rendered surface | Same services/states/grouping/order: projection output shape unchanged (`id`, `via`, `authSource`, `health`, `removable` values preserved exactly, §4 D6); re-probe moments (boot + redetect) keep refreshing with identical observable effect (§4 D4/D5). Verified by manual rendered-surface check on this machine (§7) + service test asserting exact view JSON | Manual check + service lane |
| AC4 — probe never obtains a token value | AN1 hard-rule 4 survives the move: `gh auth status --json hosts` never `--show-token`; MCP-config probes parse names/keys only; identity-only type shape (no secret/token/env/command field) re-declared in `framework/domain-model/src/connection.ts` and pinned by the translated AN1 type test + the moved real-binary test's `assertIdentityOnly` | Unit + harness lane |
| AC5 — `npm run verify` green; first boot on logged-in GitHub CLI detects exactly as today | Boot-time probe preserved: `bootAgentOrchestration` awaits the initial reach refresh when the Application enables it (topology `local` — desktop always, §4 D4). `gh` present + logged in on this machine (feasibility.md) — manual rendered check shows GitHub in the Inherited group, `working`, not removable | `npm run verify` + manual check + harness lane (`requireBinary("gh")`) |

## 2. Reused behavior and the actual change boundary

**Reused verbatim (behavior-preserving relocation, not rewrite):**
- The four probes: `inspectClaudeTools` (`harness-discovery.ts:844`), `inspectCodexTools` (:943),
  `inspectOpenCodeTools` (:1014), `inspectInheritedTools` (:1067) — same argv, same parsing, same
  degrade-to-`[]` error handling, same `INHERITED_PROBE_TIMEOUT_MS = 5_000`, same AN1 lore comments.
  They carry their small CLI-runner helpers with them (see D1) — a deliberate ~50-line duplication,
  because `runCommand`/`stripAnsi`/`failedCommandResult` are also used by the harness-family probes
  that stay, and no cross-layer sharing is legal (§3).
- The projection's output contract: `authSource:"inherited"`, `removable:false`, `id: inherited:<source>:<name>`,
  `via: "<source> · <name>"`, health `unknown→working` / explicit `needs-attention` kept, first-wins
  dedup by service name (`service-connection-projection.ts:34`).
- GET /api/connections response assembly order: inherited first, then held rows (`routes/connections.ts:221`).
- Everything about held connections (store, resolver, encryption, SSRF guards, rate limits) — untouched.
- Harness discovery's real job (readiness, version, auth state, models, runtime caps) — untouched;
  `discoverLocalHarnesses` keeps its five family probes.

**The change boundary:** the inherited half of AN1's connection concept gets its own source, cache, and
trigger inside `layers/agent-orchestration/connections`; the harness descriptor loses the reach field;
the two composition roots wire the boot and redetect moments to the new owner. Nothing else moves.

## 3. Governance: the legal ownership path

Machine-enforced rules (`tools/governance/README.md`): a layer imports only itself or framework; a
layer's `exports` map is its public face; cross-layer wiring happens only at composition roots
(the Applications + `createTestApp`, the two sanctioned composition sites, `test-utils.ts:50-63`).

- Probes today: `layers/agent-execution/harness-registry` (agent-execution layer). Destination:
  `layers/agent-orchestration/connections` (agent-orchestration layer). **agent-execution can never
  import connections and connections can never import agent-execution** — therefore:
  - the probe code MOVES (no shared module, no cross-layer call);
  - `discoverLocalHarnesses` stops running/merging the four probes (it may not call into connections);
  - the boot and redetect triggers reach the relocated probes ONLY through composition-root wiring (D4/D5).
- New/changed package edges, all already-legal directions: `connections → domain-model` (existing dep),
  `agent-orchestration layer src → @hyperidle/connections` (existing, `boot.ts`/`app.ts` already do it).
  One edge REMOVED: `connections → @hyperidle/harness-capability` (projection no longer reads the
  descriptor type; drop the dependency from `connections/package.json`).
- No new framework surface: the fact type lands in `framework/domain-model/src/connection.ts` —
  the AN1 connection-concept module, `everyone` audience, already imported by connections.
- core-api's harness routes receive a plain `() => Promise<void>` callback — no cross-layer type import.
  Applications forward the orchestration boot handle structurally — no new import there either
  (same idiom desktop's create-server already uses for `createWorkerAdapter`, :258-266).

## 4. Locked decisions (irreversible / public / cross-cutting)

**D1 — Probe destination and cache ownership: `@hyperidle/connections`.** New module
`src/inherited-reach.ts` (builder may split files) containing: the four probes moved verbatim;
their runner helpers (`stripAnsi`, `failedCommandResult`, a `runCommand` copy with the 15s command
timeout + injected-run/env/cwd seam shaped exactly like today's `HarnessProbeDeps` minus
`fetchModels`); and the cache. Public entry (exported from the package barrel):
`createInheritedReach(): InheritedReach` with
`InheritedReach = { refresh(deps?): Promise<void>; list(): readonly InheritedConnectionFact[] }`.
`refresh` runs the four probes concurrently (as `discoverLocalHarnesses` does today), assembles facts
in the fixed source order of D6, and atomically swaps a frozen snapshot (the `AdapterPool.discoveries`
pattern, `adapter-pool.ts:57-92`). No DB, no timers, no background work. All probe errors degrade to
`[]` exactly as today — `refresh` never rejects.

**D2 — The fact type: `InheritedConnectionFact` in `framework/domain-model/src/connection.ts`.**
`{ readonly name: string; readonly kind: "mcp-server" | "cli"; readonly source: string;
readonly health: ConnectionHealth | "unknown" }`. Field renamed `harness` → `source`; the VALUES are
unchanged (`"claude-code" | "codex" | "opencode" | "environment"`) because view `id`/`via` are built
from them and the view must stay byte-identical. Identity-only invariant re-pinned here: no secret,
token, env, or command field may ever appear (AN1 hard-rule 4). `InheritedToolDescriptor` is deleted
from `framework/harness-capability` (type + `index.ts:15` re-export) — no compat alias.

**D3 — Descriptor deletion (no compat field, no dual-write).**
- `HarnessCapabilityDescriptor.inheritedTools` removed (`harness-capability-descriptor.ts:156`).
- The four writes removed (`harness-capability-descriptors.ts:159,187,208,238`).
- `HarnessDiscoveryInput.inheritedTools` removed (`harness-discovery.ts:258`); `discoverLocalHarnesses`
  drops the four probes from its `Promise.all` and the merge (:1121-1154) — its stale `describeRegisteredHarness`
  lore comment (:1144-1147) goes with it (the symbol no longer exists in the tree).
- `AdapterPool` needs NO edit — it stores discovery inputs generically.

**D4 — Boot trigger.** New face option `AgentOrchestrationBootOptions.probeInheritedReach?: boolean`.
`bootAgentOrchestration` ALWAYS builds the reach cache; when the option is true it AWAITS the initial
`refresh()` before returning (facts cached by serve time, exactly as today when `createLocalAdapterPool`
awaited discovery). Applications pass `deps.topology === "local"` — desktop is always `local`
(`boot-server.ts:38`); remote-server passes its own `deps.topology`, preserving today's behavior where
a `disabled`-topology deployment shows no inherited group until its first redetect (today's
`AdapterPool.refresh()` is unconditional, so redetect populates even there — D5 mirrors both facts).
The now-purposeless `AgentOrchestrationBootOptions.adapterPool` option (boot.ts:170-175, exists solely
for the inherited projection per its own doc) is DELETED from the face and from all call sites
(desktop create-server.ts:250, remote-server create-server.ts:363).

**D5 — Redetect trigger.** core-api face gains `AppOptions.onHarnessRedetect?: () => Promise<void>`;
`createHarnessRoutes(pool, db, onHarnessRedetect?)` (harnesses.ts:117); the POST /redetect handler
awaits `Promise.all([refreshHarnessDiscoveries(pool), onHarnessRedetect?.()])` BEFORE responding —
identical observable effect to today (response returns after all probes completed). The existing
dedicated rate limiter (1 req/5s, harnesses.ts:124) already bounds the combined probe cost — the reach
probes add three config-file reads + at most one `gh` exec with a 5s timeout; no new limiter.
Applications wire `agentOrchestration.inheritedReach.refresh` using the EXISTING deferred-binding
closure pattern (desktop create-server.ts:192-210 — `bootCoreApi` runs before `bootAgentOrchestration`,
same construction cycle as the transports). `createTestApp` (core-api `__testing__/test-utils.ts`,
the second sanctioned composition site) wires it identically.

**D6 — Projection input change and display order.** `projectInheritedConnections` keeps its name;
signature becomes `(facts: readonly InheritedConnectionFact[]): ServiceConnectionView[]`; it flattens
in input order with first-wins dedup by name and the unchanged id/via/health/removable construction.
`refresh` assembles facts in the fixed source order `[claude-code, environment, codex, opencode]`.
Verified against today's descriptor enumeration (registered adapters in insertion order
[claude-code, cursor-agent, builtin, codex, opencode] then missing families in KNOWN order,
`adapter-pool.ts:584-628` + `harness-capability-descriptors.ts:216`): this fixed order reproduces
today's display order for every configuration whose non-empty sources include the claude binary OR
exclude a project `.mcp.json` — i.e. all real cases except one documented edge (no `claude` binary but
a project `.mcp.json` present alongside other non-empty sources, where today listed the claude facts
after `environment`). In that edge the service SET and every health remain identical; only ordering of
inherited entries can differ. Known, accepted, recorded here — reproducing it exactly would require
reach to read harness registration state, the very coupling this WP removes.

**D7 — Route.** `createConnectionRoutes(db, inheritedReach?: InheritedReach)` — the
`HarnessCapabilityReader` parameter and the `harnessCapabilityDescriptors` read go away
(routes/connections.ts:208-222). GET returns `[...projectInheritedConnections(inheritedReach?.list() ?? []), ...storedViews]`.
Absent cache (kernel-only/bare test apps) → empty inherited group, exactly as today's absent-pool case
(app.ts:43-49 doc). `createAgentOrchestrationApp`'s `adapterPool` option is replaced by
`inheritedReach?: InheritedReach` (boot always supplies it; the orchestration layer's own test fixture
builds the app bare and inherits the empty-group behavior).

**D8 — Naming lock summary.** `InheritedConnectionFact` (domain-model), `createInheritedReach` /
`InheritedReach` (connections), `probeInheritedReach` (orchestration boot option), `onHarnessRedetect`
(core-api option), `source` (fact field). Everything inside a function body, helper layout within
`inherited-reach.ts`, and file splitting are builder's choice.

## 5. Changed failure behavior (production tier)

- **Boot:** probes degrade to `[]` on any error (missing binary, timeout, malformed config) — unchanged.
  `refresh` cannot reject, so the awaited initial probe cannot fail boot; worst case is an empty
  inherited group, as today when a probe failed inside `discoverLocalHarnesses`.
- **Redetect:** `onHarnessRedetect` cannot reject for the same reason; if a future wiring error DID
  reject, the handler 500s — the same failure mode `refreshHarnessDiscoveries` rejection has today.
  Rate limiting unchanged (D5). GET never re-probes per request — unchanged (routes lore, :205-207).
- **Remote/`disabled` topology:** no boot probe; redetect populates — byte-identical to today's
  `new AdapterPool()` + unconditional `pool.refresh()` behavior (§4 D4/D5).
- **Concurrency:** snapshot swap is atomic single-thread assignment of a frozen object — the documented
  `AdapterPool.discoveries` pattern; a GET during a refresh reads the previous complete snapshot.

## 6. Security reasoning for the surfaces touched

- **The probes (moved, not changed):** execute external CLIs via `execFile` with FIXED argv arrays —
  no caller-controlled argument reaches a command line, so no injection vector is introduced or moved.
  They read user config files (`.mcp.json`, `~/.codex/config.toml`/`$CODEX_HOME`,
  `$XDG_CONFIG_HOME/opencode/opencode.jsonc`) extracting NAMES/KEYS ONLY — never env/command/url/token
  values. `gh auth status --json hosts` is never passed `--show-token` (AN1 hard-rule 4); the response
  shape carries host + account metadata only. The identity-only type shape (D2) keeps this enforced at
  the type level in its new home. Abuse case considered: a malicious harness config cannot influence
  HyperIdle state through these probes — names surface as display strings in the Connections view of
  the same user who owns the machine/files; there is no cross-user path (inherited is per-machine and
  the deployment's users share the machine by definition, unchanged scoping per requirements §5).
- **Redetect endpoint:** already rate-limited 1/5s per identity precisely because it spawns CLI probes
  (harnesses.ts:30-33,124); the four reach probes now run inside that same bounded handler — no new
  amplification surface, no new endpoint, no new input.
- **GET /api/connections:** unchanged — auth required, userId-scoped, never returns secrets; inherited
  views carry identity only.
- **Untouched surfaces (stated plainly):** held-connection encryption/storage/resolver, the SSRF guards
  (validate endpoint + spawn-time check), filesystems and filesystem-mounting, the MCP bridge auth, the
  credential catalog, agent provisioning. This WP adds no state-changing endpoint, no untrusted input
  path, no outbound request, no credential handling.

## 7. Verification — existing lanes only

**Red-first per AGENTS.md:** translated/new tests written before implementation.

1. **Unit (`*.test.ts`, fast lane):**
   - Probe behavior tests MOVE from `harness-discovery.test.ts` (the claude suffix/precedence/duplicate/
     symlink/malformed cases :125-455, codex/opencode/gh parse cases) into connections `__tests__`,
     re-expressed against the moved entry with the same stubbed-`run` + temp-dir technique.
     `harness-discovery.test.ts` keeps its harness-family assertions, minus every `.inheritedTools` one
     (:79,153,182,206,241,278,313,370,422,432).
   - `service-connection-projection.test.ts` retargeted from descriptor fixtures to fact arrays.
   - New cache/runner tests: fixed source order (D6), atomic swap on `refresh`, empty initial `list()`.
   - `AN1-descriptor-inherited-tools.test.ts` (framework/domain-model) TRANSLATED into the
     `InheritedConnectionFact` shape pin: identity-only fields, no secret/token/env/command property,
     `health: ConnectionHealth | "unknown"`.
2. **Service integration (`*.integration.test.ts`, CI per-merge lane) — THE one end-to-end evidence
   piece:** `layers/core-api/src/__tests__/AU36-reach-wiring.integration.test.ts`, driving the REAL
   composed app through `createTestApp` (the production composition shape):
   - boot wire: pre-boot `bootAgentOrchestration({ db, eventBus, probeInheritedReach: true })` with
     env pointed at seeded temp configs (CODEX_HOME/XDG_CONFIG_HOME via `vi.stubEnv`), hand it to
     `createTestApp({ agentOrchestrationBoot })` (existing option, test-utils.ts:32) → GET /api/connections
     shows the seeded inherited entries with exact view JSON;
   - redetect wire: seed temp configs + stub env, POST /api/harnesses/redetect → GET reflects the facts
     (catches a broken hook anywhere along route → `onHarnessRedetect` → cache → probes);
   - AC2: with facts arranged, switch an agent's `users.harnessType` A→B→A, GET after each step, assert
     byte-identical arrays.
   Arrangement uses the REAL probes reading real seeded files — no stubbed integration point, no
   test-only production export.
3. **Harness lane (real binaries, local-only, `npm run test:integration:harness`):**
   `AN1-real-harness-inherited.integration.test.ts` MOVES to
   `layers/agent-orchestration/connections/src/__tests__/` driving the moved entry directly
   (seeded isolated homes, `assertIdentityOnly`, `requireBinary("gh")`). It must be added as an
   EXPLICIT entry in `vitest.integration.config.ts` `HARNESS_INCLUDE` (the list is explicit; otherwise
   the file lands in the CI service lane and hard-fails CI where the binaries are absent).
   Gate helpers: a local `requireBinary` copy in connections `__tests__` (~30 lines, same hard-fail
   semantics and message shape as harness-registry's, `require-binary.ts`) — a cross-layer dev import
   of the original is not a legal edge, and the binary-on-PATH check is the honest gate here (the
   probes read configs; no model runs — `requireBinary`'s own AU28-Ruling-15 precedent).
   **testing.md obligation:** harness plumbing changes → builder runs
   `npm run test:integration:harness` green BEFORE shipping; nothing downstream catches it.
4. **Static:** `npm run verify` (typecheck catches every residual `inheritedTools` reference; knip
   catches dead exports; governance lint catches any boundary violation).
5. **Rendered surface (AC3/AC5):** manual check — `npm run dev`, Settings → Connections on this machine
   (gh logged in as `tobias-ambrovia` on `github.com`, all four harness binaries present —
   feasibility.md): GitHub appears in the Inherited group, health working, not removable, via
   `environment · github`, and the MCP entries from the real claude/codex/opencode configs match
   `origin/main` exactly. Record the observation (screenshot) as proof.

## 8. Load-bearing files and dependency order

ONE technical task (no dual-write/compat is mandated, so the increments cannot ship separately — the
plan's sequencing becomes commit order inside one PR; each commit should compile):

1. `framework/domain-model/src/connection.ts` — add `InheritedConnectionFact` (+ translate the AN1
   domain-model test).
2. `layers/agent-orchestration/connections/` — `src/inherited-reach.ts` (probes moved verbatim +
   runner + `createInheritedReach`), projection retargeted, barrel updated, `@hyperidle/harness-capability`
   dep dropped from package.json; probe + projection unit tests moved/retargeted.
3. `layers/agent-orchestration/src/` — `boot.ts` (option, cache build, awaited initial probe, expose
   `inheritedReach` on the boot return, delete `adapterPool` option), `app.ts` + `routes/connections.ts`
   (D7).
4. `layers/core-api/` — `app.ts` (`AppOptions.onHarnessRedetect`, threaded at :466),
   `routes/harnesses.ts` (third param, awaited in redetect), `__testing__/test-utils.ts` (wire both
   moments as production does).
5. `applications/desktop/src/create-server.ts` + `applications/remote-server/src/create-server.ts` —
   `probeInheritedReach: deps.topology === "local"`, deferred-bind `inheritedReach.refresh` into
   `bootCoreApi({ onHarnessRedetect })`, drop `adapterPool` from `bootAgentOrchestration`.
6. `layers/agent-execution/harness-registry/` — strip the four probes + merge + discovery-input field
   from `harness-discovery.ts`; strip the four writes from `harness-capability-descriptors.ts`;
   translate `harness-discovery.test.ts`.
7. `framework/harness-capability/` — delete `InheritedToolDescriptor` + `inheritedTools` + re-export.
8. `vitest.integration.config.ts` — HARNESS_INCLUDE entry; moved real-binary test lands in connections.
9. core-ui dev fixtures — delete the `inheritedTools: []` lines (5 files: `AgentEditor.stories.tsx`,
   `AgentEditor.test.tsx`, `SettingsAgents.splitview.test.tsx`, `SettingsHarnesses.splitview.test.tsx`,
   `modelOptionsForHarness.test.ts`) — excess-property errors once the field is gone.
10. Docs — §9.

## 9. Documentation made false (DOC-CLASS: update)

- `docs/architecture/connection-model.md` — §"The descriptor seam — where inherited connections come
  from" (:41-43), the GET-reads-cached-descriptors sentence (:58), §Projection (:89), and the
  harness-capability-descriptor cross-link (:115): inherited connections now project from the
  connections domain's own probe + cache; the descriptor no longer carries them.
- `docs/agent-layer/harness-capability-descriptor.md` — the `inheritedTools` field (:19,26) and the
  inherited-tool enumeration section: the field is deleted; the probes live in connections.
- `docs/guides/user/connections.md` — stays TRUE (Refresh still re-probes; list updates on next load);
  no change. `plans/AV2/architecture-critique.md` mentions the symbol but is a historical working
  artifact, not ground truth — leave it.

## 10. Consumers derived repo-wide (rg `inheritedTools|InheritedToolDescriptor`, worktree@58b2877a)

**Production, symbol-bearing — 5 files:** `framework/harness-capability/src/harness/harness-capability-descriptor.ts`
(type+field), `framework/harness-capability/src/index.ts` (re-export),
`layers/agent-execution/harness-registry/src/harness-discovery.ts` (producers + discovery-input field),
`layers/agent-execution/harness-registry/src/harness-capability-descriptors.ts` (4 writes),
`layers/agent-orchestration/connections/src/service-connection-projection.ts` (sole production reader —
confirms requirements §2.1). **Production wiring changed without naming the symbol — 7 files:**
`routes/connections.ts`, `agent-orchestration/src/app.ts`, `agent-orchestration/src/boot.ts`,
`core-api/src/app.ts`, `core-api/src/routes/harnesses.ts`, `applications/desktop/src/create-server.ts`,
`applications/remote-server/src/create-server.ts`. **Development — 9 files:** the two AN1 pins
(domain-model unit, harness-registry integration), `harness-discovery.test.ts`,
`service-connection-projection.test.ts`, and 5 core-ui fixture files (all `inheritedTools: []`).
**Docs — 2** (§9). No other consumer exists (checked `derive-primary-harness.ts`, harness-capability
`__tests__`, core-ui production components — production core-ui never reads the field).

## 11. Constraints compliance

No new package (requirements-locked destination extended, not invented). No compat field, no dual-write
(D3). Per-agent grants only expressible — reach has an identity independent of the harness; nothing is
built (out of scope honored). Probe never reads token values (D2/§6). No production export only tests
consume — `createInheritedReach` is consumed by `bootAgentOrchestration` (production); the probe deps
seam is an optional parameter production calls absent (same shape as the existing `HarnessProbeDeps`).
Connections view byte-identical (D6 + §7.5). One known microscopic divergence documented (D6 edge case).
