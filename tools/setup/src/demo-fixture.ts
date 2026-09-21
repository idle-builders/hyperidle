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
 * history (nested tasks across every lifecycle, threads with real reviews, a
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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	agentRunConfig,
	documents,
	type HyperIdleDb,
	routines,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { and, eq, inArray } from "drizzle-orm";
import { seedDemoWorldContent } from "./demo-world/index.js";
import { createDemoClock } from "./demo-world/time.js";

/**
 * Seed a demo world for onboarding / development mode.
 *
 * Creates: team "Acme" (AU44 B1: team_members dissolved), two humans, the founder's
 * assistant and five team agents, seven root tasks across every lifecycle with
 * nested subtasks to three levels deep, fifteen threads with ~100 messages,
 * a ~40-item knowledge corpus, ~45 sessions, routines with run history, and
 * notifications — a world that reads as six weeks of use by a small team.
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
	patch: {
		readonly systemPrompt?: string | null;
		readonly agentName?: string | null;
		readonly maxConcurrentSessions?: number;
	},
): Promise<void> {
	const { systemPrompt, agentName, ...runConfigPatch } = patch;
	// Only touch the run config when there is a run-config field to write. A
	// patch that carries nothing but an identity leaves `runConfigPatch` empty,
	// and drizzle rejects an empty conflict-update with "No values to set".
	if (Object.keys(runConfigPatch).length > 0) {
		await db
			.insert(agentRunConfig)
			.values({
				agentUserId,
				maxConcurrentSessions: patch.maxConcurrentSessions ?? 1,
			})
			.onConflictDoUpdate({ target: agentRunConfig.agentUserId, set: { ...runConfigPatch } });
	} else {
		await db
			.insert(agentRunConfig)
			.values({ agentUserId, maxConcurrentSessions: 1 })
			.onConflictDoNothing();
	}

	// The agent's identity is an `agent_file` document parented to it —
	// parent_kind='agent', parent_id=the agent — the binding context assembly
	// reads through `getParentedItem`. scope_kind='user'/scope_id are still
	// written too: scope answers a different question (how far the item
	// reaches) and is never derived from the parent.
	//
	// Runs AFTER migrations (this fixture is app-level seed data, not a
	// migration), so a bootstrap run always writes the current parent shape —
	// there is no pre-parent state for it to repair.
	if (systemPrompt) {
		const now = new Date();
		const ts = now.toISOString();
		const identityId = `ki_af_${agentUserId}`;
		// @lore BC4 §6.7: plausible usage — an identity file is bound into
		// every session the agent runs (high, recent sessionUseCount) but is
		// rarely opened directly from the detail page (small readCount, a few
		// days stale). Spread by a cheap hash of the agent id so multiple demo
		// agents don't all show identical counters.
		const seed = agentUserId.length + agentUserId.charCodeAt(0);
		await db
			.insert(documents)
			.values({
				id: identityId,
				scopeKind: "user",
				scopeId: agentUserId,
				// The agent's display name, matching what the migration and the create
				// route write — the knowledge view shows this title.
				title: `${agentName || agentUserId} — identity`,
				body: systemPrompt,
				format: "markdown",
				status: "active",
				version: 1,
				slot: "agent_file",
				parentKind: "agent",
				parentId: agentUserId,
				updatedBy: "demo-seed",
				createdAt: ts,
				updatedAt: ts,
				readCount: 1 + (seed % 4),
				lastReadAt: new Date(now.getTime() - (2 + (seed % 5)) * 86_400_000).toISOString(),
				sessionUseCount: 8 + (seed % 20),
				lastUsedAt: new Date(now.getTime() - (seed % 6) * 3_600_000).toISOString(),
			})
			.onConflictDoUpdate({
				target: documents.id,
				set: { body: systemPrompt, parentKind: "agent", parentId: agentUserId },
			});
	}
}

/** The persona the `role-personas` plugin ships for a role, read from its files. */
function readRolePersona(role: string): string | null {
	const filename = ROLE_PERSONA_FILES[role];
	if (!filename) return null;
	try {
		return readFileSync(
			resolve(process.cwd(), "plugins", "role-personas", "personas", filename),
			"utf-8",
		);
	} catch {
		return null;
	}
}

const ROLE_PERSONA_FILES: Readonly<Record<string, string>> = {
	builder: "builder.md",
	designer: "designer.md",
	facilitator: "facilitator.md",
	growth: "growth.md",
	ops: "ops.md",
	product_manager: "product-manager.md",
	qa_engineer: "qa-engineer.md",
};

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
		.insert(threads)
		.values({
			id: "thr-demo-bet-daily-digest",
			hostKind: "team",
			hostId: teamId,
			initiatorId: "seed-agent-cos",
			participants: "[]",
			lastActiveAt: clock.daysAgo(19),
			createdAt: clock.daysAgo(19),
		})
		.onConflictDoNothing();
	await db
		.insert(tasks)
		.values({
			id: "demo-bet-daily-digest",
			threadId: "thr-demo-bet-daily-digest",
			parentTaskId: null,
			teamId: teamId,
			title: "Internal: daily digest scaffolding bet",
			description: "Internal: daily digest scaffolding bet",
			state: "proposed",
			createdAt: clock.daysAgo(19),
			updatedAt: clock.daysAgo(19),
		})
		.onConflictDoNothing();

	// Daily digest anchor task
	await db
		.insert(threads)
		.values({
			id: "thr-demo-task-daily-digest",
			hostKind: "team",
			hostId: teamId,
			initiatorId: "seed-agent-cos",
			participants: "[]",
			lastActiveAt: clock.daysAgo(19),
			createdAt: clock.daysAgo(19),
		})
		.onConflictDoNothing();
	await db
		.insert(tasks)
		.values({
			id: "demo-task-daily-digest",
			threadId: "thr-demo-task-daily-digest",
			parentTaskId: "demo-bet-daily-digest",
			teamId,
			ownerAgentId: "seed-agent-cos",
			title: "Daily digest anchor task",
			description: "Anchor task for the daily digest routine.",
			state: "accepted",
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
			state: "active",
			ownerAgentId: "seed-agent-cos",
			triggerType: "calendar",
			triggerConfig: JSON.stringify({
				cron: "0 8 * * *",
				taskId: "demo-task-daily-digest",
			}),
			active: false,
			humanReview: false,
			silent: true,
			createdAt: clock.daysAgo(19),
		})
		.onConflictDoNothing();

	// ── The lived-in world: cast, knowledge, work, conversations, activity ──
	await seedDemoWorldContent(db, clock);

	// ── Give the demo agents the personas the role-personas plugin ships ──
	// @lore BA9g: these used to come from `docs/system-prompts/*.md` through the
	// runtime's own reader. Those files are the `role-personas` plugin's now, and
	// the runtime reads no persona off disk at all — HyperIdle ships a single
	// agent with a bare AGENTS.md. The demo world is what a team looks like once
	// somebody has installed that plugin, so the fixture reads the plugin's files
	// directly. This is seed tooling, not the shipping runtime.
	const DEMO_AGENT_ROLES = [
		"builder",
		"product_manager",
		"designer",
		"qa_engineer",
		"growth",
	] as const;
	for (const role of DEMO_AGENT_ROLES) {
		const content = readRolePersona(role);
		if (content === null) continue;
		const matching = await db
			.select({ id: users.id, name: users.name })
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
		for (const { id, name } of matching) {
			await upsertDemoRunConfig(db, id, { systemPrompt: content, agentName: name });
		}
	}

	return { teamId, founderId };
}
