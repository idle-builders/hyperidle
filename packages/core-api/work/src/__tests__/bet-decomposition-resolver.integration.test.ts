/**
 * AU21 Increment 3, bet_decomposition wave (RED) — architecture.md §6
 * Decision B's placement ruling: "`bet_decomposition` → extends
 * `packages/core-api/work/src/bet-decomposition.ts` in place (already the
 * emit site, `:263,456`)."
 *
 * This resolver must do EXACTLY what `resolveIntentInputInternal`'s
 * "bet_decomposition" case does today (`session-requests/src/service.ts:792-838`),
 * reading only `work`'s own `bets` table plus the already-injected
 * `teamCapacity` (→ `org`) and `users` ports (both ordinary same-layer
 * core-api edges, not against-grain):
 *   1. Load the bet; reject if it is not `status:"active"` AND
 *      `decompositionStatus:"running"`.
 *   2. Load the team's membership row (`teamCapacity.getByTeamId`).
 *   3. Union candidate agent ids from `membership.leadAgentId`,
 *      `membership.members` (JSON array), and `users.listUsersByTeam`
 *      (persisted FK membership) — deduped.
 *   4. Filter candidates to runnable AI agents (`kind==="ai" &&
 *      status==="active"` — NOTE: strictly `"active"`, NOT `"idle"`, unlike
 *      the shared ast-`<userId>` runnability invariant; an `"idle"` agent is
 *      excluded at THIS filter stage, before runnability is ever consulted).
 *   5. Prefer a `role==="product_manager"` candidate; else the first
 *      runnable candidate found. Reject if none.
 *   6. Validate the chosen target's runnability (the same-file
 *      `requireRunnableAgentViaUsersPort` adapter — reused, not
 *      re-implemented — per this file's own top `@lore` on why
 *      `bet-decomposition.ts` cannot statically import `@hyperidle/users`
 *      directly, Mechanism C).
 *   7. Bake: `defaultAgentId`, `sourceKind:"decomposition"`, `sourceId` (the
 *      bet id), `streamId: bet:<id>:decomposition`, `teamId`,
 *      `sourceCorrelation: {betId, teamId, decomposerAgentId}`.
 *
 * Currently RED: no `resolveBetDecompositionRequest` export exists anywhere
 * in `bet-decomposition.ts` (nor from its barrel, `@hyperidle/work`) — this
 * import fails to resolve at runtime (dynamic `import()` succeeds — the file
 * exists — but the destructured named export is `undefined`, so calling it
 * throws `TypeError: ... is not a function`).
 *
 * @lore naming: the architecture doc does not pin an exact export name for
 * this new resolver — `resolveBetDecompositionRequest` is this wave's
 * best-guess interpretation (mirrors `resolveTaskRunRequest`/
 * `resolveSessionStartRequest`'s naming), flagged for reviewer confirmation.
 *
 * @lore CONFUSION (flagged for reviewer): unlike `task_run`/`session_start`,
 * this resolver's candidate-selection algorithm is INDEPENDENT of the
 * `agentSelection.selectAgent(surface:"bet_decomposer", roleHint:
 * "product_manager")` pick `runBetDecomposition` already makes earlier in
 * the same function (bound to the `pm` variable, used as `requestedBy` and
 * as the real PM turn's actor). This resolver re-derives its OWN target via
 * the literal team-membership-scan algorithm the drain used to run —
 * intentionally, because the task brief says "does exactly what
 * resolveIntentInputInternal's case does today," and that IS a materially
 * different algorithm from `agentSelection.selectAgent`. Moving the
 * resolution to emit time collapses the drain's hidden re-read into ONE
 * decision made once, at emit — it does not unify it with the pre-existing
 * `agentSelection` pick (a separate, pre-existing selection concept this WP
 * does not touch). Proceeding with a literal translation of the drain's
 * algorithm, not a reuse of `pm`.
 */

import { bets, type HyperIdleDb, teamMembers, teams, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";

async function seedTeamAndMembership(
	db: HyperIdleDb,
	options: {
		readonly teamId: string;
		readonly membershipId: string;
		readonly leadAgentId?: string | null;
		readonly membersJson?: readonly string[] | null;
	},
): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: options.teamId, name: options.teamId, phase: "build", createdAt: now });
	await db.insert(teamMembers).values({
		id: options.membershipId,
		teamId: options.teamId,
		leadAgentId: options.leadAgentId ?? null,
		members: options.membersJson ? JSON.stringify(options.membersJson) : null,
		capacity: 5,
		activeBets: 0,
		formedAt: now,
	});
}

