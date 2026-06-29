# AR6 — Architecture (locked plan)

MCP bridge/routing, capabilities, and enforcement consolidation. **No product behavior changes** unless a real test surfaces a genuine bug (flagged below). Reuse AR2's seam verbatim; do not rebuild rigs.

---

## 0. Decision summary (read first)

The guard's file selection is **path-only** (`isHarnessIntegrationPath`, `scripts/lib/honest-harness-predicate.ts`): a file is harness-facing iff it is `…/harness/__tests__/*.integration.test.ts` OR an `EXPLICIT_HARNESS_INTEGRATION` exception. **This is the spine of the whole triage:**

- Files in `harness/__tests__/` with `.integration.test.ts` → guard-selected → MUST be real-harness, full matrix, or be demoted to `.test.ts` / removed. They are on the two allowlists today.
- Files OUTSIDE `harness/__tests__/` (`src/__tests__/`, `mcp/__tests__/`, `routes/__tests__/`) → NOT guard-selected → the guard does not force the matrix on them. The spec's AC1/AC2 still require *honesty* (no fake adapter masquerading as a harness proof), but the **mechanism** to honor AC1 for these is: convert the bridge ones to a real-harness proof that lives in `harness/__tests__/`, and demote the rest to honest units/service-integration in place.

**Two key consequences:**

1. AR6 creates **NO new real-harness proof file.** Every keeper already exists on disk (verified by `ls`): the real-bridge tool-call proof is #13 AL7-two-session + #5 T0b; the real return-enforcement proof is #11 realbinary; the **real capabilities proof is the already-shipped `AM2-real-harness-discovery.integration.test.ts`** (AM2 PR #339 — full 4-harness `requireHarness` matrix over the real `discoverLocalHarnesses()` probe). AR6 only **converts** (add the missing builtin lane + `[harness:X]` tags + drop `skip()`), **demotes** scripted duplicates to `.test.ts`, and **removes** redundant scripted copies. No new sibling, no manufactured second proof — that would be the exact duplicate AR6 exists to delete.
2. AL7-two-session-trust-first (the keeper for "real agent calls a tool through the production bridge") already lives in `harness/__tests__/` but currently fails the AR2 coverage check because it declares only claude/codex/opencode — **no `builtin` lane** (verified: exactly 3 `requireHarness` calls) — and uses **7 in-body `skip()`** blocks. It **IS on `coverage-debt.allowlist.json` today** (verified — staged debt). Conversion adds a builtin lane + `[harness:X]` tags + drops `skip()`, then removes it from coverage-debt once full-matrix.

### The `[harness:X]` tag + per-harness floor (the non-obvious trap)

`check-attestation` runs `assertPerHarnessFloor` (`scripts/lib/attestation-floor.ts`): **every** member of `SUPPORTED_HARNESSES` must have ≥1 *executed* assertion under a `[harness:<name>]`-tagged describe across the whole agentic set. Today AR2's own test supplies all four. AR6 must not *regress* this: any harness-facing integration test AR6 converts must carry `[harness:X]` describe tags (use `lane.describeTag` from `SUPPORTED_HARNESS_LANES`) so its executed assertions bucket correctly, and must drop in-body `skip()` (which yields 0 executed → would not, by itself, break the floor as long as AR2's lanes still execute, but it violates the AR1 "never skip" spirit and the per-file honesty AC). All four binaries are installed + authed on this machine (MEMORY: harness_binaries_installed_authed) — `requireHarness` hard-fails, no `skip()` needed.

### "Real harness through the production bridge" — what it requires (researched)

The MCP bridge serves tools to an agent over HTTP MCP. The **lightest real path** that proves "a real agent calling a tool through the production bridge reaches the production handler" already exists as a working pattern in two keeper files:

- `AL7-two-session-trust-first.integration.test.ts` — spawns real `claude`/`codex`/`opencode`, points each at a Hono server mounting the **production** `createMcpBridge` + `createMcpRoute` at `/api/mcp/:token`, asserts the real binary's tool call reached `registry.invoke` (capture array > 0). This is THE real-bridge proof.
- `mcp-bridge-stateful.integration.test.ts` (T0b) — drives the **production** `createMcpBridge` + `createMcpRoute` with the MCP SDK `Client` (not a binary) through initialize→list_tools→call_tool, asserts the call routed to `registry.invoke` and wrote the file. This proves the bridge's session-statefulness without a binary.

**Decision:** the production-bridge tool-call proof is carried by AL7-two-session (real binaries, full matrix) for the *agent-calls-tool* behavior, and by T0b for the *stateful-session-capability* behavior. AR6 does NOT build a brand-new "real agent invokes a tool" rig — it consolidates onto these two, converting AL7-two-session to the full matrix (adding builtin) and keeping T0b as a service-integration unit-of-the-bridge (it is not harness-facing — the SDK client is the caller, no binary). The `mcp-route`/`mcp-bridge`/`mcp-bridge-registry` scripted copies are demoted to honest units, because their *real* proof is T0b + AL7, not a scripted `provisionSession` run.

### `runThroughHarness` is for sandbox-artifact proofs, not MCP-tool-call proofs

`runThroughHarness` (AR2) drives `provisionSession` and captures sandbox *files* before teardown. That is the right vehicle for AR3/AR4/AR5 (cost, assistant turn, decomposition — they assert on produced output). For AR6's **bridge** behavior the assertion is "the tool call reached the production MCP handler", which AL7-two-session proves via the capturing router's `captured[]` array, and T0b proves via `registry.invoke` side-effects. AR6 reuses `requireHarness` + the per-harness `[harness:X]` tags + the per-harness lane structure from AR2, but the AL7 real-bridge proof is its own (pre-existing, working) rig — we do NOT force it through `provisionSession` (AL7 is a *bridge*-MCP proof, not a *provisioning* proof; routing it through `provisionSession` would conflate two seams and is out of scope). This is consistent with the spec's "plan the lightest real path."

