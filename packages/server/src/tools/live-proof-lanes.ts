/**
 * AL7 Task 11 — Live-proof lane declarations and harness availability probe.
 *
 * Terminal state per harness (DONE matrix, verified June 2026, updated AL7 delta):
 * - builtin:      green-now (in-process, no external binary needed)
 * - claude-code:  green-now (real `claude` CLI binary installed at /opt/homebrew/bin/claude)
 * - codex:        green-now (real `codex` binary; absent → absent-fail) [AL7 delta: was wiring-needed]
 * - opencode:     green-now (real `opencode` binary; absent → absent-fail) [AL7 delta: was wiring-needed]
 * - cursor-agent:  green-now (real `cursor-agent` binary; absent → absent-fail)
 *
 * AC14b: absence-is-failure. A green-now harness whose real CLI binary is absent
 * in the run environment makes `probeLiveProofHarnessAvailability` REJECT — it does
 * NOT return null, false, or "skip". The probe is the enforcement gate.
 *
 * @lore AL7 probe-fix: The probe MUST detect the installed CLI binary (`which claude/codex/opencode`),
 * NOT `require.resolve('@anthropic-ai/claude-agent-sdk')`. The claude-code real-harness
 * test spawns the real `claude` binary directly (like AL6). The claude CLI adapter
 * (CliHarnessAdapter) is the production path; binary presence is the authoritative check.
 * A binary-absent env where an npm package is resolvable via workspace node_modules would
 * produce a false green-now claim. Binary presence is the authoritative check.
 *
 * @lore AL7 delta: codex and opencode now use real `which` probes (green-now / absent-fail)
 * after MCP URL slot is wired into CLI_TOOL_CONFIGS (T5) + per-session config writer lands (T4/T6).
 * "wiring-needed" is retained in the union type for future harnesses; codex/opencode no longer return it.
 */

import { execFileSync } from "node:child_process";

/** Known harness identifiers for the live-proof DONE matrix. */
export type LiveProofHarness = "builtin" | "claude-code" | "codex" | "opencode" | "cursor-agent";

/** Terminal state for a harness in the live-proof DONE matrix. */
export type LiveProofLaneState = "green-now" | "wiring-needed" | "skipped" | "absent-fail";

/**
 * Returns the declared terminal state for a given harness per the DONE matrix.
 *
 * - `green-now` — harness is wired and the real binary/SDK is expected in the env.
 * - `wiring-needed` — native mechanism is feasible but adapter wiring not yet landed.
 * - `skipped` — harness is permanently unavailable (none currently).
 * - `absent-fail` — the harness was declared green-now but its real binary/SDK was
 *   not found in the current environment (set dynamically for claude-code when absent).
 *
 * @lore AL7 Task 11: these states map 1:1 to the architecture DONE matrix.
 * "wiring-needed" and "skipped" are non-failing terminal states (declared, not
 * derived from a missing binary). "absent-fail" is the failure state for a
 * green-now harness whose real binary/SDK is absent.
 */
export function getLiveProofLaneState(harness: LiveProofHarness | string): LiveProofLaneState {
	switch (harness) {
		case "builtin":
			return "green-now";
		case "claude-code": {
			// Probe whether the real `claude` binary is on PATH in this environment.
			// If absent, the declared state flips to absent-fail per AC14b.
			const available = isClaudeCodeAvailable();
			return available ? "green-now" : "absent-fail";
		}
		case "codex": {
			// AL7 delta: real `which codex` probe (was wiring-needed).
			const codexAvailable = isCodexAvailable();
			return codexAvailable ? "green-now" : "absent-fail";
		}
		case "opencode": {
			// AL7 delta: real `which opencode` probe (was wiring-needed).
			const opencodeAvailable = isOpencodeAvailable();
			return opencodeAvailable ? "green-now" : "absent-fail";
		}
		case "cursor-agent": {
			const cursorAvailable = isCursorAgentAvailable();
			return cursorAvailable ? "green-now" : "absent-fail";
		}
		default:
			return "absent-fail";
	}
}

/**
 * Probe whether the given harness is available in the current environment.
 *
 * Resolves on success (harness present). REJECTS on failure (harness absent or
 * permanently unavailable). Never returns null/false — rejection IS the signal.
 *
 * @lore AL7 AC14b: "absence is never a pass." This function makes the absence
 * of a required harness a hard test failure rather than a silent skip.
 */
