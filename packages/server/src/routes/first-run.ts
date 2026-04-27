/**
 * L10 — First-Run Flow API.
 *
 * Endpoints:
 *   GET    /api/first-run/status         — flow progress flags
 *   POST   /api/first-run/factory        — bootstrap factory + actor
 *   POST   /api/first-run/api-key        — test + persist provider key
 *   POST   /api/first-run/north-star     — seed PRINCIPLES/FOCUS/PORTFOLIO
 *   POST   /api/first-run/team-scaffold  — optional first product+team
 *   POST   /api/first-run/complete       — mark flow done
 *
 * Auth: all routes sit behind the standard `authMiddleware`. There is no
 * "unauthenticated" first-run path — the operator launches HyperIdle with
 * `HYPERIDLE_API_KEY` set and the web app sends it via `X-API-Key`.
 *
 * @lore L10: factory bootstrap creates the actor row inline (matches
 * the L2 seed shape). Subsequent calls become idempotent via update —
 * a re-submit of the factory step replaces the actor's role rather
 * than failing.
 *
 * @lore L10: API key is verified via `pingAnthropic` BEFORE persistence.
 * If the ping fails the key is never written. The response includes only
 * `{ ok, status, message }` — the key value is never echoed back.
 */
import {
	actors,
	agentSkills,
	agents,
	bets,
	type HyperIdleDb,
	knowledgeItems,
	products,
	teams,
	threads,
} from "@hyperidle/db";
import type { ActorRole, ApiErrorResponse } from "@hyperidle/shared";
import { API_ERROR_CODES } from "@hyperidle/shared";
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { ActorEnv } from "../middleware/actor-context.js";
import {
	readFirstRunStatus,
	writeApiKey,
	writeFactorySettings,
	writeFirstRunComplete,
	writeNorthStarIds,
	writeTeamScaffoldProductId,
	writeTeamScaffoldSkipped,
	writeVerdictCoachSeen,
} from "../services/first-run-config.js";
import { type FetchLike, pingAnthropic } from "../services/provider-ping.js";

const factorySchema = z.object({
	name: z.string().trim().min(1).max(120),
	role: z.union([z.literal("CEO"), z.literal("CPO")]),
	dataDir: z.string().trim().min(1).max(512),
});

const apiKeySchema = z.object({
	key: z.string().trim().min(8).max(512),
});

// C2: each doc accepts a string body OR an explicit { skipped: true }
// signal. Empty strings are rejected at the route level — the client
// must affirmatively choose between writing content and skipping.
const northStarFieldSchema = z.union([
	z.object({ skipped: z.literal(true) }),
	z.object({ skipped: z.literal(false), body: z.string().trim().min(1).max(20_000) }),
]);

const northStarSchema = z.object({
	principles: northStarFieldSchema,
	focus: northStarFieldSchema,
	portfolio: northStarFieldSchema,
});

const teamScaffoldSchema = z.union([
	z.object({ skipped: z.literal(true) }),
	z.object({
		skipped: z.literal(false),
		productName: z.string().trim().min(1).max(120),
		brief: z.string().trim().min(1).max(20_000),
	}),
]);

function badRequest(c: Context<ActorEnv>, message: string) {
	const body: ApiErrorResponse = { error: message, code: API_ERROR_CODES.VALIDATION };
	return c.json(body, 400);
}

const ANTHROPIC_KEY_RE = /^sk-ant-[a-zA-Z0-9_-]{10,}$/;

export interface FirstRunDeps {
	readonly fetcher?: FetchLike;
	readonly endpoint?: string;
}

const ACTOR_ID_BY_ROLE: Record<ActorRole, string> = {
	CEO: "actor:ceo",
	CPO: "actor:cpo",
};

