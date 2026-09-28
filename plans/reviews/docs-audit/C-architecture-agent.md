# Audit C — docs/architecture + docs/agent-layer (origin/main 92178fb93)

Scope: 12 architecture files (1536 lines) + 6 agent-layer files (912 lines) = 2448 lines.
Every named path/symbol below was checked with rg/ls against layers/ framework/ applications/ tools/ plugins/ (docs excluded).

## Headline

- **No page explains the architecture as it is now.** Nothing states: 4 layers + 3 apps; 6 modules (task, thread, document, user, session, platform) plus changes/policy; 18 actions declared once in `framework/domain-model/src/actions/{task,thread,document,user,session,platform}.ts` and served 3 ways (HTTP `actions-router.ts`, MCP `actions-as-tools.ts`, UI `layers/core-ui/src/services/call.ts`); `changes` table = event log with 9 object events; subscriptions → work intent or inbox row; the core→orchestration seam (durable `agent_work_intents` + `AgentOrchestrationPort`, an in-process `hc<AppType>` HTTP client over `/api/agent-orchestration/*`, `layers/core-api/src/services/agent-orchestration-port-composition.ts`; lifecycle events back). Pieces are scattered across as-implemented (455 lines of mermaid), system-overview, runtime-simplification, data-flow-examples and decisions — five overlapping pages, each partly false.
- **Gone things still described as live:** built-in harness in diagrams, model gateway/`resolvedModel`, `/api/harnesses*` routes, harness enable/disable toggle, `failClosedAssertion`/`__boundary` default-deny, `work` WS topic, artifacts API, Items/Router/push notifications, attention scores, `POST /api/knowledge`, toon-codec package, org/dispatch/work/filesystem-mounting/agent-run-config packages, `filesystem_captures` table, observability package, pre_compaction event, "new team = one agent".
- **Code finding (not docs):** `server_config.harnessDisabled` is read in ~12 production places but has NO production writer — `updateServerConfig` is only called from its own test (`layers/core-api/settings/src/server-config.ts:84`), and `SettingsHarnesses.tsx` has no toggle. The enable/disable feature is dead read-side plumbing. Also `{{community}}` placeholder in `plugins/role-personas/personas/*.md` is never filled by any code (agent-model.md:132 claims a session prompt fills it). `CORE_API_ACTOR_OVERRIDE_HEADER` is read by `layers/core-api/src/middleware/auth.ts` but no production code sets it (only tests).

---

## docs/architecture/index.md (17) — REWRITE
- Stale descriptions: "run-unit-model … (AQ1)", "decisions.md — code-verified decision log", credential "held in the desktop keychain" line fine.
- Keep file (governance fixture `tools/governance/src/lib/governance-fixtures.ts:192` names it). Rewrite to 4–5 links.

## docs/architecture/system-overview.md (145) — MERGE→ new `overview.md` (rewrite)
False/stale (12 named things gone):
- :22-23 agent-orchestration Services "dispatch · agent-run-config · filesystem-mounting" — none exist (`ls layers/agent-orchestration/` = connections filesystems run-orchestration session-requests tool-handlers).
- :27 "framework/ … + eighteen packages the substrate split into" and :82 "consolidated to these seven" — framework has 8 real packages (+ `http-middleware`, `tool-protocol` dirs holding only node_modules — leftover dirs).
- :28/:84 tools = "eval, eslint-plugin-authz, eslint-plugin-design" — also governance, repo-gates, setup, trace.
- :43 scope in `framework/domain-model/src/knowledge.ts` — file missing (scope now in `types.ts:131`/`actions/document.ts`).
- :45, :59 "opt-in sandboxing … planned follow-up (AQ2)" — plan + track id.
- :54 TOON codec `framework/toon-codec/src/toon-codec.ts` — package deleted; inlined in `layers/agent-orchestration/run-orchestration/src/context.ts:100-103`.
- :63 observability `framework/diagnostics/src/observability/` — missing (diagnostics has logger.ts, redact.ts only).
- :94 `@floating-ui/dom` in design system — 0 hits.
- :90 `main.ts:558` — now :534.
- :122 "attention scores update" — attention engine deleted (286628f7b). ":122 harness adapter unblocks agent" — verdict → `session_resume` work intent.
- :129-130 `POST /api/knowledge` + "assign to correct knowledge layer" — route and layers gone; it is `edit_document`.
- :98 "ArtifactView's five embed shapes" — review canvases are 9 kinds; no artifacts table.
Trim: language-choice rationale (:68-72), stack "scale alternative" column of futures, mobile claim caveats.
Keep: 4-layer tree idea, "not included" list, desktop shell paragraph, WS/ws-token flow.

