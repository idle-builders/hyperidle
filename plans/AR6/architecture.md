# AR6 — Architecture (locked plan)

MCP bridge/routing, capabilities, and enforcement consolidation. **No product behavior changes** unless a real test surfaces a genuine bug (flagged below). Reuse AR2's seam verbatim; do not rebuild rigs.

---

## 0. Decision summary (read first)

The guard's file selection is **path-only** (`isHarnessIntegrationPath`, `scripts/lib/honest-harness-predicate.ts`): a file is harness-facing iff it is `…/harness/__tests__/*.integration.test.ts` OR an `EXPLICIT_HARNESS_INTEGRATION` exception. **This is the spine of the whole triage:**

- Files in `harness/__tests__/` with `.integration.test.ts` → guard-selected → MUST be real-harness, full matrix, or be demoted to `.test.ts` / removed. They are on the two allowlists today.
- Files OUTSIDE `harness/__tests__/` (`src/__tests__/`, `mcp/__tests__/`, `routes/__tests__/`) → NOT guard-selected → the guard does not force the matrix on them. The spec's AC1/AC2 still require *honesty* (no fake adapter masquerading as a harness proof), but the **mechanism** to honor AC1 for these is: convert the bridge ones to a real-harness proof that lives in `harness/__tests__/`, and demote the rest to honest units/service-integration in place.

**Two key consequences:**

1. The new real-harness bridge proof must live in `packages/server/src/harness/__tests__/` so the guard selects it and the matrix is enforced — NOT in `src/__tests__/`.
2. AL7-two-session-trust-first (the keeper for "real agent calls a tool through the production bridge") already lives in `harness/__tests__/` but currently fails the AR2 coverage check because it declares only claude/codex/opencode — **no `builtin` lane** — and uses in-body `skip()`. It is NOT on the coverage allowlist (only the 5 AL6/ah5 files are). Conversion must add a builtin lane + `[harness:X]` tags + drop `skip()`.

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
| 2 | `src/__tests__/mcp-bridge.integration.test.ts` | `src/__tests__/` | no | **demote** | → `mcp/__tests__/mcp-bridge.test.ts` (pure unit; it already uses `createTestDb` + `it`, no agent) |
| 3 | `src/__tests__/mcp-bridge-registry.integration.test.ts` | `src/__tests__/` | no | **demote** | → `mcp/__tests__/mcp-bridge-registry.test.ts` (pure unit; `createTestDb` + `vi.spyOn` transport, no agent) |
| 4 | `mcp/__tests__/cli-mcp-config.integration.test.ts` | `mcp/__tests__/` | no | **demote** | → `mcp/__tests__/cli-mcp-config.test.ts` (AC2 — already uses only `fs/os/path`, zero db/app/harness) |
| 5 | `mcp/__tests__/mcp-bridge-stateful.integration.test.ts` (T0b) | `mcp/__tests__/` | no | **keep (service)** | Stays — production bridge+route via SDK client; real integration point is the bridge transport, no binary, no fake adapter. Model for §2.1. |
| 6 | `routes/__tests__/AM2-harness-capabilities.integration.test.ts` | `routes/__tests__/` | no | **service (keep) + add real-probe sibling** | See §2.2 |
| 7 | `harness/__tests__/AL6-return-gate.integration.test.ts` | `harness/__tests__/` | **yes** (allowlisted) | **demote (mostly) + remove scripted** | See §3.1 |
| 8 | `harness/__tests__/AL6-reprompt-loop.integration.test.ts` | `harness/__tests__/` | **yes** (allowlisted) | **demote** | See §3.2 |
| 9 | `harness/__tests__/AL6-uniform-forcing.integration.test.ts` | `harness/__tests__/` | **yes** (allowlisted) | **demote** | See §3.3 |
| 10 | `harness/__tests__/AL6-real-harness-return-enforcement.integration.test.ts` | `harness/__tests__/` | **yes** (allowlisted, stub via `vi.mock(llm-client)`) | **demote** | See §3.4 — it is NOT a real-harness test (mocks callLlm); the real sibling is #11 |
| 11 | `harness/__tests__/AL6-real-harness-return-enforcement-realbinary.integration.test.ts` | `harness/__tests__/` | **yes** (allowlisted) | **convert (real keeper)** | See §3.5 — the genuine real-binary return-enforcement proof; make matrix-complete + drop `skip()` |
| 12 | `harness/__tests__/ah5-gates-on-broken-stream.integration.test.ts` | `harness/__tests__/` | **yes** (allowlisted) | **demote** | See §3.6 — broken-stream is a NEGATIVE; no real harness emits zero events deterministically |
| 13 | `harness/__tests__/AL7-two-session-trust-first.integration.test.ts` | `harness/__tests__/` | **yes** (NOT allowlisted today) | **convert (real keeper)** | See §4 — add builtin lane + `[harness:X]` tags + drop `skip()` |
| 14 | `src/__tests__/AL7-builtin-live-session.integration.test.ts` | `src/__tests__/` | no | **demote/rename** | See §4 — the builtin two-session proof; mocks callLlm → it is a service-integration unit, not harness-facing |
| 15 | `src/__tests__/AL7-tailored-grant.integration.test.ts` | `src/__tests__/` | no | **service (keep)** | See §4 — verdict→grant HTTP + CAS + dispatcher; real DB/app, `CapturingAdapter` is a dispatcher fixture, not a harness-under-test claim |

