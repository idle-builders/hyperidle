/**
 * AU26 review W10 — identity and run config used to be created together, or
 * not at all, inside one `db.transaction`.
 *
 * AU31 §3.1 site 1 — INVERTED (founder ruling, architecture.md §3.1/§13
 * item 9). The seam write (`AgentOrchestrationPort.runConfig.write`) can
 * never join a caller's transaction — it is an HTTP round trip through the
 * composed app's own connection (§3.2) — so the two writes of
 * `POST /api/agents` (site 1: `insertUser` then `runConfig.write`) are no
 * longer atomic. This suite proves the named window each site's `@lore`
 * documents: the identity row survives a failed run-config write, resolving
 * `DEFAULT_AGENT_RUN_CONFIG` semantics (builtin, one concurrent session)
 * until the admin edit path repairs it.
 *
 * The fault is injected at the SECOND write only: the run-config store
 * throws, the identity insert is untouched. What is asserted is the real
 * HTTP path's effect on the real database — that the first write DOES
 * survive the second one failing.
 */

import { teams, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { afterAll, describe, expect, test } from "../../__testing__/test-fixtures.js";

// @lore shared-integration-workers: this fault-injection mock must replace
// an agent-run-config module that an earlier service file may already have loaded.
vi.hoisted(() => vi.resetModules());

const AGENT_NAME = "W10 Atomicity Agent";

vi.mock("@hyperidle/agent-run-config", async () => {
	const actual = await vi.importActual<typeof import("@hyperidle/agent-run-config")>(
		"@hyperidle/agent-run-config",
	);
	return {
		...actual,
		writeAgentRunConfig: async (): Promise<void> => {
			throw new Error("W10: run config write failed");
		},
	};
});

afterAll(() => {
	vi.doUnmock("@hyperidle/agent-run-config");
	vi.resetModules();
});

function authHeaders(): Record<string, string> {
	return { "Content-Type": "application/json" };
}

describe("creation is relinquished across identity and run config (AU31 §3.1 site 1)", () => {
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
});

/**
 * AU31 review B2 — `createTeam`'s own two writes (`teams`, `teamMembers`) are
 * core writes, not the cross-layer one §3.1 relinquishes; they were re-wrapped
 * in `db.transaction` (`teams-routes.ts`) after a review round found them
 * split apart. This proves the window they now close: a fault between the two
 * inserts must roll BOTH back, unlike the cross-layer window above.
 */
const TEAM_NAME_CORE_ATOMICITY = "B2 Core Atomicity Team";

// @lore AU44 B1: the two-table atomicity concern (teams + team_members) is
// gone after the fold — POST /teams now writes ONE row to `teams`. A single
// SQL INSERT is inherently atomic; no fault-injection test is needed.
describe("createTeam's single-table write is atomic (AU31 B2 — team_members dissolved)", () => {
	test("POST /api/teams: creates exactly one team row with no side effects", async ({
		db,
		app,
	}) => {
		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: TEAM_NAME_CORE_ATOMICITY }),
		});
		expect([200, 201]).toContain(res.status);
		const teamRows = await db
			.select()
			.from(teams)
			.where(eq(teams.name, TEAM_NAME_CORE_ATOMICITY));
		expect(teamRows).toHaveLength(1);
	});
});
