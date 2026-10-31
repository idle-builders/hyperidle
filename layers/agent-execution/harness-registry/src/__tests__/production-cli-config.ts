import * as fs from "node:fs";
import * as path from "node:path";
import type { HarnessAdapter } from "@hyperidle/harness-protocol";
import { CLAUDE_CLI_CONFIG, CURSOR_AGENT_CLI_CONFIG } from "../adapter-pool.js";
import type { CliAdapterConfig } from "../cli-harness-adapter.js";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";
import { CodexAppServerAdapter } from "../codex-app-server-adapter.js";
import { OpenCodeServeAdapter } from "../opencode-serve-adapter.js";

/**
 * Returns the production adapter for a harness — the same adapter class
 * `createLocalAdapterPool` / `registerCliAdaptersIfAvailable` would register,
 * so a wrong config or missing protocol support in production fails here too.
 */
export function productionHarnessAdapter(
	name: "claude" | "codex" | "opencode" | "cursor-agent",
): HarnessAdapter {
	switch (name) {
		case "claude":
			return new CliHarnessAdapter(CLAUDE_CLI_CONFIG);
		case "cursor-agent":
			return new CliHarnessAdapter(CURSOR_AGENT_CLI_CONFIG);
		case "codex":
			return new CodexAppServerAdapter();
		case "opencode":
			return new OpenCodeServeAdapter();
	}
}

/**
 * Looks up an adapter config through the same objects production spawns
 * from (adapter-pool.ts), never a hand-copied duplicate — so a wrong flag
 * or a stray credential in production fails the real-binary lane too.
 */
export function productionCliConfig(family: "claude" | "cursor-agent"): CliAdapterConfig {
	switch (family) {
		case "claude":
			return CLAUDE_CLI_CONFIG;
		case "cursor-agent":
			return CURSOR_AGENT_CLI_CONFIG;
	}
}

/** Parse every JSON object on its own line. */
function jsonLines(text: string): Record<string, unknown>[] {
	const out: Record<string, unknown>[] = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("{")) continue;
		try {
			const parsed = JSON.parse(trimmed);
			if (parsed && typeof parsed === "object") out.push(parsed as Record<string, unknown>);
		} catch {
			// partial line — value lands on its own line
		}
	}
	return out;
}

/**
 * Reads the codex session JSONL to find the turn_context entry for a given thread id.
 * Requires ephemeral: false (the default in CodexAppServerAdapter) so the JSONL is written.
 * CODEX_HOME is per-sandbox (CodexAppServerAdapter.buildEnv sets it to sandboxPath/.codex-home),
 * so the history stays in the session sandbox and never writes to the user's ~/.codex.
 */
export function codexTurnContext(
	threadId: string | undefined,
	codexHome: string,
): { model?: string; effort?: string } | undefined {
	if (!threadId) return undefined;
	const sessionsRoot = path.join(codexHome, "sessions");
	if (!fs.existsSync(sessionsRoot)) return undefined;
	const stack: string[] = [sessionsRoot];
	while (stack.length > 0) {
		const dir = stack.pop();
		if (dir === undefined) continue;
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				stack.push(full);
			} else if (entry.name.includes(threadId) && entry.name.endsWith(".jsonl")) {
				for (const obj of jsonLines(fs.readFileSync(full, "utf-8"))) {
					if (obj.type !== "turn_context") continue;
					const payload = obj.payload as Record<string, unknown> | undefined;
					return {
						...(typeof payload?.model === "string" ? { model: payload.model } : {}),
						...(typeof payload?.effort === "string" ? { effort: payload.effort } : {}),
					};
				}
			}
		}
	}
	return undefined;
}