## docs/architecture/as-implemented-domain-architecture.md (455) — MERGE→ `overview.md` (rewrite, ~80% cut)
False/stale (16 named things gone):
- :26 / :110 "assistant turn request", Agent layer provider `assembleContext/beginLearningIngestion/resolve defaults/selectAgent/formAssistant` (:110, :134, :287-291) — `beginLearningIngestion`, `selectAgent`, `formAssistant` 0 hits.
- :62-63, :188-196 "Artifacts", "artifacts API", `ToolRegistry --> Artifact` — no artifacts table (0f4e4d852), no artifacts API.
- :133 SessionConfig carries `resolvedModel` — removed (`harness-adapter.ts:88` lore).
- :135 tool registry at `layers/agent-execution/harness-registry/src/tool-registry.ts` — moved to `layers/agent-orchestration/tool-handlers/src/tool-registry.ts`.
- :136 events in `framework/domain-model/src/events.ts` with line numbers — file moved to `framework/event-bus/src/events.ts`.
- :255-273, :369 Builtin adapter → LLM provider API — built-in harness deleted (contradicted by :412 in same file).
- :276 `layers/agent-execution/harness-registry/src/__testing__/llm-cassette.ts` — missing.
- :312 "Server config → Model and harness settings" — server_config holds only `harnessDisabled`.
- :325 table `filesystem_captures` — dropped (migration 0057).
- :396 `layers/core-api/work/src/dependency-watcher.ts` — now `layers/core-api/task/src/`; `layers/agent-orchestration/dispatch/` — missing.
- :416 "(AQ1)", "Opt-in isolation is planned (AQ2)".
- :424 observability `framework/diagnostics/src/observability/types.ts:4`, `events.ts`, `layers/core-api/src/observability-runtime.ts` — all 3 missing.
- :428 MCP tool list = 13 tools — also `search_sessions/watch_session/stop_session/search_plugins/edit_plugin` + agent-only `return_status` (18+1).
- :449 WS topics include `work` — deleted (ws-connection-hub.ts:46 lore); global topics are `conversations`, `documents` (`ws-subscribe-authorizer.ts:157`).
- :378 "Verified against code 2026-08-06" — dated.
Trim: all 11 mermaid diagrams (L0/L1/L2/L3) — they restate each other and invent names ("Coordination domain", "Integration domain") that are not code nouns; the "There is no X any more" sentences (:384-392, :406, :412, :420, :428) are history.
Keep (move into overview): WS contract (:445-455 minus `work`), event guarantees line (:354), API layer paragraph (:406 shortened), auth one-key paragraph (:408).

## docs/architecture/runtime-simplification.md (201) — DELETE (fold ~15 lines into overview)
Banner at :3 already says it is superseded; :5 "strategic frame for Track AU"; :7 "(2026-07-13 — AU19 frame)". Design journal.
False/stale (9): `ui` Application (:27) — no `applications/ui`; agent recovers detail "via its OWN `CoreApiPort` MCP tools" (:52) — CoreApiPort deleted (3407cb98f); `knowledge` Service (:62-63, :93) — no such module; `getBetById`/`createBet` (:112) — bets gone; "Mechanism 2 below" (:123) — dangling; `.pipeline/work/AU21/architecture.md` (:45); "Triggers … default eligible agent … if no trigger matches" (:163) — not how subscriptions work; plugins contribute "tools, harness descriptors, settings metadata" (:161) — kinds are agent/subscription/document/mcp_server; "Core-owned work — knowledge … scoring … review routing" (:178).
Keep: "Durable agent handoff" (:165-171) — accurate (4 families thread_turn/task_run/session_resume/subscription_run; boot reconcile; lifecycle event after terminal state). Move to overview.
Repoint code comments: `layers/core-api/src/boot.ts:12`, `layers/core-api/src/api-middleware-stack.ts:10`, `layers/agent-orchestration/run-orchestration/src/context.ts:411`.

