/**
 * AK2 — Contributor Strategy: context assembly unit test.
 *
 * AR5 TEST-COST REFACTOR: Test #4 from AK2-contributor-scenario was demoted
 * here from the real-LLM × 4-harness matrix. It asserts on the ContributorStrategy's
 * own `assembleContext` side-effect (writing a custom context file into the sandbox).
 * This is a property of the Strategy object, not the agent — provable by calling
 * `assembleContext` directly with a tmp sandbox path. Zero agent dependency.
 *
 * AC4: The contributor's Strategy can write custom context into the sandbox.
 *   Given a ContributorStrategy that writes a custom context file,
 *   when assembleContext is called with a sandbox path,
 *   then the file is present with the expected content.
 *
 * @lore AK2: sandbox is deleted by endSession in the integration tests; we capture
 * the path + content in-memory during assembly and assert on those. In this unit
 * test there is no session lifecycle — the tmp sandbox is cleaned up by afterEach.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import type {
	ContextAssemblyOutcome,
	ContextAssemblyRequest,
	IngestionHandle,
	IngestionRequest,
	Strategy,
} from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Minimal ContributorStrategy — same shape as AK2-contributor-scenario.
// Writes a custom context file during assembleContext; the test asserts on it.
// ---------------------------------------------------------------------------

class ContributorStrategy implements Strategy<HyperIdleDb> {
	private _capturedContextPath = "";
	private _capturedContextContent = "";

	async assembleContext(req: ContextAssemblyRequest<HyperIdleDb>): Promise<ContextAssemblyOutcome> {
		// Minimal scaffold.
		fs.mkdirSync(path.join(req.sandboxPath, "context"), { recursive: true });
		fs.mkdirSync(path.join(req.sandboxPath, "knowledge"), { recursive: true });
		fs.mkdirSync(path.join(req.sandboxPath, "work"), { recursive: true });
		fs.mkdirSync(path.join(req.sandboxPath, ".fabric"), { recursive: true });
		fs.writeFileSync(
			path.join(req.sandboxPath, ".fabric", "manifest.json"),
			JSON.stringify({
				session_id: req.sessionId,
				assembled_at: new Date().toISOString(),
				items: [],
			}),
		);
		// Contributor writes a custom context file — the assertion target.
		const contextFilePath = path.join(req.sandboxPath, "context", "contributor-context.md");
		const contextContent = `# Contributor Context\nCustom knowledge for session ${req.sessionId}.`;
		fs.writeFileSync(contextFilePath, contextContent);
		// Capture in-memory for assertion (mirrors the integration test's approach).
		this._capturedContextPath = contextFilePath;
		this._capturedContextContent = contextContent;
		return { itemCount: 1, durationMs: 0 };
	}

	beginLearningIngestion(_req: IngestionRequest<HyperIdleDb>): IngestionHandle {
		return { dispose(): void {} };
	}

	async scaffoldAgents(
		_req: import("@hyperidle/shared").ScaffoldRequest<HyperIdleDb>,
	): Promise<readonly import("@hyperidle/shared").AgentScaffoldSpec[]> {
		return [];
	}

	async selectAgent(
		_req: import("@hyperidle/shared").SelectAgentRequest<HyperIdleDb>,
	): Promise<import("@hyperidle/shared").SelectAgentOutcome> {
		return { agentId: null };
	}

	async decomposeBet(
		_req: import("@hyperidle/shared").DecomposeBetRequest<HyperIdleDb>,
	): Promise<import("@hyperidle/shared").DecompositionPlan> {
		return { decomposerAgentId: null, tasks: [] };
	}

	get capturedContextPath(): string {
		return this._capturedContextPath;
	}

	get capturedContextContent(): string {
		return this._capturedContextContent;
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AK2 — Contributor Strategy: context assembly (unit, direct port call)", () => {
	let sandboxPath: string;

	beforeEach(() => {
		sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "ak2-context-assembly-"));
	});

	afterEach(() => {
		fs.rmSync(sandboxPath, { recursive: true, force: true });
	});

	// Test #4 (demoted from AK2-contributor-scenario): context file in sandbox.
	// Asserts on capturedContextPath/capturedContextContent — values the Strategy
	// itself wrote during assembleContext. This is a property of the Strategy object.
	it("contributor Strategy's custom context assembly writes the expected file to the sandbox", async () => {
		const strategy = new ContributorStrategy();

		await strategy.assembleContext({
			db: null as never, // ContributorStrategy never reads DB in assembleContext
			sandboxPath,
			sessionId: "session-test-ak2-context",
			taskId: "task-test-ak2",
			agentId: "agent-test-ak2",
			agentRole: "builder",
			teamId: "team-test-ak2",
			isRoutine: false,
		});

		// Assertions match AK2-contributor-scenario test #4 exactly.
		expect(strategy.capturedContextPath).toContain("contributor-context.md");
		expect(strategy.capturedContextContent).toContain("Custom knowledge for session");

		// Also verify the file actually exists on disk (the unit test sandbox survives afterEach).
		expect(fs.existsSync(strategy.capturedContextPath)).toBe(true);
		const diskContent = fs.readFileSync(strategy.capturedContextPath, "utf-8");
		expect(diskContent).toBe(strategy.capturedContextContent);
	});
});
