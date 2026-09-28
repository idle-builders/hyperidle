/**
 * `bootAgentExecution` — composes the adapter pool, sandbox adapter, enforcement registry, MCP bridge, and harness-environment provisioning.
 * Needs no DB handle and no credentials; it is pure runtime-adapter composition.
 *
 * @lore: adapters bundle — Application passes this to bootAgentOrchestration as a plain value; agent-orchestration never imports harness-registry directly
 * @lore: topology knob — adapter pool and sandbox adapter derive from the same "local | disabled" choice; one knob prevents drift between the two
 */

import type { ReturnEnforcementChannel } from "@hyperidle/harness-capability";
import type {
	HarnessAdapter,
	RegisteredTool,
	ToolRegistry,
	WorkerRegisterMessage,
} from "@hyperidle/harness-protocol";
import type { EnforcementRegistry as BaseEnforcementRegistry } from "@hyperidle/harness-registry";
import {
	AdapterPool,
	type CliAvailabilityDeps,
	createLocalAdapterPool,
	createReturnEnforcement,
	createSandboxAdapter,
	type HarnessProbeDeps,
	provisionHarnessEnvironment,
	RemoteHarnessAdapter,
	type SandboxAdapter,
	type WsLike,
	writePluginStdioMcpEntries,
} from "@hyperidle/harness-registry";
import { createMcpToolBridge, returnStatusTool } from "@hyperidle/harness-registry/mcp";
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
	/**
	 * Injectable command-runner for local harness discovery — the same seam
	 * `createLocalAdapterPool` already exposes. A unit test passes stubs here so
	 * booting with topology "local" never spawns a real CLI's `--version` or
	 * shells out to `which`; the real Application never passes them.
	 */
	readonly discoveryDeps?: HarnessProbeDeps;
	readonly availabilityDeps?: CliAvailabilityDeps;
}

/** The session-scoped harness-runtime operations consumed by run-orchestration's provisioner, mirrored field-for-field for direct structural assignment. */
export interface AgentExecutionHarnessRuntime {
	readonly enforcementRegistry: EnforcementRegistry;
	createReturnGate(requiredReturnActions?: readonly string[], taskId?: string): ReturnGate;
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
		/** The session's mounted filesystems — see `ProvisionOptions.trustedPaths`. */
		readonly trustedPaths?: readonly string[];
	}): Promise<{ readonly tokenEnv?: Record<string, string> }>;
	/** @lore: plugin stdio MCP entries — dialect knowledge lives in cli-mcp-config.ts */
	writePluginStdioMcpEntries(params: {
		readonly dialect: "codex-toml" | "opencode-json" | "cursor-json";
		readonly sandboxPath: string;
		readonly servers: ReadonlyArray<{
			readonly key: string;
			readonly config: Record<string, unknown>;
		}>;
	}): void;
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

/** Runtime-adapter bundle an Application hands into bootAgentOrchestration's options; agent-orchestration never imports it directly. */
export interface AgentExecutionAdapters {
	readonly pool: AdapterPool;
	readonly sandbox: SandboxAdapter;
	readonly harnessRuntime: AgentExecutionHarnessRuntime;
	/** Builds a HarnessAdapter for a worker's WebSocket registration. */
	createWorkerAdapter(ws: unknown, registration: WorkerRegisterMessage): HarnessAdapter;
	/**
	 * returnStatusTool rides this bundle rather than being imported by agent-orchestration (it reads this boot's enforcement registry).
	 */
	readonly returnStatusTool: {
		/**
		 * Typed against the narrow EnforcementRegistry so agent-orchestration's narrower registry type is accepted (wider alias would reject it).
		 */
		forRegistry(registry: BaseEnforcementRegistry): RegisteredTool;
	};
}

export interface AgentExecutionBoot {
	/** Mounted by the Application pre-auth; MCP clients authenticate via the token in the URL, not X-API-Key. */
	readonly mountMcpRouter: (api: Hono) => void;
	readonly adapters: AgentExecutionAdapters;
	readonly dispose: () => void;
}

export async function bootAgentExecution(
	options: AgentExecutionBootOptions,
): Promise<AgentExecutionBoot> {
	const sandbox = createSandboxAdapter(options.topology);
	const enforcementRegistry = createReturnEnforcement();
	const pool =
		options.topology === "local"
			? await createLocalAdapterPool({
					enforcement: enforcementRegistry,
					discoveryDeps: options.discoveryDeps,
					availabilityDeps: options.availabilityDeps,
				})
			: new AdapterPool();
	const bridge = createMcpToolBridge({
		enforcement: enforcementRegistry,
		baseUrl: options.mcpBaseUrl,
	});

	const harnessRuntime: AgentExecutionHarnessRuntime = {
		enforcementRegistry,
		createReturnGate: (requiredReturnActions, taskId) =>
			enforcementRegistry.createGate(requiredReturnActions, taskId),
		evaluateReturn: (gate, endReason) => enforcementRegistry.evaluate(gate, endReason),
		provisionReturnHook: async (hookOptions) => {
			await provisionHarnessEnvironment({ ...hookOptions, token: hookOptions.bridgeToken });
		},
		writeCliMcpConfig: (configOptions) => provisionHarnessEnvironment(configOptions),
		writePluginStdioMcpEntries: (params) => writePluginStdioMcpEntries(params),
		openMcpBridge: (session) =>
			bridge.open({
				sessionId: session.sessionId,
				registry: session.toolRegistry,
				onToolCall: session.onToolCall,
			}),
		closeMcpBridge: (token) => bridge.close(token),
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
				new RemoteHarnessAdapter(ws as WsLike, registration),
			returnStatusTool,
		},
		dispose: () => {
			// No state to release — dispose exists so every boot in the composition chain is disposable.
		},
	};
}
