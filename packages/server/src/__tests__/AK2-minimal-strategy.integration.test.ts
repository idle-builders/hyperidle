/**
 * AK2 — Minimal Strategy end-to-end integration tests.
 * AR5 CONVERSION: replaced EchoHarnessAdapter with real 4-lane matrix via
 * `runThroughHarness`. The thing under test is "a real session runs to
 * completion under the minimal Strategy" — the harness IS the integration
 * point, so `runThroughHarness` is the correct entry point here.
 *
 * AC1: A task can be dispatched and run end-to-end under a minimal Strategy
 *      that performs no context assembly, relevance, or attention work.
 *
 * Scenario 1 (from the WP validation scenarios):
 *   Given the minimal Strategy is active, when a task is dispatched (real
 *   harness), then a session runs to completion AND the Strategy stays inert.
 *
 * Inertness assertions (no knowledge files, no knowledge_items writeback) are
 * demoted to packages/strategy-minimal/src/__tests__/minimal-strategy.test.ts
 * (AR5 / architecture-critique N-2) because those properties are about the
 * Strategy object itself, not the harness:
 *   - "no files under knowledge/" → direct assembleContext call in unit
 *   - ".fabric/manifest.json has zero items" → direct assembleContext call
 *   - "beginLearningIngestion dispose() is no-op" → direct call in unit
 * The existing minimal-strategy.test.ts already covers all three.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { bets, type HyperIdleDb, knowledgeItems, sessions, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect } from "vitest";
import {
	SUPPORTED_HARNESS_LANES,
	runThroughHarness,
	startMcpBridgeServer,
} from "../harness/__tests__/provision-real-session.js";
import { requireHarness } from "../harness/__tests__/require-harness.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";

// ---------------------------------------------------------------------------
// Lane references (index-stable: builtin=0, claude=1, codex=2, opencode=3)
// ---------------------------------------------------------------------------
const BUILTIN_LANE = SUPPORTED_HARNESS_LANES[0]!;
const CLAUDE_LANE = SUPPORTED_HARNESS_LANES[1]!;
const CODEX_LANE = SUPPORTED_HARNESS_LANES[2]!;
const OPENCODE_LANE = SUPPORTED_HARNESS_LANES[3]!;

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const NOW = "2026-06-15T00:00:00.000Z";

async function seedDomain(db: HyperIdleDb): Promise<void> {
	await db
		.insert(teams)
		.values({ id: "p-ak2", name: "AK2 Test Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: "tm-ak2", teamId: "p-ak2", capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(bets).values({
		id: "b-ak2",
		teamId: "p-ak2",
		description: "AK2 test bet",
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: "agent-ak2",
		name: "AK2 Builder",
		role: "builder",
		status: "active",
		teamId: "tm-ak2",
		maxConcurrentSessions: 2,
		costActual: 0,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: "task-ak2",
		betId: "b-ak2",
		teamId: "p-ak2",
		title: "AK2 Test Task",
		state: "accepted",
		createdAt: NOW,
		updatedAt: NOW,
	});

	// Seed a knowledge item — under minimal Strategy this must NOT appear in the
	// sandbox knowledge/ dir (context assembly is inert).
	await db.insert(knowledgeItems).values({
		id: "ki-ak2",
		title: "AK2 Principle",
		body: "This should NOT be assembled by minimal strategy.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "system",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

// ---------------------------------------------------------------------------
// Shared lane describe body factory (reduces duplication across 4 lanes)
// ---------------------------------------------------------------------------

function makeLaneDescribe(lane: (typeof SUPPORTED_HARNESS_LANES)[number]): void {
	let tmpDir: string;
	let bridge: Awaited<ReturnType<typeof startMcpBridgeServer>> | undefined;

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `ak2-minimal-${lane.harnessName}-`));
		if (lane.harnessName !== "builtin") {
			bridge = await startMcpBridgeServer();
		}
	});

	afterEach(async () => {
		clearActiveStrategy();
		if (bridge) {
			await bridge.close();
			bridge = undefined;
		}
		if (fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	// AC1 / Scenario 1 main assertion: session reaches completion under minimal.
	test("session runs to completion (state=done) under minimal Strategy", async ({
		db,
		eventBus,
	}) => {
		const { minimalStrategy } = await import("@hyperidle/strategy-minimal");

		await seedDomain(db);
		setActiveStrategy(minimalStrategy);

		const { result } = await runThroughHarness(lane, { db, eventBus, tmpDir, bridge });

		// AR2 lore: builtin+claude fire MCP return tool → "completed";
		// codex+opencode do real work but may not return → "not_returned".
		expect(["completed", "not_returned"]).toContain(result.outcome);
		const [session] = await db.select().from(sessions).where(eq(sessions.id, result.sessionId));
		expect(session?.state).toBe("done");
	});

	// AC1 / Scenario 1: no new knowledge_items rows created (no writeback).
	// The Fabric's writeback path creates knowledge_items when the FileWatcher
	// flushes. Under minimal Strategy the IngestionHandle.dispose() is a no-op,
	// so the total row count stays at exactly the seeded count (1 row seeded above).
	test("no new knowledge_items rows created (no writeback) when minimal Strategy is active", async ({
		db,
		eventBus,
	}) => {
		const { minimalStrategy } = await import("@hyperidle/strategy-minimal");

		await seedDomain(db);

		// Count seeded rows before dispatch.
		const before = await db.select().from(knowledgeItems);
		const beforeCount = before.length;

		setActiveStrategy(minimalStrategy);

		await runThroughHarness(lane, { db, eventBus, tmpDir, bridge });

		// @lore AK2: knowledge_items rows are created by the Fabric's writeback
		// path. Under minimal Strategy the IngestionHandle.dispose() is a no-op
		// so no rows are written — total count stays at seeded count.
		const after = await db.select().from(knowledgeItems);
		expect(after).toHaveLength(beforeCount);
	});
}

// ---------------------------------------------------------------------------
// Tests — 4-lane harness matrix (AR5 conversion)
// Explicit per-lane describe blocks so the honest-harness-guard coverage check
// finds literal requireHarness("...") call expressions in the source.
// ---------------------------------------------------------------------------

describe(`${BUILTIN_LANE.describeTag} AK2 — Minimal Strategy`, () => {
	requireHarness("builtin");
	makeLaneDescribe(BUILTIN_LANE);
});

describe(`${CLAUDE_LANE.describeTag} AK2 — Minimal Strategy`, () => {
	requireHarness("claude");
	makeLaneDescribe(CLAUDE_LANE);
});

describe(`${CODEX_LANE.describeTag} AK2 — Minimal Strategy`, () => {
	requireHarness("codex");
	makeLaneDescribe(CODEX_LANE);
});

describe(`${OPENCODE_LANE.describeTag} AK2 — Minimal Strategy`, () => {
	requireHarness("opencode");
	makeLaneDescribe(OPENCODE_LANE);
});
