/**
 * AU21 Increment 3, bet_decomposition wave (RED) — protected proof obligation
 * named explicitly in this wave's brief, mirroring the precedent set by the
 * sibling `agent-run-admission-failed-task-run-migration.integration.test.ts`
 * (session_start + task_run wave): "the bet_decomposition-related subscriber
 * (Wave 0's `markTerminal(betId,'blocked','failed')` reaction) must actually
 * fire on a real terminal admission failure for this kind now that it's
 * migrated."
 *
 * Wave 0's own `agent-run-admission-failed-subscribers.integration.test.ts`
 * proves the REACTION exists — but its `bet_decomposition` scenario
 * deliberately forces the failure through the STILL-PRESENT
 * `resolveIntentInputInternal` "bet_decomposition" case (a bare, unbaked
 * intent against a bet whose `decompositionStatus` was left `null` —
 * `InvalidAgentWorkSourceError`) — the exact mechanism THIS wave deletes.
 * That test is not proof the reaction still fires once the intent carries a
 * REAL baked payload produced by the REAL migrated emit call site
 * (`bet-decomposition.ts`'s `runBetDecomposition`).
 *
 * This file drives the real, already-migrated-by-this-wave emit call site —
 * the `bet_state_changed(toState:"active")` subscriber `registerBetDecomposition`
 * — to create a REAL `bet_decomposition` intent, then forces a genuine
 * drain-time failure — a real Postgres trigger rejecting the
 * `agent_session_requests` insert (the same fault-injection idiom
 * `agent-work-intent-production.integration.test.ts`'s `rejectIntentWrites`
 * already uses for `agent_work_intents`, applied to the sibling table here,
 * same as the task_run migration test) — forced terminal on the first
 * attempt via `maxAttempts: 1`. This is a legitimate downstream failure class
 * for an ALREADY-validly-baked payload: with zero re-validation at drain
 * (Decision B step 2), the only way a baked `bet_decomposition` intent can
 * still fail pre-handoff is a genuine infra/DB fault at the hand-off write
 * itself — exactly what this trigger simulates.
 *
 * @lore CONFUSION (resolved while writing this test, flagged for reviewer):
 * `registerBetDecomposition` is a `serviceBootstrap`-only registration
 * (`server-factory.ts:890`), NOT something the plain `createApp` this
 * package's `app` fixture builds ever wires (`test-fixtures.ts`'s own
 * top comment: "the plain `createApp` ... does NOT invoke [serviceBootstrap]" —
 * that applies to EVERY `serviceBootstrap`-only registration, not only the
 * `agent_run_admission_failed` reactions it calls out by name). This test
 * therefore wires `registerBetDecomposition` itself with real production
 * ports — the exact same pattern `packages/core-api/src/__tests__/
 * bet-decomposition.test.ts`'s `productionPorts` + `triggerBetDecomposition`
 * already use — rather than relying on the `app` fixture for it. The `app`
 * fixture is not used at all in this file (no HTTP route is the emit site
 * for `bet_decomposition` — the emit site is the `bet_state_changed`
 * subscriber itself).
 *
 * Currently RED: `bet-decomposition.ts`'s emit call site does not yet bake a
 * payload (this wave's GREEN phase adds it), so the emitted intent's
 * `bakedRequestJson` is null — asserted directly below as the first, cheapest
 * RED signal — meaning the drain still runs the (still-present) per-kind
 * `resolveIntentInputInternal` "bet_decomposition" case, not the baked
 * hand-off path this test targets.
 */

import { createAgentSelectionService } from "@hyperidle/agent-selection";
import { agentWorkIntents, bets, type HyperIdleDb, teamMembers, teams, users } from "@hyperidle/db";
import { getTeamMembers, updateTeam } from "@hyperidle/org";
import { drainIntents, enqueueWorkIntent } from "@hyperidle/session-requests";
import type { AgentRunAdmissionFailedEvent } from "@hyperidle/shared";
import { findUser, listUsers } from "@hyperidle/users";
import type { BetDecompositionDeps, WorkDeps } from "@hyperidle/work";
import { registerBetDecomposition } from "@hyperidle/work";
import { eq, sql } from "drizzle-orm";
import { describe, expect, test, vi } from "../../test-fixtures.js";
import { queueDeps } from "../durable-agent-queue.js";

async function rejectSessionRequestWrites(db: HyperIdleDb): Promise<void> {
	await db.execute(
		sql`drop trigger if exists au21_reject_session_request_write_bdec on agent_session_requests`,
	);
	await db.execute(sql`
		create or replace function au21_reject_session_request_write_bdec() returns trigger as $$
		begin raise exception 'AU21 injected agent_session_requests write failure (bet_decomposition)'; end;
		$$ language plpgsql
	`);
	await db.execute(sql`
		create trigger au21_reject_session_request_write_bdec
		before insert on agent_session_requests
		for each row execute function au21_reject_session_request_write_bdec()
	`);
}

/**
 * Real production port wiring for `BetDecompositionDeps` — mirrors
 * `bet-decomposition.test.ts`'s `productionPorts` exactly (same real
 * `@hyperidle/agent-selection` / `@hyperidle/org` / `@hyperidle/users` /
 * `@hyperidle/session-requests` / cost-bindings wiring `server-factory.ts`
 * uses in production).
 */
