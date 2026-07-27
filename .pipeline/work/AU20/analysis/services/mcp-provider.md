# mcp-provider — Service-as-Product Audit (AU20)

**Layer:** agent-execution (Mechanism B — zero DB, zero sibling-Service dep)
**Current public exports:** 7 · **Owned tables:** 0 · **`dependsOn`: []**
**Verdict: DISSOLVE → fold into `harness-registry`.**

---

## 1. Existence / Consolidation Verdict

### What it actually is
`mcp-provider` is the **server side of the harness↔tools wire**. Three files, ~250 LOC:
- `mcp-bridge.ts` — per-session `McpServer` + streamable-HTTP transport; registers every tool from a role-filtered `ToolRegistry`, maps `ToolResult → CallToolResult`.
- `mcp-bridge-registry.ts` — in-memory `Map<token → bridge>`; register / lookup / unregister / handleRequest / size.
- `mcp-route.ts` — Hono sub-router: `ALL /mcp/:token` (JSON-RPC bridge) + `POST /mcp/:token/return-status` (AL6 hook adjudication).

### Real demand (from the data package + call-site scan)
The data package lists one consuming *service* (session-lifecycle, requesting `register`/`unregister`/`createMcpBridge`). The full call-site scan shows the true, and narrower, picture — **three production functions, two call sites**:

