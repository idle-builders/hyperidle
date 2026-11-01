/**
 * A plugin's contributions view lists what it actually contributed.
 *
 * The shipped `document-management` plugin brings one agent, three subscriptions
 * and three skills — `users`, `subscriptions` and `documents` rows. The view
 * asks the contribution registry, which names every one of them.
 */

import { cpSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type HyperIdleDb, users } from "@hyperidle/db";
import type { Hono } from "hono";
import { afterEach, describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const API_KEY = "test-contributions";
const PLUGIN_ROOT = resolve("plugins/document-management");
const PLUGIN_ID = "document-management";

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

async function editPlugin(app: Hono, body: unknown): Promise<Response> {
	return app.request("/api/actions/edit_plugin", {
		method: "POST",
		headers: { ...auth(), "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

async function install(db: HyperIdleDb, app: Hono, asPerson: () => Promise<void>): Promise<void> {
	await seedFounder(db);
	await asPerson();
	const dir = join(tmpdir(), `contributions-${Date.now()}-${Math.round(performance.now())}`);
	mkdirSync(dir, { recursive: true });
	cpSync(PLUGIN_ROOT, dir, { recursive: true });
	tempDirs.push(dir);

	const res = await editPlugin(app, {
		source: { kind: "folder", path: dir, scope: { kind: "factory", teamId: null } },
	});
	if (res.status !== 200) {
		throw new Error(`Install failed: ${JSON.stringify(await res.json())}`);
	}
}

interface ContributionRow {
	readonly kind: string;
	readonly entityId?: string;
	readonly label?: string;
	readonly detachedAt: string | null;
}

async function contributionsOf(app: Hono): Promise<readonly ContributionRow[]> {
	const res = await app.request("/api/actions/search_plugins", {
		method: "POST",
		headers: { ...auth(), "Content-Type": "application/json" },
		body: JSON.stringify({}),
	});
	expect(res.status).toBe(200);
	const body = (await res.json()) as {
		data: Array<{ id: string; contributions: ContributionRow[] }>;
	};
	const plugin = body.data.find((p) => p.id === PLUGIN_ID);
	expect(plugin, "the installed plugin must be listed").toBeDefined();
	return plugin?.contributions ?? [];
}

describe("a plugin's contributions view lists what it contributed", () => {
	test("the shipped plugin's agent, subscriptions and skills all appear", async ({
		db,
		app,
		asPerson,
	}) => {
		await install(db, app, () => asPerson("u-founder"));

		const contributions = await contributionsOf(app);
		const byKind = new Map<string, number>();
		for (const c of contributions) byKind.set(c.kind, (byKind.get(c.kind) ?? 0) + 1);

		// One agent (the Document Librarian), three subscriptions, and documents for
		// the three skills plus each subscription's prompt document.
		expect(byKind.get("agent"), "its agent must appear").toBe(1);
		expect(byKind.get("subscription"), "its three subscriptions must appear").toBe(3);
		expect(byKind.get("document") ?? 0, "its skills must appear").toBeGreaterThanOrEqual(3);
	});

	test("each contribution names the row it points at", async ({ db, app, asPerson }) => {
		await install(db, app, () => asPerson("u-founder"));

		const contributions = await contributionsOf(app);
		for (const c of contributions) {
			expect(c.entityId?.length ?? 0, `${c.kind} contribution must name its row`).toBeGreaterThan(
				0,
			);
		}
	});

	test("each contribution carries a label a person can read", async ({ db, app, asPerson }) => {
		await install(db, app, () => asPerson("u-founder"));

		const contributions = await contributionsOf(app);
		// An id is not a name. The view is a list of what a plugin brought, so
		// each row says what the thing is called.
		for (const c of contributions) {
			expect(c.label, `${c.kind} ${c.entityId} must have a label`).toBeTruthy();
		}
		const labels = contributions.map((c) => c.label);
		expect(labels).toContain("Document Librarian");
	});

	test("nothing is detached until a person edits it", async ({ db, app, asPerson }) => {
		await install(db, app, () => asPerson("u-founder"));

		const contributions = await contributionsOf(app);
		expect(contributions.length).toBeGreaterThan(0);
		for (const c of contributions) {
			expect(c.detachedAt, `${c.kind} ${c.entityId} must start attached`).toBeNull();
		}
	});
});
