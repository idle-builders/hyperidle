/**
 * The document module's plugin behaviour — architecture.md §8.3/B10: a
 * plugin's skill is a document now, upserted through `edit_document`'s
 * read-then-edit path rather than a raw repository write.
 *
 * Three things, one plugin, one install:
 *   (i)   the contributed document exists with `slot: "skill"`;
 *   (ii)  a reinstall over a person-edited body leaves the body alone —
 *         `edit_document`'s upsert never sends `body` on an existing row;
 *   (iii) disable archives exactly the contributed ids — a `document`
 *         contribution the plugin no longer owns is untouched.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { documents, pluginContributions, users } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const API_KEY = "test-plugin-skill-reinstall";
const PLUGIN_ID = "skill-reinstall-under-test";
const SKILL_DIR = "sweep";
const ORIGINAL_BODY = "# Sweep\n\nDo the sweep.";

function auth(): Record<string, string> {
	return { "X-API-Key": API_KEY, "Content-Type": "application/json" };
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

/** A minimal plugin with one skill and nothing else — a `document`
 * contribution, no agent, no routine. */
function makePlugin(): string {
	const dir = join(tmpdir(), `skill-reinstall-${Date.now()}-${Math.round(performance.now())}`);
	mkdirSync(join(dir, "skills", SKILL_DIR), { recursive: true });
	writeFileSync(join(dir, "skills", SKILL_DIR, "SKILL.md"), ORIGINAL_BODY);
	writeFileSync(
		join(dir, "plugin.json"),
		JSON.stringify({
			$schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
			name: PLUGIN_ID,
			version: "1.0.0",
			extensions: { "io.hyperidle": {} },
		}),
	);
	tempDirs.push(dir);
	return dir;
}

async function install(app: Hono): Promise<void> {
	const res = await app.request("/api/plugins", {
		method: "POST",
		headers: auth(),
		body: JSON.stringify({
			source: { type: "folder", path: makePlugin() },
			scope: { kind: "factory" },
		}),
	});
	if (res.status !== 201) {
		throw new Error(`Install failed: ${JSON.stringify(await res.json())}`);
	}
}

describe("a plugin's skill is a document, upserted through edit_document", () => {
	test("install writes the contributed document with slot: skill", async ({ db, app }) => {
		await db.insert(users).values({
			id: "u-founder",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: "2026-01-01T00:00:00Z",
		});

		await install(app);

		const [contribution] = await db
			.select()
			.from(pluginContributions)
			.where(
				and(eq(pluginContributions.pluginId, PLUGIN_ID), eq(pluginContributions.kind, "document")),
			);
		expect(contribution, "the plugin's skill is a recorded document contribution").toBeDefined();

		const [doc] = await db
			.select()
			.from(documents)
			.where(eq(documents.id, String(contribution?.entityId)));
		expect(doc?.body).toBe(ORIGINAL_BODY);
		expect(doc?.slot).toBe("skill");
		expect(doc?.status).toBe("active");
	});

	test("a reinstall over a person-edited body leaves the body alone", async ({ db, app }) => {
		await db.insert(users).values({
			id: "u-founder",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: "2026-01-01T00:00:00Z",
		});

		await install(app);
		const [contribution] = await db
			.select()
			.from(pluginContributions)
			.where(
				and(eq(pluginContributions.pluginId, PLUGIN_ID), eq(pluginContributions.kind, "document")),
			);
		const documentId = String(contribution?.entityId);

		const EDITED_BODY = "My own version of the sweep, written by hand.";
		await db.update(documents).set({ body: EDITED_BODY }).where(eq(documents.id, documentId));

		// Reinstall — `edit_document`'s upsert never sends `body` on an id that
		// already exists (architecture.md §8.3), so the person's edit survives.
		await install(app);

		const [reinstalled] = await db.select().from(documents).where(eq(documents.id, documentId));
		expect(reinstalled?.body).toBe(EDITED_BODY);
	});

	test("disable archives exactly the contributed ids", async ({ db, app }) => {
		await db.insert(users).values({
			id: "u-founder",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: "2026-01-01T00:00:00Z",
		});
		const now = "2026-01-01T00:00:00Z";
		await db.insert(documents).values({
			id: "doc-unrelated",
			scopeKind: "factory",
			scopeId: null,
			title: "Not this plugin's",
			body: "untouched",
			format: "markdown",
			status: "active",
			slot: "ordinary",
			updatedBy: "u-founder",
			createdAt: now,
			updatedAt: now,
		});

		await install(app);
		const [contribution] = await db
			.select()
			.from(pluginContributions)
			.where(
				and(eq(pluginContributions.pluginId, PLUGIN_ID), eq(pluginContributions.kind, "document")),
			);
		const documentId = String(contribution?.entityId);

		const res = await app.request(`/api/plugins/${PLUGIN_ID}/disable`, {
			method: "POST",
			headers: auth(),
		});
		expect(res.status).toBe(200);

		const [contributed] = await db.select().from(documents).where(eq(documents.id, documentId));
		expect(contributed?.status, "the contributed document is archived").toBe("archived");

		const [unrelated] = await db.select().from(documents).where(eq(documents.id, "doc-unrelated"));
		expect(unrelated?.status, "a document this plugin never contributed is untouched").toBe(
			"active",
		);
	});
});
