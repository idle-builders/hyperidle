/**
 * AU21 Increment 1 — RED phase.
 *
 * Migrates `create_bet` (packages/agent-orchestration/tool-handlers/src/
 * tool-definitions.ts) off the raw `ports.work.createBet(ctx.db, {...})` DI
 * call onto the `CoreApiPort` write seam (architecture.md §9 Increment 1,
 * §13 migrations). Two things must both be true once this increment is
 * GREEN:
 *
 *  1. The raw `createBet` binding is GONE — `ToolHandlersWorkAccessor` no
 *     longer declares it (packages/agent-orchestration/tool-handlers/src/
 *     ports.ts) and `tool-handlers-bindings.ts:180`'s
 *     `createBet: (exec, input) => work.create(exec, "bet", input)` is
 *     deleted. Proven here as a runtime structural assertion on the REAL
 *     exported `toolHandlersPorts` object (not a grep/file-read — see
 *     .claude/rules/testing.md).
 *  2. `create_bet`'s tool handler now goes through `CoreApiPort`, i.e.
 *     through the SAME `POST /bets` route + middleware a human caller uses.
 *     Proven by a REAL, observable behavioral difference the raw DI path
 *     never produced: the real route seeds `revisionLog` with a "Bet
 *     created" audit entry whose `actor` is `c.get("userId")` (bets.ts
 *     :580-621) — the OLD tool handler's raw insert never sets
 *     `revisionLog` at all. A bet created through the seam must carry that
 *     audit entry, attributed to the calling agent (ctx.agentId) — not
 *     null, not a hardcoded constant.
 *
 * `registerCoreApiTransport` / `createInProcessCoreApiTransport` (the
 * seam's composition-root wiring) do not exist yet, and `toolHandlersPorts`
 * does not yet expose a `coreApi` accessor, and `tool-definitions.ts`'s
 * `create_bet` handler has not been migrated yet — every test below is RED
 * for the right reason (missing implementation, not a typo).
 */

import { bets, teamMembers, teams, users } from "@hyperidle/db";
import { buildToolDefinitions } from "@hyperidle/tool-handlers";
import { eq } from "drizzle-orm";
import {
	createInProcessCoreApiTransport,
	registerCoreApiTransport,
} from "../services/core-api-port-composition.js";
import { toolHandlersPorts } from "../services/tool-handlers-bindings.js";
import { describe, expect, test, vi } from "../test-fixtures.js";
import { makeContext, NOW } from "./_helpers.js";

async function seedTeam(db: Parameters<typeof makeContext>[0]): Promise<{ teamId: string }> {
	const teamId = `team-migrate-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const teamMembersId = `tm-migrate-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	await db
		.insert(teams)
		.values({ id: teamId, name: "Migration Team", phase: "build", createdAt: NOW });
	await db.insert(teamMembers).values({
		id: teamMembersId,
		teamId,
		capacity: 5,
		activeBets: 0,
		formedAt: NOW,
	});
	return { teamId };
}

describe("create_bet tool — CoreApiPort migration", () => {
	test("the raw createBet DI port no longer exists on ToolHandlersPorts.work", () => {
		expect(Object.hasOwn(toolHandlersPorts.work, "createBet")).toBe(false);
	});

	test("create_bet routes through CoreApiPort — a real bet lands via the real POST /bets route, revisionLog attributed to the calling agent", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "migration-test-key");
		const { teamId } = await seedTeam(db);

		const agentId = "agent-seam-migration";
		await db.insert(users).values({
			id: agentId,
			kind: "ai",
			name: "Seam Migration Agent",
			role: "engineer",
			status: "active",
			maxConcurrentSessions: 1,
			createdAt: NOW,
		});

		// Wire the module-level toolHandlersPorts.coreApi factory to THIS test's
		// real app instance — the production equivalent of server-factory.ts
		// registering the boot-time app once.
		registerCoreApiTransport(createInProcessCoreApiTransport(app));

		const createBetTool = buildToolDefinitions(toolHandlersPorts).find(
			(t) => t.name === "create_bet",
		)!;

		const result = await createBetTool.handler(
			{ teamId, description: "Migrated through the seam" },
			makeContext(db, { agentId }),
		);

		expect(result.success).toBe(true);
		if (!result.success) return;

		const betId = (result.data as { betId: string }).betId;
		const [row] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
		expect(row).toBeDefined();
		expect(row?.description).toBe("Migrated through the seam");
		expect(row?.status).toBe("draft");

		// The raw DI path (`work.create(exec, "bet", input)`) never wrote
		// revisionLog at all — only the real POST /bets route does. Its
		// presence, attributed to the calling agent, proves this write
		// travelled through the seam's route+middleware, not the deleted DI call.
		expect(row?.revisionLog).not.toBeNull();
		const log = JSON.parse(row?.revisionLog ?? "[]") as Array<Record<string, unknown>>;
		const creationEntry = log.find(
			(entry) => entry.field === "status" && entry.new_value === "draft",
		);
		expect(creationEntry).toBeDefined();
		expect(creationEntry?.actor).toBe(agentId);
	});
});