---

## 1. Per-file triage table

Legend — **verdict**: `convert` (→ real-harness full-matrix integration), `demote` (→ `*.test.ts` honest unit), `service` (stays `*.integration.test.ts`, NOT harness-facing — real DB/app, no agent), `keep` (already an honest keeper), `remove` (scripted duplicate of an existing real proof).

| # | File (current) | Lives in | Guard-selected? | Verdict | Target shape |
|---|---|---|---|---|---|
| 1 | `src/__tests__/mcp-route.integration.test.ts` | `src/__tests__/` | no | **split: service + demote** | See §2.1 |
| 2 | `src/__tests__/mcp-bridge.integration.test.ts` | `src/__tests__/` | no | **demote** | → `mcp/__tests__/mcp-bridge.test.ts` (pure bridge unit, no agent). **WARNING-3:** it calls `createTestDb()` directly + uses `it()` (testing-rule violation, pre-existing) — on demotion, if the unit needs a DB switch to the `{ db }` fixture + `test()`; if it does not need a DB, drop the call entirely. |
| 3 | `src/__tests__/mcp-bridge-registry.integration.test.ts` | `src/__tests__/` | no | **demote** | → `mcp/__tests__/mcp-bridge-registry.test.ts` (pure registry unit; `vi.spyOn` transport, no agent). **WARNING-3:** same `createTestDb()`-direct + `it()` violation inherited — switch to `{ db }` fixture + `test()` on demotion, or drop the DB call if unused. |
| 4 | `mcp/__tests__/cli-mcp-config.integration.test.ts` | `mcp/__tests__/` | no | **demote** | → `mcp/__tests__/cli-mcp-config.test.ts` (AC2 — already uses only `fs/os/path`, zero db/app/harness) |
| 5 | `mcp/__tests__/mcp-bridge-stateful.integration.test.ts` (T0b) | `mcp/__tests__/` | no | **keep (service)** | Stays — production bridge+route via SDK client; real integration point is the bridge transport, no binary, no fake adapter. Model for §2.1. |
| 6 | `routes/__tests__/AM2-harness-capabilities.integration.test.ts` | `routes/__tests__/` | no | **service (keep)** | See §2.2 — the route serialization / no-secrets test over the static `STATIC_DISCOVERIES` map; the **real** capabilities proof already exists as `harness/__tests__/AM2-real-harness-discovery.integration.test.ts` (no new file) |
| 7 | `harness/__tests__/AL6-return-gate.integration.test.ts` | `harness/__tests__/` | **yes** (allowlisted) | **demote (mostly) + remove scripted** | See §3.1 |
| 8 | `harness/__tests__/AL6-reprompt-loop.integration.test.ts` | `harness/__tests__/` | **yes** (allowlisted) | **demote** | See §3.2 |
| 9 | `harness/__tests__/AL6-uniform-forcing.integration.test.ts` | `harness/__tests__/` | **yes** (allowlisted) | **demote** | See §3.3 |
| 10 | `harness/__tests__/AL6-real-harness-return-enforcement.integration.test.ts` | `harness/__tests__/` | **yes** (allowlisted, stub via `vi.mock(llm-client)`) | **demote** | See §3.4 — it is NOT a real-harness test (mocks callLlm); the real sibling is #11 |
| 11 | `harness/__tests__/AL6-real-harness-return-enforcement-realbinary.integration.test.ts` | `harness/__tests__/` | **yes** (allowlisted) | **convert (real keeper)** | See §3.5 — the genuine real-binary return-enforcement proof; make matrix-complete + drop `skip()` |
| 12 | `harness/__tests__/ah5-gates-on-broken-stream.integration.test.ts` | `harness/__tests__/` | **yes** (allowlisted) | **demote** | See §3.6 — broken-stream is a NEGATIVE; no real harness emits zero events deterministically |
| 13 | `harness/__tests__/AL7-two-session-trust-first.integration.test.ts` | `harness/__tests__/` | **yes** (NOT allowlisted today) | **convert (real keeper)** | See §4 — add builtin lane + `[harness:X]` tags + drop `skip()` |
| 14 | `src/__tests__/AL7-builtin-live-session.integration.test.ts` | `src/__tests__/` | no | **demote/rename** | See §4 — the builtin two-session proof; mocks callLlm → it is a service-integration unit, not harness-facing |
| 15 | `src/__tests__/AL7-tailored-grant.integration.test.ts` | `src/__tests__/` | no | **service (keep)** | See §4 — verdict→grant HTTP + CAS + dispatcher; real DB/app, `CapturingAdapter` is a dispatcher fixture, not a harness-under-test claim |

