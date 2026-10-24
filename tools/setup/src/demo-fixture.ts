/**
 * The demo world — test and setup-cli demo mode ONLY.
 *
 * @lore Demo data is opt-in at database creation (`npm run setup -- --demo`, or `--db-path` pointed at any PGlite data directory), never on a production boot path; nothing in the shipping roots may import this file.
 *
 * It tells the same story as the design's made-up data in `layers/core-ui`, so a
 * screen wired to real data can be compared with its design one to one: Finn
 * Olsen and Maya Chen at Northwind, their agents Builder, Growth and Designer,
 * Facilitation from the Team habits plugin, the task "Trials that convert
 * without a call", the hand-off "Trial-end confusion, three tickets", and the
 * knowledge tree with How we price. The content lives in `./demo-world/`.
 */

import { type HyperIdleDb, teams } from "@hyperidle/db";
import { FOUNDER_ID, PRODUCT_TEAM_ID, SUPPORT_TEAM_ID } from "./demo-world/ids.js";
import { seedDemoWorldContent } from "./demo-world/index.js";
import { createDemoClock } from "./demo-world/time.js";

/**
 * Seed the demo world. Idempotent: fixed `demo-*` ids with
 * `onConflictDoNothing` throughout, and the plugin install re-runs in place.
 * `pluginsBaseDir` is where the server will keep installed plugins, so the
 * demo's plugin can put its own version back.
 *
 * @returns the Product team id and the founder's user id.
 */
export async function seedDemoWorld(
	db: HyperIdleDb,
	opts: { readonly pluginsBaseDir?: string } = {},
): Promise<{ teamId: string; founderId: string }> {
	const clock = createDemoClock();
	await db
		.insert(teams)
		.values([
			{ id: PRODUCT_TEAM_ID, name: "Product", createdAt: clock.daysAgo(98) },
			{ id: SUPPORT_TEAM_ID, name: "Support", createdAt: clock.daysAgo(98) },
		])
		.onConflictDoNothing();
	await seedDemoWorldContent(db, clock, opts.pluginsBaseDir);
	return { teamId: PRODUCT_TEAM_ID, founderId: FOUNDER_ID };
}
