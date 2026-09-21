/**
 * A plugin that contributes an agent contributes who that agent is.
 *
 * This was the gap BA9f named: "a plugin contributing an agent had nothing to
 * contribute its identity to". The identity is a knowledge document now, so a
 * plugin's agent gets one — sourced from a file in the plugin, the way a skill
 * is.
 *
 * It is what lets the role personas leave the runtime. HyperIdle ships a single
 * agent with a bare AGENTS.md; a builder, a designer, a PM are things a plugin
 * brings, not things the product has opinions about.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { documents, type HyperIdleDb, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

/** The install route writes documents through `edit_document`, which needs a
 * real actor for the `changes` row it appends — the auth middleware's
 * API-key fallback resolves to this id when no human is seeded.
 * `onConflictDoNothing` so a second install in the same test is safe. */
async function seedFounder(db: HyperIdleDb): Promise<void> {
	await db
		.insert(users)
		.values({
			id: "u-founder",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: "2026-01-01T00:00:00Z",
		})
		.onConflictDoNothing();
}

const API_KEY = "test-ba9g-agent-identity";
const PLUGIN_ID = "personas-under-test";

function auth(): Record<string, string> {
	return { "X-API-Key": API_KEY, "Content-Type": "application/json" };
}

const tempDirs: string[] = [];

beforeEach(() => {
	vi.stubEnv("HYPERIDLE_API_KEY", API_KEY);
});
afterEach(() => {
	for (const dir of tempDirs) {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {}
	}
	tempDirs.length = 0;
	vi.unstubAllEnvs();
});

const PERSONA = "# You are a Builder\n\nYou implement features from plans.";

/** A minimal plugin whose one agent carries an identity file. */
function makePlugin(): string {
	const dir = join(tmpdir(), `ba9g-pa-${Date.now()}-${Math.round(performance.now())}`);
	mkdirSync(join(dir, "personas"), { recursive: true });
	writeFileSync(join(dir, "personas", "builder.md"), PERSONA);
	writeFileSync(
		join(dir, "plugin.json"),
		JSON.stringify({
			$schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
			name: PLUGIN_ID,
			version: "1.0.0",
			extensions: {
				"io.hyperidle": {
					agents: [
						{
							id: "builder",
							name: "Builder",
							role: "builder",
							agentCategory: "team",
							identity: "personas/builder.md",
						},
					],
				},
			},
		}),
	);
	tempDirs.push(dir);
	return dir;
}

