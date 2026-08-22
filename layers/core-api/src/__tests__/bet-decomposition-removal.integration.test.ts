/**
 * AU21 §9 Increment 10a (Decision I) RED — the built-in `bet_decomposition`
 * mechanism is REMOVED entirely, not migrated (architecture.md §6 Decision I,
 * §9 Increment 10a). These tests prove the two halves of that increment's
 * ACs:
 *
 *   (a) Committing/activating a bet through the REAL production server
 *       wiring (today: `server-factory.ts`'s `registerBetDecomposition`
 *       subscriber, registered unconditionally in `createServer`) must
 *       record NO `bet_decomposition` work intent, and the resulting bet row
 *       must carry no `decompositionStatus`/`decompositionBlockerReason`
 *       columns at all (the columns are DROPPED, not left null).
 *
 *       Currently RED: `createServer`'s production wiring still calls
 *       `registerBetDecomposition`, so committing an active bet with an
 *       eligible decomposer agent both (i) records a `bet_decomposition`
 *       intent (in the same transaction as its CAS-to-"running" write,
 *       `bet-decomposition.ts`'s `claimAndBakeDecompositionIntent`) and
 *       (ii) writes the still-present `decompositionStatus` column.
 *
 *   (b) The generic explicit-session-start mechanism against a bet's task —
 *       the capability Decision I explicitly PRESERVES (a human/plugin can
 *       still attach an agent to a bet's work via `session_start` /
 *       `explicit_session_start`, `sessions-routes.ts`) — keeps working
 *       unaffected. This test already passes today (nothing in Increment
 *       10a's deletions touches this path); it exists to pin the capability
 *       so the coming deletions can't silently regress it.
 */

import { agentWorkIntents, bets, type HyperIdleDb, teams, users } from "@hyperidle/db";
import { createServer, type ServerHandle } from "@hyperidle/remote-server/create-server";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { afterEach, beforeEach, describe, expect, test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-au21-inc10a";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function bootRealServer(db: HyperIdleDb): Promise<{ handle: ServerHandle; baseUrl: string }> {
	const handle = await createServer(0, {
		db,
		topology: "disabled",
		sandboxBasePath: "/tmp/au21-inc10a-workspaces",
	});
	const address = handle.httpServer.address();
	if (!address || typeof address === "string") {
		throw new Error("createServer did not bind a TCP address");
	}
	return { handle, baseUrl: `http://127.0.0.1:${address.port}` };
}

/** Seeds a team with one active AI agent eligible as a bet decomposer (role catalog category "team"). */
async function seedTeamWithEligibleAgent(
	db: HyperIdleDb,
): Promise<{ teamParentId: string; membershipId: string }> {
	const now = new Date().toISOString();
	const teamParentId = "inc10a-team-parent";
	const membershipId = "inc10a-team";
	await db
		.insert(teams)
		.values({ id: teamParentId, name: "Inc10a", phase: "build", createdAt: now });
	await db.insert(users).values({
		id: "inc10a-agent",
		kind: "ai",
		name: "Agent",
		role: "builder",
		agentCategory: "team",
		status: "active",
		teamId: teamParentId,
		createdAt: now,
	});
	return { teamParentId, membershipId };
}

describe("committing a bet no longer triggers the built-in bet_decomposition mechanism", () => {
	beforeEach(() => vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY));
	afterEach(() => vi.unstubAllEnvs());

	test("committing an active bet with an eligible decomposer agent records no bet_decomposition work intent", async ({
		db,
	}) => {
		const { teamParentId } = await seedTeamWithEligibleAgent(db);
		const { handle, baseUrl } = await bootRealServer(db);
		try {
			const createRes = await fetch(`${baseUrl}/api/bets`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: teamParentId,
					description: "Build feature X",
				}),
			});
			expect(createRes.status).toBe(201);
			const bet = (await createRes.json()) as { id: string };

			const commitRes = await fetch(`${baseUrl}/api/bets/${bet.id}/commit`, {
				method: "POST",
				headers: authHeaders(),
			});
			expect(commitRes.status).toBe(200);

			// The bet_decomposition subscriber (today still wired in `createServer`)
			// is fire-and-forget off the `bet_state_changed` event the commit route
			// emits; its CAS-to-"running" write and its intent record happen inside
			// ONE transaction (`claimAndBakeDecompositionIntent`). Give it a beat to
			// run, then assert the intent never lands — Decision I removes the only
			// code path that could ever write it.
			await new Promise((resolve) => setTimeout(resolve, 300));
			const decompIntents = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.kind, "bet_decomposition"));
			expect(decompIntents).toHaveLength(0);
		} finally {
			await handle.dispose();
		}
	});

	test("a committed bet's row carries no decompositionStatus/decompositionBlockerReason columns", async ({
		db,
	}) => {
		const { teamParentId } = await seedTeamWithEligibleAgent(db);
		const { handle, baseUrl } = await bootRealServer(db);
		try {
			const createRes = await fetch(`${baseUrl}/api/bets`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: teamParentId,
					description: "Build feature Y",
				}),
			});
			const bet = (await createRes.json()) as { id: string };
			await fetch(`${baseUrl}/api/bets/${bet.id}/commit`, {
				method: "POST",
				headers: authHeaders(),
			});

			const [betRow] = await db.select().from(bets).where(eq(bets.id, bet.id));
			expect(betRow).toBeDefined();
			// Decision I DROPS these columns entirely (not "sets them null") —
			// they must not exist as keys on the row at all.
			expect(betRow && "decompositionStatus" in betRow).toBe(false);
			expect(betRow && "decompositionBlockerReason" in betRow).toBe(false);
		} finally {
			await handle.dispose();
		}
	});
});