export async function probeLiveProofHarnessAvailability(
	harness: LiveProofHarness | string,
): Promise<void> {
	switch (harness) {
		case "builtin":
			// In-process — always available.
			return;

		case "claude-code":
			if (!isClaudeCodeAvailable()) {
				throw new Error(
					"claude-code harness is absent: `claude` binary is not in PATH. " +
						"Install the Claude Code CLI (`npm install -g @anthropic-ai/claude-code`). " +
						"A green-now harness whose real binary is absent makes the lane FAIL (AC14b).",
				);
			}
			return;

		case "codex":
			// AL7 delta: real `which codex` probe (was wiring-needed throw).
			// Absent binary → reject with absence error (never "wiring-needed").
			if (!isCodexAvailable()) {
				throw new Error(
					"codex binary is absent: `codex` is not in PATH. " +
						"Install codex-cli and authenticate. " +
						"A green-now harness whose real binary is absent makes the lane FAIL (AC14b).",
				);
			}
			return;

		case "opencode":
			// AL7 delta: real `which opencode` probe (was wiring-needed throw).
			if (!isOpencodeAvailable()) {
				throw new Error(
					"opencode binary is absent: `opencode` is not in PATH. " +
						"Install opencode and authenticate. " +
						"A green-now harness whose real binary is absent makes the lane FAIL (AC14b).",
				);
			}
			return;

		case "cursor-agent":
			if (!isCursorAgentAvailable()) {
				throw new Error(
					"cursor-agent binary is absent: `cursor-agent` is not in PATH. " +
						"Install Cursor Agent CLI and authenticate. " +
						"A green-now harness whose real binary is absent makes the lane FAIL (AC14b).",
				);
			}
			return;

		default:
			throw new Error(
				`Unknown harness '${harness}' — absence is never a pass (AC14b). ` +
					"Declare the harness in live-proof-lanes.ts before probing.",
			);
	}
}

/**
 * Check whether the real `claude` CLI binary is installed in this environment.
 *
 * The AL7 real-harness proof spawns the **real `claude` binary** directly (same
 * pattern as AL6-real-harness-return-enforcement). The binary, not the SDK package,
 * is the authoritative probe for the claude-code real-harness lane.
 *
 * @lore AL7 probe-fix: Previously this checked `require.resolve('@anthropic-ai/claude-agent-sdk')`.
 * That was wrong: an npm package may be resolvable in vitest via workspace node_modules
 * even when the binary is absent, yielding a false green-now claim. The real-harness
 * test spawns the CLI binary directly — the binary IS the availability check.
 * `which claude` is the same pattern used by AM2's binaryPresent() helper and all
 * other harness discovery probes.
 *
 * A green-now harness whose real CLI binary is absent makes the lane FAIL (AC14b —
 * absence is never a pass).
 */
function isClaudeCodeAvailable(): boolean {
	// Probe the real `claude` CLI binary — same pattern as AM2's binaryPresent().
	try {
		execFileSync("which", ["claude"], { stdio: "ignore" });
		return true;
	} catch {
		// `claude` binary not on PATH — the real-harness lane is not runnable.
		return false;
	}
}

/**
 * Check whether the real `codex` CLI binary is installed in this environment.
 *
 * AL7 delta: mirrors isClaudeCodeAvailable. Codex is MCP-wired (T5/T6); its
 * real-harness lane proves tool calls route through the production bridge.
 * A green-now harness whose real binary is absent makes the lane FAIL (AC14b).
 */
function isCodexAvailable(): boolean {
	try {
		execFileSync("which", ["codex"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

/**
 * Check whether the real `opencode` CLI binary is installed in this environment.
 *
 * AL7 delta: mirrors isClaudeCodeAvailable. opencode is MCP-wired (T5/T6); its
 * real-harness lane proves tool calls route through the production bridge.
 * A green-now harness whose real binary is absent makes the lane FAIL (AC14b).
 */
function isOpencodeAvailable(): boolean {
	try {
		execFileSync("which", ["opencode"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

function isCursorAgentAvailable(): boolean {
	try {
		execFileSync("which", ["cursor-agent"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}
