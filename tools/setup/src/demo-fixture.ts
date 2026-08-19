/**
 * Demo fixture — test and setup-cli demo mode ONLY.
 *
 * @lore AF17: This file is the ONLY place the "Acme" demo world lives.
 * It must NEVER be imported from production paths:
 *   - tools/setup/src/seed-pg-cli.ts
 *   - tools/setup/src/factory-bootstrap-runner.ts
 *   - framework/db/src/migrate-pg.ts
 *
 * Permitted importers: setup-cli.ts (behind --demo flag), bootstrap-pg.ts
 * (behind --demo flag / HYPERIDLE_DEMO=1 — AX1), and test files.
 *
 * @lore AX1: the skeleton grew into a LIVED-IN world — six weeks of Acme
 * history (bets across every lifecycle, threads with real reviews, a
 * knowledge corpus, sessions and routines with run history). The content
 * lives in `./demo-world/`; this file keeps the skeleton and the entry
 * point. The AF17 constraint is unchanged: demo data is OPT-IN at database
 * creation (`npm run setup -- --demo`, or `--db-path` pointed at any
 * PGlite data directory — including the desktop app's), never silent,
 * never on a non-demo instance's boot path. Desktop's Electron main
 * process cannot import this file (production never imports tooling);
 * the packaged-app path is the setup CLI against the desktop data dir.
 *
 * @lore AU29 §2.6: this file (and the whole `tools/setup` package it now
 * lives in) is `tooling` — `store-tooling-measures-everything` (Ruling 7)
 * makes any table write here legal by role, so the import-allowlist guard
 * this comment used to name (`scripts/demo-fixture-guard.ts`, retired under
 * AU28) is no longer the mechanism; the constraint above is still real (no
 * demo data on a production boot path) but is enforced by which CLIs choose
 * to call this file, not by a static import guard.
 *
 * Use neutral fictional name "Acme" — no real-product collision.
 * All ids use "demo-*" or "seed-product-1" prefixes to clearly identify them as fixtures.
 */

import {
	agentRunConfig,
	bets,
	type HyperIdleDb,
	routines,
	tasks,
	teams,
	users,
} from "@hyperidle/db";
import { readSystemPromptTemplateForRole } from "@hyperidle/factory-defaults";
import { and, eq, inArray } from "drizzle-orm";
import { seedDemoWorldContent } from "./demo-world/index.js";
import { createDemoClock } from "./demo-world/time.js";

/**
 * Seed a demo world for onboarding / development mode.
 *
 * Creates: team "Acme" + team_members row, two humans, the founder's
 * assistant and five team agents, eight bets across every lifecycle with
 * ~27 tasks, fifteen threads with ~100 messages, a ~40-item knowledge
 * corpus, ~45 sessions, routines with run history, and notifications —
 * a world that reads as six weeks of use by a small team.
 *
 * Idempotent: uses onConflictDoNothing throughout; fixed `demo-*` ids.
 *
 * @returns { teamId, founderId } — the demo team id and founder user id.
 */
/**
 * AU26 G1 — write a demo agent's run config.
 *
 * @lore AU29 §2.6: a direct `agent_run_config` write, same as the rest of this
 * file's direct table writes — legal here because `tools/setup` is tooling
 * (`store-tooling-measures-everything`, Ruling 7), not because of the
 * AU26/AU29-era db-package exception this comment used to cite (that
 * exception is gone: `framework/db` no longer hosts any first-boot writer at
 * all, see `factory-bootstrap-runner.ts`).
 */
async function upsertDemoRunConfig(
	db: HyperIdleDb,
	agentUserId: string,
	patch: { readonly systemPrompt?: string | null; readonly maxConcurrentSessions?: number },
): Promise<void> {
	await db
		.insert(agentRunConfig)
		.values({
			agentUserId,
			systemPrompt: patch.systemPrompt ?? null,
			maxConcurrentSessions: patch.maxConcurrentSessions ?? 1,
		})
		.onConflictDoUpdate({ target: agentRunConfig.agentUserId, set: { ...patch } });
}