async function install(db: HyperIdleDb, app: Hono): Promise<void> {
	await seedFounder(db);
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

describe("a plugin's agent comes with an identity", () => {
	test("installing materialises the agent and its identity document", async ({ db, app }) => {
		await install(db, app);

		const [agent] = await db.select().from(users).where(eq(users.role, "builder"));
		expect(agent, "the plugin's agent exists").toBeDefined();

		const [identity] = await db
			.select()
			.from(documents)
			.where(eq(documents.scopeId, String(agent?.id)));

		expect(identity?.body, "and it says who the agent is").toBe(PERSONA);
		// The binding session assembly reads, and the role that makes it an
		// agent file rather than ordinary knowledge.
		expect(identity?.slot).toBe("agent_file");
		expect(identity?.scopeKind).toBe("user");
		// The parent slot — the binding `getAgentIdentity` actually reads.
		expect(identity?.parentKind).toBe("agent");
		expect(identity?.parentId).toBe(agent?.id);
	});

	// @lore document-module B10: the legacy `upsertKnowledgeDocument` repaired
	// a parentless row's binding on every reinstall (a pre-parent-column
	// migration artifact). `edit_document`'s I10 (`slotted_document_cannot_move`,
	// `framework/domain-model/src/actions/document.ts`) is a locked invariant
	// from an earlier phase of this same item: a slotted document's parent is
	// fixed at create and refused on every edit that names one, unconditionally
	// — so this door cannot "repair" a parent even to its own value. Nothing
	// this module writes going forward ever omits its parent at create, so the
	// state this test simulated (`parentKind: null` on an `agent_file` row) can
	// no longer arise from any real install path; the case it proved is retired
	// with the mechanism it exercised, not weakened.
	test("the identity appears in the plugin's contributions", async ({ db, app }) => {
		await install(db, app);

		const res = await app.request("/api/plugins", { headers: auth() });
		const body = (await res.json()) as {
			plugins: Array<{ id: string; contributions: Array<{ kind: string; label: string }> }>;
		};
		const contributions = body.plugins.find((p) => p.id === PLUGIN_ID)?.contributions ?? [];

		expect(contributions.some((c) => c.kind === "agent" && c.label === "Builder")).toBe(true);
		expect(
			contributions.some((c) => c.kind === "document" && c.label.includes("Builder")),
			"its identity is a contribution too, so uninstall takes it",
		).toBe(true);
	});

	test("uninstalling takes the identity down with the agent", async ({ db, app }) => {
		await install(db, app);
		const [agent] = await db.select().from(users).where(eq(users.role, "builder"));

		const del = await app.request(`/api/plugins/${PLUGIN_ID}`, {
			method: "DELETE",
			headers: auth(),
		});
		expect(del.status).toBe(200);

		const [identity] = await db
			.select()
			.from(documents)
			.where(eq(documents.scopeId, String(agent?.id)));
		expect(identity?.status, "a removed plugin's persona reaches no session").toBe("archived");
	});

	// @lore BA9g: restore was DEAD for exactly this plugin shape. `install_path`
	// was persisted only when a plugin had skills or MCP servers, and a personas
	// plugin has neither — so restore answered NO_INSTALL_PATH forever, and even
	// past that, the source reader had no branch for an identity id. Tests stayed
	// green because none of them restored an identity.
	test("restoring an edited identity brings the plugin's version back", async ({
		db,
		pluginsApp,
	}) => {
		const app = pluginsApp;
		await db.insert(users).values({
			id: "u-founder-identity",
			name: "Founder",
			role: "founder",
			status: "active",
			kind: "human",
			createdAt: new Date().toISOString(),
		});
		await install(db, app);

		const [agent] = await db.select().from(users).where(eq(users.role, "builder"));
		const [identity] = await db
			.select()
			.from(documents)
			.where(eq(documents.scopeId, String(agent?.id)));
		expect(identity?.body).toBe(PERSONA);

		await app.request(`/api/knowledge/${identity?.id}`, {
			method: "PATCH",
			headers: { ...auth(), "X-Identity": "u-founder-identity" },
			body: JSON.stringify({
				version: identity?.version,
				updatedBy: "u-founder-identity",
				body: "My own idea of a builder.",
			}),
		});

		const res = await app.request(`/api/plugins/${PLUGIN_ID}/contributions/restore`, {
			method: "POST",
			headers: auth(),
			body: JSON.stringify({ kind: "document", entityId: identity?.id }),
		});
		expect(res.status, "restore must reach the plugin's own file").toBe(200);

		const [restored] = await db
			.select()
			.from(documents)
			.where(eq(documents.id, String(identity?.id)));
		expect(restored?.body, "the plugin's persona comes back").toBe(PERSONA);
	});

	test("a plugin-contributed routine's prompt is parented to the routine", async ({ db, app }) => {
		await seedFounder(db);
		const dir = join(tmpdir(), `ba9g-routine-prompt-${Date.now()}`);
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "plugin.json"),
			JSON.stringify({
				$schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
				name: "routine-prompt-under-test",
				version: "1.0.0",
				extensions: {
					"io.hyperidle": {
						agents: [{ id: "sweeper", name: "Sweeper", role: "builder", agentCategory: "team" }],
						routines: [
							{
								id: "weekly-sweep",
								name: "Weekly sweep",
								agentId: "sweeper",
								triggerType: "manual",
								prompt: "Sweep the stale items.",
							},
						],
					},
				},
			}),
		);
		tempDirs.push(dir);

		const res = await app.request("/api/plugins", {
			method: "POST",
			headers: auth(),
			body: JSON.stringify({ source: { type: "folder", path: dir }, scope: { kind: "factory" } }),
		});
		expect(res.status).toBe(201);

		const [routine] = await db.select().from(users).where(eq(users.name, "Sweeper"));
		expect(routine, "the plugin's agent exists").toBeDefined();

		const [promptDoc] = await db
			.select()
			.from(documents)
			.where(eq(documents.body, "Sweep the stale items."));
		expect(promptDoc, "the routine's prompt document exists").toBeDefined();
		expect(promptDoc?.slot).toBe("prompt");
		expect(promptDoc?.parentKind).toBe("routine");
		expect(promptDoc?.parentId).toBeTruthy();
	});

	test("an agent with no identity file is still installed, just bare", async ({ db, app }) => {
		await seedFounder(db);
		const dir = join(tmpdir(), `ba9g-bare-${Date.now()}`);
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "plugin.json"),
			JSON.stringify({
				$schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
				name: "bare-agent-plugin",
				version: "1.0.0",
				extensions: {
					"io.hyperidle": {
						agents: [{ id: "quiet", name: "Quiet", role: "builder", agentCategory: "team" }],
					},
				},
			}),
		);
		tempDirs.push(dir);

		const res = await app.request("/api/plugins", {
			method: "POST",
			headers: auth(),
			body: JSON.stringify({ source: { type: "folder", path: dir }, scope: { kind: "factory" } }),
		});
		expect(res.status).toBe(201);

		const [agent] = await db.select().from(users).where(eq(users.name, "Quiet"));
		expect(agent, "the agent installs without an identity").toBeDefined();
	});
});
