/**
 * DirectHarnessAdapter — single-call LLM adapter for eval use only.
 *
 * @lore AU43: Moved from harness-registry/src/harness-adapter-factory.ts.
 * This adapter is eval-only (ExternalShapedAdapter semantics, no Layer-A hooks),
 * and belongs in tools/eval rather than production harness-registry.
 * It is NOT exported from @hyperidle/harness-registry.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ResolvedModel } from "@hyperidle/domain-model";
import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/harness-protocol";
import type { CallLlmOptions } from "@hyperidle/harness-registry";
import { callLlm } from "@hyperidle/harness-registry";

export interface DirectAdapterOptions {
	readonly model: ResolvedModel;
	readonly instruction?: string;
	readonly tools?: CallLlmOptions["tools"];
	readonly maxTokens?: number;
	readonly returnEnforcement: "none";
}

interface DirectSession {
	readonly systemPrompt: string;
	readonly controller: AbortController;
	stopped: boolean;
}

export class DirectHarnessAdapter implements HarnessAdapter {
	private readonly sessions = new Map<string, DirectSession>();

	constructor(private readonly options: DirectAdapterOptions) {}

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
