/**
 * Real-agent bet decomposition integration tests.
 *
 * Proves a real strategy agent produces the decomposition; tasks/edges
 * are asserted from that real output.
 *
 * Drives `runBetDecomposition` through the AU1 AgentSessionRequest runtime
 * boundary via `decompositionDepsForLane`.
 *
 * @lore bet-decomposition-real-agent: This file is the only place in the codebase where a real agent
 * produces a bet decomposition end-to-end. The pinned assertion (below) is
 * MANDATORY and must NOT be softened — a fake/empty model output causes
 * runtime writeback to produce no tasks → `runBetDecomposition` marks the bet
 * `blocked/empty`, which makes `decompositionStatus === "done"` fail.
 * If a harness cannot produce parseable JSON for a tiny bet, that is a real
 * production-prompt fragility finding, not a reason to loosen the assert.
 *
 * @lore bet-decomposition-real-agent: Uses the real `minimalStrategy` from @hyperidle/strategy-minimal.
 * minimalStrategy.decomposeBet picks `candidates.find(c => c.role ===
 * "product_manager") ?? candidates[0]` — with a seeded PM agent it returns a
 * valid decomposerAgentId and the Kernel reaches the runtime decomposition request.
 * The earlier belief that minimalStrategy returns null was FALSE — it only returns
 * null when candidates is empty, which cannot happen with a seeded eligible PM agent.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import { bets, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { minimalStrategy } from "@hyperidle/strategy-minimal";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect } from "vitest";
import {
	decompositionDepsForLane,
	decompositionLaneMeta,
} from "../harness/__tests__/provision-real-decomposition.js";
import type { HarnessLane } from "../harness/__tests__/provision-real-session.js";
import { SUPPORTED_HARNESS_LANES } from "../harness/__tests__/provision-real-session.js";
import { requireHarness } from "../harness/__tests__/require-harness.js";
import { runBetDecomposition } from "../services/bet-decomposition.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";

// ---------------------------------------------------------------------------
// Lane references (index-stable: builtin=0, claude=1, codex=2, opencode=3, cursor-agent=4)
// ---------------------------------------------------------------------------
const BUILTIN_LANE = SUPPORTED_HARNESS_LANES[0]!;
const CLAUDE_LANE = SUPPORTED_HARNESS_LANES[1]!;
const CODEX_LANE = SUPPORTED_HARNESS_LANES[2]!;
const OPENCODE_LANE = SUPPORTED_HARNESS_LANES[3]!;
const CURSOR_AGENT_LANE = SUPPORTED_HARNESS_LANES[4]!;

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const NOW = "2026-06-15T00:00:00.000Z";

/**
 * Seed a minimal team + eligible PM agent + bet for the given lane.
 *
 * The PM agent's harnessType and modelProvider are set from `decompositionLaneMeta(lane)`
 * so the runtime request can select the adapter registered by `decompositionDepsForLane`.
 *
 * @lore bet-decomposition-real-agent: Without explicit harnessType/modelProvider on the PM agent,
 * the runtime can select the wrong harness lane. The per-lane pool registers adapters
 * with `type: "builtin"/"claude"/"codex"/"opencode"` and matching providers.
 * A harnessType mismatch → no eligible runtime adapter → blocked/failed.
 *
 * @lore bet-decomposition-real-agent: The PM agent must have `role: "product_manager"` so that
 * minimalStrategy.decomposeBet's role-match (`candidates.find(c => c.role ===
 * "product_manager")`) succeeds and returns a valid decomposerAgentId. This
 * is the real strategy's selection logic — no bespoke stand-in needed.
 */
