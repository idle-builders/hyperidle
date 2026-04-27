/**
 * L3 — Thread List / Queue Rendering. Server enrichment tests (red phase).
 *
 * Plan §3.3 + §5.10: GET /api/conversations enriched response per thread:
 *   - lastActivityAt: ISO8601 of MAX(items.created_at), COALESCE to thread.created_at.
 *   - participants: parsed JSON array (for client-side Coach/CoS detection).
 *   - blocking: true iff any non-resolved item has blocking=1.
 *   - resolvedAt: present (null until lifecycle ships).
 *   - routedToActorRole: 'CEO' | 'CPO' | null (avoids second hook).
 *
 * The route does not yet emit these fields; these tests MUST FAIL today.
 */
import { createTestDb, type HyperIdleDb, items, products, teams, threads } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { sql } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-conversations-list-l3";
const NOW = "2026-04-26T12:00:00.000Z";
const NOW_MS = Date.parse(NOW);

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

function seedActors(db: HyperIdleDb): void {
	db.run(
		sql.raw(
			`INSERT INTO actors (id, role, domain_tags, created_at) VALUES ('actor:ceo','CEO','["growth"]','${NOW}')`,
		),
	);
	db.run(
		sql.raw(
			`INSERT INTO actors (id, role, domain_tags, created_at) VALUES ('actor:cpo','CPO','["product"]','${NOW}')`,
		),
	);
}

interface EnrichedThread {
	id: string;
	kind: string;
	pinned: number | boolean;
	participants: string[] | string | null;
	createdAt: string;
	lastActivityAt: string;
	blocking?: boolean;
	resolvedAt?: string | null;
	routedToActorId?: string | null;
	routedToActorRole?: string | null;
}

describe("L3 — GET /api/conversations enrichment", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		seedActors(db);
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });

		db.insert(products).values({ id: "prod-1", name: "P", phase: "build", createdAt: NOW }).run();
		db.insert(teams)
			.values({
				id: "team-1",
				productId: "prod-1",
				capacity: 3,
				activeBets: 0,
				formedAt: NOW,
			})
			.run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("includes lastActivityAt per thread = MAX(items.created_at) coalesced to thread.createdAt", async () => {
		const threadCreated = new Date(NOW_MS - 60_000).toISOString();
		db.insert(threads)
			.values({
				id: "t-1",
				kind: "review",
				participants: JSON.stringify(["seed-agent-cos"]),
				createdAt: threadCreated,
			})
			.run();

		// Two items: most recent at NOW_MS - 5_000.
		const itemEarlier = new Date(NOW_MS - 30_000).toISOString();
		const itemLatest = new Date(NOW_MS - 5_000).toISOString();
		db.insert(items)
			.values({ id: "i-1", title: "first", threadId: "t-1", createdAt: itemEarlier })
			.run();
		db.insert(items)
			.values({ id: "i-2", title: "latest", threadId: "t-1", createdAt: itemLatest })
			.run();

		const res = await app.request("/api/conversations", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { threads: EnrichedThread[] };
		const t = body.threads.find((x) => x.id === "t-1");
		expect(t).toBeDefined();
		expect(t?.lastActivityAt).toBe(itemLatest);
	});

	it("falls back lastActivityAt to thread.createdAt when there are no items", async () => {
		const threadCreated = new Date(NOW_MS - 90_000).toISOString();
		db.insert(threads).values({ id: "t-empty", kind: "chat", createdAt: threadCreated }).run();
		const res = await app.request("/api/conversations", { headers: authHeaders() });
		const body = (await res.json()) as { threads: EnrichedThread[] };
		const t = body.threads.find((x) => x.id === "t-empty");
		expect(t).toBeDefined();
		expect(t?.lastActivityAt).toBe(threadCreated);
	});

	it("returns participants as a parsed array (for Coach/CoS detection on the client)", async () => {
		db.insert(threads)
			.values({
				id: "t-coach",
				kind: "chat",
				participants: JSON.stringify(["seed-agent-cos", "actor:ceo"]),
				createdAt: NOW,
			})
			.run();

		const res = await app.request("/api/conversations", { headers: authHeaders() });
		const body = (await res.json()) as { threads: EnrichedThread[] };
		const t = body.threads.find((x) => x.id === "t-coach");
		expect(t).toBeDefined();
		expect(Array.isArray(t?.participants)).toBe(true);
		expect(t?.participants).toEqual(expect.arrayContaining(["seed-agent-cos"]));
	});

	it("derives blocking=true when at least one item has blocking=1", async () => {
		db.insert(threads).values({ id: "t-blk", kind: "review", createdAt: NOW }).run();
		db.insert(items)
			.values({
				id: "i-blk",
				title: "blk",
				threadId: "t-blk",
				blocking: 1,
				createdAt: NOW,
			})
			.run();

		const res = await app.request("/api/conversations", { headers: authHeaders() });
		const body = (await res.json()) as { threads: EnrichedThread[] };
		const t = body.threads.find((x) => x.id === "t-blk");
		expect(t?.blocking).toBe(true);
	});

	it("derives blocking=false when no items are blocking", async () => {
		db.insert(threads).values({ id: "t-nb", kind: "chat", createdAt: NOW }).run();
		db.insert(items)
			.values({ id: "i-nb", title: "n", threadId: "t-nb", blocking: 0, createdAt: NOW })
			.run();

		const res = await app.request("/api/conversations", { headers: authHeaders() });
		const body = (await res.json()) as { threads: EnrichedThread[] };
		const t = body.threads.find((x) => x.id === "t-nb");
		expect(t?.blocking).toBe(false);
	});

	it("includes routedToActorRole resolved against the actors table", async () => {
		db.insert(threads)
			.values({
				id: "t-routed",
				kind: "review",
				routedToActorId: "actor:cpo",
				createdAt: NOW,
			})
			.run();

		const res = await app.request("/api/conversations", { headers: authHeaders() });
		const body = (await res.json()) as { threads: EnrichedThread[] };
		const t = body.threads.find((x) => x.id === "t-routed");
		expect(t?.routedToActorId).toBe("actor:cpo");
		expect(t?.routedToActorRole).toBe("CPO");
	});

	it("routedToActorRole is null when the thread is unrouted", async () => {
		db.insert(threads)
			.values({ id: "t-unrouted", kind: "chat", routedToActorId: null, createdAt: NOW })
			.run();

		const res = await app.request("/api/conversations", { headers: authHeaders() });
		const body = (await res.json()) as { threads: EnrichedThread[] };
		const t = body.threads.find((x) => x.id === "t-unrouted");
		expect(t?.routedToActorId).toBeNull();
		expect(t?.routedToActorRole).toBeNull();
	});

	it("includes resolvedAt field on every row (null until lifecycle wires it)", async () => {
		db.insert(threads).values({ id: "t-1", kind: "review", createdAt: NOW }).run();
		const res = await app.request("/api/conversations", { headers: authHeaders() });
		const body = (await res.json()) as { threads: EnrichedThread[] };
		const t = body.threads.find((x) => x.id === "t-1");
		// Field is present on the response shape (own property), even if null.
		expect(t).toBeDefined();
		expect(Object.hasOwn(t as object, "resolvedAt")).toBe(true);
	});
});