async function seedBet(
	db: HyperIdleDb,
	options: {
		readonly betId: string;
		readonly teamId: string;
		readonly status?: string;
		readonly decompositionStatus?: "running" | "done" | "blocked" | null;
	},
): Promise<void> {
	await db.insert(bets).values({
		id: options.betId,
		teamId: options.teamId,
		description: "Bet decomposition resolver bet",
		status: options.status ?? "active",
		// @lore fixed during GREEN phase: `?? "running"` treated an explicit
		// `null` (test 5's whole point — "decompositionStatus is not
		// 'running'") the same as `undefined`, silently defaulting it back to
		// "running" and defeating that test's own seed. `"decompositionStatus"
		// in options` distinguishes "caller passed null on purpose" from
		// "caller omitted the field".
		decompositionStatus: "decompositionStatus" in options ? options.decompositionStatus : "running",
		createdAt: new Date().toISOString(),
	});
}

async function seedAgent(
	db: HyperIdleDb,
	id: string,
	options: {
		readonly role?: string;
		readonly kind?: string;
		readonly status?: string;
		readonly teamId?: string;
	} = {},
): Promise<void> {
	await db.insert(users).values({
		id,
		kind: options.kind ?? "ai",
		name: `Agent ${id}`,
		role: options.role ?? "builder",
		status: options.status ?? "active",
		teamId: options.teamId ?? null,
		createdAt: new Date().toISOString(),
	});
}

/** Structural deps this wave's resolver is expected to accept — see this file's top `@lore`. */
function buildDeps(_db: HyperIdleDb) {
	return {
		teamCapacity: {
			getByTeamId: async (execDb: HyperIdleDb, teamId: string) => {
				const [row] = await execDb
					.select()
					.from(teamMembers)
					.where(eq(teamMembers.teamId, teamId))
					.limit(1);
				return row;
			},
			setActiveBets: async (): Promise<void> => {
				/* unused by this resolver */
			},
		},
		users: {
			getUserById: async (execDb: HyperIdleDb, id: string) => {
				const [row] = await execDb.select().from(users).where(eq(users.id, id)).limit(1);
				return row;
			},
			listActiveAiUsersByTeams: async (): Promise<never[]> => [],
			listUsersByTeam: async (execDb: HyperIdleDb, teamMembersId: string) => {
				return execDb.select().from(users).where(eq(users.teamId, teamMembersId));
			},
		},
	};
}

