/**
 * AL7 RED — AC14b: harness binary absent → lane FAILS (never skips, never stubs)
 *
 * Tests FAIL until:
 *   - packages/server/src/tools/live-proof-lanes.ts exports:
 *     - probeLiveProofHarnessAvailability(harness): Promise<void>
 *       (resolves if present, REJECTS if absent — not returns null/false)
 *     - getLiveProofLaneState(harness): "green-now" | "wiring-needed" | "skipped"
 *
 * Covers: AC14b (absence-is-failure, not absence-is-pass).
 *
 * MEMORY: live-proof lanes run before ship; no stub-as-proof.
 * MEMORY: a green-now harness whose real binary/SDK is unavailable makes the lane FAIL.
 */

import { describe, expect, it } from "vitest";
import {
	getLiveProofLaneState,
	probeLiveProofHarnessAvailability,
} from "../tools/live-proof-lanes.js";

// ─────────────────────────────────────────────────────────────────────────────
// AC14b — the DONE matrix terminal states are declared (not inferred from a missing binary pass)
// ─────────────────────────────────────────────────────────────────────────────

describe("AC14b: live-proof lane states are declared per the DONE matrix", () => {
	it("builtin lane state is green-now (in-process, always available)", () => {
		// Builtin is in-process — no external binary needed; always green-now.
		const state = getLiveProofLaneState("builtin");
		expect(state).toBe("green-now");
	});

	it("claude-code lane state is green-now (real claude CLI binary installed at /opt/homebrew/bin/claude)", () => {
		// Claude lane is green-now: the real `claude` binary is installed on this machine.
		// The probe keys on the CLI binary (`which claude`), not the SDK package.
		// If the binary were absent, the state would be absent-fail and this test would FAIL
		// (AC14b: absence is never a pass — a green-now harness with absent binary FAILS).
		//
		// @lore AL7 probe-fix: the weakened toContain(["green-now","absent-fail"]) fudge
		// is removed. The probe is the CLI binary; the binary IS installed; assert green-now.
		const state = getLiveProofLaneState("claude-code");
		expect(state).toBe("green-now");
	});

	it("codex lane state is wiring-needed (Task 7c not yet landed)", () => {
		// Codex is wiring-needed until Task 7c extends AL6's .codex/hooks.json PreToolUse hook.
		const state = getLiveProofLaneState("codex");
		expect(state).toBe("wiring-needed");
	});

	it("opencode lane state is wiring-needed (Task 7b not yet landed)", () => {
		// opencode is wiring-needed until Task 7b wires opencode serve /event+POST.
		const state = getLiveProofLaneState("opencode");
		expect(state).toBe("wiring-needed");
	});

	it("cursor-agent lane state is skipped (unavailable per harness-capability-descriptors)", () => {
		const state = getLiveProofLaneState("cursor-agent");
		expect(state).toBe("skipped");
	});
});

describe("AC14b: probeLiveProofHarnessAvailability — builtin always resolves", () => {
	it("probing builtin harness resolves (in-process, no external binary needed)", async () => {
		// Builtin is in-process; this must never throw.
		await expect(probeLiveProofHarnessAvailability("builtin")).resolves.toBeUndefined();
	});

	it("probing cursor-agent throws (unavailable)", async () => {
		// cursor-agent is permanently unavailable per KNOWN_HARNESS_FAMILIES.
		// The probe must reject, not silently skip.
		await expect(probeLiveProofHarnessAvailability("cursor-agent")).rejects.toThrow();
	});

	it("probing a non-existent harness throws (absence-is-failure, never skip)", async () => {
		// An unknown harness name must also cause a failure — absence is never a pass.
		await expect(
			probeLiveProofHarnessAvailability("nonexistent-harness-xyz" as "builtin"),
		).rejects.toThrow();
	});
});
