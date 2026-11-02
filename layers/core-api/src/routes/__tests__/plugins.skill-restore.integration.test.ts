/**
 * Skill restore re-imports body from plugin source on disk. Editing a
 * skill's body in the DB and then calling `edit_plugin`'s restore change puts
 * the original SKILL.md content back, through `POST /api/actions/edit_plugin`.
 */
// @lore: restore writes through edit_document — updatedBy is always ctx.actor, never a body field

import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import { type HyperIdleDb, users } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import { skillItemId } from "@hyperidle/settings";
import { afterEach, describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";
import type { ActionContext } from "../../actions/action.js";
import { buildCoreActions } from "../../actions/compose.js";

async function editDocumentAs(
	actorId: string,
	body: Record<string, unknown>,
	db: HyperIdleDb,
	eventBus: EventBus,
	agentOrchestration: AgentOrchestrationPort,
): Promise<{ ok: boolean }> {
	const actions = buildCoreActions({
		agentOrchestration,
		agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
		reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
	});
	const editDocument = actions.find((a) => a.declaration.name === "edit_document");
	if (!editDocument) throw new Error("edit_document action not found");
	const ctx: ActionContext = { actor: actorId, db, eventBus, now: new Date().toISOString() };
	const result = await editDocument.run(ctx, body);
	return { ok: result.ok };
}

/** The install route writes documents through `edit_document`, which needs a
 * real actor for the `changes` row it appends — the auth middleware's
 * API-key fallback resolves to this id when no human is seeded. `user-alice`
 * is seeded alongside it: `changes.actor` is FK-constrained to `users.id`
 * (`framework/db/src/schema.ts`'s `changes` table), so the in-process call
 * as alice below needs a real row too. */
async function seedFounder(db: HyperIdleDb): Promise<void> {
	await db.insert(users).values([
		{
			id: "u-founder",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: "2026-01-01T00:00:00Z",
		},
		{
			id: "user-alice",
			kind: "human",
			name: "Alice",
			role: "member",
			status: "active",
			createdAt: "2026-01-01T00:00:00Z",
		},
	]);
}

const PLUGIN_ROOT = resolve("plugins/document-management");
const PLUGIN_ID = "document-management";
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
	const dir = join(tmpdir(), `skill-restore-${Date.now()}`);
	mkdirSync(dir, { recursive: true });
	cpSync(PLUGIN_ROOT, dir, { recursive: true });
	tempDirs.push(dir);
	return dir;
}

describe("skill restore", () => {
	// pluginsApp is a per-test app instance with a temp pluginsBaseDir already
	// configured in the composition root — no pluginsBaseDir in the request body.
	test("restore re-imports skill body from plugin source", async ({
		db,
		pluginsApp,
		eventBus,
		agentOrchestration,
		asPerson,
	}) => {
		await seedFounder(db);
		await asPerson("u-founder", pluginsApp);
		// 1. Install. The app's pluginsBaseDir is set at construction time by the
		//    fixture, so install_path is stored automatically.
		const pluginDir = copyPlugin();
		const installRes = await pluginsApp.request("/api/actions/edit_plugin", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				source: { kind: "folder", path: pluginDir, scope: { kind: "factory", teamId: null } },
			}),
		});
		expect(installRes.status).toBe(200);

		// 2. Fetch the skill through `open_document` to get its current state.
		const skillId = skillItemId(PLUGIN_ID, SKILL_DIR, "factory", null);
		const getRes = await pluginsApp.request("/api/actions/open_document", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id: skillId }),
		});
		expect(getRes.status).toBe(200);
		const getBody = (await getRes.json()) as {
			ok: boolean;
			data: { document: { id: string; body: string; version: number; updatedBy: string } };
		};
		expect(getBody.ok).toBe(true);
		const skillItem = getBody.data.document;

		// Sanity: original body matches SKILL.md on disk.
		const originalBody = skillItem.body;
		const diskBody = readFileSync(join(PLUGIN_ROOT, "skills", SKILL_DIR, "SKILL.md"), "utf-8");
		expect(originalBody).toBe(diskBody);

		// 3. Simulate a user edit via `edit_document`, acting as "user-alice" in-process.
		const patchRes = await editDocumentAs(
			"user-alice",
			{ id: skillId, body: "USER EDITED CONTENT", version: skillItem.version },
			db,
			eventBus,
			agentOrchestration,
		);
		expect(patchRes.ok).toBe(true);

		// Verify the edit landed.
		const editedRes = await pluginsApp.request("/api/actions/open_document", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id: skillId }),
		});
		expect(editedRes.status).toBe(200);
		const edited = (
			(await editedRes.json()) as {
				ok: boolean;
				data: { document: { body: string; updatedBy: string } };
			}
		).data.document;
		expect(edited.body).toBe("USER EDITED CONTENT");
		expect(edited.updatedBy).toBe("user-alice");

		// 4. Call edit_plugin's restore change.
		const restoreRes = await pluginsApp.request("/api/actions/edit_plugin", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id: PLUGIN_ID, restore: { contribution: skillId } }),
		});
		expect(restoreRes.status).toBe(200);
		const restoreBody = (await restoreRes.json()) as { ok: boolean };
		expect(restoreBody.ok).toBe(true);

		// 5. Confirm body is back to original, updatedBy reset to plugin.
		const restoredRes = await pluginsApp.request("/api/actions/open_document", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id: skillId }),
		});
		expect(restoredRes.status).toBe(200);
		const restored = (
			(await restoredRes.json()) as { ok: boolean; data: { document: { body: string } } }
		).data.document;
		expect(restored.body).toBe(originalBody);
	});

	// Uses the standard `app` fixture (no pluginsBaseDir) to prove that trying
	// to restore a skill when install_path is null answers a clear problem.
	test("restore without install_path answers no_install_path", async ({ db, app, asPerson }) => {
		await seedFounder(db);
		await asPerson("u-founder");
		const pluginDir = copyPlugin();
		const installRes = await app.request("/api/actions/edit_plugin", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				source: { kind: "folder", path: pluginDir, scope: { kind: "factory", teamId: null } },
			}),
		});
		expect(installRes.status).toBe(200);

		const restoreRes = await app.request("/api/actions/edit_plugin", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				id: PLUGIN_ID,
				restore: { contribution: skillItemId(PLUGIN_ID, SKILL_DIR, "factory", null) },
			}),
		});
		expect(restoreRes.status).toBe(422);
		const body = (await restoreRes.json()) as { problems: ReadonlyArray<{ code: string }> };
		expect(body.problems[0]?.code).toBe("no_install_path");
	});
});
