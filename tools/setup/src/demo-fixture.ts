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
 * document corpus, sessions and a subscription). The content
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
 * Rows this file inserts itself use "demo-*" ids; the team's agents carry the
 * ids the plugin installer gives them.
 */

import { fileURLToPath } from "node:url";
import { installBundledPlugin } from "@hyperidle/core-api";
import { type HyperIdleDb, subscriptions, teams, users } from "@hyperidle/db";
import { OBJECT_EVENTS } from "@hyperidle/domain-model";
import { PM_ID, ROLE_PERSONAS_PLUGIN } from "./demo-world/ids.js";
import { seedDemoWorldContent } from "./demo-world/index.js";
import { createDemoClock } from "./demo-world/time.js";

/** The folder the bundled plugins ship in: `<repo>/plugins`. */
const BUNDLED_PLUGINS_DIR = fileURLToPath(new URL("../../../plugins", import.meta.url));

/**
 * Seed a demo world for onboarding / development mode.
 *
 * Creates: team "Acme", two humans, the founder's assistant, the role-personas
 * plugin installed for the team (its seven agents), seven root tasks across
 * every lifecycle with nested subtasks to three levels deep, fifteen threads
 * with ~100 messages, a ~50-document corpus, ~35 sessions, a paused schedule
 * subscription, and changes rows — a world that reads as six weeks of use
 * by a small team.
 *
 * Idempotent: onConflictDoNothing throughout, fixed `demo-*` ids, and the
 * plugin install re-runs as an in-place reinstall.
 *
 * @returns { teamId, founderId } — the demo team id and founder user id.
 */
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
			teamId: teamId,
			createdAt: clock.daysAgo(45),
		})
		.onConflictDoNothing();

	// Founder's personal Assistant — per-user agent, id convention `ast-<userId>`.
	// The welcome screen makes it for a real person; the demo seeds the founder
	// directly, so it seeds the assistant too, or the founder's assistant thread
	// has no agent to answer it.
	await db
		.insert(users)
		.values({
			id: `ast-${founderId}`,
			kind: "ai",
			name: "Founder's Assistant",
			role: "assistant",
			agentCategory: "individual",
			ownerUserId: founderId,
			status: "active",
			createdAt: clock.daysAgo(44),
		})
		.onConflictDoNothing();

	// The team's agents: the bundled role-personas plugin, installed for the
	// team through the same install a person's Settings › Plugins click runs,
	// on the day the team started using agents.
	await installBundledPlugin(db, {
		name: ROLE_PERSONAS_PLUGIN,
		teamId,
		bundledPluginsDir: BUNDLED_PLUGINS_DIR,
		actor: founderId,
		now: clock.daysAgo(43),
	});

	// A paused daily-digest schedule subscription — no run history; the schedule is wired but inactive.
	await db
		.insert(subscriptions)
		.values({
			id: "demo-sub-daily-digest",
			userId: `ast-${founderId}`,
			event: null,
			schedule: "0 8 * * *",
			paused: true,
			nextRunAt: null,
			createdAt: clock.daysAgo(19),
			updatedAt: clock.daysAgo(19),
		})
		.onConflictDoNothing();

	// Founder's assistant subscribes to all 9 object events so it can observe
	// the full team activity stream.
	for (const event of OBJECT_EVENTS) {
		await db
			.insert(subscriptions)
			.values({
				id: `demo-sub-ast-${event.replace(".", "-")}`,
				userId: `ast-${founderId}`,
				event,
				schedule: null,
				paused: false,
				nextRunAt: null,
				createdAt: clock.daysAgo(44),
				updatedAt: clock.daysAgo(44),
			})
			.onConflictDoNothing();
	}

	// PM agent subscribes to task.created to stay on top of new tasks.
	await db
		.insert(subscriptions)
		.values({
			id: "demo-sub-pm-task-created",
			userId: PM_ID,
			event: "task.created",
			schedule: null,
			paused: false,
			nextRunAt: null,
			createdAt: clock.daysAgo(43),
			updatedAt: clock.daysAgo(43),
		})
		.onConflictDoNothing();

	// ── The lived-in world: cast, documents, work, conversations, activity ──
	await seedDemoWorldContent(db, clock);

	return { teamId, founderId };
}
