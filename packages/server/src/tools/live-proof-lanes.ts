/**
 * AL7 Task 11 — Live-proof lane declarations and harness availability probe.
 *
 * Terminal state per harness (DONE matrix, verified June 2026):
 * - builtin:      green-now (in-process, no external binary needed)
 * - claude-code:  green-now (real `claude` CLI binary installed at /opt/homebrew/bin/claude)
 * - codex:        wiring-needed (MCP URL slot not wired in CLI_TOOL_CONFIGS for AL7 checkpoint)
 * - opencode:     wiring-needed (MCP URL slot not wired in CLI_TOOL_CONFIGS for AL7 checkpoint)
 * - cursor-agent: skipped (unavailable per harness-capability-descriptors)
 *
 * AC14b: absence-is-failure. A green-now harness whose real CLI binary is absent
 * in the run environment makes `probeLiveProofHarnessAvailability` REJECT — it does
 * NOT return null, false, or "skip". The probe is the enforcement gate.
 *
 * @lore AL7 probe-fix: The probe MUST detect the installed CLI binary (`which claude`),
 * NOT `require.resolve('@anthropic-ai/claude-agent-sdk')`. The claude-code real-harness
 * test spawns the real `claude` binary directly (like AL6). The @anthropic-ai/claude-agent-sdk
 * package is for the SDK adapter path (ClaudeAgentSdkAdapter), which is a different harness
 * lane. A binary-absent env where the SDK is resolvable via workspace node_modules would
 * produce a false green-now claim. Binary presence is the authoritative check.
 *
 * @lore AL7: the DONE matrix is NOT derived from a missing-binary pass. Each state
 * is declared here and enforced by the probe. "wiring-needed" is the honest state
 * for Codex/opencode until the MCP URL slot is wired into CLI_TOOL_CONFIGS.
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
 * - `skipped` — harness is permanently unavailable (cursor-agent).
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
			// Probe whether the real Claude SDK is installed in this environment.
			// If absent, the declared state flips to absent-fail per AC14b.
			const available = isClaudeCodeAvailable();
			return available ? "green-now" : "absent-fail";
		}
		case "codex":
			return "wiring-needed";
		case "opencode":
			return "wiring-needed";
		case "cursor-agent":
			return "skipped";
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
			// wiring-needed — the probe does not fail for wiring-needed harnesses;
			// they are not green-now yet. The test must use getLiveProofLaneState to
			// assert "wiring-needed", not try to probe.
			throw new Error(
				"codex harness is wiring-needed (Task 7c not yet landed). " +
					"Probing a wiring-needed harness is not valid — check getLiveProofLaneState instead.",
			);

		case "opencode":
			throw new Error(
				"opencode harness is wiring-needed (Task 7b not yet landed). " +
					"Probing a wiring-needed harness is not valid — check getLiveProofLaneState instead.",
			);

		case "cursor-agent":
			throw new Error(
				"cursor-agent is permanently unavailable (skipped per KNOWN_HARNESS_FAMILIES). " +
					"A skipped harness cannot be probed.",
			);

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
 * That was wrong: the SDK is resolvable in vitest via workspace node_modules even
 * when the binary is absent, yielding a false green-now claim. And more critically,
 * the real-harness test spawns the CLI binary — not the SDK adapter — so the binary
 * IS the availability check. `which claude` is the same pattern used by AM2's
 * binaryPresent() helper and all other harness discovery probes.
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
