/**
 * `bootAgentExecution` — the Layer's real boot (AC #4, architecture.md §6).
 *
 * Replaces the former re-export barrel (`src/index.ts`'s old shape). This
 * Layer now owns constructing the adapter pool, the sandbox adapter, the
 * return-enforcement registry, the MCP bridge + its router, and
 * harness-environment provisioning — the pieces an Application used to
 * construct itself (`applications/remote-server/src/index.ts`,
 * `applications/desktop/src/boot-server.ts`,
 * `applications/remote-server/src/create-server.ts`) or that leaked into
 * `layers/core-api/src/services/run-orchestration-composition.ts` through a
 * direct `@hyperidle/harness-registry` import (architecture §2.4). The boot
 * needs no DB handle and no credentials (architecture §6 point 3) — it is
 * pure runtime-adapter composition.
 *
 * @lore AU31 §6/§4: the returned `adapters` bundle is what an Application
 * hands, as a plain value, into `bootAgentOrchestration`'s options — never an
 * import `agent-orchestration` makes itself. The spelling law (§4) requires
 * the composition root to bind this boot's result to a local before any part
 * of it enters the other Layer's boot arguments; `bootAgentExecution`'s job
 * stops at producing the value, not at wiring it anywhere. That wiring
 * (`bootAgentOrchestration`'s options growing an `adapters` field, and
 * `run-orchestration-composition.ts` relocating to consume it instead of
 * importing `@hyperidle/harness-registry` directly) is architecture §5.1/§5's
 * job, not this leaf's.
 *
 * @lore Why `topology` and not two separate booleans: `desktop` and
 * `remote-server` today each construct BOTH the adapter pool AND the sandbox
 * adapter from the same "local vs disabled" choice
 * (`createLocalAdapterPool()` + `createSandboxAdapter("local")` for desktop;
 * an empty `AdapterPool` + `createSandboxAdapter("disabled")` for
 * remote-server — `applications/desktop/src/boot-server.ts`,
 * `applications/remote-server/src/index.ts`). `createSandboxAdapter` already
 * spells the choice as `"local" | "disabled"`; reusing that vocabulary here
 * keeps one knob instead of two that could drift out of sync.
 */

import {
	AdapterPool,
	createHarnessAdapter,
	createLocalAdapterPool,
	createReturnEnforcement,
	createSandboxAdapter,
	provisionHarnessEnvironment,
	type SandboxAdapter,
} from "@hyperidle/harness-registry";
import {
	closeMcpBridgeSession,
	createMcpToolBridge,
	openMcpBridgeSession,
	returnStatusTool,
} from "@hyperidle/harness-registry/mcp";
import type { ReturnEnforcementChannel } from "@hyperidle/harness-capability";
import type {
	EnforcementRegistry as BaseEnforcementRegistry,
	HarnessAdapter,
	WorkerRegisterMessage,
} from "@hyperidle/harness-protocol";
import type { RegisteredTool, ToolRegistry } from "@hyperidle/tool-protocol";
import type { Hono } from "hono";

/** The concrete registry `createReturnEnforcement()` builds — never exported by name from `@hyperidle/harness-registry`, so derived from the factory's own return type instead of duplicating its shape by hand. */
type EnforcementRegistry = ReturnType<typeof createReturnEnforcement>;
/** The gate `EnforcementRegistry.createGate()` returns. */
type ReturnGate = ReturnType<EnforcementRegistry["createGate"]>;

export interface AgentExecutionBootOptions {
	/**
	 * "local": in-process CLI harness discovery + a real local sandbox — the
	 * `desktop` Application's shape. "disabled": an empty pool, populated only
	 * by remote workers registering over the worker WS route, no local
	 * sandbox — the `remote-server` Application's shape.
	 */
	readonly topology: "local" | "disabled";
	/** The Application's own origin — spells the MCP bridge's dialable URL (`${mcpBaseUrl}/api/mcp/:token`). */
	readonly mcpBaseUrl: string;
}

/**
 * The session-scoped harness-runtime operations `run-orchestration`'s
 * provisioner consumes through its own `SessionLifecycleHarnessRuntime` port
 * (`layers/agent-orchestration/run-orchestration/src/provisioner.ts`) —
 * mirrored here field-for-field so the relocated composition root can assign
 * this object directly, structurally, with no adapter layer of its own.
 */
