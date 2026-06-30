/**
 * AK2 — Fabric parity integration test (plan §8 task #8 / §9).
 *
 * AC3: When fabricStrategy is selected, the session-boundary artifacts are
 * byte-identical to what the pre-AK2 hard-wired Fabric calls produced.
 *
 * §9 parity observations asserted here:
 *
 *   1. .fabric/manifest.json — exists during assembly, has `session_id` equal to
 *      the provisioned session, `items` populated (item count == assembleContext
 *      return value), each item has `version`/`source_path`/`format` fields.
 *      (The sandbox is deleted by endSession, so we capture the manifest in-memory
 *      via a thin spy wrapper around fabricStrategy before the sandbox goes away.)
 *
 *   2. Sandbox knowledge/ file set — context assembly writes knowledge items into
 *      the sandbox knowledge/ zones during the session. We verify this happened by
 *      confirming assembleContext returned itemCount > 0 when L4 items are seeded
 *      (same as what context-assembly.integration.test.ts pins for the raw call).
 *
 *   3. Writeback rows in DB — knowledge_items rows written by ingestion.dispose()
 *      (watcher flush) on teardown. The echo harness writes no knowledge/ files,
 *      so no new writeback rows are created — the seeded item count is unchanged.
 *      This mirrors pre-AK2 behaviour: the watcher only writes back files the agent
 *      writes; a no-write harness produces no new rows.
 *
 * @lore AK2 §9: sandbox is deleted by endSession before provisionSession returns.
 * Assertions on disk state must be captured in-memory during the assembleContext
 * call. We use a thin spy that delegates to fabricStrategy and captures the manifest
 * from disk immediately after assembly completes (before the sandbox is cleaned up).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	bets,
	type HyperIdleDb,
	knowledgeItems,
	sessions,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { create as createKnowledgeItem, fabricStrategy } from "@hyperidle/fabric";
import type {
	ContextAssemblyOutcome,
	ContextAssemblyRequest,
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	IngestionHandle,
	IngestionRequest,
	SessionConfig,
	SessionHandle,
	SessionResult,
	Strategy,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { AdapterPool } from "../harness/adapter-pool.js";
import { LocalSandboxAdapter } from "../harness/local-sandbox-adapter.js";
import {
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	provisionSession,
} from "../services/session-provisioning.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";

// ---------------------------------------------------------------------------
// Manifest capture spy — wraps fabricStrategy to read .fabric/manifest.json
// immediately after assembleContext completes (before sandbox is deleted).
// ---------------------------------------------------------------------------

interface CapturedManifest {
	// biome-ignore lint/suspicious/noExplicitAny: manifest JSON shape is dynamic
	raw: Record<string, any>;
	itemCount: number;
}

class FabricStrategySpy implements Strategy<HyperIdleDb> {
	public assembleContextOutcome: ContextAssemblyOutcome | null = null;
	public capturedManifest: CapturedManifest | null = null;
	public assembleContextCallCount = 0;
	public ingestionDisposeCallCount = 0;

	async assembleContext(req: ContextAssemblyRequest<HyperIdleDb>): Promise<ContextAssemblyOutcome> {
		this.assembleContextCallCount++;
		const outcome = await fabricStrategy.assembleContext(req);
		this.assembleContextOutcome = outcome;

		// Capture the manifest immediately after assembly — before sandbox cleanup.
		const manifestPath = path.join(req.sandboxPath, ".fabric", "manifest.json");
		if (fs.existsSync(manifestPath)) {
			const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
			// biome-ignore lint/suspicious/noExplicitAny: manifest items is a dynamic shape
			this.capturedManifest = { raw: raw as Record<string, any>, itemCount: outcome.itemCount };
		}

		return outcome;
	}

	beginLearningIngestion(req: IngestionRequest<HyperIdleDb>): IngestionHandle {
		const handle = fabricStrategy.beginLearningIngestion(req);
		const spy = this;
		return {
			dispose(): void {
				handle.dispose();
				spy.ingestionDisposeCallCount++;
			},
		};
	}

	// AK6: scaffoldAgents stub — FabricStrategySpy test is not about agent creation.
	async scaffoldAgents(
		_req: import("@hyperidle/shared").ScaffoldRequest<HyperIdleDb>,
	): Promise<readonly import("@hyperidle/shared").AgentScaffoldSpec[]> {
		return [];
	}

	// AK7: selectAgent stub — FabricStrategySpy test is not about agent selection.
	async selectAgent(
		_req: import("@hyperidle/shared").SelectAgentRequest<HyperIdleDb>,
	): Promise<import("@hyperidle/shared").SelectAgentOutcome> {
		return { agentId: null };
	}

	// AK8: decomposeBet stub — FabricStrategySpy test is not about decomposition.
	async decomposeBet(
		_req: import("@hyperidle/shared").DecomposeBetRequest<HyperIdleDb>,
	): Promise<import("@hyperidle/shared").DecompositionPlan> {
		return { decomposerAgentId: null, tasks: [] };
	}

	// AR4b: formAssistant stub — FabricStrategySpy test is not about assistant formation.
	async formAssistant(
		_req: import("@hyperidle/shared").AssistantFormationRequest<HyperIdleDb>,
	): Promise<import("@hyperidle/shared").AssistantFormation> {
		return { persona: null, assistantDraftSurface: "standard" };
	}
}

// ---------------------------------------------------------------------------
// Echo harness — completes immediately with zero cost, no file writes
// ---------------------------------------------------------------------------

class EchoHarnessAdapter implements HarnessAdapter {
	async startSession(_config: SessionConfig): Promise<SessionHandle> {
		return { sessionId: "parity-echo-session" };
	}

	async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
		// AL6 v2: emit submit_review so the return gate sees a return action.
		yield { type: "tool_call", toolName: "submit_review", args: { message: "AK2 stub done" } };
		yield { type: "completion", text: "Parity echo: done." };
	}

	async stopSession(_handle: SessionHandle): Promise<SessionResult> {
		return {
			outcome: "completed",
			cost: { minor: 0, currency: "USD" },
			tokenUsage: { byTier: {} },
		};
	}

	getCapabilities(): HarnessCapabilities {
		return {
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: ["anthropic"],
			mcpSupport: false,
			returnEnforcement: "none",
		};
	}
}

function makePool(adapter: HarnessAdapter): AdapterPool {
	const pool = new AdapterPool();
	pool.register("local", adapter, {
		name: "local",
		kind: "local",
		modelProviders: ["anthropic"],
		maxConcurrent: 4,
	});
	return pool;
}

// ---------------------------------------------------------------------------
// Seed helpers — mirrors the context-assembly integration test fixture
// ---------------------------------------------------------------------------

const NOW = "2026-06-15T00:00:00.000Z";

async function seedDomain(db: HyperIdleDb): Promise<void> {
	await db
		.insert(teams)
		.values({ id: "p-ak2p", name: "AK2 Parity Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: "tm-ak2p", teamId: "p-ak2p", capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(bets).values({
		id: "b-ak2p",
		teamId: "p-ak2p",
		description: "AK2 parity test bet",
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: "agent-ak2p",
		name: "AK2 Parity Builder",
		role: "builder",
		status: "active",
		teamId: "tm-ak2p",
		maxConcurrentSessions: 2,
		costActual: 0,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: "task-ak2p",
		betId: "b-ak2p",
		teamId: "p-ak2p",
		title: "AK2 Parity Test Task",
		state: "accepted",
		createdAt: NOW,
		updatedAt: NOW,
	});

	// Seed a knowledge item at L4 (factory/principle) so assembleContext has
	// something to assemble and the manifest will contain at least one item.
	// We use the knowledge-repository `create()` helper (same as context-assembly
	// integration tests) so the knowledgeStrategyFabric extension row is also
	// written — without it the Fabric assembler skips the item.
	await createKnowledgeItem(db, {
		layer: "L4",
		kind: "principle",
		title: "PARITY-PRINCIPLES.md",
		body: "# Parity Principles\nContext assembly must be byte-identical.",
		format: "markdown",
		status: "active",
		updatedBy: "system",
	});
}

function baseParams(basePath: string): ProvisionSessionParams {
	return {
		taskId: "task-ak2p",
		agentId: "agent-ak2p",
		productId: "p-ak2p",
		sandboxBasePath: basePath,
	};
}

// ---------------------------------------------------------------------------
// Parity tests
// ---------------------------------------------------------------------------

describe("AK2 — Fabric parity: fabricStrategy produces session-boundary artifacts unchanged", () => {
	let tmpDir: string;
	let spy: FabricStrategySpy;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak2-parity-"));
		spy = new FabricStrategySpy();
		setActiveStrategy(spy);
	});

	afterEach(() => {
		clearActiveStrategy();
		if (fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	// §9 observation 2: assembleContext was called and returned itemCount > 0
	// (the seeded L4 item is assembled into the sandbox). This is the same
	// itemCount the context-assembly.integration.test.ts pins for the raw call.
	test("fabricStrategy: assembleContext called once and returns non-zero itemCount for seeded knowledge", async ({
		db,
	}) => {
		await seedDomain(db);

		const deps: ProvisionSessionDeps = {
			db,
			eventBus: { emit: () => {}, on: () => {}, off: () => {} } as never,
			adapterPool: makePool(new EchoHarnessAdapter()),
			workspace: new LocalSandboxAdapter(),
		};

		const result = await provisionSession(deps, baseParams(tmpDir));

		const [session] = await db.select().from(sessions).where(eq(sessions.id, result.sessionId));
		expect(session?.state).toBe("done");
		expect(session?.outcome).toBe("completed");

		// assembleContext was called exactly once through the seam
		expect(spy.assembleContextCallCount).toBe(1);
		// The seeded L4 knowledge item was assembled (itemCount > 0)
		expect(spy.assembleContextOutcome?.itemCount).toBeGreaterThan(0);
	});

	// §9 observation 1: .fabric/manifest.json shape — session_id, assembled_at, items.
	// Captured in-memory during assembleContext (sandbox deleted by endSession).
	test("fabricStrategy: .fabric/manifest.json has correct shape (session_id, items with version/source_path/format)", async ({
		db,
	}) => {
		await seedDomain(db);

		const deps: ProvisionSessionDeps = {
			db,
			eventBus: { emit: () => {}, on: () => {}, off: () => {} } as never,
			adapterPool: makePool(new EchoHarnessAdapter()),
			workspace: new LocalSandboxAdapter(),
		};

		const result = await provisionSession(deps, baseParams(tmpDir));

		// Manifest was captured in-memory during assembly
		expect(spy.capturedManifest).not.toBeNull();
		const manifest = spy.capturedManifest!.raw;

		// session_id matches the provisioned session
		expect(manifest["session_id"]).toBe(result.sessionId);
		// assembled_at is present (ISO timestamp)
		expect(typeof manifest["assembled_at"]).toBe("string");
		expect(manifest["assembled_at"]).toBeTruthy();
		// items is present and populated (matches itemCount from assembleContext)
		expect(manifest["items"]).toBeDefined();
		const items = manifest["items"] as Record<string, unknown>;
		const itemKeys = Object.keys(items);
		expect(itemKeys.length).toBe(spy.capturedManifest!.itemCount);
		expect(itemKeys.length).toBeGreaterThan(0);
		// Each item has version, source_path, format — same shape as context-assembly.integration.test.ts pins
		for (const key of itemKeys) {
			const item = items[key] as Record<string, unknown>;
			expect(typeof item["version"]).toBe("number");
			expect(typeof item["source_path"]).toBe("string");
			expect(typeof item["format"]).toBe("string");
		}
	});

	// §9 observation 3: writeback rows — the echo harness writes no knowledge/ files,
	// so ingestion.dispose() flushes nothing. The knowledge_items count after the
	// session equals the seeded count (1). This mirrors pre-AK2 behaviour exactly.
	test("fabricStrategy: knowledge_items row count unchanged after session (echo harness writes no knowledge/ files)", async ({
		db,
	}) => {
		await seedDomain(db);

		const beforeRows = await db.select().from(knowledgeItems);
		const beforeCount = beforeRows.length;
		expect(beforeCount).toBeGreaterThanOrEqual(1); // at least the seeded L4 item

		const deps: ProvisionSessionDeps = {
			db,
			eventBus: { emit: () => {}, on: () => {}, off: () => {} } as never,
			adapterPool: makePool(new EchoHarnessAdapter()),
			workspace: new LocalSandboxAdapter(),
		};

		await provisionSession(deps, baseParams(tmpDir));

		// ingestion.dispose() was called (watcher flushed on session end)
		expect(spy.ingestionDisposeCallCount).toBe(1);

		// No new knowledge_items rows — echo harness wrote no knowledge/ files
		const afterRows = await db.select().from(knowledgeItems);
		expect(afterRows).toHaveLength(beforeCount);
	});
});
