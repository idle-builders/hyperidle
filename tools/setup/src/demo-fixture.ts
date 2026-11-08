/**
 * The demo world — test and setup-cli demo mode ONLY.
 *
 * @lore Demo data is opt-in at database creation (`npm run setup -- --demo`, or `--db-path` pointed at any PGlite data directory), never on a production boot path; nothing in the shipping roots may import this file.
 *
 * It tells the story the designs were drawn with, so a screen can be compared with
 * its design one to one: Finn
 * Olsen and Maya Chen at Northwind, their agents Builder, Growth and Designer,
 * Facilitation from the Team habits plugin, the task "Trials that convert
 * without a call", the hand-off "Trial-end confusion, three tickets", and the
 * knowledge tree with How we price. The content lives in `./demo-world/`.
 */

import { type HyperIdleDb, teams } from "@hyperidle/db";
import type { RunnerDb } from "@hyperidle/runner-db";
import { giveUserKey } from "@hyperidle/user";
import type { DemoWorldPlaces } from "./demo-world/cast.js";
import {
	FOUNDER_ID,
	OLSEN_LABS_TEAM_ID,
	PRODUCT_TEAM_ID,
	SUPPORT_TEAM_ID,
} from "./demo-world/ids.js";
import { seedDemoWorldContent } from "./demo-world/index.js";
import { createDemoClock } from "./demo-world/time.js";

/**
 * Seed the demo world. Idempotent: fixed `demo-*` ids with
 * `onConflictDoNothing` throughout, and the plugin install re-runs in place.
 * `founderKey` is the key the window will send — the desktop app's
 * `secrets.json` key, or the laptop server's own key when none is given.
 *
 * @returns the Product team id and the founder's user id.
 */
export async function seedDemoWorld(
	db: HyperIdleDb,
	runnerDb: RunnerDb,
	opts: DemoWorldPlaces & { readonly founderKey?: string } = {},
): Promise<{ teamId: string; founderId: string }> {
	const clock = createDemoClock();
	await db
		.insert(teams)
		.values([
			{ id: OLSEN_LABS_TEAM_ID, name: "Olsen Labs", createdAt: clock.daysAgo(100), isGlobal: true },
			{ id: PRODUCT_TEAM_ID, name: "Product", createdAt: clock.daysAgo(98) },
			{ id: SUPPORT_TEAM_ID, name: "Support", createdAt: clock.daysAgo(98) },
		])
		.onConflictDoNothing();
	await seedDemoWorldContent(db, runnerDb, clock, opts);
	// The demo opens as its founder: the key the window sends is his.
	await giveUserKey(
		db,
		FOUNDER_ID,
		opts.founderKey ?? process.env.HYPERIDLE_API_KEY ?? "hyperidle-dev-local",
	);
	return { teamId: PRODUCT_TEAM_ID, founderId: FOUNDER_ID };
}
