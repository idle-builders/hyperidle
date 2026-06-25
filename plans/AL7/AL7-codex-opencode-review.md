# AL7 codex+opencode MCP wiring delta — Phase 4 code review

**Reviewer:** single-persona reviewer (Phase 4, carrying Phase 2 v1+v2 critique context). **PR #351**, branch `concept/AL7-review-execution-loop`. **Target:** the locked delta plan `plans/AL7/architecture-codex-opencode.md` (v2, 9/10, R1 closed).

## VERDICT: NOT DONE

One CRITICAL false-green: the founder's central requirement — prove all three real CLIs against the **PRODUCTION** MCP transport — is **NOT met**. All three real-harness lanes still route through the test-only stand-in (`buildStatefulMcpServer` + `app.all("/mcp/:token")`), which the plan REQUIRED deleting (T3 / §2a-prereq / AC10). The production-side R1 closure (T0/T0b) is genuinely correct and proven — but it is the *deterministic* anchor, not the *end-to-end* one. The end-to-end binary proof exercises a test construct, not production transport, for **all three binaries**.

---

## THE false-green vector (hardest scrutiny — confirmed real)

The plan (§2a-prereq, T3, AC10, Migrations) is unambiguous: **DELETE** `buildStatefulMcpServer` (was lines 266–311) + the `app.all("/mcp/:token")` route override (was 372–378), and re-point `startAl7TestServer`/`rebuildBridge` at the production `createMcpBridge` + the real `createMcpRoute` catch-all at `/api/mcp/:token`. None of that happened.

**Code evidence (`AL7-two-session-trust-first.real-harness.test.ts`):**
- `buildStatefulMcpServer` STILL EXISTS — defined at **:298**, used at **:374** (`startAl7TestServer`) and **:453** (`rebuildBridge`). It hand-rolls its own `McpServer` + `WebStandardStreamableHTTPServerTransport` + tool handler — NOT the production `createMcpBridge`.
- The route override STILL EXISTS — `app.all("/mcp/:token", ...)` at **:404**, which calls `currentMcpState.transport.handleRequest(c.req.raw)` directly, **bypassing `bridgeRegistry.handleRequest`** (the production path at `mcp-route.ts:116` → `mcp-bridge-registry.ts:73`).
- `buildMcpUrl` (**:576**) points every CLI at `${serverUrl}/mcp/${token}` — the **override path**, NOT the production `/api/mcp/${token}`.
- The file header lore is self-incriminating: **:44–46** "the test-only `buildStatefulMcpServer` and the `app.all("/mcp/:token")` route override **will be deleted in T3 (green phase)**." T3 was never executed. The green-phase builder's flag is correct.
- Per-lane lore confirms it: codex lane **:983** "For now the test-only bridge is used and the URL is /mcp/:token"; **:925** "The rebuildBridge helper **will use** createMcpBridge once T0 is in." (Future tense — never done.)
- `writeMcpConfig` lore **:550–561** still describes the OLD stateless-vs-stateful divergence and routes to `/mcp/:token` "NOT /api/mcp/:token (bridge-registry catch-all with stateless transport)." This was true pre-T0; it is now stale and wrong (production is stateful).

**Which lanes hit production vs stand-in:**

| Lane | Constructs `createMcpBridge`? | Hits `/api/mcp/:token` (prod route)? | Through `bridgeRegistry.handleRequest`? | Verdict |
|---|---|---|---|---|
| claude (`:610`) | NO | NO (`/mcp/:token` override) | NO | **STAND-IN** |
| codex (`:947`) | NO | NO | NO | **STAND-IN** |
| opencode (`:1224`) | NO | NO | NO | **STAND-IN** |

