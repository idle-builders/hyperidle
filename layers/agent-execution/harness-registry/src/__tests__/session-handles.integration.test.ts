/**
 * Session handles: native id capture and session resumption.
 *
 * LOCAL-ONLY LANE — runs via test:integration (harness project). Needs real CLI
 * binaries and real LLM credentials. Never a GitHub Actions job.
 *
 * @lore: claude --resume global — finds sessions by UUID globally, not per directory; probe with bogus UUID to test wrong-resume
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
	HarnessAdapter,
	HarnessEvent,
	SessionConfig,
	SessionResumeConfig,
} from "@hyperidle/harness-protocol";
import { ensureSandboxGitRepo } from "@hyperidle/run-orchestration";
import { describe, expect, test } from "vitest";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";
import { LocalSandboxAdapter } from "../local-sandbox-adapter.js";
import {
	createHarnessSandbox,
	provisionClaudeSandbox,
	provisionCodexHome,
	requireHarnessAuthed,
} from "./harness-sandbox.js";
import { productionCliConfig, productionHarnessAdapter } from "./production-cli-config.js";
import { HARNESS_TEST_MODELS, requireHarness } from "./require-harness.js";
import { trackHarnessSessions } from "./session-handle-tracker.js";

const { track } = trackHarnessSessions();

// ── Context marker planted in session 1, tested in the resumed session ────────
// A non-guessable task-ID token so "did the model know this?" is meaningful.
// Framed as a task ID (not a "codeword") to avoid security-minded model
// refusals that treat codeword exchanges as prompt-injection attempts.
// @lore: codeword framing — trips haiku security heuristics; use "Task ID" framing which is semantically identical but safe
const CODEWORD = "KESTREL-7429";
const PHASE1_PROMPT =
	`The task ID for this session is ${CODEWORD}. ` +
	`Acknowledge receipt by replying with exactly the token PHASE1_OK.`;
const PHASE2_PROMPT =
	`What task ID was assigned to this session at the start of our conversation? ` +
	`Reply with just the task ID, nothing else.`;

// ── Sandbox cleanup (retry on ENOTEMPTY — OS race on macOS) ──────────────────

async function rmSandbox(sandboxPath: string): Promise<void> {
	for (let attempt = 0; attempt < 5; attempt += 1) {
		try {
			fs.rmSync(sandboxPath, { recursive: true, force: true });
			return;
		} catch (err) {
			const code = (err as NodeJS.ErrnoException).code;
			if (code !== "ENOTEMPTY" && code !== "EBUSY") throw err;
			await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
		}
	}
	fs.rmSync(sandboxPath, { recursive: true, force: true });
}

// ── Drain all events from a running session ───────────────────────────────────

async function drainEvents(
	adapter: HarnessAdapter,
	handle: Awaited<ReturnType<HarnessAdapter["startSession"]>>,
): Promise<{ events: HarnessEvent[]; completionTexts: string[]; fullText: string }> {
	const events: HarnessEvent[] = [];
	for await (const ev of adapter.streamEvents(handle)) {
		events.push(ev);
	}
	const completionTexts = events
		.filter((e) => e.type === "completion")
		.map((e) => ("text" in e ? (e.text as string) : ""));
	// Join with "" not "\n": streaming adapters emit one token per completion event, so
	// joining with newlines splits "KESTREL-7429" → "KESTREL" + "-7429" across events and
	// breaks substring checks. Joining with "" reassembles tokens into continuous text.
	const fullText = completionTexts.join("");
	return { events, completionTexts, fullText };
}

function knownCodeword(fullText: string): boolean {
	return fullText.includes(CODEWORD);
}

// ═════════════════════════════════════════════════════════════════════════════
// claude-code
// ═════════════════════════════════════════════════════════════════════════════

describe("session handles — claude-code", () => {
	requireHarness("claude");

	test("assigns session id immediately at start, resumes with prior context, bogus-id resume detected", async () => {
		await requireHarnessAuthed("claude");

		const sandboxA = fs.mkdtempSync(path.join(os.tmpdir(), "sh-claude-a-"));

		try {
			provisionClaudeSandbox(sandboxA);

			const claudeConfig = productionCliConfig("claude");
			const adapter = new CliHarnessAdapter(claudeConfig);

			// ── Proof 1: native id is assigned BEFORE any stream event ───────
			const configPhase1: SessionConfig = {
				sessionId: `sh-claude-p1-${Math.random().toString(36).slice(2, 8)}`,
				sandboxPath: sandboxA,
				assembledPrompt: PHASE1_PROMPT,
				instruction: PHASE1_PROMPT,
				modelTier: "workhorse",
				tools: [],
				selectedModel: HARNESS_TEST_MODELS.claude.model,
			};

			const handleP1 = await adapter.startSession(configPhase1);
			track(adapter, handleP1);

			// For claude, the id is assigned at start time (via --session-id).
			// It must be readable immediately — not after streaming.
			const nativeId = adapter.getNativeSessionId?.(handleP1);
			expect(
				nativeId,
				"claude native session id must be set immediately at startSession",
			).toBeTruthy();

			const { fullText: p1Full } = await drainEvents(adapter, handleP1);
			const r1 = await adapter.stopSession(handleP1);
			expect(r1.outcome).toBe("completed");

			// Sanity: the task ID appeared in phase 1's output OR was acknowledged.
			// (Some models say "PHASE1_OK" without repeating the task ID — that's fine.)
			// What matters is that phase 2 resume knows the task ID.
			expect(
				p1Full.includes("PHASE1_OK") || p1Full.includes(CODEWORD),
				`Phase 1 must produce PHASE1_OK or mention ${CODEWORD}. Got: ${p1Full.slice(0, 120)}`,
			).toBe(true);

			// ── Proof 2 + 3: resume retains prior context ────────────────────
			const resumeConfigA: SessionResumeConfig = {
				sandboxPath: sandboxA,
				modelTier: "workhorse",
				selectedModel: HARNESS_TEST_MODELS.claude.model,
			};

			const handleP2 = await adapter.resumeSession?.(nativeId!, PHASE2_PROMPT, resumeConfigA);
			track(adapter, handleP2);
			expect(handleP2, "resumeSession must return a handle").toBeDefined();
			if (!handleP2) return;

			const { fullText: p2Full } = await drainEvents(adapter, handleP2);
			const r2 = await adapter.stopSession(handleP2);
			expect(r2.outcome).toBe("completed");

			expect(
				knownCodeword(p2Full),
				`Resumed claude session must know the task ID "${CODEWORD}". ` +
					`Got: ${p2Full.slice(0, 120)}`,
			).toBe(true);

			// ── Proof 4: bogus-id resume detected (fails loudly) ──────────────
			// claude exits 0 with is_error:true and empty result on a bogus UUID.
			// Detection is content-based: outcome may be "completed" (exit 0) but
			// the session has no task ID in its output.
			//
			const bogusId = "00000000-0000-0000-0000-000000000000";
			let bogusIdDetected = false;
			try {
				const handleWrong = await adapter.resumeSession?.(bogusId, PHASE2_PROMPT, resumeConfigA);
				track(adapter, handleWrong);
				if (handleWrong) {
					const { fullText: wrongFull } = await drainEvents(adapter, handleWrong);
					const resultWrong = await adapter.stopSession(handleWrong);
					// claude exits 0 on a bogus id (error_during_execution), result is "".
					// Detection is via content: no task ID in output.
					bogusIdDetected = resultWrong.outcome !== "completed" || !knownCodeword(wrongFull);
				}
			} catch {
				// A thrown error is also a loud failure — detection successful.
				bogusIdDetected = true;
			}

			expect(
				bogusIdDetected,
				"Bogus-id resume on claude must be detected (crashed outcome or no task ID in output)",
			).toBe(true);
		} finally {
			await rmSandbox(sandboxA);
		}
	}, 120_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// codex (CodexAppServerAdapter — no resumeSession)
// ═════════════════════════════════════════════════════════════════════════════

describe("session handles — codex", () => {
	requireHarness("codex");

	test("getNativeSessionId returns a threadId (from thread/start RPC) after session completes", async () => {
		await requireHarnessAuthed("codex");

		const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "sh-codex-base-"));
		const sandboxAdapter = new LocalSandboxAdapter();
		const sandboxHandle = await sandboxAdapter.spawn(baseDir);
		const sandboxPath = sandboxHandle.path;

		try {
			ensureSandboxGitRepo(sandboxPath);

			const authFound = provisionCodexHome(sandboxPath);
			if (!authFound) {
				throw new Error(
					"codex: no ~/.codex/auth.json to copy into the per-session sandbox — run `codex login`. Never skip to green.",
				);
			}

			const config: SessionConfig = {
				sessionId: `sh-codex-p1-${Math.random().toString(36).slice(2, 8)}`,
				sandboxPath,
				assembledPrompt: PHASE1_PROMPT,
				instruction: PHASE1_PROMPT,
				modelTier: "workhorse",
				tools: [],
				selectedModel: HARNESS_TEST_MODELS.codex.model,
			};

			// CodexAppServerAdapter — production adapter for codex (codex app-server --stdio).
			const adapter = productionHarnessAdapter("codex");
			const handleP1 = await adapter.startSession(config);
			track(adapter, handleP1);

			// Stream to completion so thread/start response (which sets threadId) is processed.
			const { fullText: p1Full } = await drainEvents(adapter, handleP1);

			// Capture threadId BEFORE stopSession — stopSession deletes the session entry.
			const nativeId = adapter.getNativeSessionId?.(handleP1);

			const r1 = await adapter.stopSession(handleP1);
			expect(r1.outcome).toBe("completed");

			expect(
				p1Full.includes("PHASE1_OK") || p1Full.includes(CODEWORD),
				`Phase 1 must produce PHASE1_OK or mention ${CODEWORD}. Got: ${p1Full.slice(0, 120)}`,
			).toBe(true);
			// A UUID-shaped string proves the value was actually populated (not a placeholder).
			expect(
				nativeId,
				"codex: getNativeSessionId must return a thread id from the thread/start JSON-RPC response",
			).toMatch(/^[0-9a-f-]{8,}$/i);
		} finally {
			await sandboxAdapter.destroy(sandboxHandle);
			await rmSandbox(baseDir);
		}
	}, 120_000);

	test("session can write files — sandbox path is thread-scoped", async () => {
		await requireHarnessAuthed("codex");

		const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-sbox-"));
		const sandboxAdapter = new LocalSandboxAdapter();
		const sandboxHandle = await sandboxAdapter.spawn(baseDir);
		const sandboxPath = sandboxHandle.path;

		try {
			ensureSandboxGitRepo(sandboxPath);
			const authFound = provisionCodexHome(sandboxPath);
			if (!authFound) {
				throw new Error(
					"codex: no ~/.codex/auth.json to copy into the per-session sandbox — run `codex login`. Never skip to green.",
				);
			}

			const writeInstruction =
				"Write the text 'phase1' to a new file called codex-write-test.txt. " +
				"Reply with exactly: WRITE_DONE";

			const config: SessionConfig = {
				sessionId: `codex-sbox-p1-${Math.random().toString(36).slice(2, 8)}`,
				sandboxPath,
				assembledPrompt: writeInstruction,
				instruction: writeInstruction,
				modelTier: "workhorse",
				tools: [],
				selectedModel: HARNESS_TEST_MODELS.codex.model,
			};

			const adapter = productionHarnessAdapter("codex");
			const handle = await adapter.startSession(config);
			track(adapter, handle);
			const { fullText } = await drainEvents(adapter, handle);
			const r = await adapter.stopSession(handle);

			expect(r.outcome).toBe("completed");
			expect(
				fullText.includes("WRITE_DONE"),
				`Session must confirm file write. Got: ${fullText.slice(0, 120)}`,
			).toBe(true);
			// Key assertion: the production adapter uses sandboxPath as the working dir.
			expect(
				fs.existsSync(path.join(sandboxPath, "codex-write-test.txt")),
				"codex session must write files to its sandboxPath",
			).toBe(true);
		} finally {
			await sandboxAdapter.destroy(sandboxHandle);
			await rmSandbox(baseDir);
		}
	}, 180_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// cursor-agent
// ═════════════════════════════════════════════════════════════════════════════

describe("session handles — cursor-agent", () => {
	requireHarness("cursor-agent");

	test("captures session_id from system/init, resumes with prior context, wrong-dir resume detected as context-free", async () => {
		await requireHarnessAuthed("cursor-agent");

		const sandboxA = fs.mkdtempSync(path.join(os.tmpdir(), "sh-cursor-a-"));
		const sandboxB = fs.mkdtempSync(path.join(os.tmpdir(), "sh-cursor-b-"));

		try {
			const cursorConfig = productionCliConfig("cursor-agent");
			const adapter = new CliHarnessAdapter(cursorConfig);

			// ── Phase 1: run session, plant codeword ──────────────────────────
			const configP1: SessionConfig = {
				sessionId: `sh-cursor-p1-${Math.random().toString(36).slice(2, 8)}`,
				sandboxPath: sandboxA,
				assembledPrompt: PHASE1_PROMPT,
				instruction: PHASE1_PROMPT,
				modelTier: "workhorse",
				tools: [],
				selectedModel: HARNESS_TEST_MODELS["cursor-agent"].model,
			};

			const handleP1 = await adapter.startSession(configP1);
			track(adapter, handleP1);
			const { fullText: p1Full } = await drainEvents(adapter, handleP1);
			const r1 = await adapter.stopSession(handleP1);
			expect(r1.outcome).toBe("completed");

			// ── Proof 1: native id captured from system/init event ────────────
			const nativeId = adapter.getNativeSessionId?.(handleP1);
			expect(
				nativeId,
				"cursor-agent native session id must be captured from system/init event",
			).toBeTruthy();

			expect(
				p1Full.includes("PHASE1_OK") || p1Full.includes(CODEWORD),
				`Phase 1 must produce PHASE1_OK or mention ${CODEWORD}. Got: ${p1Full.slice(0, 120)}`,
			).toBe(true);

			// ── Proof 2 + 3: correct resume retains prior context ─────────────
			const resumeConfigA: SessionResumeConfig = {
				sandboxPath: sandboxA,
				modelTier: "workhorse",
				selectedModel: HARNESS_TEST_MODELS["cursor-agent"].model,
			};

			const handleP2 = await adapter.resumeSession?.(nativeId!, PHASE2_PROMPT, resumeConfigA);
			track(adapter, handleP2);
			expect(handleP2, "resumeSession must return a handle").toBeDefined();
			if (!handleP2) return;

			const { fullText: p2Full } = await drainEvents(adapter, handleP2);
			const r2 = await adapter.stopSession(handleP2);
			expect(r2.outcome).toBe("completed");

			expect(
				knownCodeword(p2Full),
				`Resumed cursor-agent session must know codeword "${CODEWORD}". ` +
					`Got: ${p2Full.slice(0, 120)}`,
			).toBe(true);

			// ── Proof 4: wrong-directory resume detected as context-free ──────
			// resume, echoes the requested id, but runs context-free. Detection is
			// content-based: the resumed session does NOT know the codeword from sandboxA.
			const resumeConfigB: SessionResumeConfig = {
				sandboxPath: sandboxB, // WRONG directory — cursor-agent won't find sandboxA's session
				modelTier: "workhorse",
				selectedModel: HARNESS_TEST_MODELS["cursor-agent"].model,
			};

			const handleWrong = await adapter.resumeSession?.(nativeId!, PHASE2_PROMPT, resumeConfigB);
			track(adapter, handleWrong);
			expect(handleWrong, "resumeSession must return a handle even for wrong dir").toBeDefined();
			if (!handleWrong) return;

			const { fullText: wrongFull } = await drainEvents(adapter, handleWrong);
			await adapter.stopSession(handleWrong);

			// Key assertion: wrong-dir resume does NOT know the codeword.
			// This is "detected" — the test fails loudly if cursor-agent somehow
			// returns the codeword from a wrong-directory context.
			expect(
				knownCodeword(wrongFull),
				`Wrong-directory cursor-agent resume must NOT know codeword "${CODEWORD}" ` +
					`(proves context-free session detected). Got: ${wrongFull.slice(0, 120)}`,
			).toBe(false);
		} finally {
			await rmSandbox(sandboxA);
			await rmSandbox(sandboxB);
		}
	}, 120_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// opencode (OpenCodeServeAdapter — no resumeSession, no getNativeSessionId)
// ═════════════════════════════════════════════════════════════════════════════

describe("session handles — opencode", () => {
	requireHarness("opencode");

	test("session starts, runs to completion, and stops cleanly", async () => {
		await requireHarnessAuthed(
			"opencode",
			"session-handles opencode needs a real logged-in session",
		);

		const sandbox = createHarnessSandbox("sh-opencode");

		try {
			const config: SessionConfig = {
				sessionId: `sh-opencode-${Math.random().toString(36).slice(2, 8)}`,
				sandboxPath: sandbox.path,
				assembledPrompt: PHASE1_PROMPT,
				instruction: PHASE1_PROMPT,
				modelTier: "workhorse",
				tools: [],
				selectedModel: HARNESS_TEST_MODELS.opencode.model,
			};

			// OpenCodeServeAdapter — production adapter for opencode (opencode serve --port 0).
			const adapter = productionHarnessAdapter("opencode");
			const handle = await adapter.startSession(config);
			track(adapter, handle);

			const { fullText } = await drainEvents(adapter, handle);
			const result = await adapter.stopSession(handle);

			expect(result.outcome).toBe("completed");
			expect(
				fullText.includes("PHASE1_OK") || fullText.includes(CODEWORD),
				`opencode session must acknowledge the prompt (PHASE1_OK or ${CODEWORD}). ` +
					`Got: ${fullText.slice(0, 120)}`,
			).toBe(true);
		} finally {
			await sandbox.cleanup();
		}
	}, 120_000);
});
