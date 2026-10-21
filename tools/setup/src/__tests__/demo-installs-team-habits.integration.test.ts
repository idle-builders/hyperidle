/**
 * Facilitation arrives the way a person's plugin would: the demo installs Team
 * habits for everyone through the real install path, and two of its documents
 * carry a person's later edit.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { sql } from "drizzle-orm";
import { seedDemoWorld } from "../demo-fixture.js";
import { FACILITATION_ID, MAYA_ID } from "../demo-world/ids.js";
import { runFactoryBootstrap } from "../factory-bootstrap-runner.js";

async function rows<T extends Record<string, unknown>>(db: HyperIdleDb, q: string): Promise<T[]> {
	const result = await db.execute(sql.raw(q));
	return (result as { rows: T[] }).rows;
}

describe("the demo installs Team habits for everyone", () => {
	test("one install, for everyone, enabled — and the bundled Roles plugin is not installed", async ({
		db,
	}) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		const installs = await rows<{ id: string; scope_kind: string; state: string }>(
			db,
			"SELECT id, scope_kind, state FROM plugins ORDER BY id",
		);
		expect(installs).toEqual([{ id: "team-habits", scope_kind: "factory", state: "enabled" }]);
	});

	test("Facilitation is the plugin's agent, in no team, with two reasons to start", async ({
		db,
	}) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		const agents = await rows<{ entity_id: string }>(
			db,
			"SELECT entity_id FROM plugin_contributions WHERE kind = 'agent'",
		);
		expect(agents.map((a) => a.entity_id)).toEqual([FACILITATION_ID]);
		const teams = await rows<{ team_id: string }>(
			db,
			`SELECT team_id FROM user_teams WHERE user_id = '${FACILITATION_ID}'`,
		);
		expect(teams).toEqual([]);

		const reasons = await rows<{ event: string | null; schedule: string | null }>(
			db,
			`SELECT event, schedule FROM subscriptions WHERE user_id = '${FACILITATION_ID}' ORDER BY event`,
		);
		expect(reasons).toEqual([
			{ event: "task.changed", schedule: null },
			{ event: null, schedule: "0 16 * * 5" },
		]);
	});

	test("Maya's edit of Facilitation's instructions detaches it from the plugin", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		const identity = await rows<{ updated_by: string; detached: boolean }>(
			db,
			`SELECT d.updated_by, c.detached_at IS NOT NULL AS detached FROM documents d
			   JOIN plugin_contributions c ON c.entity_id = d.id
			  WHERE d.slot = 'agent_file' AND d.parent_id = '${FACILITATION_ID}'`,
		);
		expect(identity).toEqual([{ updated_by: MAYA_ID, detached: true }]);
	});
});
