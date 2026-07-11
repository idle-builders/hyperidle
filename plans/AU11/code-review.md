# AU11 — Code Review (Reviewer, Phase 4)

**Verdict: NOT DONE** (1 blocking WARNING). 0 CRITICAL, 1 WARNING, 3 NOTE.
All independent verification performed against real source + real command output (verify, guard,
harness lane), not the builder's self-report. Base `origin/main` = `6dd27dfd`. HEAD = `d8382ec1`.

The mechanical cut is excellent — 67/67 files rehomed, guard green + fixtures green, verify green,
harness-facing paths proven via 3 real binaries. The single blocker is dead-code **masking** where
AU11's own AC-4 + this repo's explicit stance require **deletion**.

## Independent verification performed
- `npm run verify` (full) → **exit 0**. Unit/component 3397 passed; integration 2501 passed / 6 skipped;
  build + desktop build + e2e legs green; attestation written for HEAD.
- `npx tsx scripts/au11-runtime-ownership-guard.ts` → **PASS (0 findings)**; `--fixtures` → **PASS**.
- `rg` sweep: **zero** real `app-runtime` import statements remain in production or tests. All 33
  residual `app-runtime` textual hits are `@lore`/doc comments or guard-script fixture strings (verified).
- `npm run test:integration:harness` → run twice (see harness section). AU11-touched files pass on every
  harness with available auth (builtin/claude/opencode). Only codex subtests fail — codex account
  usage-limit, external.
- Owner table re-derived vs `git diff --name-status -M`: 64 renames (most R100 pure), builtin split,
  boot split, shell deletes. Spot-checked content-changed moves — all import-path-only.

## AC table

| # | AC | Verdict | Evidence |
|---|----|---------|----------|
| 1 | No app-runtime/Fabric ownership boundary in boot/wiring/imports | **PASS** | `app-runtime/` dir gone; `index.ts`+`bootstrap.ts` deleted; `./app-runtime` pkg export removed; `bootstrapAppRuntime` split into `registerCoreDomainServices`/`registerAgentLayerServices` (server-factory.ts:90,173, wired :545-546); `src/routes` guard re-exports exactly {checkAndFireRoutine, provisionTeamRoutines, runBuiltinRoutine}; guard AC-1 green. |
| 2 | Core routes/domain don't import execution internals | **PASS** | Guard AC-2 green (0 findings) + `--fixtures` green. Descriptor-read routes all `import type` only, calling read-only metadata (`getCapabilitiesByType`/`getRegistrationMetaByType`/`listCapabilityDescriptors`/`.list`/`.size`). Real execution (`worker-ws`, `mcp-route`) relocated to agent-owned `services/`. |
| 3 | Agent-layer code doesn't own core CRUD except via contracts | **PASS** | Agent moves are byte-identical renames (R098-R100); baseline behavior inherited; guard boundary (agent-owned allowlist) respected; domain integration tests green. |
| 4 | Former services moved to owner OR deleted; none as pass-through | **FAIL (WARNING)** | 62 files rehomed cleanly, no alias/re-export shims at old paths (verified). BUT 5 provably-dead files preserved via knip `ignore` instead of deleted (see F1). |
| 5 | Existing behavior observable | **PASS** | verify green with import-path-only test edits (AL6/AL7 diff = pure `routes/`→`services/mcp-route.js`); relocated mcp-route + MCP bridge proven live via builtin+claude+opencode in AL6/AL7. |
| 6 | Review includes should-graph audit | **PASS** | This review re-derives the owner table + walks boundary checks; guard re-run; residual routine-scheduler→agent-selection edge confirmed as accepted AU8 item (`@lore` at routine-scheduler.ts:227). |

## Findings

### F1 — WARNING (blocking): 5 dead files masked via knip ignore instead of deleted (AC-4)
The removed `app-runtime/**` knip glob was replaced with 5 new top-level `ignore` entries + 4 new
`ignoreIssues` export-ignores. The 5 files are provably dead — kept "alive" only by the now-deleted
barrel:
- `knowledge/conflict-resolution.ts` (263 lines; `resolveConflict`/`canPromote`/`promote`/`mergeStructuredEdits`/`resolveConflictRecord` — **0 references anywhere**)
- `knowledge/layers.ts` (`isValidLayer`/`layerDepth` — **0 references**)
- `services/polling-watcher.ts` (`startPollingWatcher` — **0 references**)
- `services/founder-router.ts` (`routeToFounder` — **test-only**; removed from POST /items in O2)
- `services/provision-registry.ts` (`clearProvisionSessionFn` test-only; `set/getAgentSessionRequestCreateFn` **0 callers**)