**Why this is CRITICAL and not a nit:** the plan's own R1 rationale (and v1 critique) establishes that codex/opencode have **no SDK adapter** — the HTTP bridge is their ONLY production transport. The stand-in diverges from production in material ways the lanes therefore never exercise:
1. **The registry token-lookup / 401 path** (`mcp-bridge-registry.ts:73–78`). The override does its own token check (`:406`) and never calls `handleRequest`. The documented sanity-break ("wrong token → 401 → captured stays 0") fires against the override's check, NOT the production registry's.
2. **The production `createMcpBridge` tool wiring** — `toolResultToCallToolResult` (`mcp-bridge.ts:66`) + role-filtered registry + the `asMcpInputSchema` zod-brand bridge (`:30`). The stand-in re-implements the tool handler inline (`:323–337`) with a different shape.
3. **Production transport is now stateful** (`mcp-bridge.ts:124`); the stand-in is *also* stateful (`:306`) — so they happen to be behaviorally equivalent on the session-mode axis, which is exactly why the green lanes are misleading: they prove the *concept* works against a faithful double, not that the *production object* works. That is the textbook false-green the founder rejected ("proof exercises a test construct, not production transport").

The deterministic T0b proof closes the session-capability question in CI for the production bridge — but T0b uses a `buildMinimalRegistry` (commit_file only), not `buildToolRegistry`, and it is the SDK `Client` driving it, not a real CLI binary. So **no test in the suite proves a real codex/opencode binary completes a tool call against the production `createMcpBridge` + `createMcpRoute`.** That conjunction is precisely AC10, and AC10 is unproven.

---

## Live-proof realness (verified — assertions are NOT weakened)

I ran the lanes locally (all 3 binaries installed + authed): **7/7 passed in 82s** (claude s1/s2 + wiring, codex s1/s2, opencode s1/s2). Real binary spawns, real file writes. The assertions are genuine and were not relaxed:
- session-1: `captured.length >= 1` + `captured[0].toolId === "commit_file"` (real MCP capture). Real.
- AC8 named control: `expect(fs.existsSync(proof.txt)).toBe(false)` in capture mode — present as its own `expect` in BOTH codex (`:1054`, `:1144`) and opencode (`:1301`, `:1376`) lanes. v1-W2 closed. Real.
- session-2: `fs.existsSync(proof.txt) === true` + content `=== "al7-proof"` + `exitCode !== null` + stdout `turn.completed` (codex) / `step_finish||turn.completed` (opencode). Real file written by the real binary. Real.
- The codex/opencode WIRING fixes are legitimate, not assertion loosening: `--dangerously-bypass-approvals-and-sandbox` (codex MCP-approval bypass, lore `:931`), `closeStdin`/pipe+end (codex stdin hang, `:497`/`:940`), TOML dup-key config refresh between sessions (`:1156`), `--model openrouter/~anthropic/claude-haiku-latest` provider-prefixed (opencode). No `expect()` was weakened to accommodate a quirk.

So the lanes are a genuine, strong proof of the trust-first loop — **against the stand-in.** The only defect is the transport they point at.

## R1 closure in production code (verified — CORRECT)

- `mcp-bridge.ts:124` IS flipped to `sessionIdGenerator: () => crypto.randomUUID()`. Lore `:88–99` updated to stateful + documents the teardown chain (N9 closed). Token (`:118`) is independent of session mode. Correct.
- **Teardown frees the per-session transport, no leak:** `mcp-bridge-registry.ts:47–71` `unregister()` deletes the Map entry + `mcpServer.close()` → transitive `transport.close()`, try-catch-wrapped. Stateful adds only a `sessionId` string + `_initialized` flag, GC'd with the instance. Confirmed.
- **T0b (`mcp-bridge-stateful.integration.test.ts`) genuinely drives the PRODUCTION factory+route** through init→list→call via the SDK `Client` + `StreamableHTTPClientTransport` at `/api/mcp/:token`, asserts `commit_file` listed + file written via `registry.invoke`. Sanity-break: POST without `mcp-session-id` → `expect([400,404]).toContain(status)`. Runs in `test:all`. **I sanity-broke it myself**: reverted the flip to `sessionIdGenerator: undefined` → T0b went RED (both the multi-request test AND the sanity-break, got 500). Restored. The R1 proof is real and anti-vacuous. AC9 fully met.
- Back-compat: `mcp-bridge.integration.test.ts` (+15 lines) green with the flip; 22/22 integration tests pass. Confirmed.

