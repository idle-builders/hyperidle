/**
 * Session handles: native id capture and session resumption.
 *
 * LOCAL-ONLY LANE — runs via test:integration (harness project). Needs real CLI
 * binaries and real LLM credentials. Never a GitHub Actions job.
 *
 * Proves per harness (claude/codex/cursor-agent/opencode), all four:
 *
 *   1. A session's native id is captured (or assigned) and survives to where a
 *      resume could use it.
 *   2. That session resumes and receives a new user message.
 *   3. The resumed session retains its prior context — it knows the task ID from
 *      the first turn.
 *   4. A resume aimed at a WRONG/unknown session id is detected and fails loudly.
 *      Most important on cursor-agent, which exits 0 on a wrong id.
 *
 * @lore BA2 cursor-agent-silent-fail: cursor-agent exits 0 even on a wrong or
 * missing session id, echoing back the requested id. Detection is from content:
 * a resumed context-free session does not know the task ID.
 *
 * @lore BA2 claude-session-global: In claude 2.1.247, --resume <uuid> finds
 * sessions globally by UUID — NOT per working directory. The research claim that
 * "wrong-dir fails loudly with exit 1" did not hold against the installed binary.
 * The correct "wrong resume" probe for claude is a bogus UUID (exits 0 with
 * error_during_execution and empty result, detected via content check).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { HarnessEvent, SessionConfig, SessionResumeConfig } from "@hyperidle/harness-protocol";
import { ensureSandboxGitRepo } from "@hyperidle/run-orchestration";
import { describe, expect, test } from "vitest";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";
import { LocalSandboxAdapter } from "../local-sandbox-adapter.js";
import {
	provisionClaudeSandbox,
	provisionCodexHome,
	requireHarnessAuthed,
} from "./harness-sandbox.js";
import { productionCliConfig } from "./production-cli-config.js";
import { HARNESS_TEST_MODELS, requireHarness } from "./require-harness.js";
import { trackHarnessSessions } from "./session-handle-tracker.js";

// @lore process-group kill only helps once stopSession runs. `track` stops any
// handle a test leaves unstopped — timeout or thrown assertion included — in
// afterEach, so a real CLI session can never outlive its test. See
// session-handle-tracker.ts.
const { track } = trackHarnessSessions();

// ── Context marker planted in session 1, tested in the resumed session ────────
// A non-guessable task-ID token so "did the model know this?" is meaningful.
// Framed as a task ID (not a "codeword") to avoid security-minded model
// refusals that treat codeword exchanges as prompt-injection attempts.
// @lore BA2 context-marker-framing: "codeword" framing caused haiku to refuse
// the acknowledgment and to decline recalling it in Phase 2 ("I can't treat
// codeword exchanges as authentication"). "Task ID" framing is semantically
// identical but does not trigger security heuristics.
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
	adapter: CliHarnessAdapter,
	handle: Awaited<ReturnType<CliHarnessAdapter["startSession"]>>,
): Promise<{ events: HarnessEvent[]; completionTexts: string[] }> {
	const events: HarnessEvent[] = [];
	for await (const ev of adapter.streamEvents(handle)) {
		events.push(ev);
	}
	const completionTexts = events
		.filter((e) => e.type === "completion")
		.map((e) => ("text" in e ? (e.text as string) : ""));
	return { events, completionTexts };
}

function knownCodeword(completionTexts: string[]): boolean {
	return completionTexts.some((t) => t.includes(CODEWORD));
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

			const { completionTexts: p1Texts } = await drainEvents(adapter, handleP1);
			const r1 = await adapter.stopSession(handleP1);
			expect(r1.outcome).toBe("completed");

			// Sanity: the task ID appeared in phase 1's output OR was acknowledged.
			// (Some models say "PHASE1_OK" without repeating the task ID — that's fine.)
			// What matters is that phase 2 resume knows the task ID.
			expect(
				p1Texts.some((t) => t.includes("PHASE1_OK") || t.includes(CODEWORD)),
				`Phase 1 must produce PHASE1_OK or mention ${CODEWORD}. Got: ${p1Texts.slice(0, 3).join("|")}`,
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

			const { completionTexts: p2Texts } = await drainEvents(adapter, handleP2);
			const r2 = await adapter.stopSession(handleP2);
			expect(r2.outcome).toBe("completed");

			expect(
				knownCodeword(p2Texts),
				`Resumed claude session must know the task ID "${CODEWORD}". ` +
					`Got: ${p2Texts.slice(0, 3).join("|")}`,
			).toBe(true);

			// ── Proof 4: bogus-id resume detected (fails loudly) ──────────────
			// claude exits 0 with is_error:true and empty result on a bogus UUID.
			// Detection is content-based: outcome may be "completed" (exit 0) but
			// the session has no task ID in its output.
			//
			// @lore BA2 claude-session-global: In claude 2.1.247, --resume <uuid>
			// finds sessions GLOBALLY by UUID, NOT per working directory. The research
			// claim that "wrong-dir fails loudly with exit 1" did not hold against the
			// installed binary — wrong-dir resume exits 0 and succeeds (the session is
			// found from any cwd). A bogus (non-existent) UUID is the correct test:
			// it exits 0 with error_during_execution subtype and empty result, so
			// content-based detection (no task ID in output) correctly signals failure.
			const bogusId = "00000000-0000-0000-0000-000000000000";
			let bogusIdDetected = false;
			try {
				const handleWrong = await adapter.resumeSession?.(bogusId, PHASE2_PROMPT, resumeConfigA);
				track(adapter, handleWrong);
				if (handleWrong) {
					const { completionTexts: wrongTexts } = await drainEvents(adapter, handleWrong);
					const resultWrong = await adapter.stopSession(handleWrong);
					// claude exits 0 on a bogus id (error_during_execution), result is "".
					// Detection is via content: no task ID in output.
					bogusIdDetected = resultWrong.outcome !== "completed" || !knownCodeword(wrongTexts);
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
// codex
// ═════════════════════════════════════════════════════════════════════════════

describe("session handles — codex", () => {
	requireHarness("codex");

	test("captures thread_id from thread.started, resumes with prior context, wrong-id fails loudly", async () => {
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

			const codexConfig = productionCliConfig("codex");
			const adapter = new CliHarnessAdapter(codexConfig);

			// ── Phase 1: run session, capture native thread id ────────────────
			const configP1: SessionConfig = {
				sessionId: `sh-codex-p1-${Math.random().toString(36).slice(2, 8)}`,
				sandboxPath,
				assembledPrompt: PHASE1_PROMPT,
				instruction: PHASE1_PROMPT,
				modelTier: "workhorse",
				tools: [],
				selectedModel: HARNESS_TEST_MODELS.codex.model,
			};

			const handleP1 = await adapter.startSession(configP1);
			track(adapter, handleP1);

			// Native id is NOT available before the stream (codex emits it on thread.started).
			// Stream to completion so the event is consumed.
			const { completionTexts: p1Texts } = await drainEvents(adapter, handleP1);
			const r1 = await adapter.stopSession(handleP1);
			expect(r1.outcome).toBe("completed");

			// ── Proof 1: native id captured from event stream ─────────────────
			const nativeId = adapter.getNativeSessionId?.(handleP1);
			expect(
				nativeId,
				"codex native session id (thread_id) must be captured from thread.started event",
			).toBeTruthy();

			expect(
				p1Texts.some((t) => t.includes("PHASE1_OK") || t.includes(CODEWORD)),
				`Phase 1 must produce PHASE1_OK or mention ${CODEWORD}. Got: ${p1Texts.slice(0, 3).join("|")}`,
			).toBe(true);

			// ── Proof 2 + 3: resume retains prior context ────────────────────
			const resumeConfig: SessionResumeConfig = {
				sandboxPath,
				modelTier: "workhorse",
				selectedModel: HARNESS_TEST_MODELS.codex.model,
			};

			const handleP2 = await adapter.resumeSession?.(nativeId!, PHASE2_PROMPT, resumeConfig);
			track(adapter, handleP2);
			expect(handleP2, "resumeSession must return a handle").toBeDefined();
			if (!handleP2) return;

			const { completionTexts: p2Texts } = await drainEvents(adapter, handleP2);
			const r2 = await adapter.stopSession(handleP2);
			expect(r2.outcome).toBe("completed");

			expect(
				knownCodeword(p2Texts),
				`Resumed codex session must know codeword "${CODEWORD}". ` +
					`Got: ${p2Texts.slice(0, 3).join("|")}`,
			).toBe(true);

			// ── Proof 4: wrong id fails loudly ───────────────────────────────
			// codex returns exit 1 with "no rollout found for thread id" on bad id.
			const bogusId = "00000000-0000-0000-0000-000000000000";
			let wrongIdDetected = false;
			try {
				const handleWrong = await adapter.resumeSession?.(bogusId, PHASE2_PROMPT, resumeConfig);
				track(adapter, handleWrong);
				if (handleWrong) {
					await drainEvents(adapter, handleWrong);
					const rWrong = await adapter.stopSession(handleWrong);
					// codex exits 1 on a bad thread id → outcome "crashed"
					wrongIdDetected = rWrong.outcome !== "completed";
				}
			} catch {
				wrongIdDetected = true;
			}

			expect(
				wrongIdDetected,
				"Wrong thread-id resume on codex must fail loudly (crashed outcome)",
			).toBe(true);
		} finally {
			await sandboxAdapter.destroy(sandboxHandle);
			await rmSandbox(baseDir);
		}
	}, 120_000);

	test("resumed codex session can write files — sandbox mode is thread-scoped not config-scoped", async () => {
		// @lore BA2 codex-sandbox-inherit: `exec resume` has no --sandbox flag.
		// The original thread's sandbox mode (workspace-write) is INHERITED by the
		// resumed session. This test proves it by having the resumed session create
		// a new file and asserting the file exists on disk.
		//
		// If codex resume defaulted to read-only, the file write would silently
		// fail or produce an error event, and the file would not exist — failing
		// this assertion. A guard you cannot show red is a passenger; this test
		// goes red if sandbox mode stops being inherited.
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

			const codexConfig = productionCliConfig("codex");
			const adapter = new CliHarnessAdapter(codexConfig);

			// Phase 1: write a sentinel file, capture thread id.
			const configP1: SessionConfig = {
				sessionId: `codex-sbox-p1-${Math.random().toString(36).slice(2, 8)}`,
				sandboxPath,
				assembledPrompt:
					"Write the text 'phase1' to a new file called sandbox-phase1.txt. " +
					"Reply with exactly: PHASE1_DONE",
				instruction:
					"Write the text 'phase1' to a new file called sandbox-phase1.txt. " +
					"Reply with exactly: PHASE1_DONE",
				modelTier: "workhorse",
				tools: [],
				selectedModel: HARNESS_TEST_MODELS.codex.model,
			};

			const handleP1 = await adapter.startSession(configP1);
			track(adapter, handleP1);
			const { completionTexts: p1Texts } = await drainEvents(adapter, handleP1);
			const r1 = await adapter.stopSession(handleP1);
			expect(r1.outcome).toBe("completed");
			expect(
				p1Texts.some((t) => t.includes("PHASE1_DONE")),
				`Phase 1 must produce PHASE1_DONE. Got: ${p1Texts.slice(0, 3).join("|")}`,
			).toBe(true);

			const nativeId = adapter.getNativeSessionId?.(handleP1);
			expect(nativeId, "codex thread_id must be captured").toBeTruthy();

			// Verify phase 1 actually wrote the file.
			expect(
				fs.existsSync(path.join(sandboxPath, "sandbox-phase1.txt")),
				"Phase 1 must have written sandbox-phase1.txt",
			).toBe(true);

			// Phase 2: resume and write a SECOND file.
			const resumeConfig: import("@hyperidle/harness-protocol").SessionResumeConfig = {
				sandboxPath,
				modelTier: "workhorse",
				selectedModel: HARNESS_TEST_MODELS.codex.model,
			};

			const handleP2 = await adapter.resumeSession?.(
				nativeId!,
				"Write the text 'phase2' to a new file called sandbox-phase2.txt. " +
					"Reply with exactly: PHASE2_DONE",
				resumeConfig,
			);
			track(adapter, handleP2);
			expect(handleP2, "resumeSession must return a handle").toBeDefined();
			if (!handleP2) return;

			const { completionTexts: p2Texts } = await drainEvents(adapter, handleP2);
			const r2 = await adapter.stopSession(handleP2);
			expect(r2.outcome).toBe("completed");
			expect(
				p2Texts.some((t) => t.includes("PHASE2_DONE")),
				`Phase 2 resume must produce PHASE2_DONE. Got: ${p2Texts.slice(0, 3).join("|")}`,
			).toBe(true);

			// Key assertion: resumed session wrote the file.
			expect(
				fs.existsSync(path.join(sandboxPath, "sandbox-phase2.txt")),
				"Resumed codex session must be able to write files (sandbox mode is thread-scoped)",
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
			const { completionTexts: p1Texts } = await drainEvents(adapter, handleP1);
			const r1 = await adapter.stopSession(handleP1);
			expect(r1.outcome).toBe("completed");

			// ── Proof 1: native id captured from system/init event ────────────
			const nativeId = adapter.getNativeSessionId?.(handleP1);
			expect(
				nativeId,
				"cursor-agent native session id must be captured from system/init event",
			).toBeTruthy();

			expect(
				p1Texts.some((t) => t.includes("PHASE1_OK") || t.includes(CODEWORD)),
				`Phase 1 must produce PHASE1_OK or mention ${CODEWORD}. Got: ${p1Texts.slice(0, 3).join("|")}`,
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

			const { completionTexts: p2Texts } = await drainEvents(adapter, handleP2);
			const r2 = await adapter.stopSession(handleP2);
			expect(r2.outcome).toBe("completed");

			expect(
				knownCodeword(p2Texts),
				`Resumed cursor-agent session must know codeword "${CODEWORD}". ` +
					`Got: ${p2Texts.slice(0, 3).join("|")}`,
			).toBe(true);

			// ── Proof 4: wrong-directory resume detected as context-free ──────
			// @lore BA2 cursor-agent-silent-fail: cursor-agent exits 0 on a wrong-dir
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

			const { completionTexts: wrongTexts } = await drainEvents(adapter, handleWrong);
			await adapter.stopSession(handleWrong);

			// Key assertion: wrong-dir resume does NOT know the codeword.
			// This is "detected" — the test fails loudly if cursor-agent somehow
			// returns the codeword from a wrong-directory context.
			expect(
				knownCodeword(wrongTexts),
				`Wrong-directory cursor-agent resume must NOT know codeword "${CODEWORD}" ` +
					`(proves context-free session detected). Got: ${wrongTexts.slice(0, 3).join("|")}`,
			).toBe(false);
		} finally {
			await rmSandbox(sandboxA);
			await rmSandbox(sandboxB);
		}
	}, 120_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// opencode
// ═════════════════════════════════════════════════════════════════════════════

describe("session handles — opencode", () => {
	requireHarness("opencode");

	test("captures sessionID from first event, resumes with prior context, wrong-id fails loudly", async () => {
		await requireHarnessAuthed("opencode");

		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "sh-opencode-"));

		try {
			const opencodeConfig = productionCliConfig("opencode");
			const adapter = new CliHarnessAdapter(opencodeConfig);

			// ── Phase 1: run session, plant codeword ──────────────────────────
			const configP1: SessionConfig = {
				sessionId: `sh-oc-p1-${Math.random().toString(36).slice(2, 8)}`,
				sandboxPath,
				assembledPrompt: PHASE1_PROMPT,
				instruction: PHASE1_PROMPT,
				modelTier: "workhorse",
				tools: [],
				selectedModel: HARNESS_TEST_MODELS.opencode.model,
			};

			const handleP1 = await adapter.startSession(configP1);
			track(adapter, handleP1);
			const { completionTexts: p1Texts } = await drainEvents(adapter, handleP1);
			const r1 = await adapter.stopSession(handleP1);
			expect(r1.outcome).toBe("completed");

			// ── Proof 1: native id captured from event stream ─────────────────
			const nativeId = adapter.getNativeSessionId?.(handleP1);
			expect(
				nativeId,
				"opencode native session id (sessionID) must be captured from event stream",
			).toBeTruthy();

			expect(
				p1Texts.some((t) => t.includes("PHASE1_OK") || t.includes(CODEWORD)),
				`Phase 1 must produce PHASE1_OK or mention ${CODEWORD}. Got: ${p1Texts.slice(0, 3).join("|")}`,
			).toBe(true);

			// ── Proof 2 + 3: resume retains prior context ────────────────────
			const resumeConfig: SessionResumeConfig = {
				sandboxPath,
				modelTier: "workhorse",
				selectedModel: HARNESS_TEST_MODELS.opencode.model,
			};

			const handleP2 = await adapter.resumeSession?.(nativeId!, PHASE2_PROMPT, resumeConfig);
			track(adapter, handleP2);
			expect(handleP2, "resumeSession must return a handle").toBeDefined();
			if (!handleP2) return;

			const { completionTexts: p2Texts } = await drainEvents(adapter, handleP2);
			const r2 = await adapter.stopSession(handleP2);
			expect(r2.outcome).toBe("completed");

			expect(
				knownCodeword(p2Texts),
				`Resumed opencode session must know codeword "${CODEWORD}". ` +
					`Got: ${p2Texts.slice(0, 3).join("|")}`,
			).toBe(true);

			// ── Proof 4: wrong id fails loudly ───────────────────────────────
			// opencode exits 1 with "Error: Session not found" on a bad session id.
			const bogusId = "ses_000000000000000000000000000000000000000000";
			let wrongIdDetected = false;
			try {
				const handleWrong = await adapter.resumeSession?.(bogusId, PHASE2_PROMPT, resumeConfig);
				track(adapter, handleWrong);
				if (handleWrong) {
					await drainEvents(adapter, handleWrong);
					const rWrong = await adapter.stopSession(handleWrong);
					wrongIdDetected = rWrong.outcome !== "completed";
				}
			} catch {
				wrongIdDetected = true;
			}

			expect(
				wrongIdDetected,
				"Wrong session-id resume on opencode must fail loudly (crashed outcome)",
			).toBe(true);
		} finally {
			await rmSandbox(sandboxPath);
		}
	}, 120_000);
});
