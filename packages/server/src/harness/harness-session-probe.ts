/**
 * AM2 AC5: Harmless real one-shot session probe per installed+authed CLI harness family.
 *
 * Each probe executes a cheap, non-destructive command via execFile (hard-coded arg array,
 * no shell, short timeout) and captures the usage-bearing event line.
 *
 * Security constraints:
 * - Hard-coded arg arrays only (no shell, no user input)
 * - Never reads CLI auth files (~/.codex/auth.json, keychain, ~/.local/share/opencode/auth.json)
 * - Committed fixtures contain only event type + numeric usage; no secrets, no auth tokens
 * - Harmless prompts only ("say OK")
 *
 * @lore AM2: The probe is the minimal real-session proof (AC5) distinct from the full
 * runtime session-routing adapter (AM3+ scope). A "probe" is one-shot, cheap, harmless,
 * captures one event line. A "runtime adapter" routes ongoing user sessions, streams all
 * events, handles approvals/credentials.
 */

import { spawn } from "node:child_process";
import type { HarnessSessionProbeResult } from "./harness-discovery.js";

/**
 * Spawn a command with closed stdin (so interactive CLIs don't block waiting for input),
 * collect stdout, and return it.
 *
 * @lore AM2: `execFile` does not support closing stdin — it inherits the parent's stdin.
 * CLIs like `codex exec` print "Reading additional input from stdin..." and may block.
 * `spawn` with `stdio: ['ignore', 'pipe', 'pipe']` ensures stdin is closed from the start.
 */
function spawnWithClosedStdin(
	cmd: string,
	args: readonly string[],
	timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args as string[], {
			stdio: ["ignore", "pipe", "pipe"],
			timeout: timeoutMs,
		});

		let stdout = "";
		let stderr = "";

		child.stdout?.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf-8");
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf-8");
		});

		const timer = setTimeout(() => {
			child.kill("SIGTERM");
			reject(new Error(`probe timed out after ${timeoutMs}ms`));
		}, timeoutMs);

		child.on("close", () => {
			clearTimeout(timer);
			resolve({ stdout, stderr });
		});

		child.on("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});
	});
}

/** @lore AM2: 60-second timeout is generous for a real LLM call (say OK = cheap). */
const PROBE_TIMEOUT_MS = 60_000;

/** The harmless prompt used for all probes. */
const PROBE_PROMPT = "say OK";

/**
 * Find the usage-bearing event line in a stream of JSONL lines.
 * For codex: `turn.completed` with a `usage` object.
 * For claude-code: `result` with `usage` + `total_cost_usd`.
 *
 * Returns the usage-bearing line, or undefined if none found.
 */
function findUsageBearingLine(
	lines: string[],
	family: "codex" | "claude-code" | "opencode",
): { line: string; eventType: string } | undefined {
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			const parsed = JSON.parse(trimmed) as Record<string, unknown>;
			if (typeof parsed.type !== "string") continue;

			if (family === "codex" && parsed.type === "turn.completed") {
				const usage = parsed.usage;
				if (
					typeof usage === "object" &&
					usage !== null &&
					typeof (usage as Record<string, unknown>).input_tokens === "number"
				) {
					return { line: trimmed, eventType: "turn.completed" };
				}
			}

			if (family === "claude-code" && parsed.type === "result") {
				const usage = parsed.usage;
				if (
					typeof usage === "object" &&
					usage !== null &&
					typeof (usage as Record<string, unknown>).input_tokens === "number" &&
					typeof parsed.total_cost_usd === "number"
				) {
					return { line: trimmed, eventType: "result" };
				}
			}

			if (family === "opencode") {
				// opencode schema is unconfirmed — capture the first parsable JSON line
				return { line: trimmed, eventType: parsed.type };
			}
		} catch {
			// Not valid JSON — skip
		}
	}
	return undefined;
}

async function probeCodexSession(): Promise<HarnessSessionProbeResult> {
	try {
		// @lore AM2: `codex exec` with --json flag emits JSONL event lines on stdout.
		// Hard-coded arg array — no shell, no user input.
		// spawnWithClosedStdin sets stdin='ignore' so codex doesn't block on
		// "Reading additional input from stdin...".
		const { stdout } = await spawnWithClosedStdin(
			"codex",
			["exec", "reply with the single word OK", "--json"],
			PROBE_TIMEOUT_MS,
		);

		const lines = stdout.split("\n");
		const usageLine = findUsageBearingLine(lines, "codex");

		if (usageLine) {
			return {
				ok: true,
				family: "codex",
				capturedLine: usageLine.line,
				eventType: usageLine.eventType,
			};
		}

		// Got output but no usage-bearing line — AC5 launch proof stands, AC6 unknown
		const firstNonEmptyLine = lines.find((l) => l.trim().length > 0)?.trim();
		return {
			ok: true,
			family: "codex",
			capturedLine: firstNonEmptyLine,
			eventType: "unknown",
			reason:
				"codex exec ran but emitted no usage-bearing turn.completed line; AC6 normalization marked unknown",
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			family: "codex",
			reason: `codex exec failed: ${message}`,
		};
	}
}

