# Overengineering Audit — HyperIdle

**Method:** 15 subsystem auditors (code + architecture docs) → adversarial verification of every finding (each "overengineered" claim re-checked by an independent agent told to *find the justification*) → ranked synthesis. 84 agents, 68 raw findings.

**Outcome:** 19 confirmed · 47 judged justified · 2 uncertain.

**Dominant theme:** *infrastructure shipped without consumers* — well-built, fully-tested modules wired into nothing, stranded when a RED/scaffold phase landed the machinery but the integration step never happened. Secondary: single-implementation abstractions, dead computation in live scoring paths, and docs that outran the code they describe.

**Cut-first recommendation:** Theme A deletions (#1–4) + fabric dead-weight (#5–6) — all high-confidence, additive-risk-free, ~800 LOC removed, and restores the relevance scorer to its full weight budget. The real fix is cultural: gate "ship infrastructure" on having a wired consumer in the same PR.

---

## Part 1 — The 19 Confirmed Findings (actionable)

### Theme A — Infrastructure without consumers (delete or wire)

- [ ] **A1 · 22 dead judge factories** — `packages/eval/src/judges.ts:141-1118` (~550 LOC). Zero callers since X8 (#191). 2 are redundant (`judgeCreateTaskCalled`→`judgeTasksCreatedCount`, `judgePromoteKnowledgeCalled`→`judgePromoteKnowledgeCalledByAgent`). **Fix:** delete all 22; keep only the ~18 scenarios import. *Biggest single LOC win.* Severity: medium.
- [ ] **A2 · Response-validator middleware** — `packages/server/src/middleware/response-validator.ts` (~117 LOC). Never mounted in `app.ts`; `registerResponseSchema()` never called outside tests. An ESLint rule falsely claims `validateBody()` "integrates with response-validator" — no import exists. Disconnected ~7 months. **Fix:** delete module + misleading rule (or wire it — but delete is right). Severity: medium.
- [ ] **A3 · Prefetch write-path** — `packages/pipeline/src/brief.ts:42-52,164-186` (`writePrefetch`+`truncatePrefetch`, 79 LOC). `readPrefetch` is live but its session-start hook was never registered in `.claude/settings.json`; the write side has no producer. **Fix:** defer `writePrefetch`/`truncatePrefetch`/`PREFETCH_CAP_BYTES` until a producer exists; keep `readPrefetch` (graceful null). Severity: low.
- [ ] **A4 · Unused Hono RPC client** — `packages/web/src/api/client.ts` (44 LOC). Zero callers; the promised `useBet`→`apiClient` migration never happened; all components use `apiFetch`. ESLint flags `apiFetch` "legacy" but the replacement was never adopted. **Fix:** delete the file. Severity: low.

### Theme B — Dead computation in live scoring (fabric)

- [ ] **B5 · `computeTagMatch()` always returns 0** — `packages/fabric/src/relevance-scoring.ts:44-66`, `context-assembly.ts:202-207`. `taskTags` is hardcoded `[]` at the only production callsite (since B6) → guard always returns 0 — yet `tagMatch` carries the **highest weight, 0.35**. 35% of the scoring budget is a guaranteed-zero signal. **Fix:** remove `taskTags` from `ScoringContext` + the tag-match branch; redistribute weight. Re-add with task→tags derivation + e2e proof if needed. Severity: medium (high-impact correctness).
- [ ] **B6 · `computeRoleMatch()` 0.5 branch unreachable** — `packages/fabric/src/relevance-scoring.ts:68-80`, `context-assembly.ts:186-191`. Items are pre-filtered by scope equality at fetch, so role match is always 1.0 or 0 — the 0.5 partial-match branch is unreachable, untested. Weight 0.15. **Fix:** drop the partial-match branch (or the whole factor); express role affinity in query ordering. Severity: medium.

> **B5 + B6 together: half the relevance-scoring weight (0.50) is dead.** Highest-impact clarity fix in the report.

### Theme C — Single-implementation abstractions

- [ ] **C7 · PGlite/Postgres dual-driver union** — `packages/db/src/connection.ts`, `profiles.ts`. Dispatch is fixed per profile at startup, schema is Postgres-only, tests are PGlite-only. No runtime driver choice exists. **Fix:** detect profile at startup; each profile calls its factory directly; drop the `HyperIdleDb` union. Severity: low.
- [ ] **C8 · `SafeCredentialsManager` interface** — `packages/desktop/src/safe-credentials.ts:21-29`. Interface for one factory returning an object literal; no alternate impl. **Fix:** drop the interface; inline the return type. Severity: low.
- [ ] **C9 · `ServerHandleLike`** — `packages/desktop/src/main.ts:132-138`. A restrictive subset of the real `ServerHandle`, used in one fn that only calls `.dispose()`. **Fix:** accept `ServerHandle | null` directly. *(Note: `SafeStorageLike` in the same area is justified by AC-12's 5-test suite — keep it.)* Severity: low.

### Theme D — Param / config slots nothing reads

- [ ] **D10 · Unused `_eventBus`/`_db` params** — `packages/server/src/routes/search.ts:78`, `settings.ts:60`, `recipients.ts:30-32` (recipients also adds unused overloads). These route factories emit no events. **Fix:** remove the params + overload. *Keep `coach.ts`'s — lore L21 justifies it.* Severity: low.
- [ ] **D11 · Half of `ProfileDefaults` prod-unread** — `packages/db/src/profiles.ts:18-43`. `sandboxAdapter`, `requiresDockerCompose`, `ports` (~50% of the type) read only in test assertions; Docker detection + ports are hardcoded elsewhere. **Fix:** keep `dbDriver`/`dbUrl` in db; move topology fields to `shared`/`fabric` (db package shouldn't carry deployment concerns). Severity: low.
- [ ] **D12 · 6 dead OTEL span attributes** — `packages/pipeline/src/otel.ts:19-37`. `storyComplexity`, `storyPattern`, `phase`, `replanCount`, `toolCallsParallel`, `cacheHitRatio` are never set; the comment cites `plans/token-efficiency-blocks.md`, which never existed in git history. **Fix:** remove the 6 dead attrs; re-add when the instrumentation that sets them ships. Severity: low.

### Theme E — Web hygiene

- [ ] **E13 · Duplicate `initialsOf`** — `packages/web/src/components/ConversationSurface.tsx:118`. Already exported from `PartList.tsx:60` (SessionView imports it correctly). **Fix:** import from `./PartList.js`; delete the local copy (−7 LOC). Severity: low.
- [ ] **E14 · `useBlockResolution` over-built** — `packages/web/src/hooks/useBlockResolution.ts` (186 LOC). One caller (AssistantOverlay, out-of-scope post-AM1); session-lifetime cache, retry/degraded states, 6 host kinds with 2 implemented; field-name bug (`pitch` vs `description`). **Fix:** inline into the single caller or defer until a genuine 2+ caller pattern (AM5). Severity: low.

### Theme F — Docs outrunning code

- [ ] **F15 · Component-budget self-contradiction** — `docs/ui-design/component-budget.md:9` ("No strict count enforced") vs `component-tree-at-a-glance.md:25` ("Adding a 20th needs a written reason"). Ceiling never enforced (PitchCard deleted, AI7 added two components — no RFC); 66 design-system exports. **Fix:** pick one — drop the ceiling or enforce it in CI; update stale counts. Severity: low.
- [ ] **F16 · Five-layer knowledge model over-documented** — `docs/knowledge-architecture/the-five-layers.md` (~50KB) + fabric/db. Only L3+L4 active, L2 read-mostly, L0/L1 scaffolding; L1 isn't even loaded into context-assembly. **Fix:** document current reality — L3+L4 live, mark L0–L2 as forward infrastructure. Severity: low.
- [ ] **F17 · Five-shape artifact spec stale** — `docs/human-interface-layer/the-three-views-the-rail.md:125-145` + artifact types. Superseded by 6 kinds + open vocabulary (AE6) but never rolled back; `ARTIFACT_VIEW_SHAPES` is still a closed enum at the API boundary, contradicting the "open vocabulary" promise; `part.ts:248` special-cases `text_diff`. **Fix:** update §4.1 to the 6-kind model; reconcile the closed enum; migrate test fixtures off old kind names. Severity: low.

---

## Part 2 — The 47 Judged Justified (rejected by verification)

These were flagged by an auditor but an independent verifier found the complexity warranted. Kept for transparency — **do not act on these without re-reading the reasoning** (full reasoning preserved in the audit transcripts).

| # | Finding | Location | Why it survived |
|---|---|---|---|
| 1 | Annotation overlay infra | `design-system/viewer/annotations/` | Load-bearing for `/human-design-review`; real heavy usage (AL1 46 annotations, AM3 12 rounds); path-anchor disambiguates duplicate components. |
| 2 | AppShell state/hooks (855 LOC) | `web/src/layouts/AppShell.tsx` | Layout orchestrator coordinating router + dual mobile/desktop layouts + context provider; split moves code without removing coordination. |
| 3 | AssistantDraftRegistry (274 LOC) | `server/src/tools/assistant-draft-registry.ts` | Security boundary; harness invokes via `registry.invoke()`; schemas hide `teamId`/`betId` from the LLM. |
| 4 | AttentionWeights 8-knob loader | `fabric/src/scoring-config.ts:95-189` | `loadAttentionWeights()` runs on every recompute; factory_settings-tunable per AC. Only the `loadWeights` DI seam is test-only. |
| 5 | Block primitive docs + impl | `shared/src/blocks/`, `docs/blocks/` | Content-hash blockId needed for body cloning + neighbor-edit stability; prevents thread-bleed across cloned bodies. |
| 6 | BootContext param object | `desktop/src/main.ts:289-294` | Both boot paths use all 4 fields; locality for two 150-line boot functions. |
| 7 | Brief/Memory read normalization | `pipeline/src/brief.ts:104-140` | TOON encodes empty arrays losslessly-impossible; defensive decode is the centralized fix. |
| 8 | eslint-plugin-design AST rules | `eslint-plugin-design/src/rules/*` | Each fixes a documented false-positive class or architectural invariant (K6 colors, AL6 stream-drain); ERROR-level. |
| 9 | Configurable scoring weights (6-knob) | `fabric/src/scoring-config.ts:8-31` | AC6 is a binding acceptance criterion; factory_settings override is tested. |
| 10 | ConversationSurface (542 LOC) | `web/src/components/ConversationSurface.tsx` | Must render standalone in the viewer w/o router; byte-identical design/prod no-drift guarantee. |
| 11 | `scoreItem` exported, "unused" | `fabric/src/relevance-scoring.ts:147-185` | Exported for AC isolation testing (16 assertions across AC1-5). |
| 12 | Design plugin 24 rules | `eslint-plugin-design/src/index.ts` | Each rule sourced from canonical docs, tied to tracked work; clean single export. |
| 13 | Catalog discovery (411 LOC) | `design-system/viewer/discovery.ts` | Handles flat-root story classification; alternative scatters metadata across 100+ files. |
| 14 | DockerSandboxAdapter | `server/src/harness/docker-sandbox-adapter.ts` | D3 completed story; flag-gated; argv-spawn security value; forward infra. |
| 15 | EnvCredentialResolver interface | `server/src/services/credential-resolver.ts` | `eval` package needs env resolver w/o DB; `instanceof` test enforces DB resolver in prod. |
| 16 | EventBusAdapter (unimplemented) | `shared/src/events.ts:475-479` | Documented cloud (Redis/NATS) requirement (Track S); zero-cost 3-method interface. |
| 17 | ExternalShapedAdapter (165 LOC) | `eval/src/provision-harness.ts:42-232` | Proves AL6 forcing on a non-builtin harness (founder AC4); validated 0.933 on a real agent. |
| 18 | IsolatedHarnessAdapter | `server/src/harness/isolated-harness-adapter.ts` | Dormant cloud-isolation infra (S2); env-flag gated; complete + tested. Wiring is the only gap. |
| 19 | Knowledge RESTRICT FKs | `db/src/schema.ts:580-607` | Security (I3): prevents audit-trail wipe if a hard-delete path is ever added. Zero runtime cost. |
| 20 | Legacy cost columns | `db/src/schema.ts` (cost cols) | ~17/20 columns actively used; per-entity cost models legit. Only `users`/`teamMembers.costCap` + `bets.appetite` truly dead. |
| 21 | LogRotator factory | `desktop/src/log-rotation.ts` | Interface used for type-safe `getBeforeQuitHandler` param; consistent with sibling interfaces. |
| 22 | Multiple Avatar impls | `web/src/{components,pages}/...` | Web intentionally diverges from DS Avatar (`surface-container` vs `surface-page`) for nesting context. |
| 23 | Multiple decoders | `web/src/hooks/useThreadDetail.ts`, `useAssistantThread.ts` | Endpoints return genuinely different shapes (6 vs 3 fields); only 2 decoders — generic is premature. |
| 24 | Notification queue (18 cols) | `db/src/schema.ts:741-793` | `typeKey`/`urgency`/`sourceLink` load-bearing for the AF8 inbox concept. |
| 25 | Occasion events (audit-only) | `shared/src/events.ts`, dispatcher | Kernel-strategy boundary seam (AK6-8); emit-ordering + audit durability; built ahead of subscribers by design. |
| 26 | Overlapping debounce-save hooks | `web/src/hooks/useAutoSave.ts`, `useBetDescriptionSave.ts` | 1 consumer each, different locking strategies; documented T3 decision; no 3rd consumer on roadmap. |
| 27 | Propagation log "unbounded" | `db/src/schema.ts:808-837` | Retention-reaper shipped AF16 (6h sweep, 30d TTL). **Finding's premise false — but the L20 lore comment is stale, see Part 4.** |
| 28 | Relevance 3-signal w/ null citation | `fabric/src/relevance-engine.ts:78-119` | Staged signal rollout; ~40 LOC; tested denominator-shrink on null. |
| 29 | RelevanceConfig (7 params) | `fabric/src/scoring-config.ts:191-266` | Architectural requirement (docs); production usage; staged citation. |
| 30 | RemoteHarnessAdapter "zero-caller" | `server/src/harness/remote-harness-adapter.ts` | Actively instantiated via worker WebSocket (S2/S4) — **not** dead. |
| 31 | Return enforcement 4-layer | `server/src/harness/return-*.ts` | Gate (per-session) vs registry (per-server, 5+ paths); test isolation needs the split. |
| 32 | Reviews route "fixture-only" | `server/src/routes/reviews.ts` | **Not overeng — a REGRESSION.** Was real (AL3/4/7), stubbed in cleanup commit 8da8bc95; should restore. See Part 4. |
| 33 | SidebarProps (23 props) | `web/src/shell/Sidebar.tsx:75-145` | Each prop tied to a feature; single consumer; grouping adds indirection without shared state. |
| 34 | WsClient state machine (247 LOC) | `web/src/services/ws-client.ts` | Reconnect/resubscribe/topic-routing all required; only the 5-tier backoff is mildly excessive. |
| 35 | Skill frontmatter parser | `pipeline/src/skill-frontmatter.ts` | `minToolCalls` used in prod telemetry; extensibility per plan. |
| 36 | Status mapping (8 wrappers) | `design-system/src/status-mapping.ts` | `noUncheckedIndexedAccess` forces casts; wrappers centralize 18 call sites. |
| 37 | Strategy Port envelopes | `shared/src/strategy-port.ts:30-237` | Extensibility (`isRoutine`), closed-union enforcement, third-party contract clarity. |
| 38 | Strategy Port single impl | `shared/src/strategy-port.ts` + impls | Kernel-first USP; minimal-strategy is the TDD harness; AC2. |
| 39 | Strategy extension tables | `db/src/schema.ts:690-738` | Real kernel/strategy boundary; correct 1:1 cardinality; forward multi-strategy. (Multi-strategy will need a discriminator — known gap.) |
| 40 | Thin fetch-wrapper hooks | `web/src/hooks/use{Team,Routine,...}.ts` | `useTeam.refetch` used; type safety + URL-encoding centralization; temp pending a real data layer. |
| 41 | ThreadShell + RichMessageCard | `design-system/src/ThreadShell.tsx`, `RichMessageCard.tsx` | Render-props keep DS layer free of web deps; promotion logic is a tested pure fn. |
| 42 | 3 unused design lint rules | `eslint-plugin-design/src/rules/no-{handrolled-select,...}` | Regression guards for completed ACs; **just need wiring** in `eslint.config.ts` (planning gap, not overeng). |
| 43 | Tunable attention+relevance scoring | `fabric/src/{scoring-config,relevance-scoring,attention-scoring}.ts` | Production-active every session; bounded; documented roadmap. |
| 44 | Tunable impact/usage weights = 0 | `fabric/src/attention-scoring.ts:144-152` | Staged L23+ infra; lore-documented; tested. |
| 45 | `attention_score` "dead spec" | docs + `server/src/routes/conversations.ts` | Actually active in the strategy table + KnowledgeList sort; spec is accurate. |
| 46 | `layerProximity` for L4 | `fabric/src/relevance-scoring.ts:121-130` | L4 score is dead, but L2/L3 differentiation is real (~3% boost); only ~6 LOC of genuine waste. |
| 47 | `validatePatchBody` no-op | `server/src/routes/observability-routes.ts:59-61` | Extension point for OTEL bearer-token redaction; pattern matches notifications/git-export routes. |

---

## Part 3 — The 2 Uncertain (verifier couldn't decide — worth a look)

- [ ] **U1 · Attention scoring — 8 weighted signals** — `fabric/src/scoring-config.ts:86-189`, `attention-scoring.ts:138-176`. `impact` and `usage` are genuinely dead (hardcoded 0, staged for L23+), but the inverse-weighted `repetition`/`confidence` signals are load-bearing per ACs — reducing to 3 signals would *break* AC3/AC4. Real question: is the 2-signal staging worth carrying now? Same family as B5/B6.
- [ ] **U2 · DesktopWorkerClient optional adapter param** — `desktop/src/desktop-worker-client.ts:91-101`. Adapter is never instantiated in `main.ts:695`; dispatch/stop messages are silently ignored (`if (!this.adapter) return`). Looks like **incomplete S4 implementation** (contradicts S4 AC "runs session using its local ClaudeAgentSdkAdapter"), not overengineering. Resolve: finish S4 wiring or remove the param.

---

## Part 4 — Bonus findings surfaced by verification (not in original 19)

The adversarial pass turned up real issues while *defending* findings:

- [ ] **Stale lore — propagation log L20** (`db/src/schema.ts:804-807`): claims "NO retention policy / follow-up should add TTL" but AF16 T16 shipped the reaper June 12. Update the comment.
- [ ] **Reviews route regression** (`server/src/routes/reviews.ts`): real DB-backed implementation (AL3/AL4/AL7) was incorrectly reduced to a 66-line fixture in cleanup commit 8da8bc95. The route is wired in prod and called by ReviewPage. **Restore the real implementation.**
- [ ] **3 design lint rules built but unwired** (`eslint-plugin-design`): `no-handrolled-select`, `no-local-status-builder`, `no-raw-settings-textarea` are tested and the codebase is compliant — but they're not in `eslint.config.ts`. Wire them (warn in web, error in design-system).
- [ ] **`riskTier` duplicated** across `knowledgeItems`/tasks and `taskStrategyFabric` — different domains (review routing vs session-end gate), but worth a note.

---

## Appendix — How to read this

Verdicts came from a two-pass process: an auditor proposes, an independent verifier (told to *find the justification*) confirms/rejects. 69% of findings were rejected — the survivors are the ones that held up. Severity is mostly "low" individually; the *value* is the pattern (Theme A) and the dead-weight in the hot scoring path (Theme B), not any single line.
