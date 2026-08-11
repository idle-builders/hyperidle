/**
 * AX1 — demo world cast: the Acme team.
 *
 * Two humans and five team agents beside the founder's assistant. Ids are
 * stable (`demo-*`) so reseeding is idempotent and existing tests keep
 * working. The founder is the FIRST human by `created_at` — local-mode auth
 * resolves the first human user, so the founder is who lands in the app.
 */

import { agentRunConfig, type HyperIdleDb, orgEdges, teamMembers, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import {
	ASSISTANT_ID,
	BUILDER_ID,
	DESIGNER_ID,
	FOUNDER_ID,
	GROWTH_ID,
	MAYA_ID,
	MEMBERS_ID,
	PM_ID,
	QA_ID,
	TEAM_ID,
} from "./ids.js";
import type { DemoClock } from "./time.js";

interface AgentSpec {
	readonly id: string;
	readonly name: string;
	readonly role: string;
	readonly createdAt: string;
	readonly harnessType: string;
	readonly maxConcurrentSessions: number;
}

export async function seedCast(db: HyperIdleDb, clock: DemoClock): Promise<void> {
	// Second human — joined a month ago to run operations. Inserted AFTER the
	// founder with a later created_at so local-mode auth keeps resolving the
	// founder as the acting human.
	await db
		.insert(users)
		.values({
			id: MAYA_ID,
			kind: "human",
			name: "Maya Chen",
			role: "operations",
			status: "active",
			email: "maya@acme.example",
			createdAt: clock.daysAgo(31),
		})
		.onConflictDoNothing();

	const agents: readonly AgentSpec[] = [
		{
			id: DESIGNER_ID,
			name: "Acme Designer",
			role: "designer",
			createdAt: clock.daysAgo(40),
			harnessType: "builtin",
			maxConcurrentSessions: 1,
		},
		{
			id: QA_ID,
			name: "Acme QA Engineer",
			role: "qa_engineer",
			createdAt: clock.daysAgo(36),
			harnessType: "codex",
			maxConcurrentSessions: 1,
		},
		{
			id: GROWTH_ID,
			name: "Acme Growth",
			role: "growth",
			createdAt: clock.daysAgo(29),
			harnessType: "builtin",
			maxConcurrentSessions: 1,
		},
	];

	for (const agent of agents) {
		await db
			.insert(users)
			.values({
				id: agent.id,
				kind: "ai",
				name: agent.name,
				role: agent.role,
				agentCategory: "team",
				status: "active",
				teamId: MEMBERS_ID,
				createdAt: agent.createdAt,
			})
			.onConflictDoNothing();
		await db
			.insert(agentRunConfig)
			.values({
				agentUserId: agent.id,
				harnessType: agent.harnessType,
				maxConcurrentSessions: agent.maxConcurrentSessions,
			})
			.onConflictDoNothing();
	}

	// Harness variety on the pre-existing skeleton agents (builder on claude,
	// the rest builtin) — gives the Agents view something to distinguish.
	for (const [agentId, harnessType] of [
		[BUILDER_ID, "claude"],
		[PM_ID, "builtin"],
		[ASSISTANT_ID, "builtin"],
	] as const) {
		await db
			.insert(agentRunConfig)
			.values({ agentUserId: agentId, harnessType, maxConcurrentSessions: 1 })
			.onConflictDoUpdate({
				target: agentRunConfig.agentUserId,
				set: { harnessType },
			});
	}

	// Org edges back to the team (the setup flow's team-creation adds these
	// for real teams; the demo team was inserted directly).
	for (const humanId of [FOUNDER_ID, MAYA_ID]) {
		await db
			.insert(orgEdges)
			.values({
				id: `demo-org-edge-${humanId}`,
				fromUserId: humanId,
				mechanism: "team",
				target: TEAM_ID,
				createdAt: clock.daysAgo(30),
			})
			.onConflictDoNothing();
	}

	// Team state reflects six weeks of use: the PM leads (docs/process-layer
	// default), two bets are live.
	await db
		.update(teamMembers)
		.set({ leadAgentId: PM_ID, activeBets: 2, formedAt: clock.daysAgo(44) })
		.where(eq(teamMembers.id, MEMBERS_ID));
}
