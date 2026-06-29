# AR2 — Architecture: one real agent run through production `provisionSession()`

One automated harness integration test drives a real agent turn through the production `provisionSession()` orchestrator (real adapter, real model, real `admitSession`/`runSession`/teardown), captures the agent's real sandbox output before teardown deletes it, and asserts on it. Plus the smallest production seam that makes that observation possible, and an extractable helper so AR3–AR6 reuse the pattern instead of rebuilding rigs.

Grounded in: `session-provisioning.ts` (read in full), `session-lifecycle.ts:280-345`, `sandbox-adapter.ts`, `require-harness.ts`, `session-provisioning.integration.test.ts` (the real-claude baseline), `vitest.integration.config.ts` (harness project), `AM2-builtin-gateway.integration.test.ts` (real builtin call shape).

## 1. The capture-seam decision (locked)

### Decision: an optional observation callback `onBeforeTeardown` on `ProvisionSessionDeps`.

Fired once in `runSession`, after the drain `try/finally` releases the adapter slot and before the teardown-branch dispatch (`if (crashed)` at ~line 1137). At that point the sandbox is fully written and **nothing has deleted it yet** (the `rm` lives in `endSession`, called later). Production callers omit the field → zero behavior change.

### Why not the two alternatives

| Option | Cost | Verdict |
|---|---|---|
| **A. Extend `filesystem_captures`** (spec's first option) | The table **does not exist** on this base (max migration `0040`; grep empty). "Extending" means *building* it: a new migration, a Drizzle table, teardown-time copy logic, retention/GC. A new persistent production subsystem for a test-observability need. Unearned (ETHOS: features earned from learnings). | **Rejected** — premise stale, change far too heavy. |
| **B. Snapshot on `ProvisionSessionResult`** (spec's "hook on the result") | Bloats the production result type with a test concern; forces a production decision on *what* to snapshot (everything = expensive on every real session; nothing = useless). | **Rejected** — pollutes a clean production type; the wrong layer decides what to read. |
| **C. Wrap the `SandboxAdapter.destroy()`** | The real `rm` is in `endSession` (`session-lifecycle.ts:341`), which runs **before** `workspace.destroy()`. A destroy-wrapper fires after the dir is already gone. | **Rejected** — fires too late; would observe an empty/missing dir. |
| **D. `onBeforeTeardown` callback in deps (chosen)** | One optional field on `ProvisionSessionDeps`; ~6 lines in `runSession`. Mirrors the existing optional deps (`mcpBridgeRegistry?`, `serviceConnectionResolver?`) and the existing `onHarnessStarted` callback. Absent → no-op. The *test* decides what to read. Teardown untouched. | **Chosen** — lightest change; honest; cannot weaken teardown. |

This is the lightest production change that does not weaken or defer the real teardown contract (AR2 constraint). It observes; it does not disable cleanup.

## 2. Production change (the seam)

### 2a. `packages/server/src/services/session-provisioning.ts`

Add one optional field to `ProvisionSessionDeps`:

```ts
export interface ProvisionSessionDeps {
  // ...existing fields unchanged...
  /**
   * AR2: optional observation hook, fired once after the agent's turn fully drains
   * and the sandbox is completely written, BEFORE teardown deletes it (endSession's
   * fs.promises.rm at session-lifecycle.ts:341). Observes only — it cannot pause,
   * defer, or cancel teardown, which runs unconditionally afterward even if this
   * throws. Absent → no-op (every production caller omits it). Lets a harness
   * integration test read the real files a real agent produced before deletion.
   */
  readonly onBeforeTeardown?: (ctx: BeforeTeardownContext) => void | Promise<void>;
}

export interface BeforeTeardownContext {
  readonly sessionId: string;
  readonly sandboxPath: string;
}
```

Fire it in `runSession` after the drain `try { … } finally { adapterPool.release(adapterId); }` block (after ~line 1095) and before the `if (crashed)` teardown dispatch (~line 1137) — a single fire-point that precedes **all four** teardown branches (completed / not_returned / budget_exhausted / crashed), at which moment the sandbox still exists:

```ts
// AR2: observation seam — sandbox is fully written; teardown has not run yet.
// Swallow observer errors so a failed capture can never strand a sandbox; the
// teardown below always runs. A failed capture surfaces as a failed test
// assertion (expected bytes never captured), not a leaked sandbox.
if (deps.onBeforeTeardown) {
  try {
    await deps.onBeforeTeardown({ sessionId, sandboxPath });
  } catch (observeErr) {
    console.warn(
      `[session-provisioning] onBeforeTeardown observer threw for ${sessionId}; ` +
        `continuing teardown:`,
      observeErr,
    );
  }
}
```

`deps` is already destructured at the top of `runSession`; add `onBeforeTeardown` to that destructure (or read `deps.onBeforeTeardown` directly). `provisionSession(deps, params)` passes `deps` straight through to `runSession` — no signature change to `provisionSession`, `admitSession`, `startSessionProvision`, or the dispatcher. This is the entire production surface of AR2.

**Why this exact location:** the drain has completed and `harness.stopSession` has run (sandbox quiescent, all native writes flushed); the adapter slot is released; but `endSession`/`crashSession` (which own the `rm`) have not been called. It is the unique point that is both *after the agent finished writing* and *before anything deletes*.

### 2b. No schema, no migration, no new table, no change to `session-lifecycle.ts`.

The `rm` at `session-lifecycle.ts:341` is unchanged. No leaked sandboxes: teardown still runs on every path.

## 3. The test (AC1–AC3)

### File
`packages/server/src/harness/__tests__/AR2-provision-real-session.integration.test.ts`
— under `harness/__tests__/`, so the integration config's `HARNESS_INCLUDE` (`packages/server/src/harness/__tests__/**/*.integration.test.ts`) auto-collects it into the **serial harness project** (`fileParallelism:false`, `retry:2`, 240s, PGlite setup present). Uses `{ db, eventBus }` from `../../test-fixtures.js`.

### Two lanes, same shape (provision-real → capture → assert → teardown)

**Lane 1 — default: `builtin` + cheap real model (primary).**
- Gate: `requireHarness("builtin")` (i.e. `OPENROUTER_API_KEY` present — the only key gate; never Anthropic/OpenAI).
- Deps: `AdapterPool` registered with `new BuiltinHarnessAdapter(...)`; `LocalSandboxAdapter`; `setActiveStrategy(fabricStrategy)`. **No MCP bridge needed** — builtin has `mcpSupport:false` and runs HyperIdle tools in-process via the registry.
- Task (seeded DB rows like the baseline test): an obvious one-step job that makes the agent call the in-registry `commit_file` tool to write a file into its sandbox — e.g. `doneCondition`/task description: *"Write the file `answer.txt` containing exactly `4` by calling commit_file, then report done."*
- `resolvedModel`: a cheap, tool-capable OpenRouter model (builder picks from the live catalog at build time — Source-Driven; ⚠️ UNVERIFIED model id until builder confirms a current cheap tool-use model on OpenRouter). `BuiltinHarnessAdapter({ maxIterations, maxOutputTokens })` kept small.
- Capture: `onBeforeTeardown` reads `answer.txt` from `sandboxPath`.
- Assert: captured `answer.txt` content contains `4` (the real file the real model wrote, observed before teardown). Belt-and-suspenders: also assert `result.totalCostCents > 0` (a stub yields 0).

**Lane 2 — CLI proof: real `claude` binary (same shape, native filesystem write).**
- Gate: `requireHarness("claude")`.
- Deps: `AdapterPool` registered with `new CliHarnessAdapter(CLAUDE_CLI_CONFIG)`; `LocalSandboxAdapter`; **plus the production MCP bridge server** — reuse the exact `startMcpBridgeServer()` pattern from `session-provisioning.integration.test.ts` (CLAUDE_CLI_CONFIG passes `--mcp-config .mcp.json --strict-mcp-config` unconditionally, so a real claude spawn needs `.mcp.json` to exist; the bridge makes `provisionSession` write it). `resolvedModel` = `claude-haiku-4-5` (keychain auth; cheapest catalog model, matching the baseline).
- Task: an obvious native-write job — *"Create a file `answer.txt` with the content `4`."* claude uses its **native Write tool** → a real file in the sandbox (not a HyperIdle tool). This is the strongest AC2 proof: an arbitrary sandbox file that **only** the capture seam can observe (no DB row, deleted at teardown).
- Capture + assert: `onBeforeTeardown` reads `answer.txt`; assert content contains `4`.

Both lanes prove AC1 (real `provisionSession` + real adapter + real model + assertion on actual produced output), AC2 (output observed via the seam before `:341` deletes it), AC3 (`requireHarness` hard-fails on absence — no `skipIf`). Each lane counts toward the attestation agentic executed-count floor (AR1).

### Why builtin is the default and claude is the second proof
Spec directive: *"Prefer BuiltinHarnessAdapter + a cheap real model for the default lane, with the same shape proven against at least one CLI binary."* Builtin is in-process and always available given a key (lowest-friction, deterministic tool execution once the model emits the call). claude is the CLI proof and is already known-installed in this env (the baseline test gates on it). The CLI lane additionally exercises the *native-write* case — the file that genuinely has no observation channel other than the seam — making AC2 load-bearing rather than incidental.

### Flake posture
Cheap-model tool-calling is nondeterministic. Mitigations already in place: the harness project sets `retry:2` and 240s timeouts. Keep the task single-step and unambiguous; keep `maxIterations`/`maxOutputTokens` small. A genuine seam/orchestrator break fails all three attempts (the retry absorbs model jitter, not logic breaks — per AR1's config lore).

## 4. The extractable pattern (AC4)

### Helper module (the reusable artifact AR3–AR6 import)
`packages/server/src/harness/__tests__/provision-real-session.ts` — a test-support module beside `require-harness.ts` (same "consumed only by harness integration tests" rationale). Exports:

```ts
/** Collects the agent's real sandbox output before teardown. Pass `.onBeforeTeardown`
 *  into ProvisionSessionDeps; after provisionSession resolves, read `.files`
 *  (relative path → content) — populated when the seam fired. */
export function createSandboxCapture(opts?: { paths?: string[] }): {
  readonly onBeforeTeardown: (ctx: BeforeTeardownContext) => Promise<void>;
  readonly files: Map<string, string>;
};

/** Stands up the production MCP route on an ephemeral port (mirrors
 *  server-factory). Needed by CLI lanes whose CLI config passes an
 *  unconditional --mcp-config. Returns { mcpBridgeRegistry, mcpBaseUrl, close }. */
export function startMcpBridgeServer(): Promise<{
  mcpBridgeRegistry: McpBridgeRegistry;
  mcpBaseUrl: string;
  close: () => Promise<void>;
}>;
```

- `createSandboxCapture` is the heart of the pattern: when `onBeforeTeardown` fires it recursively reads the sandbox (or just `opts.paths`) into the `files` map; the test reads `files` after `provisionSession` returns. Real bytes, no stub.
- `startMcpBridgeServer` is lifted verbatim from the inline copy in `session-provisioning.integration.test.ts` (currently duplicated there and in AL7). AR2 uses it for Lane 2 and exports it; the inline duplicates are migrated by **AR6's consolidation** (out of AR2 scope — AR2 does not rewrite existing test bodies).

### Documented recipe
The module's top-level JSDoc states the canonical four-step recipe so AR3–AR6 follow it without rebuilding rigs:

> **provision-real → capture → assert → teardown**
> 1. `requireHarness(<name>)` at describe scope (hard-fail, never skip).
> 2. Seed domain rows; `setActiveStrategy(fabricStrategy)`; register the real adapter in an `AdapterPool`; `LocalSandboxAdapter`; (CLI only) `startMcpBridgeServer()`.
> 3. `const cap = createSandboxCapture()`; `await provisionSession({ ...deps, onBeforeTeardown: cap.onBeforeTeardown }, params)`.
> 4. Assert on `cap.files` (and/or DB rows the agent's HyperIdle tools wrote, and/or `result`); teardown already ran — no sandbox leaked.

Plus a one-line pointer appended under the **two-archetype** section of `.claude/rules/testing.md` ("harness integration tests observe real output via `createSandboxCapture` + the `onBeforeTeardown` seam; see `provision-real-session.ts`"). Fuller user-facing docs are deferred to `/write-docs` per pipeline phasing; for AR2 the helper JSDoc is the authoritative extractable spec.

## 5. Ordered tasks for the builder

1. **Red (write-tests):** author `AR2-provision-real-session.integration.test.ts` — both lanes, `requireHarness` gates, `createSandboxCapture`, assertions on captured `answer.txt`. It fails first because `onBeforeTeardown` is not yet wired (capture map empty → assertion fails) — proving the seam is genuinely exercised (AC2 / validation scenario 3).
2. **Green — seam:** add `onBeforeTeardown?` + `BeforeTeardownContext` to `ProvisionSessionDeps`; fire it in `runSession` at the post-drain / pre-teardown point (try/catch-wrapped). Lore-comment the location + the "observes, never disables teardown" invariant.
3. **Green — helper:** create `provision-real-session.ts` (`createSandboxCapture`, `startMcpBridgeServer`) with the recipe JSDoc; point Lane 2 at it.
4. **Docs pointer:** one line under testing.md's two-archetype section.
5. **Verify:** `npm run check` + `npm run lint` (honest-harness guard must stay green — no stub/`vi.mock`; this test is honest) + run the harness integration project locally with `OPENROUTER_API_KEY` + `claude` present; confirm both lanes execute (not skip) and assert on real captured bytes. Confirm the attestation agentic executed count increments. Sanity-break: temporarily revert the `runSession` fire line → both lanes go red (seam genuinely load-bearing).

## 6. Risks / open items
- **⚠️ UNVERIFIED — OpenRouter model id** for the builtin lane: builder must pick a current cheap, tool-capable model from the live catalog at build time (Source-Driven; do not trust a remembered id).
- **Latent production bug downstream (not AR2's to fix):** the baseline real-claude test asserts `result.outcome === "not_returned"` because `isReturnAction` does not strip the `mcp__<server>__` namespace (lore'd at `session-provisioning.integration.test.ts:270`). AR2's CLI lane asserts on the **captured file**, not the verdict, so it is unaffected. Fixing `isReturnAction` is tracked but not gated here (AR2 = seam + pattern; keep scope tight).
- **`onBeforeTeardown` and the detached path:** `startSessionProvision` (HTTP) detaches `runSession` and never sets `onBeforeTeardown` — correct; the seam is test-only and the detached production path keeps its exact current teardown behavior.
