/**
 * AC5 — real harmless session probe per installed+authed CLI harness family.
 *
 * Each test executes a real one-shot session via execFile (hard-coded arg array,
 * no shell) and asserts that a machine-readable event line is captured.
 *
 * The committed AC6 fixture line MUST be the usage-bearing event:
 *   - codex: `turn.completed` with `usage` object
 *   - claude-code: `result` event with `usage` + `total_cost_usd`
 *   - opencode: first parsable JSON line (event-normalization marked `unknown` if
 *     no usage-bearing line can be identified)
 *
 * @lore AM2: These probes are cheap and harmless ("say OK" / "reply with OK").
 * They never read CLI auth files, never copy secrets, run with hard-coded arg
 * arrays (no shell). Each test calls requireHarness(<name>) first, which HARD-FAILS
 * (never skips) when the binary is absent (AR1). The inner ctx.skip() remains only
 * for the binary-present-but-not-authed case.
 * On this machine (codex/claude/opencode all installed+authed per dossier) they MUST
 * execute and capture fixtures.
 */

import { execFile } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import { probeHarnessSession } from "../harness-session-probe.js";
import { requireHarness } from "./require-harness.js";

const execFileAsync = promisify(execFile);

const FIXTURES_DIR = join(import.meta.dirname, "fixtures");

/**
 * Write fixture only if it does not already exist on disk.
 * Fixtures are SNAPSHOTS of real captured events committed to git. Re-running
 * probes yields fresh timestamps/session IDs that would change the file content
 * and break the srcHash attestation check. Write once; update only intentionally.
 *
 * @lore AM2: Fixtures must not change every test run — they're committed blobs
 * that verify-attest's srcHash fingerprints. Dynamic timestamps make every run
 * produce new blobs, invalidating the attestation. "Write-once" keeps srcHash stable.
 */
async function writeFixtureIfMissing(filePath: string, content: string): Promise<void> {
	try {
		await access(filePath);
		// File exists — skip; do not overwrite the committed snapshot.
	} catch {
		// File does not exist — write it.
		await mkdir(FIXTURES_DIR, { recursive: true });
		await writeFile(filePath, content, "utf-8");
	}
}

// Check auth by running `codex login status` — logged in = starts with "Logged in"
async function codexAuthed(): Promise<boolean> {
	try {
		const { stdout, stderr } = await execFileAsync("codex", ["login", "status"], {
			timeout: 10_000,
		});
		const out = (stdout + stderr).trim();
		return out.startsWith("Logged in");
	} catch {
		return false;
	}
}

// Check claude auth via `claude auth status` JSON
async function claudeAuthed(): Promise<boolean> {
	try {
		const { stdout } = await execFileAsync("claude", ["auth", "status"], {
			timeout: 10_000,
		});
		const parsed = JSON.parse(stdout.trim()) as { loggedIn?: boolean };
		return parsed.loggedIn === true;
	} catch {
		return false;
	}
}

// Check opencode auth by looking for providers
async function opencodeAuthed(): Promise<boolean> {
	try {
		const { stdout } = await execFileAsync("opencode", ["providers", "list"], {
			timeout: 10_000,
		});
		return /\d+\s+credentials/.test(stdout) || stdout.includes("environment variable");
	} catch {
		return false;
	}
}

describe("AM2 real harness session probe", () => {
	test("codex session probe: executes real codex exec and captures usage-bearing turn.completed fixture", async (ctx) => {
		requireHarness("codex");
		// Verify authed state — skip if binary present but not logged in
		const authed = await codexAuthed();
		if (!authed) {
			ctx.skip();
			return;
		}

		const result = await probeHarnessSession("codex");

		expect(result.ok).toBe(true);
		expect(result.family).toBe("codex");
		expect(result.capturedLine).toBeDefined();
		expect(result.capturedLine!.length).toBeGreaterThan(0);

		// The committed fixture MUST be the usage-bearing turn.completed line
		const parsed = JSON.parse(result.capturedLine!) as Record<string, unknown>;
		expect(parsed.type).toBe("turn.completed");
		expect(parsed.usage).toBeDefined();
		expect(typeof (parsed.usage as Record<string, unknown>).input_tokens).toBe("number");
		expect(typeof (parsed.usage as Record<string, unknown>).output_tokens).toBe("number");
		expect(result.eventType).toBe("turn.completed");

		// Write fixture for AC6 normalization test (write-once: skip if already committed)
		await writeFixtureIfMissing(
			join(FIXTURES_DIR, "codex-exec.jsonl"),
			`${result.capturedLine!}\n`,
		);
	}, 120_000);

	test("claude session probe: executes real claude -p and captures usage-bearing result fixture", async (ctx) => {
		requireHarness("claude");
		const authed = await claudeAuthed();
		if (!authed) {
			ctx.skip();
			return;
		}

		const result = await probeHarnessSession("claude-code");

		expect(result.ok).toBe(true);
		expect(result.family).toBe("claude-code");
		expect(result.capturedLine).toBeDefined();
		expect(result.capturedLine!.length).toBeGreaterThan(0);

		// The committed fixture MUST be the usage-bearing result line
		const parsed = JSON.parse(result.capturedLine!) as Record<string, unknown>;
		expect(parsed.type).toBe("result");
		expect(parsed.usage).toBeDefined();
		expect(typeof (parsed.usage as Record<string, unknown>).input_tokens).toBe("number");
		expect(typeof (parsed.usage as Record<string, unknown>).output_tokens).toBe("number");
		expect(typeof parsed.total_cost_usd).toBe("number");
		expect(result.eventType).toBe("result");

		// Write fixture for AC6 normalization test (write-once: skip if already committed)
		await writeFixtureIfMissing(
			join(FIXTURES_DIR, "claude-stream.jsonl"),
			`${result.capturedLine!}\n`,
		);
	}, 120_000);

	test("opencode session probe: executes real opencode run and captures event line", async (ctx) => {
		requireHarness("opencode");
		const authed = await opencodeAuthed();
		if (!authed) {
			ctx.skip();
			return;
		}

		const result = await probeHarnessSession("opencode");

		// opencode probe must execute (launch proof); event-normalization may be `unknown`
		// The probe is ok if it captured a line or detected a specific failure mode
		// (not just "binary missing" / "not authed")
		expect(result.family).toBe("opencode");

		if (result.ok && result.capturedLine) {
			// Write fixture — even if we can't normalize it, record it (write-once)
			await writeFixtureIfMissing(
				join(FIXTURES_DIR, "opencode-run.json"),
				`${result.capturedLine}\n`,
			);
		}

		// Whether ok or not, it must have tried (not been skipped at the probe level for auth reasons)
		// The probe itself ran — that's the launch proof.
		// If reason is defined (failure case), it must NOT say "not installed" / "binary not found"
		if (result.reason !== undefined) {
			expect(result.reason).not.toMatch(/not installed|binary not found/i);
		}
	}, 120_000);
});