async function probeClaudeSession(): Promise<HarnessSessionProbeResult> {
	try {
		// @lore AM2: `claude -p` with --output-format stream-json --verbose emits NDJSON
		// event lines. --no-session-persistence avoids creating persistent session files.
		// spawnWithClosedStdin prevents stdin from blocking the process.
		const { stdout } = await spawnWithClosedStdin(
			"claude",
			[
				"-p",
				PROBE_PROMPT,
				"--output-format",
				"stream-json",
				"--verbose",
				"--no-session-persistence",
			],
			PROBE_TIMEOUT_MS,
		);

		const lines = stdout.split("\n");
		const usageLine = findUsageBearingLine(lines, "claude-code");

		if (usageLine) {
			return {
				ok: true,
				family: "claude-code",
				capturedLine: usageLine.line,
				eventType: usageLine.eventType,
			};
		}

		// Got output but no usage-bearing result line
		const firstNonEmptyLine = lines.find((l) => l.trim().length > 0)?.trim();
		return {
			ok: true,
			family: "claude-code",
			capturedLine: firstNonEmptyLine,
			eventType: "unknown",
			reason:
				"claude -p ran but emitted no usage-bearing result line; AC6 normalization marked unknown",
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			family: "claude-code",
			reason: `claude -p probe failed: ${message}`,
		};
	}
}

async function probeOpenCodeSession(): Promise<HarnessSessionProbeResult> {
	try {
		// @lore AM2: `opencode run --format json` emits JSON event output.
		// opencode's event schema was not confirmed in the dossier; we capture
		// whatever it emits and mark normalization `unknown` if we can't parse usage.
		// spawnWithClosedStdin prevents stdin from blocking.
		const { stdout } = await spawnWithClosedStdin(
			"opencode",
			["run", PROBE_PROMPT, "--format", "json"],
			PROBE_TIMEOUT_MS,
		);

		const lines = stdout.split("\n");
		const usageLine = findUsageBearingLine(lines, "opencode");

		if (usageLine) {
			return {
				ok: true,
				family: "opencode",
				capturedLine: usageLine.line,
				eventType: usageLine.eventType,
			};
		}

		const firstNonEmptyLine = lines.find((l) => l.trim().length > 0)?.trim();
		return {
			ok: Boolean(firstNonEmptyLine),
			family: "opencode",
			capturedLine: firstNonEmptyLine,
			reason: firstNonEmptyLine
				? "opencode run emitted output but event schema unrecognized; normalization marked unknown"
				: "opencode run produced no output",
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			family: "opencode",
			reason: `opencode run probe failed: ${message}`,
		};
	}
}

/**
 * Run a harmless one-shot session probe for the given harness family.
 *
 * The probe uses a hard-coded arg array via execFile (no shell), short timeout,
 * and a harmless prompt. It never reads CLI auth files or captures secrets.
 *
 * @param family  The CLI harness family to probe.
 * @param deps    Optional injection point for testing (real run if absent).
 */
export async function probeHarnessSession(
	family: "codex" | "claude-code" | "opencode",
	deps?: {
		run?: (
			args: readonly string[],
		) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
	},
): Promise<HarnessSessionProbeResult> {
	// If a test-injected runner is provided, delegate to it
	if (deps?.run) {
		const cmdMap: Record<string, readonly string[]> = {
			codex: ["codex", "exec", "reply with the single word OK", "--json"],
			"claude-code": [
				"claude",
				"-p",
				PROBE_PROMPT,
				"--output-format",
				"stream-json",
				"--verbose",
				"--no-session-persistence",
			],
			opencode: ["opencode", "run", PROBE_PROMPT, "--format", "json"],
		};

		const args = cmdMap[family];
		if (!args) {
			return { ok: false, family, reason: `unknown family: ${family}` };
		}

		try {
			const { stdout } = await deps.run(args);
			const lines = stdout.split("\n");
			const usageLine = findUsageBearingLine(lines, family);
			if (usageLine) {
				return {
					ok: true,
					family,
					capturedLine: usageLine.line,
					eventType: usageLine.eventType,
				};
			}
			const firstLine = lines.find((l) => l.trim().length > 0)?.trim();
			return {
				ok: Boolean(firstLine),
				family,
				capturedLine: firstLine,
				reason: "no usage-bearing event line found",
			};
		} catch (err) {
			return { ok: false, family, reason: String(err) };
		}
	}

	// Real probe
	switch (family) {
		case "codex":
			return probeCodexSession();
		case "claude-code":
			return probeClaudeSession();
		case "opencode":
			return probeOpenCodeSession();
	}
}