## docs/architecture/data-flow-examples.md (107) — DELETE (optionally keep 1 flow in overview)
False (6): :9 `layers/core-api/work/src/dependency-watcher.ts` (now task/); :24-25 retro "learnings route to the facilitator and the assistant's thread" — post-task-retro prompt only calls `edit_document` (`plugins/document-management/plugin.json`); :79-81 "creates Item … (kind: review, risk_tier: high)", "Router → Conversations + push notification" — items, router, risk tier, push all gone; :95 "Model tier selected: fast" — tier selects nothing; :103 "No Item created".
Fictional stories (CPO on phone, Brand Voice agent, Growth agent) — marketing narrative. Flow 1 (task tree → lifecycle propagation → subscription → inbox) is the one worth keeping as a 10-line example in overview.

## docs/architecture/decisions.md (45) — DELETE (fold true items into overview)
False/stale (4): :7 `framework/toon-codec/src/toon-codec.ts` gone; :13 pre-compaction trigger "part of the adapter contract" — no adapter sets `preCompactionTrigger: true`, `pre_compaction` event absent from `harness-events.ts`; :36 "Trust gating: approval rate × risk tier" — risk tier 0 hits, policy engine deleted; :41 "Knowledge fabric sync" — fabric not a code concept.
Trim: decision-log format itself (docs.md says docs are not a design journal); :20 "No Letta, no Agent Mail, no Temporal" history; :21 "SQLite is retired"; :45 "misses are a feature" opinion.
Keep as facts in overview: handoff = `edit_task ownerAgentId`; one Node process + setInterval clocks; Postgres only; writeback 500ms file watcher (`file-watcher.ts:33`); version check refuse-and-discard; history = `changes`; no scores.

## docs/architecture/run-unit-model.md (89) — MERGE→ overview §Sessions (~15 lines)
Mostly true (`LocalSandboxAdapter`, `DisabledSandboxAdapter`, `HYPERIDLE_WORKSPACES_DIR` default tmpdir, `HYPERIDLE_PROFILE`). Stale: title "(AQ1)", "AN2", "AR2", "AQ2/AQ3" next steps (:86-89) — plans; "End-to-end transport is stubbed; AQ3 completes it" (:27) — unverified plan claim; :41 DockerSandboxAdapter history.
Move: `onBeforeTeardown` capture seam + harness test pattern (:55-84) is test-only → docs/guides/developer/testing.md.
Inbound links to repoint: knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md, requirements/system-requirements.md, human-interface-layer/overview.md, deployment/index.md, deployment/self-hosting.md.

## docs/architecture/system-boundary.md (50) — MERGE→ overview §What HyperIdle does not do (~10 lines)
False (2): :32 `layers/agent-orchestration/filesystem-mounting/src/mounter-registry.ts` — package gone (mounter now `run-orchestration/src/mounter.ts`); :24 "knowledge fabric supersedes wikis".
Trim: "founder decision 2026-06-22" (:5), AL7 ids (:20, :32, :48), GitHub MCP "~23 toolsets" market inventory (:27), "Why this is the opportunity" (:46-48) — positioning, belongs in docs/product if anywhere; the gate "being rebuilt" (:33) — plan.
Inbound: process-layer/filesystem-primitive.md, human-interface-layer/review-primitive.md.

