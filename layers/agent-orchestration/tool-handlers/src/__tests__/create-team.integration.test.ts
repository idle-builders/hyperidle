/**
 * AU44 B1 — create_team tool integration test against a real DB.
 *
 * Prior to AU44 the tool generated two separate UUIDs: `teamId` (inserted into
 * `teams`) and `teamMembersId` (passed to `persistScaffoldedAgents`). After the
 * fold there is no `team_members` table, so `persistScaffoldedAgents` sets
 * `users.teamId = teamMembersId`, but the only row in `teams` has `id = teamId`.
 * That is a foreign-key violation on every `create_team` tool call.
 *
 * This test drives the tool against a real PGlite DB and asserts that:
 *   (1) The call succeeds (no FK violation, no thrown error).
 *   (2) The scaffolded agents all carry `teamId` equal to the created `teams.id`.
 *
 * Stub-port unit tests cannot catch this class of bug because they never touch
 * the real FK constraint. An integration test against a real DB is the only
 * mechanical proof.
 */

import * as os from "node:os";
import * as path from "node:path";
import {
	agentRunConfig,
	type HyperIdleDb,
	type NewAgentRunConfigRow,
	type NewUser,
	teams,
	users,
} from "@hyperidle/db";
import { createTestDb, type TestDbHandle } from "@hyperidle/db/testing";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/harness-protocol";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolHandlersPorts } from "../ports.js";
import { buildToolDefinitions } from "../tool-definitions.js";
import { STUB_TOOL_HANDLERS_PORTS } from "./stub-ports.js";

/**
 * Module-level mutable db handle closed over by the port fakes — assigned
 * fresh per test in `beforeEach` so each test gets a clean database.
 */
let sharedDb: HyperIdleDb;

/**
 * Minimal real-DB port implementation for the create_team flow.
 *
 * Only the methods the tool actually calls are wired to real DB operations.
 * Everything else stays the "throw if called" stub so accidental invocations
 * fail loudly.
 *
 * `provisionTeamRoutines` is a no-op: it would require the routine table to be
 * seeded and is orthogonal to the FK-correctness this test proves.
 */
const ports: ToolHandlersPorts = {
	...STUB_TOOL_HANDLERS_PORTS,
	coreApi: {
		...STUB_TOOL_HANDLERS_PORTS.coreApi,

		/** Insert the `teams` row — mirrors what org's createTeam does. */
		createTeam: async (input) => {
			await sharedDb.insert(teams).values({
				id: input.id,
				name: input.name,
				phase: input.phase,
				functions: input.functions,
				factoryDbPath: input.factoryDbPath,
				createdAt: input.createdAt,
				capacity: 5,
				activeBets: 0,
				formedAt: input.createdAt,
			});
		},

		/**
		 * Stub for the widened seam: resolve-then-persist, all driven by the
		 * request. Inserts one agent with teamId = teamMembersId to prove FK
		 * correctness (the actual implementation resolves specs in core-api).
		 *
		 * @lore AU44 B1: This is the seam that catches the FK bug. Before the
		 * fix, `teamMembersId` was a different UUID from `teamId`, causing every
		 * insert here to violate `users.teamId → teams.id ON DELETE RESTRICT`.
		 * @lore AU44 AU20-fd: renamed from persistScaffoldedAgents; stub now
		 * accepts the full request shape (no pre-resolved specs).
		 */
		scaffoldFromRequest: async (teamMembersId, _trigger, _teamName, _functions, role, name) => {
			const now = new Date().toISOString();
			const agentId = `agent-${crypto.randomUUID()}`;

			const userRow: NewUser = {
				id: agentId,
				kind: "ai",
				name: name ?? "Test Agent",
				role: role ?? "assistant",
				// @lore AU44 B1: this is what proves FK correctness — teamMembersId
				// must equal the teams.id inserted by createTeam above.
				teamId: teamMembersId,
				status: "active",
				createdAt: now,
			};
			await sharedDb.insert(users).values(userRow);

			const configRow: NewAgentRunConfigRow = {
				agentUserId: agentId,
				systemPrompt: null,
				harnessType: "builtin",
				modelId: "claude-sonnet-4-6",
				modelProvider: "anthropic",
				maxConcurrentSessions: 1,
				modelTierPreference: null,
			};
			await sharedDb
				.insert(agentRunConfig)
				.values(configRow)
				.onConflictDoUpdate({
					target: agentRunConfig.agentUserId,
					set: { harnessType: "builtin" },
				});

			return { agentIds: [agentId], leadAgentId: agentId };
		},

		/** Query users by teamId — mirrors the real listUsersByTeam behaviour. */
		listUsersByTeam: async (teamMembersId) => {
			const rows = await sharedDb
				.select({ id: users.id, name: users.name, role: users.role })
				.from(users)
				.where(eq(users.teamId, teamMembersId));
			return rows;
		},

		/** Update team-owned columns — mirrors org's updateTeam. */
		updateTeam: async (teamId, patch) => {
			if (Object.keys(patch).length > 0) {
				await sharedDb.update(teams).set(patch).where(eq(teams.id, teamId));
			}
		},

		/** No-op: routine provisioning is orthogonal to FK correctness. */
		provisionTeamRoutines: async () => {},
	},
};

const createTeamTool = buildToolDefinitions(ports).find((t) => t.name === "create_team")!;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(db: HyperIdleDb, eventBus: EventBus): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus,
		agentId: "agent-test",
		sessionId: "session-au44-create-team",
		taskId: "task-au44",
		sandboxPath: path.join(os.tmpdir(), `hi-au44-create-team-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("create_team tool — AU44 B1 FK correctness", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		sharedDb = db;
		eventBus = new EventBus();
	});

	afterEach(async () => {
		await handle.close();
	});

	it("succeeds without a FK violation — agents carry teamId = teams.id", async () => {
		const result = await createTeamTool.handler(
			{ name: "AU44 Test Team", functions: ["development", "product"] },
			makeContext(db, eventBus),
		);

		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as {
			teamId: string;
			teamMembersId: string;
			agentIds: string[];
		};

		// (1) teamMembersId must equal teamId after the fold.
		expect(data.teamMembersId).toBe(data.teamId);

		// (2) The teams row exists.
		const [teamRow] = await db
			.select({ id: teams.id })
			.from(teams)
			.where(eq(teams.id, data.teamId));
		expect(teamRow).toBeDefined();

		// (3) Every scaffolded agent's teamId references the teams row — proves no FK violation.
		expect(data.agentIds.length).toBeGreaterThan(0);
		for (const agentId of data.agentIds) {
			const [userRow] = await db
				.select({ teamId: users.teamId })
				.from(users)
				.where(eq(users.id, agentId));
			expect(userRow).toBeDefined();
			expect(userRow?.teamId).toBe(data.teamId);
		}
	});

	it("emits team_created event with teamId = teamMembersId", async () => {
		const events: unknown[] = [];
		eventBus.on("team_created", (e) => events.push(e));

		const result = await createTeamTool.handler(
			{ name: "Event Team", functions: ["development"] },
			makeContext(db, eventBus),
		);

		expect(result.success).toBe(true);
		expect(events).toHaveLength(1);

		const evt = events[0] as { teamId: string; teamMembersId: string };
		expect(evt.teamId).toBe(evt.teamMembersId);
	});
});