## Other lenses (all clean)

- **live-proof-lanes.ts** — codex/opencode flipped to real `which` probes (`:60–67`), `absent-fail` on absence (AC7), `isCodexAvailable`/`isOpencodeAvailable` mirror `isClaudeCodeAvailable` (execFileSync which). Per-harness `wiring-needed` matrix block DELETED from the AL7 test (grep confirms gone). `wiring-needed` retained in the union for future harnesses. Correct.
- **cli-mcp-config.ts** — clean discriminated dialect writer; codex token via `HYPERIDLE_MCP_TOKEN` env (NOT inline in toml), opencode inline via `JSON.stringify`. Security lore accurate. Threading verified: `cliMcpDialect` exposed (`cli-harness-adapter.ts:710`), `mcpTokenEnv` injected OUTSIDE allowlist (`:363`), threaded from `session-provisioning.ts:782,878`. N6 closed.
- **session-provisioning.ts Phase 8b** — `writeCliMcpConfig` called keyed on `cliMcpDialect` (`:774`), token threaded; no per-backend branch in the router (AC6 — transport-agnostic invariant preserved). Correct.
- **adapter-pool.ts** — opencode `args` → headless `run` form incl. `--model {{model}}`, `eventFormat: "text"→"ndjson"`; codex `mcpConfig: codex-toml`. AL6 `reEngageCarrier` protected test (`AL6-...test.ts:1134`) still reads the field — preserved. W3 opencode JSONL normalization is flagged as a builder lore note (`adapter-pool.ts:403`) but **I did not find a T6 sub-assertion proving ≥1 opencode event normalizes to a structured (non-`unknown`) type** — see WARNING-B.
- **Security** — no new route; token is bridge session key, per-session, sandbox-scoped; `mcp-session-id` is not an auth credential (unknown path token still 401s at the registry before the transport). No token leak to disk outliving the session (sandbox is per-session). commit_file sandbox containment intact (writes under `sandboxPath`). STRIDE: no new surface. Clean.
- **Simplification / slop** — no over-engineering. ONE issue: the dead `buildStatefulMcpServer` + override are slop (see WARNING-A), but that is subsumed by the CRITICAL since they are not yet dead — they are load-bearing for the (wrongly-wired) lanes.

---

## AC completeness table

| AC | Requirement | Proven by | Status |
|---|---|---|---|
| AC1 | codex tool call routes via MCP → registry.invoke (s1 capture) | codex lane `:1045` (`captured>=1`, `toolId==="commit_file"`) | **Routes via STAND-IN, not production bridge** — CRITICAL |
| AC2 | opencode s1 capture | opencode lane `:1293` | **STAND-IN** — CRITICAL |
| AC3 | codex s2 executes approved op → real file | codex lane `:1193–1194` (file + `"al7-proof"` + `turn.completed`) | **STAND-IN** — CRITICAL |
| AC4 | opencode s2 → real file | opencode lane `:1420–1421` (file + content + `step_finish`) | **STAND-IN** — CRITICAL |
| AC5 | per-binary MCP config shape | `cli-mcp-config.integration.test.ts` (toml/json shape, token placement) — passed | **MET** |
| AC6 | router transport-agnostic, no per-backend branch | `check` + review: `tool-registry.invoke` unchanged; dialect only in writer+config | **MET** |
| AC7 | absent codex/opencode → lane FAILS | `live-proof-lanes` probe `absent-fail`; `AL7-harness-absent-fail.test.ts` | **MET** |
| AC8 | non-approval-holds (captured-but-unapproved does NOT execute) | NAMED `expect(...).toBe(false)` both lanes (`:1054,1144,1301,1376`) | **MET** (asserts against stand-in transport, but the capture/hold logic is router-side, not transport-side — acceptable) |
| AC9 | production bridge session-capable (stateful) | T0b — verified RED→GREEN with my own sanity-break | **MET** |
| AC10 | **real CLIs prove against the PRODUCTION bridge, not a stand-in** | "All three lanes hit `createMcpBridge` + real `createMcpRoute`; stand-in DELETED" | **NOT MET** — stand-in still present; lanes never construct `createMcpBridge` nor hit `/api/mcp/:token` |