export interface AgentExecutionHarnessRuntime {
	readonly enforcementRegistry: EnforcementRegistry;
	createReturnGate(requiredReturnActions?: readonly string[]): ReturnGate;
	evaluateReturn(
		gate: ReturnGate,
		endReason: "completed" | "crashed" | "stopped",
	): "returned" | "not_returned";
	provisionReturnHook(options: {
		readonly sandboxPath: string;
		readonly channel: ReturnEnforcementChannel;
		readonly bridgeToken: string;
		readonly mcpUrl: string;
		readonly forceBudget: number;
	}): Promise<void>;
	writeCliMcpConfig(options: {
		readonly dialect: "codex-toml" | "opencode-json" | "cursor-json";
		readonly sandboxPath: string;
		readonly mcpUrl: string;
		readonly token: string;
	}): Promise<{ readonly tokenEnv?: Record<string, string> }>;
	/**
	 * The session-scoped MCP dial. `registry`/`baseUrl` are no longer per-call
	 * parameters (contrast `run-orchestration-composition.ts`'s current
	 * `openMcpBridge(options)` today) — this boot already owns one bridge
	 * instance and one `mcpBaseUrl`, closed over here, so the caller supplies
	 * only the session-scoped data.
	 */
	openMcpBridge(session: {
		readonly sessionId: string;
		readonly toolRegistry: ToolRegistry;
		readonly onToolCall?: (call: { toolName: string; args: unknown }) => void;
	}): Promise<{ readonly token: string; readonly url: string }>;
	closeMcpBridge(token: string): Promise<void>;
}

/**
 * The opaque, shared-typed runtime-adapter bundle an Application hands into
 * `bootAgentOrchestration`'s options (architecture §2.4/§4 clause 3) — never
 * imported by `agent-orchestration` itself.
 */
export interface AgentExecutionAdapters {
	readonly pool: AdapterPool;
	readonly sandbox: SandboxAdapter;
	readonly harnessRuntime: AgentExecutionHarnessRuntime;
	/** Builds a `HarnessAdapter` for a worker's WebSocket registration (the "remote" kind — `AdapterPool.select()`'s worker-side counterpart to the local adapters this boot pre-registers). */
	createWorkerAdapter(ws: unknown, registration: WorkerRegisterMessage): HarnessAdapter;
	/**
	 * AU31 §2.5: `returnStatusTool` is execution content (it reads the
	 * enforcement registry this same boot owns) — it rides this bundle rather
	 * than being imported by `agent-orchestration`, which composes it into
	 * `extraTools` via `forRegistry(harnessRuntime.enforcementRegistry)`.
	 */
	readonly returnStatusTool: {
		/**
		 * `@hyperidle/harness-protocol`'s narrow `EnforcementRegistry` (register/get/
		 * incrementForce/unregister) — `harness-registry/mcp`'s own
		 * `returnStatusTool.forRegistry` genuinely only reads that subset, even
		 * though every registry this boot hands out (including
		 * `harnessRuntime.enforcementRegistry`, the wider `ReturnEnforcement`)
		 * satisfies it too. Typing this field against the wider local alias
		 * would reject the caller's narrower, honest registry type
		 * (`agent-orchestration`'s own `SessionLifecycleEnforcementRegistry`)
		 * for methods it never calls.
		 */
		forRegistry(registry: BaseEnforcementRegistry): RegisteredTool;
	};
}

export interface AgentExecutionBoot {
	/** Mounted by the Application pre-auth, at the same spot `mcpBridgeRegistry.router` mounts today (`create-server.ts:790`) — MCP clients authenticate via the token in the URL, not `X-API-Key`. */
	readonly mountMcpRouter: (api: Hono) => void;
	readonly adapters: AgentExecutionAdapters;
	readonly dispose: () => void;
}

export async function bootAgentExecution(
	options: AgentExecutionBootOptions,
): Promise<AgentExecutionBoot> {
	const pool = options.topology === "local" ? await createLocalAdapterPool() : new AdapterPool();
	const sandbox = createSandboxAdapter(options.topology);
	const enforcementRegistry = createReturnEnforcement();
	const bridge = createMcpToolBridge({ enforcement: enforcementRegistry });

	const harnessRuntime: AgentExecutionHarnessRuntime = {
		enforcementRegistry,
		createReturnGate: (requiredReturnActions) =>
			enforcementRegistry.createGate(requiredReturnActions),
		evaluateReturn: (gate, endReason) => enforcementRegistry.evaluate(gate, endReason),
		provisionReturnHook: async (hookOptions) => {
			await provisionHarnessEnvironment({ ...hookOptions, token: hookOptions.bridgeToken });
		},
		writeCliMcpConfig: (configOptions) => provisionHarnessEnvironment(configOptions),
		openMcpBridge: (session) =>
			openMcpBridgeSession(bridge, options.mcpBaseUrl, {
				sessionId: session.sessionId,
				registry: session.toolRegistry,
				onToolCall: session.onToolCall,
			}),
		closeMcpBridge: (token) => closeMcpBridgeSession(bridge, token),
	};

	return {
		mountMcpRouter: (api) => {
			api.route("/", bridge.router);
		},
		adapters: {
			pool,
			sandbox,
			harnessRuntime,
			createWorkerAdapter: (ws, registration) =>
				createHarnessAdapter({ kind: "remote", ws, registration }),
			returnStatusTool,
		},
		dispose: () => {
			// Nothing here owns a timer, an interval, or an open handle: the pool
			// and the bridge are both in-memory maps GC reclaims, and neither the
			// pool's discovery snapshot nor the sandbox adapter starts a
			// background process. `dispose` exists so the boot's shape matches
			// `bootCoreApi`/`bootAgentOrchestration` (every boot in the
			// composition chain is disposable), not because there is state to
			// release yet.
		},
	};
}