async function seedDecompositionDomain(
	db: HyperIdleDb,
	suffix: string,
	lane: HarnessLane,
): Promise<{ betId: string; teamId: string; agentId: string }> {
	const teamId = `team-decomposition-${suffix}`;
	const memberId = `member-decomposition-${suffix}`;
	const agentId = `agent-decomposition-${suffix}`;
	const betId = `bet-decomposition-${suffix}`;
	const { harnessType, modelProvider } = decompositionLaneMeta(lane);

	await db.insert(teams).values({
		id: teamId,
		name: `Decomposition Team ${suffix}`,
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
	// harnessType/modelProvider set per-lane so runtime selection finds the adapter.
	// role=product_manager ensures minimalStrategy.decomposeBet returns this agent
	// via candidates.find(c => c.role === "product_manager").
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: `Decomposition Agent ${suffix}`,
		role: "product_manager",
		agentCategory: "team",
		teamId: memberId, // users.teamId references teamMembers.id
		status: "active",
		maxConcurrentSessions: 2,
		costActual: 0,
		harnessType,
		modelProvider,
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
	/**
	 * @lore opencode-xdg-isolation: opencode uses ~/.local/share/opencode/opencode.db
	 * (global SQLite). Without XDG_DATA_HOME isolation, rapid sequential opencode processes
	 * across this file's lanes can hit a write-lock → the second process hangs indefinitely.
	 * Mirrors the minimal-strategy-session.integration.test.ts isolation pattern.
	 * Only needed for opencode lane — gated on harnessName.
	 */
	let xdgDataHomeBefore: string | undefined;

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `real-bet-decomposition-${lane.harnessName}-`));
		if (lane.harnessName === "opencode") {
			// Isolate opencode's SQLite DB per-test to prevent write-lock hangs.
			xdgDataHomeBefore = process.env.XDG_DATA_HOME;
			process.env.XDG_DATA_HOME = path.join(tmpDir, ".opencode-data");
		}
	});

	afterEach(async () => {
		clearActiveStrategy();
		if (lane.harnessName === "opencode") {
			// Restore XDG_DATA_HOME to its pre-test value.
			if (xdgDataHomeBefore !== undefined) {
				process.env.XDG_DATA_HOME = xdgDataHomeBefore;
			} else {
				delete process.env.XDG_DATA_HOME;
			}
		}
		if (fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	// A real strategy agent produces the decomposition; tasks/edges are
	// asserted from that real output.
	//
	// Pinned assertion:
	//   decompositionStatus === "done"
	//   tasks.length >= 1
	//   tasks.every(t => t.title.trim().length >= 3)
	//
	// Fail-closed: a fake/empty/non-array model output → no task writeback
	// → decompositionStatus "blocked"/"empty", so BOTH
	// asserts below fail. This test cannot pass on fake/empty agent output.
	//
	// minimalStrategy.decomposeBet: candidates.find(c => c.role === "product_manager")
	// returns the seeded PM agent → decomposerAgentId is non-null → Kernel reaches
	// runtime decomposition request → real harness produces the task list.
	test("real agent decomposes a real bet — ≥1 persisted task with non-trivial title, bet done", async ({
		db,
		eventBus,
	}) => {
		setActiveStrategy(minimalStrategy);

		const { betId } = await seedDecompositionDomain(db, lane.harnessName, lane);

		const deps = decompositionDepsForLane(lane, { db, eventBus, tmpDir });

		await runBetDecomposition(deps, betId);

		// ── Mandatory pinned assertions: fail closed on empty or fake output ─────
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
// Tests — four-lane harness matrix
// Explicit per-lane describe blocks so the honest-harness-guard coverage check
// finds literal requireHarness("...") call expressions in the source.
// ---------------------------------------------------------------------------

describe(`${BUILTIN_LANE.describeTag} Bet decomposition — real agent turns a bet into tasks`, () => {
	requireHarness("builtin");
	makeLaneDescribe(BUILTIN_LANE);
});

describe(`${CLAUDE_LANE.describeTag} Bet decomposition — real agent turns a bet into tasks`, () => {
	requireHarness("claude");
	makeLaneDescribe(CLAUDE_LANE);
});

describe(`${CODEX_LANE.describeTag} Bet decomposition — real agent turns a bet into tasks`, () => {
	requireHarness("codex");
	makeLaneDescribe(CODEX_LANE);
});

describe(`${OPENCODE_LANE.describeTag} Bet decomposition — real agent turns a bet into tasks`, () => {
	requireHarness("opencode");
	makeLaneDescribe(OPENCODE_LANE);
});

describe(`${CURSOR_AGENT_LANE.describeTag} Bet decomposition — real agent turns a bet into tasks`, () => {
	requireHarness("cursor-agent");
	makeLaneDescribe(CURSOR_AGENT_LANE);
});
