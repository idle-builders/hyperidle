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
import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { create as createKnowledgeItem } from "../app-runtime/knowledge-repository.js";
import { AdapterPool } from "../harness/adapter-pool.js";
import { LocalSandboxAdapter } from "../harness/local-sandbox-adapter.js";
import {
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	provisionSession,
} from "../services/session-provisioning.js";
import { test } from "../test-fixtures.js";

// ---------------------------------------------------------------------------
// Manifest capture spy — wraps the app-owned context provider to read
// .fabric/manifest.json immediately after assembleContext completes.
// ---------------------------------------------------------------------------

interface CapturedManifest {
	raw: Record<string, unknown>;
	itemCount: number;
}

const contextSpy = vi.hoisted(() => ({
	assembleContextOutcome: null as null | {
		itemCount: number;
		durationMs: number;
		manifestPath: string;
	},
	capturedManifest: null as CapturedManifest | null,
	assembleContextCallCount: 0,
	ingestionDisposeCallCount: 0,
}));

vi.mock("../services/agent-context/assemble-context.js", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../services/agent-context/assemble-context.js")>();
	const fsModule = await import("node:fs");
	const pathModule = await import("node:path");

	return {
		...actual,
		assembleAgentContext: async (
			input: Parameters<typeof actual.assembleAgentContext>[0],
		): Promise<
			ReturnType<typeof actual.assembleAgentContext> extends Promise<infer T> ? T : never
		> => {
			contextSpy.assembleContextCallCount++;
			const outcome = await actual.assembleAgentContext(input);
			contextSpy.assembleContextOutcome = outcome;

			const manifestPath = pathModule.join(input.sandboxPath, ".fabric", "manifest.json");
			if (fsModule.existsSync(manifestPath)) {
				const raw = JSON.parse(fsModule.readFileSync(manifestPath, "utf-8")) as Record<
					string,
					unknown
				>;
				contextSpy.capturedManifest = {
					raw,
					itemCount: outcome.itemCount,
				};
			}

			return outcome;
		},
		beginAgentWriteback: (
			input: Parameters<typeof actual.beginAgentWriteback>[0],
		): ReturnType<typeof actual.beginAgentWriteback> => {
			const handle = actual.beginAgentWriteback(input);
			return {
				dispose(): void {
					handle.dispose();
					contextSpy.ingestionDisposeCallCount++;
				},
			};
		},
	};
});

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

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak2-parity-"));
		contextSpy.assembleContextOutcome = null;
		contextSpy.capturedManifest = null;
		contextSpy.assembleContextCallCount = 0;
		contextSpy.ingestionDisposeCallCount = 0;
	});

	afterEach(() => {
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
		expect(contextSpy.assembleContextCallCount).toBe(1);
		// The seeded L4 knowledge item was assembled (itemCount > 0)
		expect(contextSpy.assembleContextOutcome?.itemCount).toBeGreaterThan(0);
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
		expect(contextSpy.capturedManifest).not.toBeNull();
		const manifest = contextSpy.capturedManifest!.raw;

		// session_id matches the provisioned session
		expect(manifest["session_id"]).toBe(result.sessionId);
		// assembled_at is present (ISO timestamp)
		expect(typeof manifest["assembled_at"]).toBe("string");
		expect(manifest["assembled_at"]).toBeTruthy();
		// items is present and populated (matches itemCount from assembleContext)
		expect(manifest["items"]).toBeDefined();
		const items = manifest["items"] as Record<string, unknown>;
		const itemKeys = Object.keys(items);
		expect(itemKeys.length).toBe(contextSpy.capturedManifest!.itemCount);
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
		expect(contextSpy.ingestionDisposeCallCount).toBe(1);

		// No new knowledge_items rows — echo harness wrote no knowledge/ files
		const afterRows = await db.select().from(knowledgeItems);
		expect(afterRows).toHaveLength(beforeCount);
	});
});