| Export | Real production consumer | Role |
|---|---|---|
| `createMcpBridge` | `core-api/session-lifecycle-bindings.ts` (wires session-lifecycle's provider port) | make a per-session bridge |
| `createMcpBridgeRegistry` | `core-api/server-factory.ts` (composition root) | hold the routing table |
| `createMcpRoute` | `core-api/server-factory.ts` (composition root) | mount the Hono router |
| `McpBridgeRegistry` (type) | `core-api/app.ts` | DI type |
| `CreateMcpBridgeOptions`, `McpBridgeInstance`, `toolResultToCallToolResult` | **tests only** (externally) | leaked internals |

So of 7 exports, **3 are the real product** (createMcpBridge / createMcpBridgeRegistry / createMcpRoute), 1 type rides along, and 3 are internal helpers/types leaked to the public barrel.

### Why it does NOT earn its own package boundary
AU19's claim — *"the MCP wire protocol is a genuinely distinct concern from harness process management"* — does not survive contact with the code:

1. **The return-status route adjudicates `harness-registry`'s own state.** `createMcpRoute` reads `enforcementRegistry.get(sessionId)`, calls `enforcementRegistry.incrementForce(...)` and `shouldForceReturn(...)` — the AL6 return-enforcement machinery whose factory (`createEnforcementRegistry`) and gate (`createReturnGate`/`evaluateReturn`) **live in `harness-registry`**. The adjudicator is split from the registry it adjudicates across a package boundary for no reason.
2. **`harness-registry` already owns the other end of this exact wire.** It exports `writeCliMcpConfig` — the code that writes the `.mcp.json`/`config.toml` a CLI harness reads to *discover the very endpoint `mcp-provider` serves*. Config-writer and server are two halves of one contract; changing the wire shape today touches two packages.
3. **Same layer, same mechanism, same consumer flow.** Both are agent-execution / zero-DB. session-lifecycle provisions a harness *and* its MCP bridge in the same provisioning step — they are not independent products with independent demand; they are one platform's two faces.
4. **Zero dependencies, one consumer flow, ~250 LOC.** A leaf package this small, consumed only by the composition root + one orchestration service, is packaging overhead, not a product boundary.

### Candidate-cluster hypothesis — confirmed (for this member)
The `harness-execution-platform` hypothesis is right that the *layer* is a genuine earned security seam (untrusted remote-worker, Mechanism B). But **internally, `mcp-provider` is not a peer of `harness-registry` — it is a satellite of it.** The steer ("strongest fold-into-harness-registry candidate; tiny wire transport") matches the evidence exactly. Dissolve it into `harness-registry`; the merged package is the agent-execution platform product (harness adapters + LLM client + sandbox + return-enforcement + **the MCP tool-serving mount**), serving `session-lifecycle` and the `core-api` composition root. `tool-provider` is a separate question for its own planner; nothing here forces it in.

---

## 2. Deliberate Target Public API

Redesigned as a capability **inside `harness-registry`**. The registry and the route are never used apart (server-factory builds the route directly from the registry it just created), and the bridge instance / result-mapper are pure internals. Collapse the 7 into **one factory + one handle type**:

### `createMcpToolBridge({ enforcement }) → McpToolBridge`
The single "MCP tool-serving mount" for a server. Returns a handle that IS the mount:
- `router: Hono` — mount at `/api` (serves `ALL /mcp/:token` + `POST /mcp/:token/return-status`, adjudicating against the `enforcement` registry passed in).
- `open(session: { sessionId; registry; onToolCall? }) → { token }` — create + register a per-session bridge; returns the routing token.
- `close(token) → Promise<void>` — unregister + tear down (mcpServer.close, swallow-on-teardown).

**Subsumes:**
| Current export | Fate |
|---|---|
| `createMcpBridgeRegistry` | → internal (`open` builds+stores) |
| `createMcpRoute` | → `.router` on the handle |
| `McpBridgeRegistry` (type) | → replaced by `McpToolBridge` |
| `createMcpBridge` | → internal, invoked by `open` |
| `CreateMcpBridgeOptions` | → inline param of `open` |
| `McpBridgeInstance` | → private (never crosses the boundary; session-lifecycle only needs the token) |
| `toolResultToCallToolResult` | → private helper (only tests import it) |
| `register`/`unregister`/`lookup`/`handleRequest`/`size` | → `open`/`close` public; `lookup`/`handleRequest`/`size` private (route uses them internally; no external caller needs token-lookup or size) |

**Target public exports: 2** (`createMcpToolBridge` + `type McpToolBridge`) — down from 7 — and **0 as a standalone package** (dissolved).

Why this is a meaningful shared capability, not a per-caller carve-out: it is parameterized by *session*, not by harness or use-case. Every harness that speaks MCP (claude/codex/opencode, and any future CLI) is served by the same `open(session)` — the bridge does not know or branch on which harness connects.

---

## 3. Inside Lens

- **Co-location ends the split-brain.** The return-status route sits next to `createEnforcementRegistry`/`evaluateReturn` it adjudicates, and the MCP server sits next to `writeCliMcpConfig` that advertises its URL. Changing the wire contract or the AL6 hook protocol is now a one-package edit.
- **Encapsulation.** `asMcpInputSchema` (the zod-3/zod-4 brand bridge) and `toolResultToCallToolResult` become private; `McpBridgeInstance` never leaves the module. The public surface is a lifecycle (`open`/`close`) + a mountable `router` — implementation (stateful transport, 64-char token, teardown swallow) is free to change.
- **One seam to reason about.** session-lifecycle holds a `McpToolBridge`, calls `open` at provision and `close` at teardown — the same shape its port already wants (`SessionLifecycleMcpProvider` + `...McpBridgeRegistry` collapse to one injected handle).

---

## 4. Scaling Argument (sub-linear)

Apply the test — *add dozens more services / hundreds more calls, do we add methods?*

- **New harness family (e.g. gemini-cli):** zero new methods. It discovers the endpoint via `writeCliMcpConfig` and is served by the same `open(session)`. The bridge is intent-agnostic.
- **New transport (stdio instead of streamable-HTTP):** a strategy/param inside `open`, not a new export.
- **New adjudication rule (AL6 variant):** lives in the injected `enforcement` registry the route already reads — the route signature is unchanged.
- **Nth consuming service wanting a bridge:** composes `open`/`close`; adds no surface.

Contrast the method-per-intent path this audit rejects — `registerClaudeBridge`, `bridgeForCodexSession`, `lookupBridgeByToken`, `mcpRouteWithEnforcement`, `mcpRouteWithoutEnforcement` — each new harness/lookup-shape/enforcement-mode would grow one export. `createMcpToolBridge` with `open(session)` parameterized by session absorbs all of them: **surface stays 2 as callers and harnesses multiply.**

---

## 5. Key Collapses

1. **`createMcpBridgeRegistry` + `createMcpRoute` + `McpBridgeRegistry` → `createMcpToolBridge` (router on the handle).** The registry and route are always created together from each other; one factory returns both.
2. **`createMcpBridge` + `register`/`unregister` + `CreateMcpBridgeOptions` + `McpBridgeInstance` → `open(session)` / `close(token)`.** Bridge construction and registration are one act (session-lifecycle only ever needs the token back); the instance never crosses the boundary.
3. **`toolResultToCallToolResult` (internal mapper leaked to the barrel) → private.** Externally imported only by tests.
4. **Dissolve the package into `harness-registry`.** Reunites the return-status route with the `enforcementRegistry` it mutates and the MCP server with the `writeCliMcpConfig` that points harnesses at it — one platform boundary, one wire contract, instead of two packages editing in lockstep.

**Net: 7 public exports → 2, and one fewer package** in the agent-execution platform.
