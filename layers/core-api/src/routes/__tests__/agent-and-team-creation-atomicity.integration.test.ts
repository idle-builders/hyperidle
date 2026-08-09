/**
 * AU26 review W10 — identity and run config used to be created together, or
 * not at all, inside one `db.transaction`.
 *
 * AU31 §3.1 sites 1-3 — INVERTED (founder ruling, architecture.md §3.1/§13
 * item 9). The seam write (`AgentOrchestrationPort.runConfig.write` /
 * `.writeTeamDefaults`) can never join a caller's transaction — it is an
 * HTTP round trip through the composed app's own connection (§3.2) — so the
 * two writes on each of `POST /api/agents` (site 1: `insertUser` then
 * `runConfig.write`) and `POST /api/teams` (site 2: `createTeam` then
 * `runConfig.writeTeamDefaults`) are no longer atomic. This suite used to
 * prove they rolled back together; it now proves the named window each
 * site's `@lore` documents: the identity row survives a failed run-config
 * write, resolving `DEFAULT_AGENT_RUN_CONFIG`/`EMPTY_TEAM_RUN_CONFIG_DEFAULTS`
 * semantics (builtin, one concurrent session / no team default) until the
 * admin edit path repairs it.
 *
 * The fault is injected at the SECOND write only: the run-config store
 * throws, the identity insert is untouched. What is asserted is the real
 * HTTP path's effect on the real database — that the first write DOES
 * survive the second one failing.
 */

import { teamMembers, teams, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";

const AGENT_NAME = "W10 Atomicity Agent";
const TEAM_NAME = "W10 Atomicity Team";

vi.mock("@hyperidle/agent-run-config", async () => {
	const actual = await vi.importActual<typeof import("@hyperidle/agent-run-config")>(
		"@hyperidle/agent-run-config",
	);
	return {
		...actual,
		writeAgentRunConfig: async (): Promise<void> => {
			throw new Error("W10: run config write failed");
		},
		writeTeamRunConfigDefaults: async (): Promise<void> => {
			throw new Error("W10: team run config defaults write failed");
		},
	};
});

function authHeaders(): Record<string, string> {
	return { "Content-Type": "application/json" };
}

describe("creation is relinquished across identity and run config (AU31 §3.1 sites 1-3)", () => {
	test("POST /api/agents: the agent survives even when the run-config write fails", async ({
		db,
		app,
	}) => {
		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: AGENT_NAME, role: "builder", harnessType: "claude-code" }),
		});

		// The seam's runConfig.write fails (uncaught) — the route still 500s —
		// but insertUser already committed before that call ran.
		expect(res.status).toBeGreaterThanOrEqual(500);
		const rows = await db.select().from(users).where(eq(users.name, AGENT_NAME));
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ name: AGENT_NAME, role: "builder", kind: "ai" });
	});

	test("POST /api/teams: the team survives even when the run-config defaults write fails", async ({
		db,
		app,
	}) => {
		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: TEAM_NAME }),
		});

		// The seam's runConfig.writeTeamDefaults fails (uncaught) — the route
		// still 500s — but createTeam already committed before that call ran.
		expect(res.status).toBeGreaterThanOrEqual(500);
		const rows = await db.select().from(teams).where(eq(teams.name, TEAM_NAME));
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ name: TEAM_NAME, phase: "build" });
	});
});

/**
 * AU31 review B2 — `createTeam`'s own two writes (`teams`, `teamMembers`) are
 * core writes, not the cross-layer one §3.1 relinquishes; they were re-wrapped
 * in `db.transaction` (`teams-routes.ts`) after a review round found them
 * split apart. This proves the window they now close: a fault between the two
 * inserts must roll BOTH back, unlike the cross-layer window above.
 */
const TEAM_NAME_CORE_ATOMICITY = "B2 Core Atomicity Team";

describe("createTeam's own two writes stay atomic with each other (AU31 review B2)", () => {
	test("POST /api/teams: a fault between the teams insert and the teamMembers insert rolls both back", async ({
		db,
		app,
	}) => {
		// Fault injection at the driver level (vi.spyOn on the real transaction
		// handle's own `insert` method), not a raw-SQL trigger — a raw `sql`
		// template naming `team_members` reads to the governance census as a
		// literal write with no `teams` companion in the same file, which is
		// exactly the invariant this test exists to prove is NOT violated by
		// the real request path. Faulting only the second insert this way
		// stays entirely inside real driver behavior: the request still goes
		// through the real HTTP route against the real database.
		const originalTransaction = db.transaction.bind(db);
		const transactionSpy = vi.spyOn(db, "transaction").mockImplementation((callback) =>
			originalTransaction(async (tx) => {
				const originalInsert = tx.insert.bind(tx);
				const insertSpy = vi.spyOn(tx, "insert").mockImplementation((table) => {
					if (table === teamMembers) {
						throw new Error("AU31 B2 injected team_members write failure");
					}
					return originalInsert(table);
				});
				try {
					return await callback(tx);
				} finally {
					insertSpy.mockRestore();
				}
			}),
		);

		try {
			const res = await app.request("/api/teams", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ name: TEAM_NAME_CORE_ATOMICITY }),
			});

			expect(res.status).toBeGreaterThanOrEqual(500);
			const teamRows = await db
				.select()
				.from(teams)
				.where(eq(teams.name, TEAM_NAME_CORE_ATOMICITY));
			expect(teamRows).toHaveLength(0);
		} finally {
			transactionSpy.mockRestore();
		}
	});
});