export function createFirstRunRoutes(db: HyperIdleDb, deps: FirstRunDeps = {}): Hono<ActorEnv> {
	const app = new Hono<ActorEnv>();

	// S3: CSRF defence. Every mutating route (POST) MUST carry the
	// `X-Requested-With: hyperidle-web` header. A drive-by `<form>`
	// submission from a malicious site cannot set this header.
	// Read-only `GET /status` is exempt.
	app.use("*", async (c, next) => {
		if (c.req.method !== "GET" && c.req.method !== "HEAD") {
			const xrw = c.req.header("X-Requested-With");
			if (xrw !== "hyperidle-web") {
				const body: ApiErrorResponse = {
					error: "CSRF check failed: missing or invalid X-Requested-With header",
					code: API_ERROR_CODES.UNAUTHORIZED,
				};
				return c.json(body, 403);
			}
		}
		await next();
	});

	app.get("/status", (c) => {
		return c.json(readFirstRunStatus(db));
	});

	app.post("/factory", async (c) => {
		const raw: unknown = await c.req.json().catch(() => null);
		const parsed = factorySchema.safeParse(raw);
		if (!parsed.success) return badRequest(c, parsed.error.message);
		const { name, role, dataDir } = parsed.data;

		writeFactorySettings(db, { name, dataDir });

		// Upsert the canonical actor row for the chosen founder role.
		// Both rows always exist after this step — only one is "you".
		// @lore L10: we DO seed both actor IDs on first-run so cross-actor
		// reassignment (L2 PATCH /threads/:id/route) keeps working before
		// any agent runtime runs. The user's chosen role is recorded in
		// `factory_settings.factory.actor_role`.
		const now = new Date().toISOString();
		const myActorId = ACTOR_ID_BY_ROLE[role];
		const otherRole: ActorRole = role === "CEO" ? "CPO" : "CEO";
		const otherActorId = ACTOR_ID_BY_ROLE[otherRole];
		db.insert(actors)
			.values([
				{ id: myActorId, role, domainTags: "[]", createdAt: now },
				{ id: otherActorId, role: otherRole, domainTags: "[]", createdAt: now },
			])
			.onConflictDoNothing()
			.run();

		return c.json({ ok: true, actorId: myActorId });
	});

	app.post("/api-key", async (c) => {
		const raw: unknown = await c.req.json().catch(() => null);
		const parsed = apiKeySchema.safeParse(raw);
		if (!parsed.success) return badRequest(c, parsed.error.message);
		const key = parsed.data.key;

		// Cheap shape check before paying for an HTTP round-trip.
		if (!ANTHROPIC_KEY_RE.test(key)) {
			return c.json({ ok: false, status: 0, message: "invalid key format" });
		}
		const result = await pingAnthropic({
			key,
			fetcher: deps.fetcher,
			endpoint: deps.endpoint,
		});

		if (result.ok) {
			writeApiKey(db, key);
			return c.json({ ok: true, status: result.status, last4: key.slice(-4) });
		}
		return c.json({ ok: false, status: result.status, message: result.message });
	});

	app.post("/north-star", async (c) => {
		const raw: unknown = await c.req.json().catch(() => null);
		const parsed = northStarSchema.safeParse(raw);
		if (!parsed.success) return badRequest(c, parsed.error.message);
		const { principles, focus, portfolio } = parsed.data;
		const now = new Date().toISOString();
		const updatedBy = c.get("actorId") ?? "system:first-run";

		const principlesId = `ki:north-star:principles`;
		const focusId = `ki:north-star:focus`;
		const portfolioId = `ki:north-star:portfolio`;

		const fields = [
			{ kind: "principles" as const, id: principlesId, title: "Principles", value: principles },
			{ kind: "focus" as const, id: focusId, title: "Focus", value: focus },
			{ kind: "portfolio" as const, id: portfolioId, title: "Portfolio", value: portfolio },
		];

		// C2: only persist a knowledge_items row when the user actually
		// supplied a body. Skipped docs leave the slot empty so the Coach
		// can come back to it later.
		const skippedKinds: Array<"principles" | "focus" | "portfolio"> = [];
		for (const field of fields) {
			if (field.value.skipped) {
				skippedKinds.push(field.kind);
				continue;
			}
			db.insert(knowledgeItems)
				.values({
					id: field.id,
					layer: "L4",
					kind: "principle",
					topic: field.kind,
					title: field.title,
					body: field.value.body,
					format: "markdown",
					status: "active",
					version: 1,
					updatedBy,
					createdAt: now,
					updatedAt: now,
				})
				.onConflictDoUpdate({
					target: knowledgeItems.id,
					set: { body: field.value.body, updatedAt: now, updatedBy },
				})
				.run();
		}

		// C2 follow-up: drop a thread row per skipped kind so the Coach
		// scheduler (out of scope for L10 — see L9) has something to find
		// and surface back to the founder. The thread is unrouted; L9
		// will route it onto the right actor when it picks it up.
		for (const kind of skippedKinds) {
			db.insert(threads)
				.values({
					id: `thread:north-star-followup:${kind}`,
					kind: "system:north-star-followup",
					pinned: 0,
					participants: null,
					routedToActorId: null,
					domainTag: kind,
					createdAt: now,
				})
				.onConflictDoNothing()
				.run();
		}

		writeNorthStarIds(db, { principlesId, focusId, portfolioId });
		return c.json({
			ok: true,
			principlesId,
			focusId,
			portfolioId,
			skipped: skippedKinds,
		});
	});

	app.post("/team-scaffold", async (c) => {
		const raw: unknown = await c.req.json().catch(() => null);
		const parsed = teamScaffoldSchema.safeParse(raw);
		if (!parsed.success) return badRequest(c, parsed.error.message);

		// S2: idempotency — once the step has been satisfied (skip OR a
		// product was created), refuse to create more rows. A retry after
		// network blip MUST NOT spawn duplicate products + agents.
		const existingStatus = readFirstRunStatus(db);
		if (existingStatus.teamScaffoldHandled) {
			return c.json({ ok: true, idempotent: true });
		}

		if (parsed.data.skipped) {
			writeTeamScaffoldSkipped(db);
			return c.json({ ok: true, skipped: true });
		}

		const { productName, brief } = parsed.data;
		const now = new Date().toISOString();
		const productId = `prod:${slugify(productName)}-${suffix()}`;
		const teamId = `team:${productId}`;

		db.insert(products)
			.values({ id: productId, name: productName, phase: "discover", createdAt: now })
			.run();
		db.insert(teams)
			.values({
				id: teamId,
				productId,
				capacity: 4,
				activeBets: 0,
				formedAt: now,
			})
			.run();

		const roles = ["pm", "builder", "growth", "ops"] as const;
		const skillByRole: Record<(typeof roles)[number], string> = {
			pm: "shape_bet",
			builder: "implement_task",
			growth: "growth_experiment",
			ops: "ops_routine",
		};
		const agentRows = roles.map((role) => ({
			id: `agent:${productId}:${role}`,
			name: `${productName} ${role.toUpperCase()}`,
			teamId,
			role,
			status: "idle" as const,
			maxConcurrentSessions: 1,
			createdAt: now,
		}));
		db.insert(agents).values(agentRows).run();
		const skillRows = agentRows.map((a) => ({
			agentId: a.id,
			skillId: skillByRole[a.role],
			autonomyLevel: 2 as const,
			updatedAt: now,
			updatedBy: c.get("actorId") ?? "system:first-run",
		}));
		db.insert(agentSkills).values(skillRows).run();

		// First brief → bet stub.
		db.insert(bets)
			.values({
				id: `bet:${productId}:initial`,
				productId,
				teamId,
				pitch: brief,
				appetite: "small",
				status: "shaped",
				createdAt: now,
			})
			.run();

		writeTeamScaffoldProductId(db, productId);
		return c.json({ ok: true, productId, teamId });
	});

	app.post("/verdict-coach-seen", (c) => {
		writeVerdictCoachSeen(db);
		return c.json({ ok: true });
	});

	app.post("/complete", (c) => {
		const status = readFirstRunStatus(db);
		if (!(status.factoryReady && status.apiKeyReady && status.northStarReady)) {
			return badRequest(c, "Required steps incomplete");
		}
		writeFirstRunComplete(db);
		return c.json({ ok: true });
	});

	return app;
}

function slugify(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "")
		.slice(0, 40);
}

function suffix(): string {
	// S2: crypto-grade randomness so two operators bootstrapping with
	// identical product names cannot collide on the productId.
	return crypto.randomUUID().slice(0, 6);
}