export async function seedDemoWorld(
	db: HyperIdleDb,
): Promise<{ teamId: string; founderId: string }> {
	const clock = createDemoClock();
	const teamId = "demo-team-acme";
	const founderId = "demo-founder";

	// Demo team (domain entity — the "Acme" workspace), founded six weeks ago.
	await db
		.insert(teams)
		.values({
			id: teamId,
			name: "Acme",
			phase: "build",
			functions: JSON.stringify(["development", "product"]),
			createdAt: clock.daysAgo(44),
		})
		.onConflictDoNothing();

	// Human founder — demo mode only. FIRST human by created_at: local-mode
	// auth resolves the first human user, so the founder is who lands in the app.
	await db
		.insert(users)
		.values({
			id: founderId,
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			email: "founder@example.com",
			createdAt: clock.daysAgo(45),
		})
		.onConflictDoNothing();

	// Founder's personal Assistant — per-user agent, id convention `ast-<userId>`.
	// Registration normally scaffolds this (routes/users.ts); the demo fixture
	// seeds the founder directly, so without this the assistant thread resolves
	// `ast-<founderId>` → requireRunnableAgent throws → assistant send 500s.
	await db
		.insert(users)
		.values({
			id: `ast-${founderId}`,
			kind: "ai",
			name: "Founder's Assistant",
			role: "assistant",
			agentCategory: "individual",
			status: "active",
			createdAt: clock.daysAgo(44),
		})
		.onConflictDoNothing();
	await upsertDemoRunConfig(db, `ast-${founderId}`, { maxConcurrentSessions: 1 });

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
			teamId: teamId,
			createdAt: clock.daysAgo(43),
		})
		.onConflictDoNothing();
	await upsertDemoRunConfig(db, "demo-agent-builder", { maxConcurrentSessions: 3 });

	// Demo product manager agent
	await db
		.insert(users)
		.values({
			id: "demo-agent-pm",
			kind: "ai",
			name: "Acme Product Manager",
			role: "product_manager",
			agentCategory: "team",
			teamId: teamId,
			status: "active",
			createdAt: clock.daysAgo(43),
		})
		.onConflictDoNothing();
	await upsertDemoRunConfig(db, "demo-agent-pm", { maxConcurrentSessions: 1 });

	// Set team lead to demo builder
	await db.update(teams).set({ leadAgentId: "demo-agent-builder" }).where(eq(teams.id, teamId));

	// Daily digest bet (disabled by default — operator enables)
	await db
		.insert(bets)
		.values({
			id: "demo-bet-daily-digest",
			teamId,
			description: "Internal: daily digest scaffolding bet",
			appetite: "small",
			status: "draft",
			createdAt: clock.daysAgo(19),
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
			createdAt: clock.daysAgo(19),
			updatedAt: clock.daysAgo(19),
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
			createdAt: clock.daysAgo(19),
		})
		.onConflictDoNothing();

	// ── The lived-in world: cast, knowledge, work, conversations, activity ──
	await seedDemoWorldContent(db, clock);

	// ── Backfill systemPrompt on demo agents from docs-backed role templates ──
	// @lore AF17: applyFactoryBootstrap() backfills factory agents' systemPrompt.
	// Demo agents are created AFTER bootstrap, so they miss that backfill. We read
	// the same docs-backed templates here and apply them to demo agents. This
	// mirrors what the old monolithic seed.ts did for all agents in one pass.
	// @lore AU18: previously read cached rows from `factorySettings.system_template:<role>`
	// (written by bootstrap); that table is retired. Read directly via the shared
	// `readSystemPromptTemplateForRole` (system-prompt-templates.ts) — the same
	// map/reader bootstrap, roster.ts, and agents.ts now all use.
	// @lore AU26 G1: `systemPrompt` moved to `agent_run_config`, so the role-scoped
	// backfill resolves ids off `users` first and writes to the run-config rows.
	// Roles without a docs template resolve null and are skipped.
	const DEMO_AGENT_ROLES = [
		"builder",
		"product_manager",
		"designer",
		"qa_engineer",
		"growth",
	] as const;
	for (const role of DEMO_AGENT_ROLES) {
		const content = readSystemPromptTemplateForRole(role);
		if (content === null) continue;
		const matching = await db
			.select({ id: users.id })
			.from(users)
			.where(
				and(
					inArray(users.id, [
						"demo-agent-builder",
						"demo-agent-pm",
						"demo-agent-designer",
						"demo-agent-qa",
						"demo-agent-growth",
					]),
					eq(users.role, role),
				),
			);
		for (const { id } of matching) {
			await upsertDemoRunConfig(db, id, { systemPrompt: content });
		}
	}

	return { teamId, founderId };
}
