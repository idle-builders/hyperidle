/**
 * User store reads: full-row getters (present + absent), id-batch
 * preservation, filter composition, in-transaction reads (a read passed a
 * live `tx` sees the same tx's uncommitted write), and the full-row
 * projection (no run-config fields — those live on `agent_run_config`).
 */

import { type HyperIdleDb, teams } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { findUser, insertUser, listUsers, setUserTeams } from "../user-store.js";

const NOW = "2026-01-01T00:00:00.000Z";

function userValues(id: string, extra: Record<string, unknown> = {}) {
	return {
		id,
		kind: "ai",
		name: `User ${id}`,
		role: "builder",
		status: "active",
		createdAt: NOW,
		...extra,
	};
}

async function seedTeam(db: HyperIdleDb, teamId: string): Promise<void> {
	await db.insert(teams).values({ id: teamId, name: `Team ${teamId}`, createdAt: NOW });
}

/** A user row in `teamId`'s team. */
async function insertInTeam(
	db: HyperIdleDb,
	teamId: string,
	values: ReturnType<typeof userValues>,
): Promise<void> {
	await insertUser(db, values);
	await setUserTeams(db, values.id, [teamId]);
}

describe("user-store reads", () => {
	test("findUser returns the row, or undefined when absent", async ({ db }) => {
		await insertUser(db, userValues("u1", { avatarUrl: "https://example.com/u1.png" }));
		const found = await findUser(db, { id: "u1" });
		expect(found?.id).toBe("u1");
		// Full-row getter returns the whole identity row, avatar included.
		expect(found?.avatarUrl).toBe("https://example.com/u1.png");
		expect(found?.teamIds).toEqual([]);
		expect(await findUser(db, { id: "missing" })).toBeUndefined();
	});

	test("listUsers with ids preserves the inArray set", async ({ db }) => {
		await insertUser(db, userValues("a"));
		await insertUser(db, userValues("b"));
		await insertUser(db, userValues("c"));
		const rows = await listUsers(db, { ids: ["a", "c"] });
		expect(rows.map((r) => r.id).sort()).toEqual(["a", "c"]);
	});

	test("listUsers with kind filters by kind", async ({ db }) => {
		await insertUser(db, userValues("ai1", { kind: "ai" }));
		await insertUser(db, userValues("hu1", { kind: "human" }));
		const humans = await listUsers(db, { kind: "human" });
		expect(humans.map((r) => r.id)).toEqual(["hu1"]);
	});

	test("listUsers with teamIds+kind+status filters active AI users and orders by id", async ({
		db,
	}) => {
		await seedTeam(db, "tm1");
		await insertInTeam(db, "tm1", userValues("z", { kind: "ai", status: "active" }));
		await insertInTeam(db, "tm1", userValues("a", { kind: "ai", status: "active" }));
		await insertInTeam(db, "tm1", userValues("r", { kind: "ai", status: "retired" }));
		const rows = await listUsers(db, {
			teamIds: ["tm1"],
			kind: "ai",
			status: "active",
			orderById: true,
		});
		expect(rows.map((r) => r.id)).toEqual(["a", "z"]);
	});

	test("findUser composes role, team, status, and exclusion predicates", async ({ db }) => {
		await seedTeam(db, "tm-role");
		await insertInTeam(db, "tm-role", userValues("self", { role: "reviewer", status: "active" }));
		await insertInTeam(db, "tm-role", userValues("peer", { role: "reviewer", status: "active" }));
		await insertInTeam(
			db,
			"tm-role",
			userValues("retired", { role: "reviewer", status: "retired" }),
		);

		const teammate = await findUser(db, {
			role: "reviewer",
			teamIds: ["tm-role"],
			status: "active",
			excludeId: "self",
		});
		expect(teammate?.id).toBe("peer");
	});

	test("listUsers nameContains is case-insensitive and escapes LIKE wildcards", async ({ db }) => {
		await insertUser(db, userValues("literal", { name: "Agent 100%_Ready" }));
		await insertUser(db, userValues("wildcard", { name: "Agent 100XXReady" }));

		const rows = await listUsers(db, { nameContains: "%_READY" });
		expect(rows.map((row) => row.id)).toEqual(["literal"]);
	});

	test("listUsers(kind:ai) returns the full identity row, and no run-config fields", async ({
		db,
	}) => {
		// `systemPrompt` and the other run-config fields live on
		// `agent_run_config` — `users` is purely the identity record.
		await insertUser(
			db,
			userValues("ag1", {
				kind: "ai",
				role: "builder",
				avatarUrl: "https://example.com/ag1.png",
			}),
		);
		const [row] = await listUsers(db, { kind: "ai" });
		expect(row).toBeDefined();
		// avatarUrl is present in the full User row (routes project only what they need)
		expect(row?.avatarUrl).toBe("https://example.com/ag1.png");
		expect(row && "systemPrompt" in row).toBe(false);
		expect(row && "harnessType" in row).toBe(false);
		expect(row && "maxConcurrentSessions" in row).toBe(false);
	});

	test("a read passed a live tx sees the same tx's uncommitted write", async ({ db }) => {
		await db.transaction(async (tx) => {
			await insertUser(tx as HyperIdleDb, userValues("intx"));
			const seen = await findUser(tx as HyperIdleDb, { id: "intx" });
			expect(seen?.id).toBe("intx");
		});
		// After commit the row is visible outside the tx too.
		expect(await findUser(db, { id: "intx" })).toBeDefined();
	});
});