No plan/spec marks any as future-wired. This violates AC-4 ("deleted as dead behavior; none remain as
pass-through wrappers"), the WP's destructive mandate ("classify, move, delete… instead of preserving
old ownership for convenience"), and this repo's explicit, repeated rule: *code reachable only via
test/story is dead → DELETE (don't ignore/mask); knip:production is the guardrail, don't weaken it.*
AU11 is the WP that unmasked these (deleting the barrel + `app-runtime/**` glob) — cleaning them is in
scope, not a separate concern.

**Fix:** delete the 5 files + the 2 orphan tests (`founder-router.test.ts`,
`bet-decomposition.test.ts`'s `clearProvisionSessionFn` usage — trim or drop); remove
`provision-registry.ts` + `polling-watcher.ts` from the guard's `AU11_AGENT_FILES`; remove the 5
`ignore` + 4 `ignoreIssues` entries added to `knip.json`. Then re-verify. If the builder has a genuine
reason to retain `conflict-resolution.ts` as dormant feature code, that must be stated explicitly with
a wiring plan — not concealed behind a knip ignore.

### N1 — NOTE: guard allowlist references soon-dead files
`AU11_AGENT_FILES` lists `provision-registry.ts` and `polling-watcher.ts` (both dead). Harmless Set
membership today, but must be dropped when F1 is fixed.

### N2 — NOTE: test file names still say "app-runtime"
`__tests__/app-runtime-domain-observability.integration.test.ts` (a good behavioral net for the moved
domains) and `__tests__/O3-service-move-bootstrap.integration.test.ts` reference the old name in
filename/prose. Cosmetic; not a production reference. Optional rename for clarity.

### N3 — NOTE: architecture-plan count label off (pre-existing)
Plan labels the agent bucket "~13" while enumerating 16 files (already flagged N1 in arch-critique).
Guard's `AU11_AGENT_FILES` correctly has 16. Cosmetic.

## The 4 flagged judgment calls — my rulings
1. **mcp-route reclassification (descriptor-read → still-direct-execution / relocated to `services/`)
   — CORRECT.** Body calls `enforcementRegistry.incrementForce(sessionId)` (line 109) and
   `bridgeRegistry.handleRequest(token, c.req.raw)` (line 131) — real MCP protocol execution + hook
   state mutation, not a capability list. Pure rename + `@lore`; logic byte-identical; only
   `server-factory.ts:51` import repointed. No route shim left behind (full move). Same treatment as
   `worker-ws.ts` — consistent and right.
2. **Extra descriptor-read allowlist entries (agent-profile/agents/workers, +assistant/teams/users)
   — CORRECT.** All are `import type` only. Direct pool calls are read-only metadata:
   agent-profile→`getCapabilitiesByType`+`.size`; agents→`getRegistrationMetaByType`;
   workers→`pool.list`; harnesses/connections→`listCapabilityDescriptors`(+`refreshDiscoveries`).
   assistant/teams/users make **zero** direct pool calls (forward the value to agent-owned dispatchers).
   Guard green confirms no value-import of a forbidden module from any of them. No execution.
3. **5 dead files + ~19 dead exports preserved via knip ignore — INCORRECT → F1 (delete them).** See above.
4. **`app-runtime-service-ownership.test.ts` deleted — CORRECT.** Its assertions were
   `toEqual(expect.any(Function))` structural smoke over the app-runtime grouping (the exact grouping
   AU11 dissolves) — near-zero behavioral value. Real behavior of every referenced function is covered
   by each module's own tests + the integration suites (`O3-service-move-bootstrap`, `sessions`,
   `app-runtime-domain-observability`). No unique coverage lost.

## Harness-facing integration lane (the flagged gap)
`.env` was provisioned but `vitest.integration.config.ts` / its setup file do **not** auto-load it, and
the sandbox blocks reading/sourcing the secrets file — so builtin `requireHarness` (checks
`process.env.OPENROUTER_API_KEY`) saw no key on the first run. Re-ran the two AU11-touched files with
`node --env-file=.env`:

- **AL6 + AL7 re-run: 31 passed / 3 failed (34).** Every pass includes the builtin, claude, and
  opencode variants — which exercise the relocated `services/mcp-route.ts` end-to-end (AL6: Stop hook →
  real `/api/mcp/:token/return-status`; AL7: `commit_file` → MCP bridge → capturing router).
- **All 3 failures are `[harness:codex]` subtests**, root cause an external codex ChatGPT-account
  usage cap: codex output is `{"type":"error","message":"You've hit your usage limit … purchase more
  credits"}` + `turn.failed` → turn never completes → no tool call / no hook POST → assertion fails.
  Documented in project memory (codex=subscription). NOT an AU11 regression.
- Full-lane first pass: claude/opencode/gh live-proofs green; builtin blocked on env (above);
  codex blocked on usage cap. AN2/AM2/cli-adapter codex failures share the same usage-limit cause.

**Conclusion:** the AU11 mcp-route/worker-ws relocations are proven working via 3 real binaries. The
harness lane has **no AU11-attributable failure**; the only reds are environmental (codex account cap;
builtin key not auto-loaded by the harness config). Not a blocker for AU11, but flag: the harness
config not loading `.env` is a standing infra friction for this lane.

## Positive-lens summary
- **Architecture:** clean two-owner cut; boundaries hold; no aliases/shims; documented residual edge is
  an accepted AU8 item. Boot split is faithful (`registerCore…`/`registerAgent…` replicate
  `bootstrapAppRuntime` composition). `src/routes` is a legitimate narrow public seam (3 named fns).
- **Design:** N/A (no UI).
- **Security:** no new surface; moves byte-identical; execution relocated within-package (no auth
  change); no secrets in diff; `@lore` comments substantive.

**Fix list (for the builder, round 2):**
1. Delete `knowledge/conflict-resolution.ts`, `knowledge/layers.ts`, `services/polling-watcher.ts`,
   `services/founder-router.ts`, `services/provision-registry.ts` (0-ref/test-only, git history keeps).
2. Delete/trim their orphan tests (`founder-router.test.ts`; `bet-decomposition.test.ts`
   `clearProvisionSessionFn` usage).
3. Remove those 5 files' `ignore` entries + the 4 `ignoreIssues` export-ignores added in `knip.json`.
4. Remove `provision-registry.ts` + `polling-watcher.ts` from the guard's `AU11_AGENT_FILES`.
5. Re-run `npm run verify` + `npx tsx scripts/au11-runtime-ownership-guard.ts` → green.

Once F1 is resolved, AU11 is ready for Phase 5 (retro) + ship.

---

# AU11 — Code Review ROUND 2 (Reviewer, Phase 4)

**Verdict: DONE.** 0 CRITICAL, 0 WARNING, 0 blocking NOTE. Round-1 blocker F1 resolved.
All claims independently verified against real source + real command output at HEAD `8c7eca17`
(fix commit `1c4cee82`), base `origin/main` `6dd27dfd`. Not trusted from the builder self-report.

## Independent verification performed (round 2)
- `npm run check` → **PASS, 0 errors, all 10 packages.**
- `npm run lint` → **PASS.** Biome baseline warnings only (487 warn / 146 info, non-blocking, exit 0);
  all guards green: honest-harness, test-naming, ag7, au3, au6, au7, au9, au10, **au11**.
- `npx knip` (full, incl exports/types) → **exit 0**, only 55 baseline config hints; **zero** Unused
  files / exports / types sections. `npm run knip:production` → clean. Dead code genuinely gone, not re-masked.
- `npx tsx scripts/au11-runtime-ownership-guard.ts` → **PASS (0 findings)**; `--fixtures` → **PASS**.
- Committed attestation freshness: recomputed `sourceHash()` with the script's exact JS logic →
  `df7208…d3c0c4` for both current HEAD and commit `1c4cee82` = the attestation's `srcHash`. **MATCH** —
  attestation is genuinely against the current source tree (`8c7eca17` only adds the attestation JSON,
  which `sourceHash` excludes), `status:passed dirty:false scope:affected`. Full verify (check+lint+knip+
  test:all+build) is validly covered at this exact source state. (`check-attestation.ts` HMAC path is
  CI-secret-gated and not runnable locally — srcHash identity is the sanctioned local proof.)
- Harness lane not re-run for round 2: the round-2 diff is pure deletion of unreferenced code +
  comment/test-cleanup — it touches no harness-facing path (mcp-route / worker-ws / adapters unchanged).
  Round-1's 3-binary live proof of the relocations still holds.

## The 7 fix claims — each independently verified
1. **5 dead files deleted — TRUE.** `git show --stat 1c4cee82` + filesystem confirm
   `conflict-resolution.ts`(-278), `layers.ts`(-9), `polling-watcher.ts`(-122), `founder-router.ts`(-20),
   `provision-registry.ts`(-48) gone. `rg` for import statements → **NO IMPORTS**. The 3 residual textual
   hits (`org-routing.ts:28`, `task-dispatcher.ts:18`, `P2-fallback…:14-15`) are all `@lore`/doc comments.
2. **Orphan test deleted + test trim clean — TRUE.** `founder-router.test.ts`(-41) deleted.
   `bet-decomposition.test.ts` trim removed only the `afterEach(() => clearProvisionSessionFn())` block +
   its import — a **no-op cleanup** (nothing in the test ever registered a fn into that registry). The real
   assertion (`records a decomposition request and does not select/start a harness in domain code`) is
   preserved. **No coverage lost.**
3. **knip.json byte-identical to origin/main except the `app-runtime/**` glob — TRUE.**
   `git diff origin/main -- knip.json` = a single removed `ignoreIssues` line
   (`"packages/server/src/app-runtime/**": ["exports","types"]`). Zero new `ignore`/`ignoreIssues` entries.
4. **Guard allowlist 16→14 — TRUE.** `AU11_AGENT_FILES` now enumerates exactly 14 entries;
   `provision-registry.ts` + `polling-watcher.ts` removed (confirmed absent by grep).
5. **17+1 dead exports deleted; live types correctly kept — TRUE.**
   - Deleted `types.ts` names have **0 non-types.ts server callers** (verified per-name). The 3 names that
     still show refs resolve elsewhere, not to the deleted local decls: `KNOWLEDGE_LAYERS`/`scopeToLayer`
     import from `@hyperidle/shared`; `PropagationStatus` in `lifecycle-propagation.ts` is a **separate
     local narrow type decl**, not the deleted export.
   - "Superseded `@hyperidle/shared` duplicates" spot-check: `RiskTier`, `AutonomyLevel`, `KnowledgeScope`,
     `PropagationStatus`, `KNOWLEDGE_LAYERS`, `KnowledgeSortOption` **all exist in
     `packages/shared/src/knowledge.ts`** and are what callers import now. Confirmed.
   - Kept types (`KnowledgeLayer`/`KnowledgeStatus`/`KNOWLEDGE_STATUSES`/`KnowledgeKind`/`PropagationLevel`)
     **all have real local callers** (e.g. `knowledge-repository.ts:25` `import type … from "./types.js"`,
     `practice-meeting.ts`, `lifecycle-propagation.ts`). Correctly kept.
   - `events.ts` unmask is **runtime-safe**: only the never-wired `setKnowledgeEventBus` injection seam +
     deprecated `knowledgeEvents` Proxy removed (the old `@lore` claiming `app.ts` wires the setter was
     stale — no reference exists anywhere, and `check` would have failed if `app.ts` used it). Emission
     path (`getKnowledgeEvents()` over the default `KnowledgeEventEmitter`) intact; knowledge-event
     integration tests pass under the attested full run. Remaining `knowledgeEvents` hits are local test vars.
6. **Stale `@lore` updated — TRUE.** Spot-checked `bet-decomposition.ts` (dropped `→ provision-registry →`
   from the pipeline path desc), `session-run-registry.ts` (dropped `(like provision-registry.ts)`),
   `org-routing.ts` / `P2-fallback…` (founder-router now described as dead/0-callers). All accurate.
7. **Green-state claims — CONFIRMED** (check/lint/knip/guard re-run live above; full test:all/build via the
   fresh, srcHash-matched attestation `status:passed dirty:false sha=1c4cee82`).

## Round-1 NOTE findings — current status
- **N1 (guard allowlist references soon-dead files) → RESOLVED.** Both dropped in fix #4.
- **N2 (test filenames still say "app-runtime") → UNCHANGED, still cosmetic/optional.** Not made worse;
  `app-runtime-domain-observability.integration.test.ts` remains a good behavioral net. Non-blocking.
- **N3 (arch-plan agent-bucket label "~13" vs enumerated count) → UNCHANGED, cosmetic.** Bucket is now 14
  files post-deletion; label still approximate. Non-blocking.

## AC table (round 2)

| # | AC | Verdict | Evidence |
|---|----|---------|----------|
| 1 | No app-runtime/Fabric ownership boundary in boot/wiring/imports | **PASS** | Unchanged from R1; guard AC-1 green + fixtures; no barrel/boot-shell/`./app-runtime` export/dir. |
| 2 | Core routes/domain don't import execution internals | **PASS** | Guard AC-2 green (0 findings) + `--fixtures` green. |
| 3 | Agent-layer code doesn't own core CRUD except via contracts | **PASS** | Guard boundary respected; domain integration green (attested). |
| 4 | Former services moved to owner OR deleted; none as pass-through | **PASS (was FAIL)** | 5 provably-dead files **deleted** (not masked); knip.json clean vs origin/main; `npx knip` zero dead files/exports; +18 dead exports removed; zero new knip ignores. F1 fully resolved. |
| 5 | Existing behavior observable | **PASS** | Import-path-only test edits; knowledge-event emission intact; test:all green (attested); harness relocations proven R1. |
| 6 | Review includes should-graph audit | **PASS** | Owner table re-derived; guard re-run; residual routine-scheduler→agent-selection edge = accepted AU8 item. |

## Verdict
**DONE.** F1 (the sole round-1 blocker) is resolved by genuine deletion, not re-masking; the deletion is
correctly scoped (each removed name proven 0-caller or a `@hyperidle/shared` duplicate; each kept name has
a real local caller); no live behavior removed; all gates green; attestation fresh against HEAD.
**AU11 is cleared for Phase 5 (retro) + ship.**
