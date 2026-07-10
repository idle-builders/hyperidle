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

import { execFileSync } from "node:child_process";
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

	// ── T2: codex + opencode probe truthing (AL7 delta, AC7) ───────────────────
	//
	// After the AL7 delta (T7), codex + opencode use real `which` probes.
	// They must return "green-now" or "absent-fail" — never "wiring-needed".
	// "wiring-needed" is the OLD pre-T7 value; it is replaced by the real probe.
	//
	// @lore AL7 T2: The old "wiring-needed" tests are removed because the delta
	// changes the behavior. The new tests assert the post-T7 contract.

	it("codex lane state is green-now or absent-fail after wiring (AC7, never wiring-needed)", () => {
		// After the AL7 delta, codex is a real `which codex` probe.
		// It must return either green-now (binary present) or absent-fail (binary absent).
		// "wiring-needed" is no longer valid for codex after this delta.
		const state = getLiveProofLaneState("codex");
		expect(["green-now", "absent-fail"]).toContain(state);
	});

	it("opencode lane state is green-now or absent-fail after wiring (AC7, never wiring-needed)", () => {
		// After the AL7 delta, opencode is a real `which opencode` probe.
		// Same contract as codex.
		const state = getLiveProofLaneState("opencode");
		expect(["green-now", "absent-fail"]).toContain(state);
	});

	it("cursor-agent lane state is green-now or absent-fail when binary present/absent", () => {
		const state = getLiveProofLaneState("cursor-agent");
		expect(["green-now", "absent-fail"]).toContain(state);
	});
});

describe("AC14b: probeLiveProofHarnessAvailability — builtin always resolves", () => {
	it("probing builtin harness resolves (in-process, no external binary needed)", async () => {
		// Builtin is in-process; this must never throw.
		await expect(probeLiveProofHarnessAvailability("builtin")).resolves.toBeUndefined();
	});

	it("probing cursor-agent resolves when binary is on PATH", async () => {
		await expect(probeLiveProofHarnessAvailability("cursor-agent")).resolves.toBeUndefined();
	});

	it("probing a non-existent harness throws (absence-is-failure, never skip)", async () => {
		// An unknown harness name must also cause a failure — absence is never a pass.
		await expect(
			probeLiveProofHarnessAvailability("nonexistent-harness-xyz" as "builtin"),
		).rejects.toThrow();
	});

	// ── T2 probe truthing: codex + opencode (AC7) ─────────────────────────────
	//
	// After T7: probeLiveProofHarnessAvailability("codex"|"opencode") must resolve
	// if the binary is present, reject if absent (never throw "wiring-needed" error).
	//
	// RED TODAY: probing "codex"|"opencode" throws "wiring-needed" error.
	// GREEN AFTER T7: resolves (binary present) or rejects with binary-absent error.

	it("T2-RED: probing codex resolves when codex binary is present (real `which codex` probe)", async () => {
		// Simulate codex binary being present by checking actual which.
		// If codex is installed on this machine, the probe must resolve (not throw "wiring-needed").
		// If codex is absent, it must reject with an absent-binary error (not "wiring-needed").
		//
		// We determine which behavior to expect by running `which codex` directly.
		let codexOnPath = false;
		try {
			execFileSync("which", ["codex"], { stdio: "ignore" });
			codexOnPath = true;
		} catch {
			codexOnPath = false;
		}

		if (codexOnPath) {
			// Binary present → probe must resolve.
			// RED: currently throws "wiring-needed" regardless of binary presence.
			await expect(probeLiveProofHarnessAvailability("codex")).resolves.toBeUndefined();
		} else {
			// Binary absent → probe must reject with absence error (not "wiring-needed").
			const rejection = await probeLiveProofHarnessAvailability("codex").catch((e) => e);
			expect(rejection).toBeInstanceOf(Error);
			const message = (rejection as Error).message;
			// Must NOT say "wiring-needed" — that's the old incorrect error.
			// Must say something about the binary being absent/not found.
			expect(message).not.toContain("wiring-needed");
			expect(message.toLowerCase()).toMatch(/absent|not found|not in path|binary/i);
		}
	});

	it("T2-RED: probing opencode resolves when opencode binary is present (real `which opencode` probe)", async () => {
		// Same contract as codex.
		let opencodeOnPath = false;
		try {
			execFileSync("which", ["opencode"], { stdio: "ignore" });
			opencodeOnPath = true;
		} catch {
			opencodeOnPath = false;
		}

		if (opencodeOnPath) {
			// Binary present → probe must resolve.
			// RED: currently throws "wiring-needed" regardless of binary presence.
			await expect(probeLiveProofHarnessAvailability("opencode")).resolves.toBeUndefined();
		} else {
			// Binary absent → probe must reject with absence error (not "wiring-needed").
			const rejection = await probeLiveProofHarnessAvailability("opencode").catch((e) => e);
			expect(rejection).toBeInstanceOf(Error);
			const message = (rejection as Error).message;
			expect(message).not.toContain("wiring-needed");
			expect(message.toLowerCase()).toMatch(/absent|not found|not in path|binary/i);
		}
	});
});
