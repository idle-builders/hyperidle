/**
 * AU26 review W10 — identity and run config are created together, or not at all.
 *
 * The G1 column move turned one insert into two unwrapped writes on three
 * paths: `POST /api/agents` (`insertUser` then `writeAgentRunConfig`),
 * `POST /api/teams` (`createTeam` then `writeTeamRunConfigDefaults`) and the
 * assistant stub in the same handler. A failure between them leaves an agent
 * whose run config silently resolves the all-null default — builtin, one
 * concurrent session — instead of the harness the caller asked for. Nothing
 * fails loudly; the agent simply runs on the wrong harness forever.
 *
 * The fault is injected at the SECOND write only: the run-config store throws,
 * the identity insert is untouched. What is asserted is the real HTTP path's
 * effect on the real database — that the first write does not survive the
 * second one failing. Both stores already take a `WriteExecutor`, so the fix is
 * one `db.transaction`.
 */

import { teams, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { describe, expect, test } from "../../test-fixtures.js";

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

describe("creation is atomic across identity and run config", () => {
	test("POST /api/agents leaves no agent behind when the run-config write fails", async ({
		db,
		app,
	}) => {
		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: AGENT_NAME, role: "builder", harnessType: "claude-code" }),
		});

		expect(res.status).toBeGreaterThanOrEqual(500);
		// No half-created agent: an identity row with no run config resolves the
		// all-null default (builtin, 1 session), not the claude-code that was asked for.
		expect(await db.select().from(users).where(eq(users.name, AGENT_NAME))).toEqual([]);
	});

	test("POST /api/teams leaves no team behind when the run-config defaults write fails", async ({
		db,
		app,
	}) => {
		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: TEAM_NAME }),
		});

		expect(res.status).toBeGreaterThanOrEqual(500);
		expect(await db.select().from(teams).where(eq(teams.name, TEAM_NAME))).toEqual([]);
	});
});
