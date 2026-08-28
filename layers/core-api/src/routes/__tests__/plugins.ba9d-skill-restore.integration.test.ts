/**
 * BA9d D12: skill restore re-imports body from plugin source on disk.
 * Proves that editing a skill's body in the DB and then calling the restore
 * route puts the original SKILL.md content back, and that `updatedBy` is
 * reset to `plugin:<pluginId>`.
 */

import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { knowledgeItems } from "@hyperidle/db";
import { skillItemId } from "@hyperidle/settings";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const API_KEY = "test-ba9d-skill-restore";
const PLUGIN_ROOT = resolve("plugins/knowledge-management");
const PLUGIN_ID = "knowledge-management";
// One skill dirName from the plugin's skills/ directory.
const SKILL_DIR = "post-task-retro";

function auth(): Record<string, string> {
	return { "X-API-Key": API_KEY };
}

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
	test("restore re-imports skill body from plugin source, resets updatedBy", async ({
		db,
		app,
	}) => {
		// 1. Install with pluginsBaseDir so install_path is set.
		const pluginsBaseDir = join(tmpdir(), `ba9d-sr-base-${Date.now()}`);
		mkdirSync(pluginsBaseDir, { recursive: true });
		tempDirs.push(pluginsBaseDir);

		const pluginDir = copyPlugin();
		const installRes = await app.request("/api/plugins", {
			method: "POST",
			headers: { ...auth(), "Content-Type": "application/json" },
			body: JSON.stringify({
				source: { type: "folder", path: pluginDir },
				scope: { kind: "factory" },
				pluginsBaseDir,
			}),
		});
		expect(installRes.status).toBe(201);

		// 2. Look up the skill row by its deterministic hashed ID.
		const skillId = skillItemId(PLUGIN_ID, SKILL_DIR);
		const skillRows = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, skillId));
		const skillRow = skillRows[0];
		expect(skillRow).toBeDefined();
		const originalBody = skillRow!.body;
		// Sanity: original body matches SKILL.md on disk.
		const diskBody = readFileSync(join(PLUGIN_ROOT, "skills", SKILL_DIR, "SKILL.md"), "utf-8");
		expect(originalBody).toBe(diskBody);

		// 3. Simulate a user edit: overwrite body directly in the DB.
		await db
			.update(knowledgeItems)
			.set({ body: "USER EDITED CONTENT", updatedBy: "user-alice" })
			.where(eq(knowledgeItems.id, skillId));

		// Verify the edit landed.
		const edited = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, skillId));
		expect(edited[0]?.body).toBe("USER EDITED CONTENT");
		expect(edited[0]?.updatedBy).toBe("user-alice");

		// 4. Call the restore route.
		const restoreRes = await app.request(`/api/plugins/${PLUGIN_ID}/contributions/restore`, {
			method: "POST",
			headers: { ...auth(), "Content-Type": "application/json" },
			body: JSON.stringify({ kind: "skill", manifestKey: SKILL_DIR }),
		});
		expect(restoreRes.status).toBe(200);
		const restoreBody = (await restoreRes.json()) as { ok: boolean; key: string };
		expect(restoreBody.ok).toBe(true);

		// 5. Confirm body is back to original, updatedBy reset to plugin.
		const restored = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, skillId));
		expect(restored[0]?.body).toBe(originalBody);
		expect(restored[0]?.updatedBy).toBe(`plugin:${PLUGIN_ID}`);
	});

	test("restore without install_path returns NO_INSTALL_PATH", async ({ db, app }) => {
		// Install WITHOUT pluginsBaseDir — install_path will be null.
		const pluginDir = copyPlugin();
		const installRes = await app.request("/api/plugins", {
			method: "POST",
			headers: { ...auth(), "Content-Type": "application/json" },
			body: JSON.stringify({
				source: { type: "folder", path: pluginDir },
				scope: { kind: "factory" },
				// no pluginsBaseDir
			}),
		});
		expect(installRes.status).toBe(201);

		const restoreRes = await app.request(`/api/plugins/${PLUGIN_ID}/contributions/restore`, {
			method: "POST",
			headers: { ...auth(), "Content-Type": "application/json" },
			body: JSON.stringify({ kind: "skill", manifestKey: SKILL_DIR }),
		});
		expect(restoreRes.status).toBe(422);
		const body = (await restoreRes.json()) as { code: string };
		expect(body.code).toBe("NO_INSTALL_PATH");
	});
});
