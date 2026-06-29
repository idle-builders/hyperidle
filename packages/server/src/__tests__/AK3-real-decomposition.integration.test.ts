/**
 * AR5 NEW — AK3 real-agent bet decomposition integration tests.
 *
 * Proves AC2: a real strategy agent produces the decomposition; tasks/edges
 * are asserted from that real output.
 *
 * Decision A (plans/AR5/architecture.md §1): drives `runBetDecomposition`
 * Branch 3 (`runRealPmTurn`) via `decompositionDepsForLane` — NOT
 * `provisionSession`/`runThroughHarness`. The production decomposition turn
 * does NOT flow through `provisionSession`; `runRealPmTurn` calls
 * `adapterPool.select()` directly. See provision-real-decomposition.ts @lore.
 *
 * @lore AR5 — This file is the only place in the codebase where a real agent
 * produces a bet decomposition end-to-end. The pinned assertion (below) is
 * MANDATORY and must NOT be softened — a fake/empty model output causes
 * `runRealPmTurn` to return [] → `runBetDecomposition` marks the bet
 * `blocked/empty`, which makes `decompositionStatus === "done"` fail.
 * If a harness cannot produce parseable JSON for a tiny bet, that is a real
 * production-prompt fragility finding, not a reason to loosen the assert.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { bets, tasks, teamMembers, teams, users } from "@hyperidle/db";
import type { HyperIdleDb } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect } from "vitest";
import {
	decompositionDepsForLane,
} from "../harness/__tests__/provision-real-decomposition.js";
import { SUPPORTED_HARNESS_LANES } from "../harness/__tests__/provision-real-session.js";
import { requireHarness } from "../harness/__tests__/require-harness.js";
import { runBetDecomposition } from "../services/bet-decomposition.js";
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

/**
 * Seed a minimal team + eligible agent + bet.
 * The PM agent is kind=ai, status=active, agentCategory=team — eligible for
 * decomposition. No harnessType/modelProvider set → defaults to
 * builtin/anthropic which `decompositionDepsForLane` accommodates.
 */
async function seedDecompositionDomain(
	db: HyperIdleDb,
	suffix: string,
): Promise<{ betId: string; teamId: string; agentId: string }> {
	const teamId = `team-ar5-${suffix}`;
	const memberId = `tm-ar5-${suffix}`;
	const agentId = `agent-ar5-${suffix}`;
	const betId = `bet-ar5-${suffix}`;

	await db.insert(teams).values({
		id: teamId,
		name: `AR5 Team ${suffix}`,
		phase: "build",
		createdAt: NOW,
	});
	await db.insert(teamMembers).values({
		id: memberId,
		teamId,
		capacity: 5,
		activeBets: 0,
		formedAt: NOW,
	});
	// PM agent — eligible, kind=ai, agentCategory=team, role=product_manager.
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: `AR5 PM ${suffix}`,
		role: "product_manager",
		agentCategory: "team",
		teamId: memberId, // users.teamId references teamMembers.id
		status: "active",
		maxConcurrentSessions: 2,
		costActual: 0,
		createdAt: NOW,
	});
	// Active bet awaiting decomposition.
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "Add a public health endpoint that returns {status:'ok'}",
		doneCondition: "GET /health returns 200 with {status:'ok'}",
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});

	return { betId, teamId, agentId };
}

// ---------------------------------------------------------------------------
// Shared lane describe body factory
// ---------------------------------------------------------------------------

function makeLaneDescribe(lane: (typeof SUPPORTED_HARNESS_LANES)[number]): void {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `ak3-real-decomp-${lane.harnessName}-`));
	});

	afterEach(async () => {
		clearActiveStrategy();
		if (fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	// AC2: a real strategy agent produces the decomposition; tasks/edges are
	// asserted from that real output.
	//
	// Pinned assertion (W-2, verbatim — MUST NOT BE SOFTENED):
	//   decompositionStatus === "done"
	//   tasks.length >= 1
	//   tasks.every(t => t.title.trim().length >= 3)
	//
	// Fail-closed: a fake/empty/non-array model output → runRealPmTurn returns []
	// → Branch-3 empty-guard → decompositionStatus "blocked"/"empty", so BOTH
	// asserts below fail. This test cannot pass on fake/empty agent output.
	test("real agent decomposes a real bet — ≥1 persisted task with non-trivial title, bet done", async ({
		db,
		eventBus,
	}) => {
		const { minimalStrategy } = await import("@hyperidle/strategy-minimal");
		setActiveStrategy(minimalStrategy);

		const { betId } = await seedDecompositionDomain(db, lane.harnessName);

		const deps = decompositionDepsForLane(lane, { db, eventBus, tmpDir });

		await runBetDecomposition(deps, betId);

		// ── MANDATORY pinned assertions (AR5 W-2 / architecture.md §1) ──────────
		const bet = await db.query.bets.findFirst({ where: eq(bets.id, betId) });
		expect(bet?.decompositionStatus).toBe("done"); // empty/failed output → "blocked", fails closed

		const betTasks = await db.query.tasks.findMany({ where: eq(tasks.betId, betId) });
		expect(betTasks.length).toBeGreaterThanOrEqual(1); // ≥1 real persisted task
		expect(
			betTasks.every((t) => t.title.trim().length >= 3), // non-trivial title — survives phrasing variance
		).toBe(true);
	});
}

// ---------------------------------------------------------------------------
// Tests — 4-lane harness matrix (AC2, AC4)
// Explicit per-lane describe blocks so the honest-harness-guard coverage check
// finds literal requireHarness("...") call expressions in the source.
// ---------------------------------------------------------------------------

describe(`${BUILTIN_LANE.describeTag} AK3 — real-agent bet decomposition`, () => {
	requireHarness("builtin");
	makeLaneDescribe(BUILTIN_LANE);
});

describe(`${CLAUDE_LANE.describeTag} AK3 — real-agent bet decomposition`, () => {
	requireHarness("claude");
	makeLaneDescribe(CLAUDE_LANE);
});

describe(`${CODEX_LANE.describeTag} AK3 — real-agent bet decomposition`, () => {
	requireHarness("codex");
	makeLaneDescribe(CODEX_LANE);
});

describe(`${OPENCODE_LANE.describeTag} AK3 — real-agent bet decomposition`, () => {
	requireHarness("opencode");
	makeLaneDescribe(OPENCODE_LANE);
});
