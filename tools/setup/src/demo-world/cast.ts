/**
 * AX1 — demo world cast: the Acme team.
 *
 * Two humans, the founder's assistant, and the seven agents the role-personas
 * plugin brought to the team. The founder is the FIRST human by `created_at` —
 * local-mode auth resolves the first human user, so the founder is who lands
 * in the app.
 */

import { agentRunConfig, type HyperIdleDb, orgEdges, users } from "@hyperidle/db";
import type { HarnessType } from "@hyperidle/domain-model";
import {
	ASSISTANT_ID,
	BUILDER_ID,
	DESIGNER_ID,
	FACILITATOR_ID,
	FOUNDER_ID,
	GROWTH_ID,
	MAYA_ID,
	OPS_ID,
	PM_ID,
	QA_ID,
	TEAM_ID,
} from "./ids.js";
import type { DemoClock } from "./time.js";

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
			teamId: TEAM_ID,
			createdAt: clock.daysAgo(31),
		})
		.onConflictDoNothing();

	// The team's agents came with the role-personas plugin, which gives them no
	// harness outside a running server. Spread them across all four installable
	// harnesses so the Agents view has something to distinguish.
	for (const [agentId, harnessType, maxConcurrentSessions] of [
		[BUILDER_ID, "claude-code", 3],
		[PM_ID, "codex", 1],
		[DESIGNER_ID, "opencode", 1],
		[QA_ID, "codex", 1],
		[GROWTH_ID, "cursor-agent", 1],
		[OPS_ID, "claude-code", 1],
		[FACILITATOR_ID, "opencode", 1],
		[ASSISTANT_ID, "claude-code", 1],
	] as const satisfies readonly (readonly [string, HarnessType, number])[]) {
		await db
			.insert(agentRunConfig)
			.values({ agentUserId: agentId, harnessType, maxConcurrentSessions })
			.onConflictDoUpdate({
				target: agentRunConfig.agentUserId,
				set: { harnessType, maxConcurrentSessions },
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

	// @lore BC5 T11: `leadAgentId`/`formedAt` are dropped (migration 0090) —
	// a team is an id and a name now; there is nothing left here to set.
}
