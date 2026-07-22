import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	ResolvedModel,
	SessionConfig,
	SessionHandle,
	SessionResult,
	WorkerRegisterMessage,
} from "@hyperidle/shared";
import type { BuiltinHarnessOptions } from "./builtin-harness-adapter.js";
import { BuiltinHarnessAdapter } from "./builtin-harness-adapter.js";
import type { CliAdapterConfig, CliAdapterDeps } from "./cli-harness-adapter.js";
import { CliHarnessAdapter } from "./cli-harness-adapter.js";
import type { CallLlmOptions } from "./llm-client.js";
import { callLlm } from "./llm-client.js";
import { estimateLlmCost } from "./llm-cost-estimate.js";
import { RemoteHarnessAdapter } from "./remote-harness-adapter.js";

interface WsLike {
	send(data: string): void;
	close(): void;
	onmessage: ((evt: { data: string }) => void) | null;
	onclose: (() => void) | null;
	onerror: ((err: Error) => void) | null;
}

type BuiltinSpec = { readonly kind: "builtin"; readonly options?: BuiltinHarnessOptions };
type CliSpec = {
	readonly kind: "cli";
	readonly config: CliAdapterConfig;
	readonly deps?: CliAdapterDeps;
};
type DirectSpec = {
	readonly kind: "direct";
	readonly model: ResolvedModel;
	readonly instruction?: string;
	readonly tools?: CallLlmOptions["tools"];
	readonly maxTokens?: number;
	readonly returnEnforcement: "none";
};
type RemoteSpec = {
	readonly kind: "remote";
	readonly ws: unknown;
	readonly registration: WorkerRegisterMessage;
};
export type HarnessAdapterSpec = BuiltinSpec | CliSpec | DirectSpec | RemoteSpec;

interface DirectSession {
	readonly systemPrompt: string;
	readonly controller: AbortController;
	stopped: boolean;
}

class DirectHarnessAdapter implements HarnessAdapter {
	private readonly sessions = new Map<string, DirectSession>();

	constructor(private readonly options: DirectSpec) {}

	async startSession(config: SessionConfig): Promise<SessionHandle> {
		let systemPrompt = config.assembledPrompt;
		try {
			systemPrompt = await fs.readFile(path.join(config.sandboxPath, "AGENTS.md"), "utf8");
		} catch {
			// Carrier is optional; assembled prompt is canonical fallback.
		}
		this.sessions.set(config.sessionId, {
			systemPrompt,
			controller: new AbortController(),
			stopped: false,
		});
		return { sessionId: config.sessionId };
	}

	async *streamEvents(handle: SessionHandle): AsyncGenerator<HarnessEvent> {
		const session = this.sessions.get(handle.sessionId);
		if (!session) {
			yield {
				type: "error",
				message: "Direct harness session not found",
				code: "SESSION_NOT_FOUND",
			};
			return;
		}
		try {
			const response = await callLlm({
				model: this.options.model,
				system: session.systemPrompt,
				messages: [
					{ role: "user", content: this.options.instruction ?? "Complete your assigned task." },
				],
				tools: this.options.tools,
				maxTokens: this.options.maxTokens ?? 1024,
				signal: session.controller.signal,
			});
			if (session.stopped) return;
			const cost = estimateLlmCost(
				response.usage.inputTokens,
				response.usage.outputTokens,
				this.options.model.model,
			);
			if (cost > 0)
				yield { type: "cost_update", totalCost: cost, deltaCost: cost, currency: "USD" };
			yield {
				type: "token_usage",
				inputTokens: response.usage.inputTokens,
				outputTokens: response.usage.outputTokens,
			};
			for (const block of response.content) {
				if (block.type === "tool_use")
					yield { type: "tool_call", toolName: block.name, args: block.input };
			}
			const text = response.content
				.flatMap((block) => (block.type === "text" ? [block.text] : []))
				.join("");
			if (!session.stopped) yield { type: "completion", text };
		} catch (error) {
			if (!session.stopped)
				yield {
					type: "error",
					message: `Direct harness LLM call failed: ${String(error)}`,
					code: "LLM_CALL_FAILED",
				};
		} finally {
			this.sessions.delete(handle.sessionId);
		}
	}

	stopSession(handle: SessionHandle): Promise<SessionResult> {
		const session = this.sessions.get(handle.sessionId);
		if (session) {
			session.stopped = true;
			session.controller.abort(new Error("Direct harness session stopped"));
			this.sessions.delete(handle.sessionId);
		}
		return Promise.resolve({
			outcome: session ? "stopped" : "completed",
			cost: { minor: 0, currency: "USD" },
			tokenUsage: { byTier: {} },
		});
	}

	getCapabilities(): HarnessCapabilities {
		return {
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: [this.options.model.provider],
			mcpSupport: false,
			returnEnforcement: "none",
		};
	}
}

export function createHarnessAdapter(spec: BuiltinSpec): BuiltinHarnessAdapter;
export function createHarnessAdapter(spec: CliSpec): CliHarnessAdapter;
export function createHarnessAdapter(spec: DirectSpec): HarnessAdapter;
export function createHarnessAdapter(spec: RemoteSpec): RemoteHarnessAdapter;
export function createHarnessAdapter(spec: HarnessAdapterSpec): HarnessAdapter {
	switch (spec.kind) {
		case "builtin":
			return new BuiltinHarnessAdapter(spec.options);
		case "cli":
			return new CliHarnessAdapter(spec.config, spec.deps);
		case "direct":
			return new DirectHarnessAdapter(spec);
		case "remote":
			if (!isSocket(spec.ws))
				throw new TypeError("Remote harness requires a WebSocket-like transport");
			return new RemoteHarnessAdapter(spec.ws, spec.registration);
	}
}

function isSocket(value: unknown): value is WsLike {
	if (typeof value !== "object" || value === null) return false;
	return (
		"send" in value &&
		typeof value.send === "function" &&
		"close" in value &&
		typeof value.close === "function"
	);
}