function productionPorts(): WorkDeps {
	const agentSelectionService = createAgentSelectionService({
		users: {
			getUserById: (db, id) => findUser(db, { id }),
			listActiveAiUsersByTeams: (db, teamIds) =>
				listUsers(db, { teamIds, kind: "ai", status: "active" }),
		},
		teams: { getTeamMembersByTeamId: (db, teamId) => getTeamMembers(db, { teamId }) },
	});
	return {
		agentSelection: {
			listCandidates: (db, teamId) => agentSelectionService.listCandidates({ db, teamId }),
			selectAgent: (occDeps, occasion) =>
				agentSelectionService.selectAgent({
					surface: occasion.surface,
					db: occDeps.db,
					eventBus: occDeps.eventBus,
					teamId: occasion.teamId,
					workKey: occasion.workKey,
					roleHint: occasion.roleHint,
					spreadIndex: occasion.spreadIndex,
				}),
		},
		users: {
			getUserById: (db: HyperIdleDb, id: string) => findUser(db, { id }),
			listActiveAiUsersByTeams: (db: HyperIdleDb, teamIds: string[]) =>
				listUsers(db, { teamIds, kind: "ai", status: "active" }),
			listUsersByTeam: (db: HyperIdleDb, teamMembersId: string) =>
				listUsers(db, { teamIds: [teamMembersId] }),
		},
		workIntents: { record: enqueueWorkIntent },
		teamCapacity: {
			getByTeamId: (db: HyperIdleDb, teamId: string) => getTeamMembers(db, { teamId }),
			setActiveBets: (db: HyperIdleDb, teamId: string, activeBets: number) =>
				updateTeam(db, teamId, { activeBets }),
		},
	};
}

describe("agent_run_admission_failed — bet_decomposition reaction fires for a REAL migrated (baked) intent", () => {
	test("a real baked bet_decomposition intent that fails terminally at drain still marks the real bet blocked/failed", async ({
		db,
		eventBus,
	}) => {
		const now = new Date().toISOString();
		await db
			.insert(teams)
			.values({ id: "team-au21-bdec-mig", name: "Team", phase: "build", createdAt: now });
		await db.insert(teamMembers).values({
			id: "team-au21-bdec-mig-members",
			teamId: "team-au21-bdec-mig",
			capacity: 5,
			activeBets: 0,
			formedAt: now,
		});
		await db.insert(users).values({
			id: "agent-au21-bdec-mig-pm",
			kind: "ai",
			name: "PM Agent",
			role: "product_manager",
			teamId: "team-au21-bdec-mig-members",
			status: "active",
			createdAt: now,
		});
		// @lore fixed during GREEN phase: a real `bet_state_changed(toState:"active")`
		// caller (`transitionBet`) commits `bets.status:"active"` BEFORE emitting
		// the event — `resolveBetDecompositionRequest` (this wave's new
		// emit-time resolver) now reads `bet.status` synchronously inside
		// `runBetDecomposition`'s own transaction, so the fixture must reflect
		// that real commit-then-emit ordering rather than leaving the row at
		// "draft" and only faking the event.
		await db.insert(bets).values({
			id: "bet-au21-bdec-mig",
			teamId: "team-au21-bdec-mig",
			description: "bet_decomposition migration proof bet",
			status: "active",
			createdAt: now,
		});

		const deps: BetDecompositionDeps = {
			db,
			eventBus,
			...productionPorts(),
			sandboxBasePath: "/tmp/au21-bdec-mig",
		};
		const dispose = registerBetDecomposition(deps);

		try {
			eventBus.emit({
				type: "bet_state_changed",
				streamId: "bet-au21-bdec-mig",
				betId: "bet-au21-bdec-mig",
				fromState: "draft",
				toState: "active",
				timestamp: Date.now(),
			});

			await vi.waitFor(async () => {
				const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-au21-bdec-mig"));
				expect(bet?.decompositionStatus).toBe("running");
			});
		} finally {
			dispose();
		}

		const [intentBeforeDrain] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, "bet-au21-bdec-mig"));
		expect(intentBeforeDrain).toBeDefined();
		// RED today: the emit call site does not yet bake the request.
		expect(intentBeforeDrain?.bakedRequestJson).toBeTruthy();

		await rejectSessionRequestWrites(db);

		const emitted: AgentRunAdmissionFailedEvent[] = [];
		eventBus.on("agent_run_admission_failed", (event) => emitted.push(event));

		const queueDrainDeps = { ...queueDeps(db), eventBus };
		await drainIntents(queueDrainDeps, { maxAttempts: 1 });

		expect(emitted).toHaveLength(1);
		expect(emitted[0]).toMatchObject({
			kind: "bet_decomposition",
			sourceId: "bet-au21-bdec-mig",
			terminal: true,
		});

		await vi.waitFor(async () => {
			const [finalized] = await db.select().from(bets).where(eq(bets.id, "bet-au21-bdec-mig"));
			expect(finalized?.decompositionStatus).toBe("blocked");
			expect(finalized?.decompositionBlockerReason).toBe("failed");
		});
	});
});
