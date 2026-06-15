/**
 * Demo fixture — test and setup-cli demo mode ONLY.
 *
 * @lore AF17: This file is the ONLY place the "Acme" demo world lives.
 * It must NEVER be imported from production paths:
 *   - packages/db/src/seed-pg-cli.ts
 *   - packages/db/src/bootstrap-pg.ts
 *   - packages/db/src/factory-bootstrap.ts
 *   - packages/db/src/migrate-pg.ts
 *
 * Permitted importers: setup-cli.ts (behind --demo flag) and test files.
 * The import-allowlist guard (scripts/demo-fixture-guard.ts) enforces this statically.
 *
 * Use neutral fictional name "Acme" — no real-product collision.
 * All ids use "demo-*" or "seed-product-1" prefixes to clearly identify them as fixtures.
 */

import { and, eq, inArray } from "drizzle-orm";
import type { HyperIdleDb } from "./connection.js";
import { bets, factorySettings, routines, tasks, teamMembers, teams, users } from "./schema.js";

/**
 * Seed a demo world for onboarding / development mode.
 *
 * Creates: team "Acme" + team_members row, human founder, demo agents
 * (builder, PM), daily-digest bet/task/routine.
 *
 * Idempotent: uses onConflictDoNothing throughout.
 *
 * @returns { teamId, founderId } — the demo team id and founder user id.
 */
export async function seedDemoWorld(
	db: HyperIdleDb,
): Promise<{ teamId: string; founderId: string }> {
	const now = new Date().toISOString();
	const teamId = "demo-team-acme";
	const teamMembersId = "demo-team-members-acme";
	const founderId = "demo-founder";

	// Demo team (domain entity — the "Acme" workspace)
	await db
		.insert(teams)
		.values({
			id: teamId,
			name: "Acme",
			phase: "build",
			functions: JSON.stringify(["development", "product"]),
			createdAt: now,
		})
		.onConflictDoNothing();

	// Team membership record
	await db
		.insert(teamMembers)
		.values({
			id: teamMembersId,
			teamId,
			capacity: 5,
			activeBets: 0,
			formedAt: now,
		})
		.onConflictDoNothing();

	// Human founder — demo mode only
	await db
		.insert(users)
		.values({
			id: founderId,
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			email: "founder@example.com",
			maxConcurrentSessions: 0,
			createdAt: now,
		})
		.onConflictDoNothing();

	// Demo builder agent
	await db
		.insert(users)
		.values({
			id: "demo-agent-builder",
			kind: "ai",
			name: "Acme Builder",
			role: "builder",
			agentCategory: "team",
			status: "active",
			maxConcurrentSessions: 3,
			teamId: teamMembersId,
			createdAt: now,
		})
		.onConflictDoNothing();

	// Demo product manager agent
	await db
		.insert(users)
		.values({
			id: "demo-agent-pm",
			kind: "ai",
			name: "Acme Product Manager",
			role: "product_manager",
			agentCategory: "team",
			teamId: teamMembersId,
			status: "active",
			maxConcurrentSessions: 1,
			systemPromptPath: "docs/system-prompts/product-manager.md",
			createdAt: now,
		})
		.onConflictDoNothing();

	// Set team lead to demo builder
	await db
		.update(teamMembers)
		.set({ leadAgentId: "demo-agent-builder" })
		.where(eq(teamMembers.id, teamMembersId));

	// Daily digest bet (disabled by default — operator enables)
	await db
		.insert(bets)
		.values({
			id: "demo-bet-daily-digest",
			teamId,
			description: "Internal: daily digest scaffolding bet",
			appetite: "small",
			status: "draft",
			createdAt: now,
		})
		.onConflictDoNothing();

	// Daily digest anchor task
	await db
		.insert(tasks)
		.values({
			id: "demo-task-daily-digest",
			betId: "demo-bet-daily-digest",
			teamId,
			ownerAgentId: "seed-agent-cos",
			title: "Daily digest anchor task",
			description: "Anchor task for the daily digest routine — emits routine_fired.",
			state: "ready",
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing();

	// Daily digest routine (inactive by default)
	await db
		.insert(routines)
		.values({
			id: "demo-routine-daily_digest",
			name: "Daily digest",
			teamId,
			state: "active",
			ownerAgentId: "seed-agent-cos",
			triggerType: "calendar",
			triggerConfig: JSON.stringify({
				cron: "0 8 * * *",
				taskId: "demo-task-daily-digest",
			}),
			active: false,
			delegationAllowed: false,
			humanReview: false,
			silent: true,
		})
		.onConflictDoNothing();

	// ── Backfill systemPrompt on demo agents from factory_settings role templates ──
	// @lore AF17: applyFactoryBootstrap() populates system_template:<role> rows and
	// backfills factory agents. Demo agents are created AFTER bootstrap, so they miss
	// the backfill. We query factory_settings here and apply templates to demo agents.
	// This mirrors what the old monolithic seed.ts did for all agents in one pass.
	// @lore AK1: key prefix renamed from old variant to "system_template:" in AK1 harness-vocab rename.
	const DEMO_AGENT_ROLES = ["builder", "product_manager"] as const;
	const templateKeys = DEMO_AGENT_ROLES.map((r) => `system_template:${r}`);
	const templates = await db
		.select({ key: factorySettings.key, value: factorySettings.value })
		.from(factorySettings)
		.where(inArray(factorySettings.key, templateKeys));

	for (const { key, value } of templates) {
		const role = key.replace("system_template:", "");
		await db
			.update(users)
			.set({ systemPrompt: value })
			.where(and(inArray(users.id, ["demo-agent-builder", "demo-agent-pm"]), eq(users.role, role)));
	}

	return { teamId, founderId };
}
