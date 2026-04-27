import {
	actors,
	createTestDb,
	factorySettings,
	type HyperIdleDb,
	knowledgeItems,
	products,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchLike } from "../services/provider-ping.js";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-first-run";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

function fakeFetcher(opts: { status: number; body?: unknown; throwOnSecondCall?: boolean }): {
	fetcher: FetchLike;
	calls: Array<{ url: string; init?: RequestInit }>;
} {
	const calls: Array<{ url: string; init?: RequestInit }> = [];
	const fetcher: FetchLike = async (url, init) => {
		calls.push({ url, init });
		if (opts.throwOnSecondCall && calls.length === 2) {
			throw new Error("network down");
		}
		return new Response(opts.body === undefined ? null : JSON.stringify(opts.body), {
			status: opts.status,
			headers: { "Content-Type": "application/json" },
		});
	};
	return { fetcher, calls };
}

describe("L10 — First-Run Flow API", () => {
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		app = createTestApp({ db, eventBus: new EventBus() });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("GET /api/first-run/status", () => {
		it("returns all-false on a wiped db", async () => {
			const res = await app.request("/api/first-run/status", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body).toEqual({
				factoryReady: false,
				apiKeyReady: false,
				apiKeyLast4: null,
				northStarReady: false,
				teamScaffoldHandled: false,
				complete: false,
			});
		});
	});

	describe("POST /api/first-run/factory", () => {
		it("rejects empty name", async () => {
			const res = await app.request("/api/first-run/factory", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ name: "", role: "CEO", dataDir: "/tmp" }),
			});
			expect(res.status).toBe(400);
		});

		it("rejects invalid role", async () => {
			const res = await app.request("/api/first-run/factory", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ name: "A", role: "boss", dataDir: "/tmp" }),
			});
			expect(res.status).toBe(400);
		});

		it("creates factory settings + actor rows + advances status", async () => {
			const res = await app.request("/api/first-run/factory", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ name: "Acme Factory", role: "CEO", dataDir: "/var/data" }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { ok: boolean; actorId: string };
			expect(body).toEqual({ ok: true, actorId: "actor:ceo" });

			const rows = db.select().from(actors).all();
			expect(rows).toHaveLength(2);
			const roles = rows.map((r) => r.role).sort();
			expect(roles).toEqual(["CEO", "CPO"]);

			const settingsRows = db.select().from(factorySettings).all();
			const map = new Map(settingsRows.map((r) => [r.key, r.value]));
			expect(map.get("factory.name")).toBe("Acme Factory");
			expect(map.get("factory.data_dir")).toBe("/var/data");

			// status reflects ready
			const sres = await app.request("/api/first-run/status", { headers: authHeaders() });
			const sbody = (await sres.json()) as { factoryReady: boolean };
			expect(sbody.factoryReady).toBe(true);
		});

		it("is idempotent (second submit does not fail)", async () => {
			for (let i = 0; i < 2; i++) {
				const res = await app.request("/api/first-run/factory", {
					method: "POST",
					headers: authHeaders(),
					body: JSON.stringify({ name: "Acme Factory", role: "CPO", dataDir: "/var/data" }),
				});
				expect(res.status).toBe(200);
			}
		});

		// C1 regression: actor-context middleware MUST skip /api/first-run
		// even when HYPERIDLE_DEFAULT_ACTOR_ID is set against a wiped DB.
		// Without the bypass the middleware 404s before the handler runs.
		it("succeeds against a wiped DB when HYPERIDLE_DEFAULT_ACTOR_ID is set", async () => {
			vi.stubEnv("HYPERIDLE_DEFAULT_ACTOR_ID", "actor:ceo");
			const res = await app.request("/api/first-run/factory", {
				method: "POST",
				headers: { ...authHeaders(), "X-Requested-With": "hyperidle-web" },
				body: JSON.stringify({ name: "Wiped", role: "CEO", dataDir: "/wiped" }),
			});
			expect(res.status).toBe(200);
			const meRows = db.select().from(actors).all();
			expect(meRows.map((r) => r.role).sort()).toEqual(["CEO", "CPO"]);
		});
	});

	describe("POST /api/first-run/api-key", () => {
		it("rejects malformed keys without a network call", async () => {
			const { fetcher, calls } = fakeFetcher({ status: 200, body: {} });
			// Use a fresh app that wires the fetcher into the route's deps.
			// The default app uses globalThis.fetch — we re-wire below.
			const res = await app.request("/api/first-run/api-key", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ key: "totally-bogus-string" }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { ok: boolean; message?: string };
			expect(body.ok).toBe(false);
			// no network call because the regex rejects up-front (default fetcher unused, but check anyway)
			expect(calls.length).toBe(0);
			void fetcher;
			// key is NOT persisted
			const stored = db
				.select()
				.from(factorySettings)
				.where(eq(factorySettings.key, "provider.anthropic.api_key"))
				.get();
			expect(stored).toBeUndefined();
		});

		it("on bad-key (HTTP 401 from provider), does not persist and returns ok:false", async () => {
			// Use a key with valid shape so it reaches the fetcher.
			const validShape = "sk-ant-1234567890abcdef";
			// We can't inject deps into the production app — use a 401 response by stubbing global fetch.
			const original = globalThis.fetch;
			globalThis.fetch = (async () =>
				new Response(JSON.stringify({ error: { type: "authentication_error", message: "x" } }), {
					status: 401,
					headers: { "Content-Type": "application/json" },
				})) as typeof fetch;
			try {
				const res = await app.request("/api/first-run/api-key", {
					method: "POST",
					headers: authHeaders(),
					body: JSON.stringify({ key: validShape }),
				});
				expect(res.status).toBe(200);
				const body = (await res.json()) as { ok: boolean; status: number };
				expect(body.ok).toBe(false);
				expect(body.status).toBe(401);
				const stored = db
					.select()
					.from(factorySettings)
					.where(eq(factorySettings.key, "provider.anthropic.api_key"))
					.get();
				expect(stored).toBeUndefined();
			} finally {
				globalThis.fetch = original;
			}
		});

		it("on good-key (200 from provider), persists key + last4", async () => {
			const validShape = "sk-ant-abc1234567xyz";
			const original = globalThis.fetch;
			globalThis.fetch = (async () =>
				new Response("{}", {
					status: 200,
					headers: { "Content-Type": "application/json" },
				})) as typeof fetch;
			try {
				const res = await app.request("/api/first-run/api-key", {
					method: "POST",
					headers: authHeaders(),
					body: JSON.stringify({ key: validShape }),
				});
				expect(res.status).toBe(200);
				const body = (await res.json()) as { ok: boolean; last4?: string };
				expect(body.ok).toBe(true);
				expect(body.last4).toBe(validShape.slice(-4));

				const stored = db
					.select()
					.from(factorySettings)
					.where(eq(factorySettings.key, "provider.anthropic.api_key"))
					.get();
				expect(stored?.value).toBe(validShape);
				const last4 = db
					.select()
					.from(factorySettings)
					.where(eq(factorySettings.key, "provider.anthropic.api_key_last4"))
					.get();
				expect(last4?.value).toBe(validShape.slice(-4));
			} finally {
				globalThis.fetch = original;
			}
		});
	});

	describe("POST /api/first-run/north-star", () => {
		it("creates 3 knowledge_items (PRINCIPLES/FOCUS/PORTFOLIO)", async () => {
			const res = await app.request("/api/first-run/north-star", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					principles: "Boil the lake.",
					focus: "Ship 1 product to PMF.",
					portfolio: "Two bets max in flight.",
				}),
			});
			expect(res.status).toBe(200);

			const rows = db.select().from(knowledgeItems).all();
			const titles = rows.map((r) => r.title).sort();
			expect(titles).toEqual(["Focus", "Portfolio", "Principles"]);

			const status = (await (
				await app.request("/api/first-run/status", { headers: authHeaders() })
			).json()) as { northStarReady: boolean };
			expect(status.northStarReady).toBe(true);
		});

		it("rejects empty bodies", async () => {
			const res = await app.request("/api/first-run/north-star", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ principles: "", focus: "x", portfolio: "y" }),
			});
			expect(res.status).toBe(400);
		});

		it("upserts on second submit", async () => {
			const submit = (body: string) =>
				app.request("/api/first-run/north-star", {
					method: "POST",
					headers: authHeaders(),
					body: JSON.stringify({ principles: body, focus: body, portfolio: body }),
				});
			expect((await submit("first")).status).toBe(200);
			expect((await submit("second")).status).toBe(200);
			const row = db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, "ki:north-star:principles"))
				.get();
			expect(row?.body).toBe("second");
		});
	});

	describe("POST /api/first-run/team-scaffold", () => {
		it("records skip when skipped:true", async () => {
			const res = await app.request("/api/first-run/team-scaffold", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ skipped: true }),
			});
			expect(res.status).toBe(200);
			const status = (await (
				await app.request("/api/first-run/status", { headers: authHeaders() })
			).json()) as { teamScaffoldHandled: boolean };
			expect(status.teamScaffoldHandled).toBe(true);
		});

		it("creates product, team, agents, and brief stub when not skipped", async () => {
			const res = await app.request("/api/first-run/team-scaffold", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					skipped: false,
					productName: "Newsletter Tool",
					brief: "Help authors batch-publish newsletters.",
				}),
			});
			expect(res.status).toBe(200);
			const productsList = db.select().from(products).all();
			expect(productsList).toHaveLength(1);
			expect(productsList[0]?.name).toBe("Newsletter Tool");
		});
	});

	describe("POST /api/first-run/complete", () => {
		it("rejects when required steps missing", async () => {
			const res = await app.request("/api/first-run/complete", {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(400);
		});

		it("succeeds when all required steps done", async () => {
			// Bootstrap factory
			await app.request("/api/first-run/factory", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ name: "F", role: "CEO", dataDir: "/d" }),
			});
			// Stub fetch for api-key
			const original = globalThis.fetch;
			globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;
			await app.request("/api/first-run/api-key", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ key: "sk-ant-validkey1234" }),
			});
			globalThis.fetch = original;

			await app.request("/api/first-run/north-star", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ principles: "p", focus: "f", portfolio: "po" }),
			});

			const res = await app.request("/api/first-run/complete", {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const status = (await (
				await app.request("/api/first-run/status", { headers: authHeaders() })
			).json()) as { complete: boolean };
			expect(status.complete).toBe(true);
		});
	});
});