## docs/architecture/authorization-model.md (95) — REWRITE → `security.md` (with credential-model merged)
False (8):
- :5 "`framework/domain-model/src/actions/thread.ts` cites this table" — thread.ts does not mention it (`HOST_SCOPED` at :486 has no doc citation).
- :37 composition root "may name a different actor with the actor-override header" — header is read (`middleware/auth.ts`) but set by no production code; tools call actions in-process with `actor: ctx.agentId` (`actions-as-tools.ts`).
- :66 default-deny via `__boundary` + `failClosedAssertion()` in `api-middleware-stack.ts` — 0 hits for both; `requireBoundary` only in the eslint plugin.
- :63 `isRLSEnabled: false` — 0 hits.
- :67 "`routes/threads.ts`" — route deleted (fine as history, but cut).
- :65 `api-middleware-stack.ts:75` — auth mounted at :40.
- :75 global topics "`conversations`, `work`" — actually `conversations`, `documents`.
- :76 `session:<id>` "must exist and its task host must resolve … deny fail-closed" — code admits any non-empty id with no lookup (`ws-subscribe-authorizer.ts:200-203`).
- :86 "artifact detail/preview" read parity — no artifacts.
Trim: Saltzer–Schroeder/OWASP name-drop, RLS "revisit when" paragraph, `no-header-identity-in-authz` deletion history (:67).
Keep: Principal = `c.get("userId")`; one key `HYPERIDLE_API_KEY` constant-time; `canReadThread`/`canWriteThread` host table (true, thread.ts:486-496); join-by-posting; `HYPERIDLE_SHARED_MODE` ws-token rule; worker token; `canReadDocument`; `user:<id>` rule.
Rename note: code cites `docs/architecture/authorization-model.md:32` at `layers/core-api/src/boot.ts:193` and `authorization-model.md:32` at `layers/agent-orchestration/run-orchestration/src/connection-provisioning.ts:31` (line-number citations — repoint to `security.md` §Trust mode, drop line numbers). Doc inbound: credential/connection/system-overview/as-implemented (all in scope).

## docs/architecture/credential-model.md (43) — MERGE→ `security.md` §Secrets (~8 lines)
True: one credential `shared_backend_key`, desktop `safeStorage` (`applications/desktop/src/safe-credentials.ts`), connections' own cipher. Trim: the "HyperIdle holds no model credential. The catalog once carried three more…" block (:11-18) is history — reduce to one sentence "a harness brings its own login; HyperIdle stores no model key".
Inbound to repoint: agent-layer/model-routing-and-cost.md, system-overview, connection-model, authorization-model, requirements/system-requirements.md.

## docs/architecture/connection-model.md (122) — FIX (trim to ~60)
False (3): :96 `ServiceConnectionProjection` in `service-connection-projection.ts` — file and symbol gone (0 hits); :86 `ServiceConnectionResolverAdapter` — 0 hits; :75 `schema.ts:1735` — `service_connections` is at :1063.
Trim: ids AN2/AO1/AU36 (:19, :86, :45); vocabulary table (:110-118) restates code types; "Column details belong to the schema file" meta-text; hard rule 5 duplicates credential page.
Missing: that connections are owned by agent-orchestration and reached from `edit_user`/`open_user` through `AgentOrchestrationPort` (`/api/agent-orchestration/connections/:userId`).

## docs/architecture/plugins.md (167) — FIX (trim to ~90)
Claims check out (`plugin_contributions`, `detached_at`, `install_path`, `installed-plugins/`, `HYPERIDLE_BUNDLED_PLUGINS_DIR`, `installScope`, `setLive`, two bundled plugins, `search_plugins` available rows).
Trim history: :37-39 deleted Agent behavior page; :56-72 "Provenance used to be recorded seven different ways…" + `topic` column defect story; :79-87 "They used to be three separate spellings … drifted" bullet list; :101 "That is D5"; :119-121 dev-checkout note can be one line.
Missing: contribution kinds in code are agent, subscription, document, mcp_server (doc calls a skill its own kind; say "skill = a document with slot skill").

## docs/agent-layer/index.md (9) — REWRITE
Lists model-routing ("MODEL_CATALOG" — deleted ca76816f5) and harness-coverage ("five-harness matrix, AR7"). Rewrite after merges.

