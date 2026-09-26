/**
 * A plugin that contributes an agent contributes who that agent is: the
 * identity is a document, sourced from a file in the plugin, the way a skill
 * is, and installed through `POST /api/actions/edit_plugin` / `search_plugins`.
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

/** The install path writes documents through `edit_document`, which needs a
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

async function editPlugin(app: Hono, body: unknown): Promise<Response> {
	return app.request("/api/actions/edit_plugin", {
		method: "POST",
		headers: auth(),
		body: JSON.stringify(body),
	});
}

async function install(db: HyperIdleDb, app: Hono): Promise<void> {
	await seedFounder(db);
	const res = await editPlugin(app, {
		source: { kind: "folder", path: makePlugin(), scope: { kind: "factory", teamId: null } },
	});
	if (res.status !== 200) {
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
		// agent file rather than an ordinary document.
		expect(identity?.slot).toBe("agent_file");
		expect(identity?.scopeKind).toBe("user");
		// The parent slot — the binding `getAgentIdentity` actually reads.
		expect(identity?.parentKind).toBe("agent");
		expect(identity?.parentId).toBe(agent?.id);
	});

	test("the identity appears in the plugin's contributions", async ({ db, app }) => {
		await install(db, app);

		const res = await app.request("/api/actions/search_plugins", {
			method: "POST",
			headers: auth(),
			body: JSON.stringify({}),
		});
		const body = (await res.json()) as {
			data: Array<{ id: string; contributions: Array<{ kind: string; label: string }> }>;
		};
		const contributions = body.data.find((p) => p.id === PLUGIN_ID)?.contributions ?? [];

		expect(contributions.some((c) => c.kind === "agent" && c.label === "Builder")).toBe(true);
		expect(
			contributions.some((c) => c.kind === "document" && c.label.includes("Builder")),
			"its identity is a contribution too, so uninstall takes it",
		).toBe(true);
	});

	test("uninstalling takes the identity down with the agent", async ({ db, app }) => {
		await install(db, app);
		const [agent] = await db.select().from(users).where(eq(users.role, "builder"));

		const del = await editPlugin(app, { id: PLUGIN_ID, remove: true });
		expect(del.status).toBe(200);

		const [identity] = await db
			.select()
			.from(documents)
			.where(eq(documents.scopeId, String(agent?.id)));
		expect(identity?.status, "a removed plugin's persona reaches no session").toBe("archived");
	});

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

		await app.request("/api/actions/edit_document", {
			method: "POST",
			headers: { ...auth(), "X-Identity": "u-founder-identity" },
			body: JSON.stringify({
				id: identity?.id,
				version: identity?.version,
				body: "My own idea of a builder.",
			}),
		});

		const res = await editPlugin(app, {
			id: PLUGIN_ID,
			restore: { contribution: identity?.id },
		});
		expect(res.status, "restore must reach the plugin's own file").toBe(200);

		const [restored] = await db
			.select()
			.from(documents)
			.where(eq(documents.id, String(identity?.id)));
		expect(restored?.body, "the plugin's persona comes back").toBe(PERSONA);
	});

	test("a plugin-contributed subscription's prompt is parented to the subscription", async ({
		db,
		app,
	}) => {
		await seedFounder(db);
		const dir = join(tmpdir(), `ba9g-subscription-prompt-${Date.now()}`);
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "plugin.json"),
			JSON.stringify({
				$schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
				name: "subscription-prompt-under-test",
				version: "1.0.0",
				extensions: {
					"io.hyperidle": {
						agents: [{ id: "sweeper", name: "Sweeper", role: "builder", agentCategory: "team" }],
						subscriptions: [
							{
								id: "weekly-sweep",
								name: "Weekly sweep",
								agentId: "sweeper",
								event: "task.changed",
								prompt: "Sweep the stale items.",
							},
						],
					},
				},
			}),
		);
		tempDirs.push(dir);

		const res = await editPlugin(app, {
			source: { kind: "folder", path: dir, scope: { kind: "factory", teamId: null } },
		});
		expect(res.status).toBe(200);

		const [subscriptionOwner] = await db.select().from(users).where(eq(users.name, "Sweeper"));
		expect(subscriptionOwner, "the plugin's agent exists").toBeDefined();

		const [promptDoc] = await db
			.select()
			.from(documents)
			.where(eq(documents.body, "Sweep the stale items."));
		expect(promptDoc, "the subscription's prompt document exists").toBeDefined();
		expect(promptDoc?.slot).toBe("prompt");
		expect(promptDoc?.parentKind).toBe("subscription");
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

		const res = await editPlugin(app, {
			source: { kind: "folder", path: dir, scope: { kind: "factory", teamId: null } },
		});
		expect(res.status).toBe(200);

		const [agent] = await db.select().from(users).where(eq(users.name, "Quiet"));
		expect(agent, "the agent installs without an identity").toBeDefined();
	});
});