describe("resolveBetDecompositionRequest — emit-time bet_decomposition resolver (work)", () => {
	test("bakes the full request, preferring a product_manager candidate over an earlier-listed non-PM candidate", async ({
		db,
	}) => {
		const { resolveBetDecompositionRequest } = await import("../bet-decomposition.js");
		await seedTeamAndMembership(db, {
			teamId: "team-bdec-1",
			membershipId: "tm-bdec-1",
		});
		await seedAgent(db, "builder-bdec-1", { role: "builder", teamId: "tm-bdec-1" });
		await seedAgent(db, "pm-bdec-1", { role: "product_manager", teamId: "tm-bdec-1" });
		await seedBet(db, { betId: "bet-bdec-1", teamId: "team-bdec-1" });

		const baked = await resolveBetDecompositionRequest(db, "bet-bdec-1", buildDeps(db));

		expect(baked).toMatchObject({
			defaultAgentId: "pm-bdec-1",
			sourceKind: "decomposition",
			sourceId: "bet-bdec-1",
			streamId: "bet:bet-bdec-1:decomposition",
			teamId: "team-bdec-1",
			sourceCorrelation: {
				betId: "bet-bdec-1",
				teamId: "team-bdec-1",
				decomposerAgentId: "pm-bdec-1",
			},
		});
	});

	test("falls back to the first runnable candidate when no product_manager is present", async ({
		db,
	}) => {
		const { resolveBetDecompositionRequest } = await import("../bet-decomposition.js");
		await seedTeamAndMembership(db, {
			teamId: "team-bdec-2",
			membershipId: "tm-bdec-2",
		});
		await seedAgent(db, "builder-bdec-2", { role: "builder", teamId: "tm-bdec-2" });
		await seedBet(db, { betId: "bet-bdec-2", teamId: "team-bdec-2" });

		const baked = await resolveBetDecompositionRequest(db, "bet-bdec-2", buildDeps(db));

		expect(baked.defaultAgentId).toBe("builder-bdec-2");
	});

	test("candidates are unioned from leadAgentId + the membership JSON array + persisted FK membership, deduped", async ({
		db,
	}) => {
		const { resolveBetDecompositionRequest } = await import("../bet-decomposition.js");
		await seedAgent(db, "lead-bdec-3", { role: "builder" });
		await seedTeamAndMembership(db, {
			teamId: "team-bdec-3",
			membershipId: "tm-bdec-3",
			leadAgentId: "lead-bdec-3",
			membersJson: ["lead-bdec-3"], // deliberately overlaps the lead — must dedup, not error
		});
		await seedAgent(db, "pm-bdec-3", { role: "product_manager", teamId: "tm-bdec-3" });
		await seedBet(db, { betId: "bet-bdec-3", teamId: "team-bdec-3" });

		const baked = await resolveBetDecompositionRequest(db, "bet-bdec-3", buildDeps(db));

		// The FK-membership-only PM candidate must still be found (not just the
		// lead/JSON-listed non-PM), proving the three sources are genuinely unioned.
		expect(baked.defaultAgentId).toBe("pm-bdec-3");
	});

	test("rejects when the bet is not active", async ({ db }) => {
		const { resolveBetDecompositionRequest } = await import("../bet-decomposition.js");
		await seedTeamAndMembership(db, { teamId: "team-bdec-4", membershipId: "tm-bdec-4" });
		await seedAgent(db, "pm-bdec-4", { role: "product_manager", teamId: "tm-bdec-4" });
		await seedBet(db, {
			betId: "bet-bdec-4",
			teamId: "team-bdec-4",
			status: "draft",
			decompositionStatus: "running",
		});

		await expect(resolveBetDecompositionRequest(db, "bet-bdec-4", buildDeps(db))).rejects.toThrow();
	});

	test("rejects when the bet's decompositionStatus is not 'running'", async ({ db }) => {
		const { resolveBetDecompositionRequest } = await import("../bet-decomposition.js");
		await seedTeamAndMembership(db, { teamId: "team-bdec-5", membershipId: "tm-bdec-5" });
		await seedAgent(db, "pm-bdec-5", { role: "product_manager", teamId: "tm-bdec-5" });
		await seedBet(db, {
			betId: "bet-bdec-5",
			teamId: "team-bdec-5",
			status: "active",
			decompositionStatus: null,
		});

		await expect(resolveBetDecompositionRequest(db, "bet-bdec-5", buildDeps(db))).rejects.toThrow();
	});

	test("rejects when no runnable candidate exists (no membership row at all)", async ({ db }) => {
		const { resolveBetDecompositionRequest } = await import("../bet-decomposition.js");
		const now = new Date().toISOString();
		await db
			.insert(teams)
			.values({ id: "team-bdec-6", name: "team-bdec-6", phase: "build", createdAt: now });
		await seedBet(db, { betId: "bet-bdec-6", teamId: "team-bdec-6" });

		await expect(resolveBetDecompositionRequest(db, "bet-bdec-6", buildDeps(db))).rejects.toThrow();
	});

	test("an 'idle' AI candidate is excluded at the candidate filter — not treated as runnable", async ({
		db,
	}) => {
		const { resolveBetDecompositionRequest } = await import("../bet-decomposition.js");
		await seedTeamAndMembership(db, { teamId: "team-bdec-7", membershipId: "tm-bdec-7" });
		await seedAgent(db, "idle-pm-bdec-7", {
			role: "product_manager",
			status: "idle",
			teamId: "tm-bdec-7",
		});
		await seedBet(db, { betId: "bet-bdec-7", teamId: "team-bdec-7" });

		// The only candidate is "idle" — the resolver's candidate filter requires
		// strictly "active" (unlike the shared runnability invariant, which
		// treats "idle" as runnable) — so this must reject as "no runnable target".
		await expect(resolveBetDecompositionRequest(db, "bet-bdec-7", buildDeps(db))).rejects.toThrow();
	});

	test("rejects a candidate that resolves but is not kind:'ai' (human teammate)", async ({
		db,
	}) => {
		const { resolveBetDecompositionRequest } = await import("../bet-decomposition.js");
		await seedTeamAndMembership(db, {
			teamId: "team-bdec-8",
			membershipId: "tm-bdec-8",
			leadAgentId: "human-bdec-8",
		});
		await seedAgent(db, "human-bdec-8", { role: "founder", kind: "human", teamId: "tm-bdec-8" });
		await seedBet(db, { betId: "bet-bdec-8", teamId: "team-bdec-8" });

		await expect(resolveBetDecompositionRequest(db, "bet-bdec-8", buildDeps(db))).rejects.toThrow();
	});
});