AC1–AC4 are technically green but their *transport contract* (AC10) is violated, so they do not prove the production claim. AC10 is the founder's explicit requirement and is unmet.

---

## What the builder must fix (to reach DONE)

**CRITICAL-1 — Re-point all three lanes at the production bridge (execute T3 / §2a-prereq, finally).**
1. DELETE `buildStatefulMcpServer` (`:298–343`) and the `app.all("/mcp/:token")` override (`:396–410`).
2. In `startAl7TestServer`: build the bridge via `const bridge = await createMcpBridge({ sessionId: testSessionId, registry: capturingRouter.registry })`, `bridgeRegistry.register(bridge)`, and rely on the existing `createMcpRoute(bridgeRegistry, enforcementReg)` catch-all (already mounted under `/api`). Expose `bridge.token`.
3. In `rebuildBridge`: `await bridgeRegistry.unregister(oldToken)` → `createMcpBridge({...newRouter.registry})` → `register` → update token.
4. Change `buildMcpUrl` to `${serverUrl}/api/mcp/${token}` (production path). Delete the stale `/mcp/:token` lore (`:550–561`) and the "will be deleted in T3" header lore (`:44–46`).
5. Re-run `npm run test:real-harness` — all 3 lanes must stay green THROUGH the production transport. (They will: production is now stateful, so the only change is plumbing — exactly the plan's claim. The claude assertions are protected and must not change.)
6. Re-run the documented sanity-break (wrong token) and confirm it now hits the production registry 401, not the override check.

**WARNING-A — stale/dead lore once CRITICAL-1 lands.** After deletion, remove the now-false comments. Until then they actively mislead (they claim production wiring that does not exist). If for any reason the stand-in is kept, that is an automatic re-fail.

**WARNING-B — W3 opencode normalization has no proving assertion.** The plan (R3/W3, carried v1→v2) required T6 to run a real `opencode run --format json` spawn through `normalizeHarnessEvent` and assert ≥1 event normalizes to a structured (non-`unknown`) type, else add the opencode pre-map. The lane asserts on raw stdout (`step_finish`) which "the MCP router doesn't depend on" (lore `:1427`) — that sidesteps the obligation rather than meeting it. No test asserts opencode events normalize to a structured type. Either add that assertion (and the pre-map if it fails) or document explicitly that opencode loop event-handling (return-detection, cost) is knowingly unproven for this delta. As-is, the `eventFormat: "ndjson"` change is unproven for opencode.

**NIT-1 — T0b uses `buildMinimalRegistry` (commit_file only), not `buildToolRegistry`.** Acceptable for a session-capability proof (avoids DB), and the plan permits it. No action required; noted so it is not mistaken for production-registry coverage.

---

## Summary

Production R1 closure is excellent and genuinely proven (T0b RED→GREEN sanity-break passed under my own revert). The wiring, config writer, probe truthing, security, and transport-agnostic invariant are all correct. But the headline deliverable — proving all three real CLIs against the PRODUCTION transport — was not executed: T3 never deleted the stand-in, and all three lanes route through `buildStatefulMcpServer` + `/mcp/:token`. The 7 green lanes prove the loop against a faithful double, which is the exact false-green the founder rejected for codex/opencode (no SDK fallback). **NOT DONE** until CRITICAL-1 is fixed and the lanes re-run green through `createMcpBridge` + `/api/mcp/:token`.

---

# ROUND 2 — re-review of the T3 + W3 delta (fix commit d87ab89f)

## VERDICT: DONE

Both prior blockers are genuinely closed against the tree (verified by reading the code, the fix diff, deterministic sanity, and a live real-harness run). Verdict flips to **DONE**.

## CRITICAL-1 (T3 — re-point lanes at production bridge) — CLOSED

Verified each prior sub-claim against `AL7-two-session-trust-first.real-harness.test.ts` + the fix diff (`git diff d87ab89f^ d87ab89f`):

1. **`buildStatefulMcpServer` DELETED** — function body gone (was 266–311); only a one-line tombstone comment (`:276–278`) + descriptive lore remain. `grep buildStatefulMcpServer` over `packages/` finds zero live code — only comments documenting the deletion. The hand-rolled `McpServer` + `WebStandardStreamableHTTPServerTransport` imports were removed (diff drops `@modelcontextprotocol/sdk/server/*` + `node:crypto` imports). No test-only transport stand-in remains anywhere.
2. **`app.all("/mcp/:token")` override DELETED** — gone from the diff; `grep 'app.all("/mcp'` finds zero (only a comment string at `:45`). The lanes now mount only `createMcpRoute(bridgeRegistry, enforcementReg)` at `/api`.
3. **Production wiring** — `startAl7TestServer` (`:317`) and `rebuildBridge` (`:367`) both construct via `createMcpBridge` from `../../mcp/mcp-bridge.js` (`:79`), `bridgeRegistry.register(...)`, and the request path is the production `router.all("/mcp/:token")` → `bridgeRegistry.handleRequest(token, raw)` (`mcp-route.ts:116–119`) → registry `lookup` → **401 on unknown token** (`mcp-bridge-registry.ts:75–76`). The documented wrong-token sanity-break now fires against the **production registry**, not the override's own check. `buildMcpUrl` → `${serverUrl}/api/mcp/${token}` (`:487`) for all three lanes.
4. **Assertions unchanged/real** — the fix diff touches only the stand-in helper + comments + the W3 block. The claude lane assertion bodies (`captured.length >= 1`, `toBe("commit_file")`, `fs.existsSync(proof.txt)`, content `=== "al7-proof"`, `exitCode !== null`) are byte-identical (zero `expect(...)` lines for the claude lanes appear in the diff). codex/opencode session-1 capture, AC8 NAMED control (`expect(...).toBe(false)` in capture mode, `:957/1047/1207/1283`), and session-2 real-file-write assertions are all intact. No `expect` was weakened to make the production-route move pass.

**Live confirmation:** `npm run test:real-harness` → **19/19 passed (126s)**; the 7 AL7 lanes (claude s1/s2/wiring, codex s1/s2, opencode s1/s2) all green THROUGH `createMcpBridge` + `/api/mcp/:token`. Real binary spawns, real file writes, production stateful transport. AC1–AC4 + AC10 now proven against production transport.

## WARNING-B (W3 — opencode normalization) — CLOSED

- `preMapOpencodeEvent` (`harness-event-normalization.ts:76`) maps `step_finish → completion` and `tool → tool_call`, and runs **inside** production `normalizeHarnessEvent` (`:114`) before the canonical-type gate. `normalizeHarnessEvent` is consumed by production loop code (`cli-harness-adapter.ts`, `adapter-pool.ts`) — load-bearing, not test-only.
- The opencode session-2 lane (`:1336–1362`) replaced the prior raw-stdout `includes("step_finish")` sidestep with a real assertion: parse each JSONL line → `normalizeHarnessEvent` → count results that are NOT `error/UnknownHarnessEvent` → assert `>= 1`. It asserts on the **canonical normalized type**, not raw stdout. Passed **live** against real opencode JSONL output.
- **Anti-vacuous (deterministic):** ran the built `normalizeHarnessEvent` against real shapes — `step_finish → completion`, `tool → tool_call` (both structured), unmapped type → `error/UnknownHarnessEvent`. Revert the pre-map and `step_finish`/`tool` fall through to `UnknownHarnessEvent` → W3 assertion goes red. The assertion genuinely gates on the pre-map's existence.

## Gates

- `npm run check` — PASS (13/13 packages). The new `as number`/`as string` casts in `normalizeHarnessEvent` are post-guard narrowing casts (after `isFiniteNumber`/`EVENT_TYPES` checks) forced by `mapped` being typed `Record<string, unknown>`; type-safe in practice. Acceptable.
- `npm run lint` — PASS (warnings only, at main baseline; zero errors).
- T0b (`mcp-bridge-stateful.integration.test.ts`) — **2/2 pass** in the integration lane (still in `test:all`); confirmed still present and anti-vacuous (sanity-broken last round).
- mcp + routes integration regression — **738/738 pass**.

## Updated AC completeness table

| AC | Requirement | Proving test | Status |
|---|---|---|---|
| AC1 | codex tool call routes via MCP → registry.invoke (s1 capture) | codex lane `:947` `captured>=1`, `toBe("commit_file")` — via PRODUCTION bridge | **MET** |
| AC2 | opencode s1 capture | opencode lane `:1199` — via PRODUCTION bridge | **MET** |
| AC3 | codex s2 executes approved op → real file | codex lane `:1095–1100` (file + `"al7-proof"` + `turn.completed`) — PRODUCTION bridge | **MET** |
| AC4 | opencode s2 → real file | opencode lane `:1326–1327` (file + content) — PRODUCTION bridge | **MET** |
| AC5 | per-binary MCP config shape | `cli-mcp-config.integration.test.ts` | **MET** |
| AC6 | router transport-agnostic, no per-backend branch | `npm run check` + review (dialect only in writer/config) | **MET** |
| AC7 | absent codex/opencode → lane FAILS | `live-proof-lanes` probe; `AL7-harness-absent-fail.test.ts` | **MET** |
| AC8 | captured-but-unapproved does NOT execute | NAMED `expect(...).toBe(false)` both lanes `:957/1047/1207/1283` | **MET** |
| AC9 | production bridge session-capable (stateful) | T0b `mcp-bridge-stateful.integration.test.ts` (2/2, RED→GREEN sanity-break R1) | **MET** |
| AC10 | **real CLIs prove against PRODUCTION bridge, not a stand-in** | All 3 lanes construct `createMcpBridge` + hit `/api/mcp/:token` via `bridgeRegistry.handleRequest`; stand-in DELETED; **19/19 real-harness green live** | **MET** |
| W3 | opencode events normalize to structured canonical type | opencode s2 `:1355` (`nonErrorNormalizedCount>=1` via prod `normalizeHarnessEvent`) + deterministic anti-vacuous check | **MET** |

## Residual NITs (non-blocking — do not gate DONE)

- **NIT-2 — one stale error-message string.** `:601` failure-path message still says `stateful MCP server reachable at /mcp/:token` (should be `/api/mcp/:token`). Cosmetic, only printed when the assertion already fails; all functional paths use `/api/mcp/:token`. Worth a one-line cleanup in a later touch, not a blocker.
- **NIT-3 — `preMapOpencodeEvent` has no CI unit test.** It's a deterministic pure function in production code (used by `cli-harness-adapter.ts`/`adapter-pool.ts`) but its only coverage is the local-only real-harness lane (not in `test:all`/CI). Per the project's validation principle, a runtime-behavior unit should have a CI-runnable test. The W3 obligation as written was real-harness-scoped and is met; deterministic anti-vacuousness is confirmed manually. A small `harness-event-normalization.test.ts` asserting `step_finish→completion` / `tool→tool_call` / unmapped→`UnknownHarnessEvent` would lock the pre-map in CI. Recommended follow-up, not a gate.

## Summary

T3 was executed correctly and W3 is genuinely closed. The stand-in (`buildStatefulMcpServer` + `/mcp/:token` override) is fully deleted; all three real CLIs now prove the trust-first two-session loop against the PRODUCTION `createMcpBridge` + `createMcpRoute` registry path (`/api/mcp/:token` → `bridgeRegistry.handleRequest` → 401-on-unknown). Verified live: 19/19 real-harness lanes green. The opencode pre-map is real, production-wired, and the W3 assertion is anti-vacuous. claude assertions are byte-identical; no `expect` was weakened. check/lint/T0b/regression all green. The false-green the founder rejected is gone. **DONE.**
