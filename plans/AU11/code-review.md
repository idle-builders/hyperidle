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