**Verdict counts:** convert = **2** (#11 AL6-realbinary, #13 AL7-two-session); demote = **8** (#2, #3, #4, #7, #8, #9, #10, #12, #14 — see note); service-keep = **3** (#5 T0b, #6 AM2-capabilities, #15 AL7-tailored-grant); split = #1 (one service half + one demoted half). #14 is a demote (rename off `.integration`). Net: convert 2 / demote 8 / service-keep 3 / split 1.

---

## 2. MCP bridge + capabilities (AC1, AC2)

### 2.1 `mcp-route.integration.test.ts` → split (AC1, AC2)

Current contents are two distinct intents mixed:

- **Service-integration (keep, no harness):** AC2's `registry.handleRequest` 401-for-unknown-token + 401-after-unregister (lines 589–629) — these drive the real `createMcpBridgeRegistry`/`createMcpRoute` token routing with `createMcpBridge`, no agent. Move these into the existing real keeper **T0b** (`mcp-bridge-stateful.integration.test.ts`) OR keep them as a slimmed `mcp/__tests__/mcp-route.test.ts` unit (they use `createTestDb` + `buildToolRegistry`, no app server). **Decision:** fold the 401/token-routing assertions into T0b's describe (it already stands up the production route on a real port) so the route's token-gate is proven on the real listener — one honest proof. Where an assertion needs no live port (pure `registry.handleRequest("deadbeef", req)` → 401), keep it as a `mcp/__tests__/mcp-route.test.ts` unit.
- **Scripted-`provisionSession` (remove):** AC5 bridge-lifecycle, AC6 `.mcp.json` write, AC7 fallback, the graceful-degradation critique test all inject `ScriptedHarnessAdapter`/`CapturingHarness`/`McpJsonCapturingHarness` (hand-rolled `implements HarnessAdapter`) into `provisionSession`. These prove **provisioning orchestration** (bridge registered Phase 8 / unregistered Phase 11 / `.mcp.json` shape), NOT the bridge serving a real tool call. They are scripted look-alikes. **The real proof of `.mcp.json` write + bridge registration through `provisionSession` is AR2's claude lane** (`startMcpBridgeServer` writes the live `.mcp.json`, the real claude binary reads it and calls a tool). **Decision:** the *bridge-lifecycle/`.mcp.json`* assertions are genuine `provisionSession` orchestration logic over a fake adapter — demote the load-bearing ones to a **`mcp/__tests__/mcp-route-provisioning.test.ts` unit** ONLY where the assertion is pure orchestration (registry.size transitions, `.mcp.json` structure) and does not claim to prove the harness. Remove the rest as duplicated by AR2's real claude lane.

Concretely for #1:
- Move 401/unknown-token + 401-after-unregister → T0b (real route) — **AC2 honest proof.**
- Demote `.mcp.json` structure + bridge size==1-during/0-after to `mcp-route-provisioning.test.ts` as orchestration units (they assert on `provisionSession`'s file/registry side-effects, which is service logic — but they must NOT live as `.integration` with a fake adapter; the fake-adapter `implements HarnessAdapter` trips the guard if the file were in `harness/__tests__/`; here it is in `src/__tests__/` so it does not, but per AC1 "no wrapper/fake adapter remains in these `*.integration.test.ts`" we still strip the `.integration` label). Real `.mcp.json`-through-provisioning is covered by AR2's claude lane; AR6 need not re-prove it with a real binary.
- Delete the original `mcp-route.integration.test.ts`.

### 2.2 `AM2-harness-capabilities.integration.test.ts` → service-keep + real-probe sibling (AC1)

Current: drives the real `/api/harnesses` route via `createTestApp` with a **static `STATIC_DISCOVERIES` map** + a real `BuiltinHarnessAdapter` in the pool. The route + serialization (no-secrets, accessMode, authAction shape) is genuinely exercised against the real Hono app — that is honest **service integration** and stays as-is (it is not harness-facing; `routes/__tests__/` is outside `harness/__tests__/`).

The AC1 gap the spec names is "capabilities proven against a **real harness**." The capability *source* is scripted (`STATIC_DISCOVERIES`) so the route assertion is environment-independent. **Decision:** add a separate, small **real-probe** proof that the production discovery (`discoverLocalHarnesses()` / `createLocalAdapterPool()`) returns a real `ready` descriptor for each installed binary — placed in `harness/__tests__/AM2-harness-capabilities.integration.test.ts` (note: harness dir → guard-selected → must carry the full matrix). It iterates `SUPPORTED_HARNESS_LANES`, `requireHarness(lane.harnessName)` per lane under a `[harness:X]` describe, and asserts the **real** discovery probe reports that harness as available with its real version. This is the lightest real-harness capability proof: it does not spawn a turn (cheap), it confirms the production probe sees the real binary. The original `routes/__tests__/…` service test stays for the serialization/no-secrets assertions (which need the static map for determinism).

⚠️ **UNVERIFIED**: builder must confirm the production discovery entry point (`discoverLocalHarnesses` vs `createLocalAdapterPool` vs `probeLiveProofHarnessAvailability`) and its exact return shape before writing the real-probe lanes. Reference: `packages/server/src/harness/harness-discovery.ts` and `AL7-builtin-live-session`'s `probeLiveProofHarnessAvailability` usage.

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
| return-enforcement (real hook fires across harnesses) | **#11 AL6-realbinary** converted to full matrix + `requireHarness` (no `skip()`), `[harness:X]` tags | #10 demoted to `AL6-builtin-enforcement.test.ts` unit (real `BuiltinHarnessAdapter` + mocked `callLlm` is a legit in-process unit) |
| broken-stream gates | **`ah5-gates.test.ts` unit** testing `probeSucceeds` + the broken-stream adapter directly (pure predicate) | scripted `.integration` (#12) |
| builtin-live-session two-session loop | **#14 demoted** to `AL7-builtin-live-session.test.ts` (real `BuiltinHarnessAdapter` + mocked `callLlm` is an in-process unit; it never spawns a binary) | — |
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
5. Where the file uses `import { test } from "../../test-fixtures.js"` it needs `{ db }` fixtures — those remain available in `.test.ts` too (the fixtures are config-driven by suffix only for *which vitest project* runs them; `.test.ts` with fixture import runs in the unit project — ⚠️ **UNVERIFIED**: builder must confirm `.test.ts` files can still import `test-fixtures` and receive `{ db }` under `vitest.config.ts`; if PGlite fixtures are integration-project-only, these stay `.integration.test.ts` as **service** integration and are simply removed from BOTH allowlists, which is also acceptable — they are then service-integration, not harness-facing, and `isHarnessIntegrationPath` returns false for them only if they leave `harness/__tests__/`). **Resolution:** if a demoted file needs PGlite `{ db }`, it stays `*.integration.test.ts` BUT must move OUT of `harness/__tests__/` (e.g. to `services/__tests__/` or `__tests__/`) so `isHarnessIntegrationPath` returns false and the guard does not demand the matrix. See §6 risk.

---

## 4. AL7 consolidation (AC3, AC4)

Three AL7 files cover the trust-first two-session loop at three fidelities:

- **#13 `AL7-two-session-trust-first.integration.test.ts`** (harness dir, real binaries) — claude/codex/opencode spawn → production `createMcpBridge`+`createMcpRoute` → capturing router. **THE real-harness MCP-tool-call keeper.** Convert to full matrix:
  - Add a **`[harness:builtin]` lane**. Builtin does not spawn a binary, so it cannot route through the HTTP MCP bridge the way the CLIs do — its tool calls are in-process. **Decision:** the builtin two-session loop is already proven by #14 (`AL7-builtin-live-session`) through the real `BuiltinHarnessAdapter` loop. To satisfy the per-harness matrix on #13 WITHOUT duplicating, give #13 a `[harness:builtin]` describe that delegates to the same builtin two-session assertion (real `BuiltinHarnessAdapter` + `provisionSession`, mocked `callLlm` for determinism) — i.e. **fold #14's builtin proof INTO #13 as its builtin lane**, then remove #14. This makes #13 the single full-matrix AL7 keeper (builtin in-process + claude/codex/opencode real-binary), and #14 disappears (its content becomes #13's builtin lane).

    ⚠️ Caveat: #14 mocks `callLlm` (deterministic builtin loop). Mixing a `vi.mock("llm-client")` builtin lane into the same file as the real-binary lanes is fine (the mock only affects the in-process builtin path; CLI lanes spawn separate processes unaffected by the vitest module mock). But the guard's `isStubDirty` flags `vi.mock(.*llm-client)` in a selected `.integration` file. **So #13 cannot carry a `vi.mock(llm-client)` builtin lane and stay clean.** Resolution: the builtin lane must drive the **real** `BuiltinHarnessAdapter` with a **real** cheap model (OpenRouter, gated by `requireHarness("builtin")` = `OPENROUTER_API_KEY`) — exactly AR2's builtin lane pattern — NOT a mocked callLlm. The two-session trust-first loop with a real model is feasible (AR2 lane 1 proves a real builtin turn). This is more work than reusing #14's cassette but is the only matrix-clean shape. If a real-model builtin two-session loop proves too nondeterministic for the PC-capture assertion, fall back: keep #14 as a separate **`AL7-builtin-live-session.test.ts` unit** (demoted, mocked callLlm, removed from any allowlist) AND give #13 its builtin lane via AR2's real-builtin `runThroughHarness` asserting only the bridge tool-call reached the handler (not the full PC loop). **Builder picks based on observed flakiness; default to the real-model builtin lane.**
  - Replace every in-body `const authed = await claudeAuthed(); if (!authed) { skip(); return; }` with reliance on `requireHarness(<name>)` at describe scope (already present) — **delete the `skip()` blocks**. The binaries are installed+authed (MEMORY); `requireHarness` hard-fails if not. This satisfies AC4 "hard-fail on missing harness; none skip."
  - Add `[harness:X]` describe-title tags (use `SUPPORTED_HARNESS_LANES[n].describeTag`) so the per-harness attestation floor buckets the executed assertions.
  - Add `packages/server/src/harness/__tests__/AL7-two-session-trust-first.integration.test.ts` to `scripts/coverage-debt.allowlist.json` **only transiently** if landed incrementally; the AC requires it be **removed** once full coverage is reached. Net end state: NOT on either allowlist (clean + full matrix).

- **#14 `AL7-builtin-live-session.integration.test.ts`** — folded into #13's builtin lane (preferred) OR demoted to `AL7-builtin-live-session.test.ts` unit (fallback). Either way it stops being a harness-facing `.integration` claim and is absent from both allowlists.

- **#15 `AL7-tailored-grant.integration.test.ts`** — **service-keep.** It exercises the real verdict→grant HTTP route (`app.request(.../verdict)`), the CAS consume, and the dispatcher enqueue against real DB/app via fixtures. Its `CapturingAdapter` is a *dispatcher fixture* (proves session 2 was enqueued with the grant-bearing workflow), not a claim that a harness was exercised. It lives in `src/__tests__/` → not guard-selected → stays `.integration` as honest service integration. **No change** beyond confirming it is off both allowlists (it already is).

---

## 5. Reuse of AR2 helpers (exact signatures)

From `packages/server/src/harness/__tests__/provision-real-session.ts`:

- `requireHarness(name: HarnessName)` — call at describe scope; hard-fails if binary/key absent. Replaces all `skip()`/`skipIf`.
- `SUPPORTED_HARNESS_LANES: readonly HarnessLane[]` — iterate for the four lanes; `lane.harnessName`, `lane.describeTag` (`[harness:X]`), `lane.prepFn(ctx)`.
- `runThroughHarness(lane, ctx): Promise<{ result, cap }>` — drives `provisionSession` + captures sandbox files. **Used by AM2 real-probe? No** — capability probe doesn't run a session. **Used by #13 builtin lane** if going the real-model `provisionSession` route. **Not used** by #13's CLI lanes (they use AL7's existing `startAl7TestServer` real-bridge rig, which is the correct bridge proof — do not force through `provisionSession`).
- `createSandboxCapture(opts?)` — for any lane asserting on a written file.
- `startMcpBridgeServer()` — production route on an ephemeral port; AL7 already has its own equivalent (`startAl7TestServer`) tuned for the two-session capturing-router flow — keep AL7's (it adds capture/grant modes `startMcpBridgeServer` lacks).

`HarnessName` type + `requireHarness` from `./require-harness.js`. `SUPPORTED_HARNESSES` from `scripts/lib/honest-harness-predicate.ts` (mirrored, do not import scripts from packages — use the `require-harness.ts` literal).

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

`scripts/coverage-debt.allowlist.json` — currently 13 entries. After AR6, remove the five AR6-owned ones that get demoted:
- `AL6-real-harness-return-enforcement.integration.test.ts` (demoted #10)
- `AL6-reprompt-loop.integration.test.ts` (#8)
- `AL6-return-gate.integration.test.ts` (#7)
- `AL6-uniform-forcing.integration.test.ts` (#9)
- `ah5-gates-on-broken-stream.integration.test.ts` (#12)
- `AL7-two-session-trust-first.integration.test.ts` (#13) — **must NOT be added** if it currently is absent; #13 is converted to full coverage so it must be ABSENT (clean + covered). **It is absent today** — keep absent. The realbinary keeper (#11) IS on the coverage list today (`AL6-real-harness-return-enforcement-realbinary.integration.test.ts`) → remove it once #11 reaches full matrix.
- Leave the AR3/AR4/AR5-owned entries (`X3-session-provisioning`, `X6-provisioning-integration`, `adapter-pool`, `AF10`, `af7-*`, `AM2-builtin-gateway`, `AM2-real-harness-session-probe`, `AN1`, `AN2`, `cli-adapter-real-binary`, `session-provisioning`) — those are other WPs' debt. **AR6 touches only its own files.**

**Net coverage-debt removals (AR6):** the 5 demoted AL6/ah5 files + `AL6-real-harness-return-enforcement-realbinary.integration.test.ts` (#11) once full-matrix.

`scripts/honest-harness-guard.allowlist.json` net: also remove `AL6-real-harness-return-enforcement-realbinary…`? — **No**, it is NOT on the stub allowlist (it's a real test, not stub-dirty). It IS on the coverage allowlist. After #11 reaches full matrix, remove it from coverage-debt only.

⚠️ **Risk (service-vs-harness placement):** any demoted file that still needs `{ db }` PGlite fixtures and therefore must stay `*.integration.test.ts` MUST move out of `harness/__tests__/` (to `services/__tests__/` or `mcp/__tests__/`) so `isHarnessIntegrationPath` returns false — otherwise the guard demands the full matrix on a service test. Builder must verify per file whether `.test.ts` can receive fixtures; if not, relocate. (#7's persisted-row assertions are the main candidate.)

---

## 7. Ordered task list (builder)

1. **Demote the pure-logic units first (no real binary needed, fast feedback).** #4 cli-mcp-config → `.test.ts` (already pure). #2 mcp-bridge, #3 mcp-bridge-registry → `mcp/__tests__/*.test.ts`. #12 ah5 → `ah5-gates.test.ts` testing `probeSucceeds` + broken-stream adapter directly. #8 reprompt-loop, #9 uniform-forcing → `.test.ts` (pure import/fs/channel-dispatch logic). For each: rename suffix, relocate if it needs `{db}` fixtures (§6 risk), remove from both allowlists.
2. **Return-gate consolidation (#7, #10).** Extract the verdict assertions to a `return-gate.test.ts` unit over `createReturnGate`/`evaluateReturn`. Demote #10 to `AL6-builtin-enforcement.test.ts` (real builtin adapter + mocked callLlm). Demote #7's orchestration assertions to a service `.test.ts`/`.integration` unit (relocate out of harness dir if `.integration`+fixtures). Remove both from allowlists.
3. **Split #1 mcp-route.** Fold 401/token-routing into T0b (#5); demote `.mcp.json`/registry-size assertions to `mcp-route-provisioning.test.ts`; delete the original `.integration` file.
4. **Run `npm run lint` (honest-harness-guard) early** to confirm the allowlist edits are consistent (stale/debt-paid errors surface immediately). *(Designer note: this is the builder's gate; the designer does not run it.)*
5. **Convert #11 AL6-realbinary to full matrix:** wrap each harness block in `[harness:X]` describe via `SUPPORTED_HARNESS_LANES` tags, add a `[harness:builtin]` lane (real builtin enforcement via real model OR the existing in-process builtin loop with a real cheap model), delete all in-body `skip()`, rely on `requireHarness`. Remove from coverage-debt allowlist.
6. **Convert #13 AL7-two-session to full matrix:** add `[harness:builtin]` lane (real-model builtin two-session via `runThroughHarness`/`provisionSession`, default) per §4; delete `skip()` blocks; add `[harness:X]` tags. Fold #14's builtin proof in; remove #14. Confirm #13 absent from both allowlists.
7. **AM2 real-probe sibling:** add `harness/__tests__/AM2-harness-capabilities.integration.test.ts` (full matrix, real discovery probe per lane); keep the `routes/__tests__/` service test for serialization.
8. **Add #15 AL7-tailored-grant verification** that it is off both allowlists (no code change).
9. **Final allowlist reconciliation:** stub allowlist → `[]`; coverage-debt → AR6's six entries removed (5 demoted + #11). Run guard `--check` to confirm zero stale/debt-paid violations.

---

## 8. Validation method per AC

- **AC1** (mcp-route/bridge/registry/AM2-capabilities prove behavior against a real harness through the production bridge; no wrapper/fake adapter remains in these `.integration`): the real-bridge tool-call proof is **#13 AL7-two-session** (full matrix) + **#5 T0b** (production bridge stateful session); AM2 real-probe sibling proves capabilities against real discovery. The four named scripted `.integration` files (#1/#2/#3 + AM2's scripted half) no longer exist as `.integration` with a fake adapter (demoted to `.test.ts` units / folded into T0b). **Verify:** `grep` for `implements HarnessAdapter`/`Scripted`/`Capturing` in any `*.integration.test.ts` under the AR6 set returns nothing; #13 + T0b pass with real binaries.
- **AC2** (`cli-mcp-config` is a `.test.ts` unit, `.integration` removed): file renamed; uses only `fs/os/path`; runs in the unit project. **Verify:** `ls` shows `cli-mcp-config.test.ts`, no `.integration` variant; `npm run test` (unit) includes it.
- **AC3** (one honest proof per enforcement behavior; scripted duplicate removed/demoted): the keeper table in §3 — each behavior has exactly one keeper; #7/#8/#9/#10/#12/#14 demoted/folded. **Verify:** for each behavior, exactly one file asserts it at integration fidelity (real binary for return-enforcement via #11; in-process/unit for the pure-logic gates).
- **AC4** (no `.integration` constructs a scripted/fake adapter; converted tests hard-fail on missing harness; full matrix): honest-harness-guard `--check` clean with empty stub allowlist; #11 + #13 carry all four `requireHarness` lanes + `[harness:X]` tags; `assertPerHarnessFloor` passes (all four harnesses have executed assertions). **Verify:** `npm run lint` (guard) green; `npm run verify` attestation has non-zero `agenticExecutedByHarness` for builtin/claude/codex/opencode. *(Designer does NOT run these — builder validates in the green phase.)*

---

## 9. Product-bug flags (honest tests may surface)

AR6 changes no product behavior. Two latent issues the honest conversions may expose (in scope to fix only if a real test surfaces them):

1. **codex cost = 0** (AR2 lore `codex-cost-zero`): codex emits `turn.completed`, not a `result` event with `total_cost_usd`, so `CliHarnessAdapter` cost extraction never fires. Already deferred to AR3 (MEMORY). #11/#13 must NOT assert codex `totalCostCents > 0`. Not AR6's to fix — flag for AR3.
2. **builtin two-session real-model nondeterminism**: a real cheap model may not reliably emit `commit_file` → `read_inbox` in order for #13's builtin lane (AC11 "work continues"). If flaky, the fallback (§4) keeps the deterministic builtin proof as a unit and proves only the bridge tool-call on the builtin lane. This is a *test-fidelity* choice, not a product bug.

No genuine product bug is expected in the MCP bridge or enforcement logic (T0b, #11, #15 already pass on real integration today). If a real run surfaces one, it is in scope per the spec; flag it to the reviewer.

---

## 10. Open risks for the reviewer

- **R1 — fixture availability in `.test.ts`:** the demotion plan assumes `.test.ts` units can either run pure (no `{db}`) or be relocated out of `harness/__tests__/` if they need PGlite. If the project's vitest config binds `{db}` fixtures to the integration project only, several demoted files stay `.integration` and must relocate to a non-harness dir to escape `isHarnessIntegrationPath`. Builder must verify and the reviewer should confirm no demoted file lands as `.integration` inside `harness/__tests__/` (that would re-trigger the matrix demand).
- **R2 — builtin lane on the real-bridge keepers (#11, #13):** builtin is in-process and does not route tool calls over the HTTP MCP bridge like the CLIs. The `[harness:builtin]` lane proves builtin enforcement / two-session via the in-process adapter + a real model, NOT through the same HTTP path. The reviewer must accept that "full matrix" for a *bridge* test means "builtin's equivalent in-process proof" — the bridge is a CLI transport; builtin has no MCP-over-HTTP. This is honest (builtin genuinely runs) but is not the literal same code path. Flag if the reviewer wants builtin excluded from the bridge matrix instead (would require a guard/predicate carve-out — larger change, not recommended).
- **R3 — `skip()` vs `requireHarness`:** the guard's `hasAbsentSkipIf` only catches `.skipIf(...)`, NOT in-body `if(!authed){skip()}`. Removing `skip()` is an AC4/spirit requirement, not a mechanically-guarded one — the reviewer must eyeball that #11/#13 have no residual in-body skips.
- **R4 — AM2 real-probe entry point** is `⚠️ UNVERIFIED` (§2.2). If the production discovery probe can't be invoked cheaply per-harness, the AM2 AC1 "real harness" proof may need to fall back to a session-spawning probe (heavier). Reviewer should confirm the chosen probe genuinely exercises real-binary discovery.
