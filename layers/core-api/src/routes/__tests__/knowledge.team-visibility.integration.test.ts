/**
 * @lore nested-knowledge-items architecture.md §4 D2 / review.md B2 & B3 — the
 * team-scope visibility rule, proven at the real HTTP route, not just the
 * repository function. Before this fix `GET /api/knowledge` used
 * `{visibleWithSignals}`, whose only predicate was the pre-existing Q2
 * private-user check — a team-scoped row was returned to everybody. And
 * `GET /knowledge/:id`'s `children` array had no visibility filter at all —
 * a non-member opening a shared parent saw every team-scoped and private
 * child's title through `ChildrenCard`.
 *
 * `list({tree})`/`list({childrenOf})` already had their own repository-level
 * coverage (knowledge-tree-reads.integration.test.ts); this file is the
 * missing piece review.md named directly — a production caller wiring that
 * read into the route a real request hits.
 */
import { documents, type HyperIdleDb, teams, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";
import { createTestApp } from "../../__testing__/test-utils.js";

const TEST_API_KEY = "test-key-team-visibility";
const ACTOR_OVERRIDE_HEADER = "x-hyperidle-actor-id";

function authHeaders(actorId?: string): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...(actorId ? { [ACTOR_OVERRIDE_HEADER]: actorId } : {}),
	};
}

async function seedTeam(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(teams).values({
		id,
		name: id,
		phase: "build",
		createdAt: new Date().toISOString(),
	});
}

async function seedUser(db: HyperIdleDb, id: string, teamId: string | null): Promise<void> {
	await db.insert(users).values({
		id,
		name: id,
		role: "founder",
		status: "active",
		kind: "human",
		teamId,
		createdAt: new Date().toISOString(),
	});
}

async function seedKnowledgeItem(
	db: HyperIdleDb,
	id: string,
	opts: {
		scopeKind: string;
		scopeId?: string | null;
		updatedBy: string;
		parentKind?: string | null;
		parentId?: string | null;
	},
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(documents).values({
		id,
		title: `Item ${id}`,
		body: "body",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: opts.updatedBy,
		scopeKind: opts.scopeKind,
		scopeId: opts.scopeId ?? null,
		parentKind: opts.parentKind ?? null,
		parentId: opts.parentId ?? null,
		createdAt: now,
		updatedAt: now,
	});
}

describe("knowledge team-scope visibility at the real route", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("GET /api/knowledge excludes a team-scoped item for a viewer outside that team", async ({
		db,
		eventBus,
	}) => {
		await seedTeam(db, "team-1");
		await seedTeam(db, "team-2");
		await seedUser(db, "u-member", "team-1");
		await seedUser(db, "u-outsider", "team-2");
		await seedKnowledgeItem(db, "ki-team-1", {
			scopeKind: "team",
			scopeId: "team-1",
			updatedBy: "u-member",
		});

		const app = await createTestApp({ db, eventBus });

		const outsiderRes = await app.request("/api/knowledge", { headers: authHeaders("u-outsider") });
		const outsiderBody = (await outsiderRes.json()) as { items: Array<{ id: string }> };
		expect(outsiderBody.items.map((i) => i.id)).not.toContain("ki-team-1");

		const memberRes = await app.request("/api/knowledge", { headers: authHeaders("u-member") });
		const memberBody = (await memberRes.json()) as { items: Array<{ id: string }> };
		expect(memberBody.items.map((i) => i.id)).toContain("ki-team-1");
	});

	test("GET /knowledge/:id children excludes a team-scoped child for a non-member — ChildrenCard must not leak the title", async ({
		db,
		eventBus,
	}) => {
		await seedTeam(db, "team-1");
		await seedTeam(db, "team-2");
		await seedUser(db, "u-member", "team-1");
		await seedUser(db, "u-outsider", "team-2");
		await seedKnowledgeItem(db, "ki-parent", { scopeKind: "factory", updatedBy: "u-member" });
		await seedKnowledgeItem(db, "ki-child-team", {
			scopeKind: "team",
			scopeId: "team-1",
			updatedBy: "u-member",
			parentKind: "document",
			parentId: "ki-parent",
		});

		const app = await createTestApp({ db, eventBus });

		const outsiderRes = await app.request("/api/knowledge/ki-parent", {
			headers: authHeaders("u-outsider"),
		});
		const outsiderBody = (await outsiderRes.json()) as { children: Array<{ id: string }> };
		expect(outsiderBody.children.map((c) => c.id)).not.toContain("ki-child-team");

		const memberRes = await app.request("/api/knowledge/ki-parent", {
			headers: authHeaders("u-member"),
		});
		const memberBody = (await memberRes.json()) as { children: Array<{ id: string }> };
		expect(memberBody.children.map((c) => c.id)).toContain("ki-child-team");
	});

	// review.md B1: the team filter landed on the Children card but not the
	// Backlinks card (`relatedItems`, `childrenAndSiblings`) directly beneath
	// it — a viewer outside the item's team saw every team-scoped child's
	// title through Backlinks even though Children correctly hid it.
	test("GET /knowledge/:id relatedItems excludes a team-scoped child for a non-member — BacklinksCard must not leak the title", async ({
		db,
		eventBus,
	}) => {
		await seedTeam(db, "team-1");
		await seedTeam(db, "team-2");
		await seedUser(db, "u-member", "team-1");
		await seedUser(db, "u-outsider", "team-2");
		await seedKnowledgeItem(db, "ki-parent", { scopeKind: "factory", updatedBy: "u-member" });
		await seedKnowledgeItem(db, "ki-child-team", {
			scopeKind: "team",
			scopeId: "team-1",
			updatedBy: "u-member",
			parentKind: "document",
			parentId: "ki-parent",
		});

		const app = await createTestApp({ db, eventBus });

		const outsiderRes = await app.request("/api/knowledge/ki-parent", {
			headers: authHeaders("u-outsider"),
		});
		const outsiderBody = (await outsiderRes.json()) as { relatedItems: Array<{ id: string }> };
		expect(outsiderBody.relatedItems.map((r) => r.id)).not.toContain("ki-child-team");

		const memberRes = await app.request("/api/knowledge/ki-parent", {
			headers: authHeaders("u-member"),
		});
		const memberBody = (await memberRes.json()) as { relatedItems: Array<{ id: string }> };
		expect(memberBody.relatedItems.map((r) => r.id)).toContain("ki-child-team");
	});
});