## docs/agent-layer/agent-model.md (176) — FIX (heavy trim to ~90)
False (9 named things):
- :26 `AgentScaffoldSpec`, `persistScaffoldedAgents`, `layers/core-api/org/src/scaffold-agents.ts` — all gone (org package deleted; governance lists `persistScaffoldedAgentsSchema` as retired).
- :33, :159 status `active | paused | retired` — `USER_STATUSES = ["active","idle","inactive","retired"]` (`framework/domain-model/src/actions/user.ts:31`).
- :159 "adapter pool skips [paused agent] (`adapter-pool.ts` S4)" — S4 `paused` is an adapter-pool entry flag, not an agent status.
- :55 identity document "with `role='agent_file'`" — the column is `slot` (`schema.ts` documents.slot).
- :118 `MAX_TOOL_ITERATIONS=3` — 0 hits.
- :132 `{{community}}` "a session prompt fills it" — no code fills it; only appears in persona markdown.
- :140-143 "Creating a team creates one agent … role `agent`" — `edit_user({team:{name}})` just creates the team row (`layers/core-api/user/src/user-actions.ts:871-882`); no agent.
- :138 "`users.ts` update route" — no such route.
- :77 "The Three Categories" — there are two.
Trim: :34, :81, :135-136, :145-149, :151-155 (BA9d/BA9g/AD8a/b/c rename lore, deleted catalog/roster history); :99-105 defaultFactoryRoster history; :116 "(AU27)"; :174-176 cost/WIP deletion notes (link once); "knowledge fabric" (:7); "team is 3–6 agents" opinion.
Missing: `users.health` (crash note, `schema.ts` users.health), `agent_run_config.model_options_json`, the model paragraph from model-routing (below).

## docs/agent-layer/model-routing-and-cost.md (61) — MERGE→ agent-model.md (one paragraph)
True core: `model_id` → `SessionConfig.selectedModel` → `--model`; tier is a label on `sessions.model_tier` keying `TokenUsage.byTier`.
False (3): :22 `layers/core-api/src/routes/validate-agent-config.ts` — now `layers/core-api/user/src/validate-agent-config.ts`; :51 `ModelTierUnknownWarning` — 0 hits; :60 "Cost caps — the Money-only agent < team < factory hierarchy … owned by wip-and-cost-limits" — cost caps deleted.
Trim: :26-32 "Removed" gateway block, :45-49 `model_tier_preference` removal story.
Inbound to repoint (10): process-layer/the-four-primitives.md, process-layer/canonical-shapes.md, agent-model, harness-capability-descriptor, as-implemented, credential-model, data-flow-examples, requirements/system-requirements.md, requirements/functional-requirements.md.

## docs/agent-layer/harness-capability-descriptor.md (224) — REWRITE → `harnesses.md` (~90)
False (15 named things gone):
- :3 "Kernel-owned", :218-219 "Not Strategy-owned … Kernel-governed" — dead framing.
- :5 test `layers/core-api/src/routes/__tests__/AM2-harness-capabilities.integration.test.ts` — missing.
- :13 `accessMode: "api-gateway" | …` and :17 `runtime: HarnessRuntimeCapabilities` — neither field on `HarnessCapabilityDescriptor` (`framework/harness-capability/src/harness/harness-capability-descriptor.ts`); it has `returnEnforcement?` instead (undocumented).
- :32 "probes the five known families" — four.
- :59, :71, :83 `harness-session-probe.ts`, `probeClaudeSession`, `probeOpenCodeSession` — file and two probes gone (only `probeCodexSession` in adapter-pool).
- :118 `runtimeFromCapabilities`; :179 `missingKnownHarnessDescriptors` — 0 hits.
- :133 `pre_compaction` event in `harness-events.ts` — event type not there (only token_usage/tool_call/completion/error).
- :161 `framework/harness-protocol/src/harness/harness-event-normalization.ts` — moved to `layers/agent-execution/harness-registry/src/harness-event-normalization.ts`.
- :149 `mcp-bridge-stateful.integration.test.ts` — 0 hits.
- :174-198 whole API surface `GET /api/harnesses`, `POST /api/harnesses/redetect`, `POST /api/harnesses/:type/disabled`, `layers/core-api/src/routes/harnesses.ts`, `createRateLimiter` — all deleted; harnesses are `open_user` (`user.ts:288`), redetect is `edit_user({redetectHarnesses:true})`.
- :202-210 Enable/Disable — no writer of `harnessDisabled`, no toggle in `SettingsHarnesses.tsx`; :210 builtin exemption "enforced in two places" contradicts :46-51.
- :216 "the gateway owns model credential resolution" — gateway deleted; :224 "cost enforcement".
Trim: removed-builtin notes (:46-51, :208-210), AM2/AM4/AN1/AU36 ids, evidence-first research-dossier chain.
Keep: per-family discovery probes, headless command lines, MCP delivery per dialect (`writeCliMcpConfig` codex-toml/opencode-json/cursor-json, `.mcp.json`), stateful MCP bridge at `/api/mcp/:token`, event normalization pre-maps.
Inbound (8): process-layer/tasks-and-sessions.md, requirements/system-requirements.md, human-interface-layer/part-model.md, agent-model, index, decisions, as-implemented, connection-model.

