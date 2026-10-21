/**
 * The demo world's team agents arrive the way a person's would: the demo
 * installs the bundled `role-personas` plugin for the Product team through the
 * real install path, and every agent the demo world talks about is one the
 * installer made.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { sql } from "drizzle-orm";
import { seedDemoWorld } from "../demo-fixture.js";
import {
	ASSISTANT_ID,
	BUILDER_ID,
	DESIGNER_ID,
	FACILITATOR_ID,
	GROWTH_ID,
	OPS_ID,
	PM_ID,
	PRODUCT_TEAM_ID,
	QA_ID,
	SUPPORT_TEAM_ID,
} from "../demo-world/ids.js";
import { runFactoryBootstrap } from "../factory-bootstrap-runner.js";

async function rows<T extends Record<string, unknown>>(db: HyperIdleDb, q: string): Promise<T[]> {
	const result = await db.execute(sql.raw(q));
	return (result as { rows: T[] }).rows;
}

const INSTALL_ID = `role-personas@${PRODUCT_TEAM_ID}`;
const PLUGIN_AGENTS = [
	BUILDER_ID,
	DESIGNER_ID,
	FACILITATOR_ID,
	GROWTH_ID,
	OPS_ID,
	PM_ID,
	QA_ID,
].sort();

describe("the demo installs the role-personas plugin for its team", () => {
	test("one team install of role-personas, enabled, for the Product team", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		const installs = await rows<{
			id: string;
			scope_kind: string;
			scope_team_id: string;
			state: string;
		}>(db, "SELECT id, scope_kind, scope_team_id, state FROM plugins WHERE name = 'role-personas'");
		expect(installs).toEqual([
			{ id: INSTALL_ID, scope_kind: "team", scope_team_id: PRODUCT_TEAM_ID, state: "enabled" },
		]);
	});

	test("the seven agents the installer recorded are the demo world's agents, each in one team — Designer in Support", async ({
		db,
	}) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		const recorded = await rows<{ entity_id: string }>(
			db,
			`SELECT entity_id FROM plugin_contributions
			  WHERE plugin_id = '${INSTALL_ID}' AND kind = 'agent' ORDER BY entity_id`,
		);
		expect(recorded.map((r) => r.entity_id)).toEqual(PLUGIN_AGENTS);

		const memberships = await rows<{ id: string; team_id: string }>(
			db,
			`SELECT u.id, ut.team_id FROM users u JOIN user_teams ut ON ut.user_id = u.id
			  WHERE u.kind = 'ai' AND u.status = 'active' AND u.id IN (${PLUGIN_AGENTS.map((a) => `'${a}'`).join(", ")})
			  ORDER BY u.id`,
		);
		expect(memberships).toEqual(
			PLUGIN_AGENTS.map((id) => ({
				id,
				team_id: id === DESIGNER_ID ? SUPPORT_TEAM_ID : PRODUCT_TEAM_ID,
			})),
		);
	});

	test("the demo team's agents are the plugin's seven plus the founder's assistant, nothing hand-made", async ({
		db,
	}) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		const agents = await rows<{ id: string }>(
			db,
			"SELECT id FROM users WHERE kind = 'ai' AND role <> 'system' ORDER BY id",
		);
		expect(agents.map((r) => r.id)).toEqual([...PLUGIN_AGENTS, ASSISTANT_ID].sort());
	});

	test("every agent identity in the demo is a document the installer registered", async ({
		db,
	}) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		const identities = await rows<{
			id: string;
			parent_id: string;
			body: string;
			registered: boolean;
		}>(
			db,
			`SELECT d.id, d.parent_id, d.body,
			        EXISTS (SELECT 1 FROM plugin_contributions c
			                 WHERE c.plugin_id = '${INSTALL_ID}' AND c.kind = 'document'
			                   AND c.entity_id = d.id) AS registered
			   FROM documents d
			  WHERE d.slot = 'agent_file' AND d.parent_kind = 'agent' AND d.status = 'active'
			  ORDER BY d.parent_id`,
		);
		expect(identities.map((r) => r.parent_id)).toEqual(PLUGIN_AGENTS);
		for (const identity of identities) {
			expect(identity.registered, `${identity.id} registered by the installer`).toBe(true);
			expect(identity.body.length, `${identity.id} carries the persona`).toBeGreaterThan(0);
		}
	});

	test("installing again on a reseed changes nothing", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);
		const count = async (table: string): Promise<number> =>
			Number((await rows<{ c: string }>(db, `SELECT COUNT(*) AS c FROM ${table}`))[0]?.c);
		const before = [await count("plugins"), await count("plugin_contributions")];

		await seedDemoWorld(db);

		expect([await count("plugins"), await count("plugin_contributions")]).toEqual(before);
	});
});