**Verdict counts:** convert = **2** (#11 AL6-realbinary, #13 AL7-two-session); demote = **8** (#2, #3, #4, #7, #8, #9, #10, #12, #14 — see note); service-keep = **3** (#5 T0b, #6 AM2-capabilities route test, #15 AL7-tailored-grant); split = #1 (one service half + one demoted half). #14 is a demote (rename off `.integration`). Net: convert 2 / demote 8 / service-keep 3 / split 1. **The capabilities real-harness keeper (`AM2-real-harness-discovery.integration.test.ts`) is already on disk and already clean — it is NOT in this table because AR6 does not touch it (it is the pre-existing single honest keeper; no convert/demote/remove needed).**

---

## 2. MCP bridge + capabilities (AC1, AC2)

### 2.1 `mcp-route.integration.test.ts` → split (AC1, AC2)

Current contents are two distinct intents mixed:

- **Service-integration (keep, no harness):** AC2's `registry.handleRequest` 401-for-unknown-token + 401-after-unregister (lines 589–629) — these drive the real `createMcpBridgeRegistry`/`createMcpRoute` token routing with `createMcpBridge`, no agent. Move these into the existing real keeper **T0b** (`mcp-bridge-stateful.integration.test.ts`) OR keep them as a slimmed `mcp/__tests__/mcp-route.test.ts` unit (they use `createTestDb` + `buildToolRegistry`, no app server). **Decision:** fold the 401/token-routing assertions into T0b's describe (it already stands up the production route on a real port) so the route's token-gate is proven on the real listener — one honest proof. Where an assertion needs no live port (pure `registry.handleRequest("deadbeef", req)` → 401), keep it as a `mcp/__tests__/mcp-route.test.ts` unit.
- **Scripted-`provisionSession` (remove):** AC5 bridge-lifecycle, AC6 `.mcp.json` write, AC7 fallback, the graceful-degradation critique test all inject `ScriptedHarnessAdapter`/`CapturingHarness`/`McpJsonCapturingHarness` (hand-rolled `implements HarnessAdapter`) into `provisionSession`. These prove **provisioning orchestration** (bridge registered Phase 8 / unregistered Phase 11 / `.mcp.json` shape), NOT the bridge serving a real tool call. They are scripted look-alikes. **The real proof of `.mcp.json` write + bridge registration through `provisionSession` is AR2's claude lane** (`startMcpBridgeServer` writes the live `.mcp.json`, the real claude binary reads it and calls a tool). **Decision:** the *bridge-lifecycle/`.mcp.json`* assertions are genuine `provisionSession` orchestration logic over a fake adapter — demote the load-bearing ones to a **`mcp/__tests__/mcp-route-provisioning.test.ts` unit** ONLY where the assertion is pure orchestration (registry.size transitions, `.mcp.json` structure) and does not claim to prove the harness. Remove the rest as duplicated by AR2's real claude lane.

Concretely for #1:
- Move 401/unknown-token + 401-after-unregister → T0b (real route) — **AC2 honest proof.**
- **Prefer REMOVE over relabel for the scripted-`provisionSession` assertions (WARNING-2).** The `.mcp.json`-write + bridge-size-1→0 assertions are driven by 5 hand-rolled `implements HarnessAdapter` classes (`ScriptedHarnessAdapter`, `CapturingHarness`, `McpJsonCapturingHarness`, `TokenValidatingHarness`, `WorkspaceCapturingHarness` — verified) over `provisionSession`. **The real `.mcp.json`-through-provisioning write is already proven by AR2's real claude lane** (`startMcpBridgeServer` writes the live `.mcp.json`, the real binary reads it). So: where an orchestration *function* exists to test directly (the `.mcp.json` writer / `startMcpBridgeServer` / the registry register/unregister functions), demote to a `mcp-route-provisioning.test.ts` unit that asserts that **real function's output** — NOT a `provisionSession`-over-scripted-adapter relabel. Where the only thing the assertion proves is scripted-adapter plumbing already covered by AR2's claude lane, **delete it** rather than relabel. A `.test.ts` that still drives `provisionSession` with a fake adapter to assert "`.mcp.json` was written" proves orchestration plumbing, not the bridge, and duplicates AR2 — do not keep it.
- Delete the original `mcp-route.integration.test.ts`.

### 2.2 AM2 capabilities → existing keeper, NO new file (AC1)

**The capabilities AC1 "proven against a real harness" gap is ALREADY closed on disk. AR6 creates nothing here.** Two AM2 files exist and split the labor cleanly — neither needs a change:

- **`harness/__tests__/AM2-real-harness-discovery.integration.test.ts` (the capabilities keeper — verified present).** Shipped AM2 PR #339. Lives in the guard-selected harness dir; calls the **real production probe `discoverLocalHarnesses()`**; declares the **full 4-harness matrix** — `requireHarness("codex"|"claude"|"opencode"|"builtin")` each under its own `describe` — plus an unconditional cursor-agent-unavailable assertion; asserts each installed binary's real `state`/`version`/`authAction`. It is on **neither allowlist** (clean + covered). **This IS AC1's "capabilities proven against a real harness."** AR6's only action: **recognize it as the single honest keeper and leave it untouched.** (Builder confirms it is off both allowlists — it already is.)
- **`routes/__tests__/AM2-harness-capabilities.integration.test.ts` (service-keep, unchanged).** Drives the real `/api/harnesses` route via `createTestApp` with a **static `STATIC_DISCOVERIES` map** + a real `BuiltinHarnessAdapter`. The route + serialization (no-secrets, accessMode, authAction shape) is genuinely exercised against the real Hono app — honest **service integration**, environment-independent by design. It is **not** harness-facing (`routes/__tests__/` is outside `harness/__tests__/`, not guard-selected). The static map is correct here: the route serialization must be deterministic, so the capability *source* is intentionally scripted while the *route* is real. Stays as-is.

**Decision (CRITICAL-1 correction):** do **NOT** create a new `harness/__tests__/AM2-harness-capabilities.integration.test.ts` real-probe sibling. The earlier draft proposed exactly that — it would manufacture a **second** real-harness capabilities proof iterating `SUPPORTED_HARNESS_LANES`, duplicating `AM2-real-harness-discovery`'s already-shipped full-matrix `discoverLocalHarnesses()` proof. That is the precise "two proofs" duplicate AR6 is chartered to eliminate. The capabilities keeper is the file that already exists; the route serialization test is the service-keep. Done.

**R4 resolved (no UNVERIFIED):** the production discovery entry point is `discoverLocalHarnesses()` (from `../harness-discovery.js`), confirmed in-use and working in `AM2-real-harness-discovery.integration.test.ts`; it returns a `Record<harness, { state, version, authAction, runtime, reason }>`. No probe needs to be re-derived. **NIT-1:** the capabilities keeper is `AM2-real-harness-discovery` — distinct from `AM2-real-harness-session-probe` (a session-spawning probe that is AM2's own coverage-debt concern, untouched by AR6) and `AM2-builtin-gateway` (also AM2's). AR6 touches none of the three.

---

## 3. Enforcement consolidation — one honest proof per behavior (AC3, AC4)

The enforcement files are the spec's "good-pattern-gone-confusing" case. The truth on disk:

- The **only genuine real-binary** enforcement test is **#11 AL6-realbinary** (spawns claude/codex/opencode, fires the Stop hook against the real `/api/mcp/:token/return-status` route, asserts `forceCount>=1`). It is the keeper.
- **#10 AL6-real-harness-return-enforcement** is **mislabeled** — its name says "real-harness" but it `vi.mock`s `llm-client` and runs the in-process `BuiltinHarnessAdapter` only (+ a cursor inert assertion). It is a unit, not a real-harness test.
- **#7/#8/#9** drive `provisionSession` with **hand-rolled `implements HarnessAdapter` / `makeStubAdapter` / `makeV4BlockingStub` / `makeV4MockAdapter`** factories. They prove the **return-gate verdict logic** and the **`provisionReturnHook` channel dispatch** — pure logic — over scripted streams.
- **#12 ah5** drives `provisionSession` with a broken-stream stub and asserts the **`probeSucceeds` predicate** (pure logic) fails closed.

The behaviors and their single keepers:

| Behavior | Single honest keeper (after AR6) | Removed / demoted |
|---|---|---|
| return-gate verdict (returned vs not_returned, persisted row, bus event) | **`return-gate.test.ts` unit** testing `createReturnGate`/`evaluateReturn` directly (`packages/server/src/harness/return-gate.ts`) + the existing `provisionSession` *service* assertions on row/event demoted to `.test.ts` where they are pure orchestration | scripted `AL6-return-gate.integration.test.ts` (#7) |
| reprompt / one-startSession / no-v3-loop | **`AL6-reprompt-loop.test.ts` unit** (the `startCallCount==1`, v3-fields-removed, re-engage.ts-deleted, channel-declared assertions are all pure-import logic) | scripted `.integration` (#8) |
| uniform-forcing / per-channel `provisionReturnHook` dispatch | **`AL6-uniform-forcing.test.ts` unit** (the `provisionReturnHook` channel→file table + mock-channel-override + v1-regression-guard are pure logic / fs assertions) | scripted `.integration` (#9) |
| return-enforcement (real hook fires across harnesses) | **#11 AL6-realbinary** converted to full matrix + `requireHarness` (mechanically remove all ~12 in-body `skip()`, `grep` → zero), `[harness:X]` tags; **builtin lane = real model, never `vi.mock(llm-client)`** (R2 caveat — the realbinary file is a selected `.integration`, so a mocked-callLlm builtin lane would trip `isStubDirty`) | #10 demoted to `AL6-builtin-enforcement.test.ts` unit (real `BuiltinHarnessAdapter` + mocked `callLlm` is a legit in-process unit — fine in a `.test.ts`, NOT in #11) |
| broken-stream gates | **`ah5-gates.test.ts` unit** testing `probeSucceeds` + the broken-stream adapter directly (pure predicate) | scripted `.integration` (#12) |
| builtin-live-session two-session loop | folded into **#13's `[harness:builtin]` lane re-proven with a REAL model** (R2 caveat); #14 then **removed**. (Fallback only if real-model loop is flaky: keep a demoted `AL7-builtin-live-session.test.ts` unit with mocked `callLlm`, AND #13's builtin lane asserts only the bridge tool-call reached the handler via real-model `runThroughHarness`.) | #14 removed (or demoted to `.test.ts` unit, off both allowlists, in the fallback) |
| tailored-grant (verdict→grant→CAS→dispatch) | **#15 service-keep** (real DB/app HTTP path; `CapturingAdapter` is a dispatcher enqueue fixture, not a harness-under-test claim) | — |
| MCP-bridge real tool call (claude/codex/opencode/builtin) | **#13 AL7-two-session** converted to full matrix | the scripted `mcp-route`/`mcp-bridge`/`mcp-bridge-registry` copies (§2.1, §2 demotes) |

### Why demote #7/#8/#9/#12 instead of convert?

Each asserts a **pure transform / predicate** over a *scripted* stream:
- #7 return-gate → `evaluateReturn(gate, "completed")` is a 3-line pure function; the "persisted row is not_returned" assertion is `provisionSession` orchestration that does not depend on a real model (the stream content is the input, real or scripted). A real harness cannot *deterministically* produce a no-return turn on demand (the whole AR2 W-2 lore: CLIs won't call the return tool reliably) — so forcing these through a real binary makes them flaky AND proves nothing the unit doesn't. **The real cross-harness enforcement fire is #11.**
- #8/#9 → `provisionReturnHook` channel dispatch + `startCallCount` + capability-field presence are all pure imports / fs writes. No model involved.
- #12 → broken-stream is a *negative* (zero events); no real model emits zero events on command. `probeSucceeds` is a pure predicate. Converting it is impossible-by-construction.

This is the spec's exact instruction: "the scripted-adapter `.integration` duplicate is either removed or demoted to a pure-logic unit (e.g. the gate-verdict function tested directly)."

### 3.1–3.6 mechanical demotion recipe (builder)

For each of #7, #8, #9, #10, #12, #14:
1. Rename `*.integration.test.ts` → `*.test.ts` (drop `.integration`).
2. Move from `harness/__tests__/` is NOT required (units may live in `harness/__tests__/`; the guard only selects `.integration.test.ts` there, so a `.test.ts` is invisible to it — confirmed by `HARNESS_DIR_INTEGRATION` regex requiring `.integration.test.ts`). Keep them in place; rename suffix only.
3. Remove from `scripts/honest-harness-guard.allowlist.json` AND `scripts/coverage-debt.allowlist.json` (the file is no longer a harness-facing integration → both entries become stale → guard FAILS until removed). Both lists currently contain #7/#8/#9/#10/#12; remove those five entries.
4. Where the assertion was a thin wrapper over a pure function, **prefer testing the function directly** (`createReturnGate`/`evaluateReturn`, `provisionReturnHook`, `probeSucceeds`) rather than through `provisionSession` — but it is acceptable to keep the `provisionSession`-over-scripted-stream assertions as `.test.ts` units (they run fast against PGlite + scripted adapter; that is a legitimate service unit). The MUST is: no file claims `.integration` while feeding a scripted harness. The fake-adapter factory (`makeStubAdapter(): HarnessAdapter`) is fine in a `.test.ts` (the guard's stub-content patterns only apply to *selected* `.integration` files).
5. Where the file uses `import { test } from "../../test-fixtures.js"` it needs `{ db }` fixtures — **these remain available in a `.test.ts` unit, in place inside `harness/__tests__/`, no relocation** (R1 ruling, verified: the unit vitest project warms the same globalThis PGlite pool; `AK4-assistant-draft-registry.test.ts` already imports fixtures and destructures `{ db }` in a `.test.ts`). Suffix only governs which file the guard *selects*, not which gets fixtures. So: rename `.integration.test.ts` → `.test.ts` in place, keep the `{ db }` import, done. Relocation out of `harness/__tests__/` is needed ONLY if a remnant must keep the `.integration` suffix as genuine service integration (not the case for any AR6 demote target — they are pure-logic or `{ db }`-in-place units).

---

## 4. AL7 consolidation (AC3, AC4)

Three AL7 files cover the trust-first two-session loop at three fidelities:

- **#13 `AL7-two-session-trust-first.integration.test.ts`** (harness dir, real binaries) — claude/codex/opencode spawn → production `createMcpBridge`+`createMcpRoute` → capturing router. **THE real-harness MCP-tool-call keeper.** Convert to full matrix:
  - Add a **`[harness:builtin]` lane**. Builtin does not spawn a binary, so it cannot route through the HTTP MCP bridge the way the CLIs do — its tool calls are in-process. **Decision:** the builtin two-session loop is already proven by #14 (`AL7-builtin-live-session`) through the real `BuiltinHarnessAdapter` loop. To satisfy the per-harness matrix on #13 WITHOUT duplicating, give #13 a `[harness:builtin]` describe that delegates to the same builtin two-session assertion (real `BuiltinHarnessAdapter` + `provisionSession`, mocked `callLlm` for determinism) — i.e. **fold #14's builtin proof INTO #13 as its builtin lane**, then remove #14. This makes #13 the single full-matrix AL7 keeper (builtin in-process + claude/codex/opencode real-binary), and #14 disappears (its content becomes #13's builtin lane).

    **R2 BINDING CAVEAT — the builtin lane MUST use a real model, NEVER `vi.mock(llm-client)`.** "Full SUPPORTED_HARNESSES matrix" for a bridge/enforcement test is satisfied by a `requireHarness(<name>)` lane + ≥1 executed `[harness:X]`-tagged assertion per harness (R2 ruling — accepted by the reviewer); it does NOT require a literal HTTP-bridge code path per harness. builtin is genuinely in-process (no MCP-over-HTTP), so its in-process enforcement equivalent through the real `BuiltinHarnessAdapter` counts as the builtin lane — honest, builtin really runs. **But** the guard's `isStubDirty` flags `vi.mock(.*llm-client)` in any selected `.integration` file, so #13's builtin lane CANNOT mock `callLlm`. It MUST drive the **real** `BuiltinHarnessAdapter` with a **real** cheap model (OpenRouter, gated by `requireHarness("builtin")` = `OPENROUTER_API_KEY`) — exactly AR2's builtin lane pattern. A real-model builtin turn is proven feasible (AR2 lane 1). #14's mocked-callLlm cassette therefore CANNOT be folded verbatim into #13 — its behavior is re-proven with a real model, then #14 is removed. If the full real-model two-session PC-capture loop proves nondeterministic, fall back: the builtin lane asserts only that the bridge/enforcement tool-call reached the production handler (via AR2's real-builtin `runThroughHarness`), not the full ordered PC loop — still a real-model lane, never a mock. **This caveat is binding for EVERY builtin lane AR6 adds (#11 and #13 alike): real model, no `vi.mock(llm-client)`, gated by `requireHarness("builtin")`.**
  - **Mechanically delete every in-body skip (R3 ruling — not eyeballing).** The guard's `hasAbsentSkipIf` matches `.skipIf(...)` but NOT in-body `if(!authed){skip();return;}` — verified. #13 has **7** such blocks (`grep -c 'skip()'` = 7), each behind `const authed = await claudeAuthed(); if(!authed){skip();return;}`. The builder must delete every one of them AND the now-orphaned `claudeAuthed()`/`authed` helper, relying solely on the describe-scope `requireHarness` (binaries installed+authed per MEMORY → hard-fail, never skip). **Verification step (mandatory, not optional):** `grep -n 'skip()' packages/server/src/harness/__tests__/AL7-two-session-trust-first.integration.test.ts` must return **zero**. Same for #11 (~12 sites — `grep -c 'skip()'` = 12). This is a mechanical check, not a reviewer eyeball.
  - Add `[harness:X]` describe-title tags (use `SUPPORTED_HARNESS_LANES[n].describeTag`) so the per-harness attestation floor buckets the executed assertions.
  - `AL7-two-session-trust-first.integration.test.ts` **IS on `coverage-debt.allowlist.json` today** (verified — staged debt, 3 lanes only). Do NOT remove it until the builtin lane is added AND executes; removing an incomplete file makes the coverage check fail. Sequence: add builtin lane + `[harness:X]` tags + drop `skip()` → file now declares all four lanes → THEN remove it from coverage-debt. Net end state: NOT on either allowlist (clean + full matrix).

- **#14 `AL7-builtin-live-session.integration.test.ts`** — folded into #13's builtin lane (preferred) OR demoted to `AL7-builtin-live-session.test.ts` unit (fallback). Either way it stops being a harness-facing `.integration` claim and is absent from both allowlists.

- **#15 `AL7-tailored-grant.integration.test.ts`** — **service-keep.** It exercises the real verdict→grant HTTP route (`app.request(.../verdict)`), the CAS consume, and the dispatcher enqueue against real DB/app via fixtures. Its `CapturingAdapter` is a *dispatcher fixture* (proves session 2 was enqueued with the grant-bearing workflow), not a claim that a harness was exercised. It lives in `src/__tests__/` → not guard-selected → stays `.integration` as honest service integration. **No change** beyond confirming it is off both allowlists (it already is).

---

## 5. Reuse of AR2 helpers (exact signatures)

From `packages/server/src/harness/__tests__/provision-real-session.ts`:

- `requireHarness(name: HarnessName)` — call at describe scope; hard-fails if binary/key absent. Replaces all `skip()`/`skipIf`.
- `SUPPORTED_HARNESS_LANES: readonly HarnessLane[]` — iterate for the four lanes; `lane.harnessName`, `lane.describeTag` (`[harness:X]`), `lane.prepFn(ctx)`.
- `runThroughHarness(lane, ctx): Promise<{ result, cap }>` — drives `provisionSession` + captures sandbox files. **Not used for AM2** — capabilities are already proven by the existing `AM2-real-harness-discovery` keeper (no session run, no new file). **Used by #13 + #11 builtin lanes** for the real-model `provisionSession` route. **Not used** by #13's CLI lanes (they use AL7's existing `startAl7TestServer` real-bridge rig, which is the correct bridge proof — do not force through `provisionSession`).
- `createSandboxCapture(opts?)` — for any lane asserting on a written file.
- `startMcpBridgeServer()` — production route on an ephemeral port; AL7 already has its own equivalent (`startAl7TestServer`) tuned for the two-session capturing-router flow — keep AL7's (it adds capture/grant modes `startMcpBridgeServer` lacks).

`HarnessName` type + `requireHarness` from `./require-harness.js`. For `SUPPORTED_HARNESSES`, **use the existing compile-checked mirror in `require-harness.ts`** (it already mirrors `scripts/lib/honest-harness-predicate.ts` — no need to re-derive the "don't import scripts from packages" constraint; the mirror is the supported entry point).

---

## 6. Allowlist edits (exact)

`scripts/honest-harness-guard.allowlist.json` — currently:
```
AL6-real-harness-return-enforcement.integration.test.ts
AL6-reprompt-loop.integration.test.ts
AL6-return-gate.integration.test.ts
AL6-uniform-forcing.integration.test.ts
ah5-gates-on-broken-stream.integration.test.ts
```
After AR6: **empty `[]`.** All five are demoted to `.test.ts` (#7/#8/#9/#10/#12) → no longer `.integration` in `harness/__tests__/` → not selected → must not be allowlisted (stale = FAIL).

`scripts/coverage-debt.allowlist.json` — currently **13 entries** (verified). After AR6, remove the **seven** AR6-owned ones (5 demoted AL6/ah5 + #11 realbinary + #13 AL7-two-session) once each reaches its end state:
- `AL6-real-harness-return-enforcement.integration.test.ts` (demoted #10)
- `AL6-reprompt-loop.integration.test.ts` (#8)
- `AL6-return-gate.integration.test.ts` (#7)
- `AL6-uniform-forcing.integration.test.ts` (#9)
- `ah5-gates-on-broken-stream.integration.test.ts` (#12)
- `AL7-two-session-trust-first.integration.test.ts` (#13) — **IS on coverage-debt today** (verified — staged debt because it declares only 3 lanes, no builtin). Add the builtin lane + `[harness:X]` tags + drop `skip()` → reaches full SUPPORTED_HARNESSES matrix → **then REMOVE it from coverage-debt.** End state: off both allowlists, full matrix. (Do NOT leave it on coverage-debt; do NOT remove it before the builtin lane lands and executes — removing a still-incomplete file would make the guard's coverage check fail.)
- `AL6-real-harness-return-enforcement-realbinary.integration.test.ts` (#11) — IS on coverage-debt today → remove once #11 reaches full matrix (builtin lane added + `[harness:X]` tags + `skip()` removed).
- Leave the six non-AR6 entries untouched (verified against the live `coverage-debt.allowlist.json`): `session-provisioning.integration.test.ts`, `AM2-builtin-gateway.integration.test.ts`, `AM2-real-harness-session-probe.integration.test.ts`, `AN1-real-harness-inherited.integration.test.ts`, `AN2-connection-provisioning.integration.test.ts`, `cli-adapter-real-binary.integration.test.ts` — those are other WPs' debt. **AR6 removes only its 7 owned entries** (#7/#8/#9/#10/#12 demoted + #11 + #13 full-matrix); 13 − 7 = 6 remain.

**Net coverage-debt removals (AR6):** the 5 demoted AL6/ah5 files + `AL6-real-harness-return-enforcement-realbinary.integration.test.ts` (#11) + `AL7-two-session-trust-first.integration.test.ts` (#13), all removed once their respective files reach full matrix / demotion. End state coverage-debt = the original 13 minus these 7 AR6-owned entries (5 demoted AL6/ah5 + #11 + #13).

`scripts/honest-harness-guard.allowlist.json` (stub) net: do **not** add or remove `AL6-real-harness-return-enforcement-realbinary…` here — it is NOT stub-dirty (it's a real test) and was never on the stub allowlist. Only the 5 demoted AL6/ah5 files leave the stub allowlist → stub allowlist ends **empty `[]`**.

**Placement rule (R1 ruling — fixtures need NO relocation):** demoted `*.test.ts` units CAN take `{ db }` PGlite fixtures **in place inside `harness/__tests__/`** — proven empirically (the unit vitest project warms the same globalThis PGlite pool; `AK4-assistant-draft-registry.test.ts` already does this). The guard only selects `.integration.test.ts` in that dir, so a `.test.ts` is invisible to it regardless of `{ db }` usage. **A demoted file does NOT relocate merely to use `{ db }`.** Relocation out of `harness/__tests__/` is required **only** when a file must KEEP the `.integration` suffix because it is genuine service integration (real DB/app, not demotable to a unit) — in that single case move it to `services/__tests__/` or `mcp/__tests__/` so `isHarnessIntegrationPath` returns false. Default: rename suffix to `.test.ts` in place; relocate only the genuine-service remnants. (No AR6 demote target is expected to need relocation — the demotes are all pure-logic units or `{ db }`-in-place `.test.ts`.)

---

## 7. Ordered task list (builder)

1. **Demote the pure-logic units first (no real binary needed, fast feedback).** #4 cli-mcp-config → `.test.ts` (already pure). #2 mcp-bridge, #3 mcp-bridge-registry → `mcp/__tests__/*.test.ts`. #12 ah5 → `ah5-gates.test.ts` testing `probeSucceeds` + broken-stream adapter directly. #8 reprompt-loop, #9 uniform-forcing → `.test.ts` (pure import/fs/channel-dispatch logic). For each: rename suffix, relocate if it needs `{db}` fixtures (§6 risk), remove from both allowlists.
2. **Return-gate consolidation (#7, #10).** Extract the verdict assertions to a `return-gate.test.ts` unit over `createReturnGate`/`evaluateReturn`. Demote #10 to `AL6-builtin-enforcement.test.ts` (real builtin adapter + mocked callLlm). Demote #7's orchestration assertions to a service `.test.ts`/`.integration` unit (relocate out of harness dir if `.integration`+fixtures). Remove both from allowlists.
3. **Split #1 mcp-route.** Fold 401/token-routing into T0b (#5); demote `.mcp.json`/registry-size assertions to `mcp-route-provisioning.test.ts`; delete the original `.integration` file.
4. **Run `npm run lint` (honest-harness-guard) early** to confirm the allowlist edits are consistent (stale/debt-paid errors surface immediately). *(Designer note: this is the builder's gate; the designer does not run it.)*
5. **Convert #11 AL6-realbinary to full matrix:** wrap each harness block in `[harness:X]` describe via `SUPPORTED_HARNESS_LANES` tags; add a `[harness:builtin]` lane that drives real builtin enforcement via a **real model** (`requireHarness("builtin")` = `OPENROUTER_API_KEY`, **never `vi.mock(llm-client)`** — R2 binding caveat); mechanically delete all ~12 in-body `skip()` blocks + the orphaned `claudeAuthed()` helper (R3); **verify `grep -n 'skip()'` on the file returns zero**; rely on `requireHarness`. Remove from coverage-debt allowlist once full-matrix.
6. **Convert #13 AL7-two-session to full matrix:** add `[harness:builtin]` lane (real-model builtin two-session via `runThroughHarness`/`provisionSession` — **real model, never `vi.mock(llm-client)`**, R2 caveat); mechanically delete all 7 in-body `skip()` blocks + orphaned `claudeAuthed()` helper (R3); **verify `grep -n 'skip()'` returns zero**; add `[harness:X]` tags. Re-prove #14's builtin behavior with a real model, then remove #14. Remove #13 from coverage-debt once full-matrix; confirm off both allowlists.
7. **AM2 — NO new file (CRITICAL-1).** Do NOT create a real-probe sibling. `harness/__tests__/AM2-real-harness-discovery.integration.test.ts` already IS the full-matrix real-harness capabilities keeper (`discoverLocalHarnesses()`, all four `requireHarness` lanes, off both allowlists) — leave it untouched. Keep the `routes/__tests__/AM2-harness-capabilities.integration.test.ts` service test (static-map serialization) untouched. Confirm both are off both allowlists (they already are). AR6 writes zero new capabilities files.
8. **Add #15 AL7-tailored-grant verification** that it is off both allowlists (no code change).
9. **Final allowlist reconciliation:** stub allowlist → `[]` (5 demoted AL6/ah5 files removed); coverage-debt → AR6's **seven** entries removed (5 demoted AL6/ah5 + #11 realbinary + #13 AL7-two-session, each removed once full-matrix/demoted). Run guard `--check` to confirm zero stale/debt-paid violations. Run `grep -n 'skip()'` on #11 and #13 → zero residuals. Run `grep 'implements HarnessAdapter\|Scripted\|Capturing'` across surviving AR6-set `*.integration.test.ts` → nothing.

---

## 8. Validation method per AC

- **AC1** (mcp-route/bridge/registry/AM2-capabilities prove behavior against a real harness through the production bridge; no wrapper/fake adapter remains in these `.integration`): the real-bridge tool-call proof is **#13 AL7-two-session** (full matrix) + **#5 T0b** (production bridge stateful session); **capabilities against a real harness is the pre-existing keeper `AM2-real-harness-discovery.integration.test.ts`** (full 4-lane `discoverLocalHarnesses()` — NO new file). The scripted `.integration` files (#1/#2/#3) no longer exist as `.integration` with a fake adapter (demoted to `.test.ts` units / folded into T0b); the `routes/__tests__/AM2-harness-capabilities` static-map serialization test stays as honest service integration. **Verify:** `grep` for `implements HarnessAdapter`/`Scripted`/`Capturing` in any `*.integration.test.ts` under the AR6 set returns nothing; #13 + T0b pass with real binaries; **no new AM2 capabilities file was added** (CRITICAL-1).
- **AC2** (`cli-mcp-config` is a `.test.ts` unit, `.integration` removed): file renamed; uses only `fs/os/path`; runs in the unit project. **Verify:** `ls` shows `cli-mcp-config.test.ts`, no `.integration` variant; `npm run test` (unit) includes it.
- **AC3** (one honest proof per enforcement behavior; scripted duplicate removed/demoted): the keeper table in §3 — each behavior has exactly one keeper; #7/#8/#9/#10/#12/#14 demoted/folded. **Verify:** for each behavior, exactly one file asserts it at integration fidelity (real binary for return-enforcement via #11; in-process/unit for the pure-logic gates).
- **AC4** (no `.integration` constructs a scripted/fake adapter; converted tests hard-fail on missing harness; full matrix): honest-harness-guard `--check` clean with empty stub allowlist; #11 + #13 carry all four `requireHarness` lanes + `[harness:X]` tags; `assertPerHarnessFloor` passes (all four harnesses have executed assertions). **Verify:** `npm run lint` (guard) green; `npm run verify` attestation has non-zero `agenticExecutedByHarness` for builtin/claude/codex/opencode. *(Designer does NOT run these — builder validates in the green phase.)*

---

## 9. Product-bug flags (honest tests may surface)

AR6 changes no product behavior. Two latent issues the honest conversions may expose (in scope to fix only if a real test surfaces them):

1. **codex cost = 0** (AR2 lore `codex-cost-zero`): codex emits `turn.completed`, not a `result` event with `total_cost_usd`, so `CliHarnessAdapter` cost extraction never fires. Already deferred to AR3 (MEMORY). #11/#13 must NOT assert codex `totalCostCents > 0`. Not AR6's to fix — flag for AR3.
2. **builtin two-session real-model nondeterminism**: a real cheap model may not reliably emit `commit_file` → `read_inbox` in order for #13's builtin lane. If flaky, the §4 fallback narrows the builtin lane's assertion to "the bridge/enforcement tool-call reached the production handler" (still a **real-model** lane — never `vi.mock(llm-client)`, R2 caveat), not the full ordered PC loop. This is a *test-fidelity* choice, not a product bug.

No genuine product bug is expected in the MCP bridge or enforcement logic (T0b, #11, #15 already pass on real integration today). If a real run surfaces one, it is in scope per the spec; flag it to the reviewer.

---

## 10. Risk rulings (resolved by Phase-2 critique — recorded for the builder)

All four open risks were ruled on by the reviewer; the rulings are now folded into the plan above. Recorded here so the builder does not re-open them:

- **R1 — RESOLVED (no relocation for fixtures).** Demoted `*.test.ts` units take `{ db }` PGlite fixtures **in place** inside `harness/__tests__/` — empirically proven (unit project warms the same pool; `AK4-assistant-draft-registry.test.ts` does it). Relocation is needed ONLY for a remnant that must KEEP the `.integration` suffix as genuine service integration. No AR6 demote target is expected to relocate. See §6 placement rule + §3 step 5.
- **R2 — RESOLVED (accepted, with binding caveat).** "Full SUPPORTED_HARNESSES matrix" for a bridge/enforcement test = a `requireHarness(<name>)` lane + ≥1 executed `[harness:X]` assertion per harness; NOT a literal per-harness code path. builtin's in-process enforcement equivalent counts. **Binding caveat for EVERY builtin lane (#11, #13): real model (`requireHarness("builtin")` = `OPENROUTER_API_KEY`), NEVER `vi.mock(llm-client)`** (trips `isStubDirty`). No guard carve-out. See §4 + §3.
- **R3 — RESOLVED (mechanical, not eyeball).** The guard catches `.skipIf` but NOT in-body `if(!authed){skip()}`. #11 (~12 sites) and #13 (7 sites) carry these; the builder deletes every one + the orphaned `claudeAuthed()` helper, then **`grep -n 'skip()'` on each converted file must return zero** (a mandatory verification step, not a reviewer eyeball). See §4 + §7 steps 5–6, 9.
- **R4 — RESOLVED (moot).** The AM2 capabilities proof already exists (`AM2-real-harness-discovery.integration.test.ts`) and uses the confirmed-working `discoverLocalHarnesses()` probe. No new probe to verify, no new file to write (CRITICAL-1). The UNVERIFIED marker is removed. See §2.2.