## docs/agent-layer/harness-coverage-enforcement.md (199) — DELETE (move ~20 lines to docs/guides/developer/testing.md)
It is a test convention, not architecture, and mostly an obituary for a deleted gate (:5-7, :34-61 "The former gate … removed", :149-154 carve-out history, :30 predicate history).
False (5): :105-116 test table — `AL7-two-session-trust-first.integration.test.ts` and `AM2-real-harness-session-probe.integration.test.ts` missing; "Twelve files call requireHarness" — 17 test files do now (e.g. subscription-wake-live-harness, document-tools-live-harness, model-selection-real-binary …); :197 "Reference five-harness matrix test; the only file the predicate matches" — predicate `isHarnessIntegrationPath` gone; :118 says 3 files emit `[harness:X]` tags — 7 do; :195-196 duplicate row for require-harness.ts.
Move to testing guide: the 4 review-enforced rules (:73-76), locked models table (:88-95, true: `HARNESS_TEST_MODELS`), "completed or not_returned, never crashed" assertion, last-non-empty-completion gotcha.
Must repoint: `.claude/rules/testing.md:100` → `docs/guides/developer/testing.md` §Harness lane. Doc inbound: return-gate-enforcement, harness-capability-descriptor, agent-layer/index, guides/developer/testing.md.

## docs/agent-layer/return-gate-enforcement.md (243) — FIX (trim to ~100)
Mechanism is real (`RETURN_ACTION_NAMES = ["edit_task","send_message"]`, `stripMcpNamespace`, `MAX_FORCE_RETURNS = 2`, `shouldForceReturn`, `provisionReturnHook`, `/api/mcp/:token/return-status`, `createReturnGate`, `no-ungated-stream-drain`, `tools/eval/src/scenarios/force-return.ts`).
False (5): :26 `isInternalExtractionDrain` — 0 hits; :67 `EnforcementEntry/EnforcementRegistry` "declared in `framework/harness-protocol/src/harness/enforcement-registry.ts`" — lives in `layers/agent-execution/harness-registry/src/enforcement-registry.ts`; :144 `layers/core-api/src/services/run-orchestration-composition.ts` — now `layers/agent-orchestration/src/services/run-orchestration-composition.ts`; :232 "covers all five supported harnesses … (AR6 consolidation)" — four; :45 `sdk-inprocess` "dead … survives only in the type union" (dead code, flag).
Missing: the agent-only `return_status` MCP tool (`return-status-tool.ts`) — agents can ask whether they have returned; not documented anywhere.
Trim: "v4 replaces v3" (:36), "AR2 W1 fix … Before AR2" (:20), removed builtin-loop block (:118-121), §10 eval scenarios and §11 test tables (move to testing guide or drop), §8 `computeForceReturnCount` internals.

---

## Proposed target structure

