/**
 * BA9d D12: skill restore re-imports body from plugin source on disk.
 * Proves that editing a skill's body in the DB and then calling the restore
 * route puts the original SKILL.md content back.
 *
 * @lore document-module B10: restore now writes through `edit_document`, so
 * `updatedBy` becomes the requesting person (architecture.md §3.5 — the
 * field is never on the input, always `ctx.actor`), not the `plugin:<id>`
 * sentinel the legacy repository write used.
 */

import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type HyperIdleDb, users } from "@hyperidle/db";
import { skillItemId } from "@hyperidle/settings";
import { afterEach, describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

/** The install route writes documents through `edit_document`, which needs a
 * real actor for the `changes` row it appends — the auth middleware's
 * API-key fallback resolves to this id when no human is seeded. */
async function seedFounder(db: HyperIdleDb): Promise<void> {
	await db.insert(users).values({
		id: "u-founder",
		kind: "human",
		name: "Founder",
		role: "founder",
		status: "active",
		createdAt: "2026-01-01T00:00:00Z",
	});
}

const PLUGIN_ROOT = resolve("plugins/knowledge-management");
const PLUGIN_ID = "knowledge-management";
// One skill dirName from the plugin's skills/ directory.
const SKILL_DIR = "post-task-retro";

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs) {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {}
	}
	tempDirs.length = 0;
});

function copyPlugin(): string {
	const dir = join(tmpdir(), `ba9d-sr-${Date.now()}`);
	mkdirSync(dir, { recursive: true });
	cpSync(PLUGIN_ROOT, dir, { recursive: true });
	tempDirs.push(dir);
	return dir;
}

describe("BA9d skill restore", () => {
	// pluginsApp is a per-test app instance with a temp pluginsBaseDir already
	// configured in the composition root — no pluginsBaseDir in the request body.
	test("restore re-imports skill body from plugin source", async ({ db, pluginsApp }) => {
		await seedFounder(db);
		// 1. Install. The app's pluginsBaseDir is set at construction time by the
		//    fixture, so install_path is stored automatically.
		const pluginDir = copyPlugin();
		const installRes = await pluginsApp.request("/api/plugins", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				source: { type: "folder", path: pluginDir },
				scope: { kind: "factory" },
			}),
		});
		expect(installRes.status).toBe(201);

		// 2. Fetch the skill from the knowledge route to get its current state.
		const skillId = skillItemId(PLUGIN_ID, SKILL_DIR, "factory", null);
		const getRes = await pluginsApp.request(`/api/knowledge/${skillId}`);
		expect(getRes.status).toBe(200);
		const skillItem = (await getRes.json()) as {
			id: string;
			body: string;
			version: number;
			updatedBy: string;
		};

		// Sanity: original body matches SKILL.md on disk.
		const originalBody = skillItem.body;
		const diskBody = readFileSync(join(PLUGIN_ROOT, "skills", SKILL_DIR, "SKILL.md"), "utf-8");
		expect(originalBody).toBe(diskBody);

		// 3. Simulate a user edit via the knowledge PATCH route.
		const patchRes = await pluginsApp.request(`/api/knowledge/${skillId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				body: "USER EDITED CONTENT",
				updatedBy: "user-alice",
				version: skillItem.version,
			}),
		});
		expect(patchRes.status).toBe(200);

		// Verify the edit landed.
		const editedRes = await pluginsApp.request(`/api/knowledge/${skillId}`);
		expect(editedRes.status).toBe(200);
		const edited = (await editedRes.json()) as { body: string; updatedBy: string };
		expect(edited.body).toBe("USER EDITED CONTENT");
		expect(edited.updatedBy).toBe("user-alice");

		// 4. Call the restore route.
		const restoreRes = await pluginsApp.request(`/api/plugins/${PLUGIN_ID}/contributions/restore`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ kind: "knowledge", entityId: skillId }),
		});
		expect(restoreRes.status).toBe(200);
		const restoreBody = (await restoreRes.json()) as { ok: boolean; entityId: string };
		expect(restoreBody.ok).toBe(true);

		// 5. Confirm body is back to original, updatedBy reset to plugin.
		const restoredRes = await pluginsApp.request(`/api/knowledge/${skillId}`);
		expect(restoredRes.status).toBe(200);
		const restored = (await restoredRes.json()) as { body: string; updatedBy: string };
		expect(restored.body).toBe(originalBody);
	});

	// Uses the standard `app` fixture (no pluginsBaseDir) to prove that trying
	// to restore a skill when install_path is null returns a clear error.
	test("restore without install_path returns NO_INSTALL_PATH", async ({ db, app }) => {
		await seedFounder(db);
		const pluginDir = copyPlugin();
		const installRes = await app.request("/api/plugins", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				source: { type: "folder", path: pluginDir },
				scope: { kind: "factory" },
			}),
		});
		expect(installRes.status).toBe(201);

		const restoreRes = await app.request(`/api/plugins/${PLUGIN_ID}/contributions/restore`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				kind: "knowledge",
				entityId: skillItemId(PLUGIN_ID, SKILL_DIR, "factory", null),
			}),
		});
		expect(restoreRes.status).toBe(422);
		const body = (await restoreRes.json()) as { code: string };
		expect(body.code).toBe("NO_INSTALL_PATH");
	});
});
