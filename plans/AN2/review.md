# AN2 — Code Review (Phase 4)

**Verdict: NOT DONE.** Two CRITICAL blockers. The per-harness live-proof is **theater** — running it confirms zero carriers prove end-to-end auth+retrieval. And the CLI-key / claude / opencode env carrier (`plan.envInjections`) is computed then dropped on the floor — it never reaches a spawned child, so `GH_TOKEN` injection (AC2's named example) cannot work in production. Typecheck green, unit suite green (20/20), but green proves only that files get written.

---

## CRITICAL findings

### C1 — Live-proof is theater; no carrier proves end-to-end auth+retrieval
`packages/server/src/harness/__tests__/AN2-connection-provisioning.real-harness.test.ts`

I ran it (`npm run test:real-harness`, all four binaries present: claude, codex, opencode, gh). Result:

- **claude (`:177-313`)** — real CLI spawned. Agent response: *"I don't see a `ping_test` tool from the `an2-test` MCP server in my available tools."* The MCP connection **FAILED**. The test logs a WARNING (`:290-298`) and **passes anyway** — its only hard assertions are `mcpJson.mcpServers["an2-test"]` is defined (`:307`) and a completion event fired (`:308`). The comment at `:296-298` admits it: *"R1 risk: claude trust-prompt may block external MCP server... For now: log and pass."* This is precisely the R1 trust-prompt the research flagged UNVERIFIED (research §4) — and it **silently degraded**. The MCP server's echo token `AN2_PROBE_OK` appears in **zero** completions.
- **codex (`:322-372`) / opencode (`:381-438`)** — print `"LIVE PROOF"` but **never spawn the binary**. They call `applyProvisioningPlan` (write a file), `mcpServer.close()`, then assert file contents. No CLI spawn, no transport, no tool call. The MCP test server is closed before any client could reach it. Config-shape assertions mislabeled "LIVE PROOF" — identical to the unit/integration tests, [[mock-validation-trap]].
- **gh CLI-key (`:444-501`)** — skipped (no `GH_TOKEN` in env). The sole CLI-key path is unproven on this run.
- **builtin** — correctly scoped out (C1 in arch); not a finding.

**Contract violated:** concept hard-rule 7 + research §5 ("spawning a real session... confirming the agent **actually authenticates to and calls a real MCP server** with the held token... a green test against a stub of our own client proves nothing"). The codebase already has the correct bar: `AL7-two-session-trust-first.real-harness.test.ts:14` asserts `capturedCallCount >= 1` (real binary called the tool via MCP). AN2 falls below its own repo's standard.

**Fix:** (a) claude — investigate `bypassPermissions` + `--strict-mcp-config` (the TODO at `:298`) so the external Bearer MCP connects without a trust prompt; assert `completions.includes("AN2_PROBE_OK")` as a HARD assertion, not a warning. If claude genuinely cannot connect to a project-scoped external Bearer MCP headlessly, that is a **carrier defect** to surface, not paper over. (b) codex/opencode — actually spawn the real binary against the live MCP server and assert the echo token returns, mirroring the claude shape and AL7's `capturedCallCount`. (c) gh — run once with a real token present and record it; WP is not `done` until each carrier-bearing harness has a real green run (hard-rule 7 skip-discipline).

### C2 — `plan.envInjections` is dead: CLI-key + claude/opencode bearer env never reaches the child
`packages/server/src/services/connection-provisioning.ts:270` produces `plan.envInjections` (GH_TOKEN/GITHUB_TOKEN for CLI-key `:209`; `<SVC>_MCP_TOKEN` `:232`; `<SVC>_TOKEN` convention `:237`). **Nothing ever consumes it.**

- `applyProvisioningPlan` returns `mcpTokenEnv` derived **only** from the codex writer (`:388`). Claude-native (`:342`), opencode (`:337`), and no-carrier/CLI-key (`:348`) all return `{}`.
- `session-provisioning.ts:849-860` merges only `connEnv` (the return of `applyProvisioningPlan`) into `mcpTokenEnv`. `plan.envInjections` is never passed, never merged.
- Grep confirms: `.envInjections` is referenced **nowhere** outside `connection-provisioning.ts` and tests.

**Consequence:** for the CLI-key path (AC2's named example "read a repo" via `gh`/`GH_TOKEN`), the token is computed and discarded — `gh` in the spawned session sees no token. For claude/opencode the bearer token rides the inline `.mcp.json`/`opencode.json` header (so those work via the file), making `envInjections` redundant there — but the CLI-key path has **no file carrier**, env is its only carrier, and it is severed.

**Contract violated:** `architecture.md:183` ("inject `GH_TOKEN`/`GITHUB_TOKEN`... into child env via `mcpTokenEnv` → real `gh`") and `:168` ("the merged `mcpTokenEnv` flows into `sessionStartConfig.mcpTokenEnv`"). The arch says envInjections → mcpTokenEnv; the code never does it.

**Fix:** in `applyProvisioningPlan`, fold `plan.envInjections` into the returned `mcpTokenEnv` (all carrier branches), OR merge `plan.envInjections` directly at `session-provisioning.ts:857`. Note the C1 theater is *why* this was never caught: no live run ever spawned a child that read the env.

---

## WARNING findings

### W1 — Integration test sidesteps the real `app`/spawn path on a false pretext
`AN2-connection-provisioning.integration.test.ts:19-21` claims it uses the db-only fixture to avoid "a pre-existing Zod schema error in artifact-preview.ts:41 — unrelated to AN2, present on the base branch." **`npm run check` is green across all 12 packages.** No such error exists. The effect: the integration test never exercises `provisionSession` through the real `app` fixture, so the C2 dead-env path slips through. Use the server `app` fixture and drive a real session-provisioning spawn (the arch's "real deployed session", research §5).

### W2 — `/validate` reachability probe treats ANY HTTP response as "working"
`routes/connections.ts:484` — `if (response.status > 0) return "working"`. A 401/403/404 from the pinned IP marks the connection healthy. AC (AN1) says health reflects "whether it currently works"; a 401 means the held token does **not** work. The MCP-typical-4xx rationale (`:481`) is too broad — it greenlights auth failures. Narrow to: 2xx, or MCP-handshake-shaped responses; treat 401/403 as `needs-attention`.

### W3 — Provisioning-failure swallow can hide a real break behind "graceful degradation"
`session-provisioning.ts:861-869` catches all connection-provisioning errors and continues (correct per hard-rule: a missing tool must not kill the spawn). But combined with C1 (no live proof) and C2 (dead env), a genuine provisioning failure is indistinguishable from success in every automated gate. Acceptable to not abort the spawn; NOT acceptable that no test asserts the success path through this block with a real child. Tie-off lands with the C1 fix (a real spawn that observes the tool actually present).

---

## NIT findings

- **N1** `connection-provisioning.ts:151` — `r.authSource as HeldAuthSource` cast. Justified by the `inArray` filter + comment; acceptable escape hatch (1, documented).
- **N2** `integration.test.ts:380` — `expect(true).toBe(true)` in the AC6 else-branch. Filler assertion ([[testing rule]]: never assert `toBeDefined`/trivially-true). Restructure so the meaningful branch is the only path, or assert the file's absence directly.
- **N3** `real-harness.test.ts:153-169` builtin scope-out test ends `expect(true).toBe(true)` — same filler. The scope-out is legitimately a no-op; consider a doc-only marker rather than a passing assertion that proves nothing.
- **N4** `asMcpShape` cast (`real-harness.test.ts:98-100`) — **NOT a finding.** Verified legitimate: same zod-version-seam bridge as `mcp-bridge.ts:30 asMcpInputSchema` (server zod 4.4.3 vs SDK-deduped zod 3.25.76), behavior-neutral, no wire-shape change. The SDK accepts it at runtime.

---

## Positive lens results (what holds)

- **No gate / no broker** — confirmed. Provisioning installs config + steps out; no approval/reversibility classifier anywhere. Hard-rule 1 holds.
- **`$HOME` hygiene** — confirmed. Every write (`writeCodexTomlEntries:369`, opencode `:406`, claude `:473`) is under `sandboxPath`. codex uses `<sandbox>/.codex-home` not `~/.codex`. HR3 unit + integration assert the path prefix. No write touches real `$HOME`. Hard-rule 3 (location) holds.
- **Secret hygiene** — confirmed. Decrypted token only via `resolver.resolve` (`:198`); never in a route response (`rowToView` excludes it), never in an error/log (warnings interpolate `conn.id`/`reason`, not the token; unit test `:217-238` asserts this). No `console.log` of plaintext.
- **Per-user isolation** — holds for the single-founder model. `listActiveHeld:139` scopes `eq(userId)`; `resolveOwningHumanUserId` is the documented seam for future multi-tenant. AC7 integration test proves user B's plan excludes user A's connections. Hard-rule 4 holds today.
- **Genericity** — confirmed. Second service = one row + (for CLI-key) one `SERVICE_CLI_ENV` entry; no per-service client code. Hard-rule 6 holds. (Caveat: AC4 "second service reachable by configuration" is proven for the MCP path; the CLI-key generic path is undermined by C2.)
- **Idempotent re-apply** — `buildProvisioningPlan` is a pure read-projection; AC4 integration test asserts byte-equal codex config across respawn. Hard-rule 2 holds (for the file carrier).
- **`asMcpShape` cast** — legitimate (see N4).

---

## Acceptance-criteria completeness

| AC | Requirement | Covered? | Evidence / Gap |
|---|---|---|---|
| AC1 | Every spawn has the service's tools present + authenticated, no re-auth | **PARTIAL** | File-carrier (claude/codex/opencode MCP) written + wired (Phase 8b-connections). But "authenticated" is **unproven live** (C1) and the env-carrier (CLI-key) is severed (C2). |
| AC2 | Agent performs a **real op against a real service end-to-end**, no gate | **NOT MET** | This is the live-proof AC. claude live run FAILED (tool not visible); codex/opencode never spawned; gh skipped. Zero end-to-end retrievals (C1). |
| AC3 | Survives respawn — destroy, respawn, tools work again | **PARTIAL** | AC4 integration test proves config is byte-identical across respawn. "tools work" again rides AC2, which is unproven (C1). |
| AC4 | >1 service; second by **configuration not code**; ≥1 real external MCP | **PARTIAL** | Two services materialize from one path (integration `:289`). "real external MCP server" end-to-end unproven (C1). CLI-key second-service path broken (C2). |
| AC5 | Connect/disconnect changes next spawn's toolset; after disconnect tool gone | **MET** | Integration `:330` proves delete → absent in fresh sandbox. Spawn-time read confirmed. |
| AC6 | One user's tools never in another user's sandbox | **MET** | Integration `:389` (AC7 block) proves isolation; query userId-scoped. |

Two of six ACs MET; the two load-bearing live-proof ACs (AC2, AC4's "real external MCP") are NOT met.

---

## Blocking summary

1. **C1** — live-proof is theater (claude silently degraded; codex/opencode never spawn; gh skipped). Make each carrier prove the agent actually calls the MCP tool / `gh` op and retrieves real data, asserted hard.
2. **C2** — `plan.envInjections` never merged into `mcpTokenEnv`; CLI-key (`GH_TOKEN`) and convention carriers reach no child. Wire envInjections → mcpTokenEnv.

Resolve C1 + C2 (and W1 so the integration test runs the real spawn path). The architecture is sound and the file-carrier mechanics are correct; the gap is that nothing proves authentication actually happens, and one whole carrier is disconnected.