### docs/architecture/ (1536 → ~460 lines)
| Page | Purpose | Lines |
|---|---|---|
| `index.md` | 4 links + governance pointer | 17 → 10 |
| `overview.md` (new; replaces system-overview, as-implemented, runtime-simplification, data-flow-examples, decisions, run-unit-model, system-boundary) | The one page: 3 apps + 4 layers; modules per layer; 18 actions declared once in domain-model, served as HTTP route + MCP tool + UI call; `changes` = event log, 9 object events + bus events, in-memory bus guarantees; subscriptions (event/schedule → work intent or inbox); core→orchestration seam (durable work intents, `AgentOrchestrationPort` in-process HTTP client, lifecycle events back; bake-at-emit); session path (provision → host working dir → harness → MCP bridge → writeback → return gate link); plumbing routes; WS topics; one-key auth; what HyperIdle does not do (boundary, 10 lines); one worked flow | ~220 |
| `security.md` (authorization-model + credential-model) | Principal, one key, shared mode, thread/document/WS read rules, worker token, secrets | 138 → ~80 |
| `connections.md` (connection-model renamed or kept) | held vs inherited, `open_user`/`edit_user` door, resolver, rules | 122 → ~60 |
| `plugins.md` | install per scope, 4 contribution kinds, registry, lifecycle, detach/restore, bundled | 167 → ~90 |

### docs/agent-layer/ (912 → ~290 lines)
| Page | Purpose | Lines |
|---|---|---|
| `index.md` | 3 links | 9 → 5 |
| `agent-model.md` | agent = users row + agent_run_config + identity document; categories; assistant; model per agent (tier = label); status; one team | 176+61 → ~90 |
| `harnesses.md` (from harness-capability-descriptor) | 4 families: discovery, headless command, MCP delivery, event normalization, descriptor fields as in code | 224 → ~90 |
| `return-gate.md` (from return-gate-enforcement) | return set, per-harness channel table, force budget, drain backstop, `return_status` tool | 243 → ~100 |

Total 2448 → ~750 lines.

### Repoints required if pages are deleted/renamed
- `.claude/rules/testing.md:100` → docs/guides/developer/testing.md §Harness lane.
- `layers/core-api/src/boot.ts:193`, `layers/agent-orchestration/run-orchestration/src/connection-provisioning.ts:31` (authorization-model.md:32) → security.md §Trust mode.
- `layers/core-api/src/boot.ts:12`, `layers/core-api/src/api-middleware-stack.ts:10`, `layers/agent-orchestration/run-orchestration/src/context.ts:411` (runtime-simplification.md) → overview.md.
- `README.md:124` says "three-layer system overview" — should be four layers.
- `applications/website/src/__tests__/doc-links.test.ts:34-98` uses `docs/agent-layer/agent-model.md` as a URL fixture — keep that filename.
- `tools/governance/src/lib/governance-fixtures.ts:192` names `docs/architecture/index.md` — keep.
- Other docs linking in: model-routing-and-cost (process-layer/the-four-primitives.md, process-layer/canonical-shapes.md, requirements/system-requirements.md, requirements/functional-requirements.md); run-unit-model (knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md, requirements/system-requirements.md, human-interface-layer/overview.md, deployment/index.md, deployment/self-hosting.md); architecture/decisions.md (requirements/index.md, requirements/system-requirements.md, human-interface-layer/decisions.md); system-boundary (process-layer/filesystem-primitive.md, human-interface-layer/review-primitive.md); system-overview (human-interface-layer/decisions.md, human-interface-layer/overview.md, requirements/usability-requirements.md); harness-capability-descriptor (process-layer/tasks-and-sessions.md, requirements/system-requirements.md, human-interface-layer/part-model.md); credential-model (requirements/system-requirements.md); as-implemented (process-layer/the-four-primitives.md); harness-coverage (guides/developer/testing.md); agent-model (archive/facilitators.md, product/human-ai-collaboration.md, guides/user/index.md, guides/user/agents.md, requirements/functional-requirements.md, requirements/users-and-their-modes-of-engagement.md) — unchanged if agent-model keeps its name.
