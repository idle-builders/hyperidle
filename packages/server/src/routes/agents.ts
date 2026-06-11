/**
 * X3 — /api/agents routes: Agent Configuration CRUD API.
 *
 * GET    /api/agents              — list AI agents (excludes system role, excludes retired)
 * POST   /api/agents              — create new agent (founder-only)
 * PATCH  /api/agents/:id         — update agent config (founder-only)
 * DELETE /api/agents/:id         — soft-delete to "retired" (founder-only)
 * GET    /api/agents/templates/:role — fetch soul prompt template from factorySettings
 *
 * @lore X3: Separate from /api/users because the self-edit guard on PATCH /api/users/:id
 * returns 403 when the authenticated user tries to edit another user. Agent management
 * requires a founder editing any AI user — a different authorization model. New routes
 * keep the self-edit security boundary clean.
 *
 * @lore X3: System-role agents (role = "system") are excluded from all CRUD.
 * They are internal infrastructure (system:propagation) and must not be configurable.
 */

import { randomUUID } from "node:crypto";
import { factorySettings, type HyperIdleDb, sessions, users } from "@hyperidle/db";
import { AGENT_CATEGORIES, findRoleCatalogEntry, MODEL_TIERS } from "@hyperidle/shared";
import { and, count, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import type { AdapterPool } from "../harness/adapter-pool.js";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { handleAgentProfile } from "./agent-profile.js";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const createAgentSchema = z.object({
	name: z.string().min(1).max(200),
	role: z.string().min(1).max(100),
	agentCategory: z.enum(AGENT_CATEGORIES).optional(),
	soulPrompt: z.string().max(50_000).nullable().optional(),
	harnessType: z.string().max(100).nullable().optional(),
	modelTierPreference: z.enum(MODEL_TIERS).nullable().optional(),
	maxConcurrentSessions: z.number().int().min(1).max(20).default(1),
	teamId: z.string().nullable().optional(),
});

const patchAgentSchema = z.object({
	name: z.string().min(1).max(200).optional(),
	role: z.string().min(1).max(100).optional(),
	soulPrompt: z.string().max(50_000).nullable().optional(),
	harnessType: z.string().max(100).nullable().optional(),
	modelTierPreference: z.enum(MODEL_TIERS).nullable().optional(),
	maxConcurrentSessions: z.number().int().min(1).max(20).optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PatchAgentData = z.infer<typeof patchAgentSchema>;

/** Build a partial update set from validated PATCH data. Only includes fields that were present in the request. */
function buildPatchUpdateSet(data: PatchAgentData): Record<string, unknown> {
	const updateSet: Record<string, unknown> = {};
	if (data.name !== undefined) updateSet.name = data.name;
	if (data.role !== undefined) updateSet.role = data.role;
	if ("soulPrompt" in data) updateSet.soulPrompt = data.soulPrompt ?? null;
	if ("harnessType" in data) updateSet.harnessType = data.harnessType ?? null;
	if ("modelTierPreference" in data)
		updateSet.modelTierPreference = data.modelTierPreference ?? null;
	if (data.maxConcurrentSessions !== undefined)
		updateSet.maxConcurrentSessions = data.maxConcurrentSessions;
	return updateSet;
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create Hono routes for the Agent Configuration API.
 *
 * @lore AB1: adapterPool is optional — when not provided, the profile endpoint
 * still works (health signals default to harnessAvailable=true). The pool is
 * only available in production and integration tests that pass one.
 */
export function createAgentRoutes(db: HyperIdleDb, adapterPool?: AdapterPool): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// ── GET /:id/profile — agent profile (AB1) ──
	// @lore AB1: Must be registered BEFORE /:id so "profile" is not captured
	// as the id param when the URL is /api/agents/someId/profile.
	// Hono matches routes by registration order within the same method.
	router.get("/:id/profile", requireBoundary({ kind: "public-data" }), async (c) => {
		return handleAgentProfile(c, db, adapterPool);
	});

	// ── GET /templates/:role — MUST come before /:id to avoid route collision ──
	// @lore X3: Hono matches routes in registration order. If /:id was registered
	// first, "templates" would be captured as the id param. Register the static
	// path prefix first.
	router.get("/templates/:role", requireBoundary({ kind: "public-data" }), async (c) => {
		const role = c.req.param("role");
		const key = `soul_template:${role}`;

		const [row] = await db
			.select({ value: factorySettings.value })
			.from(factorySettings)
			.where(eq(factorySettings.key, key))
			.limit(1);

		if (!row) {
			return c.json({ error: "No template for role", code: "NOT_FOUND" }, 404);
		}

		return c.json({ role, content: row.value });
	});

	// ── GET / — list AI agents (excludes system role and retired) ──
	router.get("/", requireBoundary({ kind: "public-data" }), async (c) => {
		// Query all non-system, non-retired AI agents
		const agentRows = await db
			.select()
			.from(users)
			.where(and(eq(users.kind, "ai"), ne(users.role, "system"), ne(users.status, "retired")));

		// Count active sessions per agent
		const activeCounts = await db
			.select({ agentId: sessions.agentId, count: count() })
			.from(sessions)
			.where(eq(sessions.state, "active"))
			.groupBy(sessions.agentId);

		const countMap = new Map<string, number>(activeCounts.map((r) => [r.agentId, r.count]));

		const result = agentRows.map((agent) => ({
			id: agent.id,
			name: agent.name,
			role: agent.role,
			agentCategory: agent.agentCategory ?? null,
			soulPrompt: agent.soulPrompt ?? null,
			harnessType: agent.harnessType ?? null,
			modelTierPreference: agent.modelTierPreference ?? null,
			maxConcurrentSessions: agent.maxConcurrentSessions,
			status: agent.status,
			activeSessions: countMap.get(agent.id) ?? 0,
		}));

		return c.json(result);
	});

	// ── POST / — create new agent ──
	router.post("/", requireBoundary({ kind: "public-data" }), async (c) => {
		let rawBody: unknown;
		try {
			rawBody = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON", code: "VALIDATION_ERROR" }, 400);
		}

		const parsed = createAgentSchema.safeParse(rawBody);
		if (!parsed.success) {
			return c.json(
				{ error: "Validation error", code: "VALIDATION_ERROR", issues: parsed.error.issues },
				400,
			);
		}

		const data = parsed.data;
		const id = randomUUID();
		const now = new Date().toISOString();

		// Derive agentCategory: explicit field > catalog lookup > default "team"
		const catalogEntry = findRoleCatalogEntry(data.role);
		const agentCategory = data.agentCategory ?? catalogEntry?.category ?? "team";

		await db.insert(users).values({
			id,
			kind: "ai",
			name: data.name,
			role: data.role,
			agentCategory,
			status: "active",
			soulPrompt: data.soulPrompt ?? null,
			harnessType: data.harnessType ?? null,
			modelTierPreference: data.modelTierPreference ?? null,
			maxConcurrentSessions: data.maxConcurrentSessions,
			teamId: data.teamId ?? null,
			createdAt: now,
		});

		return c.json(
			{
				id,
				name: data.name,
				role: data.role,
				agentCategory,
				soulPrompt: data.soulPrompt ?? null,
				harnessType: data.harnessType ?? null,
				modelTierPreference: data.modelTierPreference ?? null,
				maxConcurrentSessions: data.maxConcurrentSessions,
				status: "active",
				activeSessions: 0,
			},
			201,
		);
	});

	// ── PATCH /:id — update agent config ──
	router.patch("/:id", requireBoundary({ kind: "public-data" }), async (c) => {
		const id = c.req.param("id");

		const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
		if (!existing) {
			return c.json({ error: "Agent not found", code: "NOT_FOUND" }, 404);
		}
		if (existing.kind !== "ai" || existing.role === "system") {
			return c.json({ error: "Cannot modify system agents", code: "FORBIDDEN" }, 403);
		}

		let rawBody: unknown;
		try {
			rawBody = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON", code: "VALIDATION_ERROR" }, 400);
		}

		const parsed = patchAgentSchema.safeParse(rawBody);
		if (!parsed.success) {
			return c.json(
				{ error: "Validation error", code: "VALIDATION_ERROR", issues: parsed.error.issues },
				400,
			);
		}

		const data = parsed.data;
		// Build update set — only include fields explicitly provided
		const updateSet = buildPatchUpdateSet(data);

		if (Object.keys(updateSet).length === 0) {
			// Nothing to update — return current state
		} else {
			await db.update(users).set(updateSet).where(eq(users.id, id));
		}

		const [updated] = await db.select().from(users).where(eq(users.id, id)).limit(1);
		if (!updated) {
			return c.json({ error: "Agent not found after update", code: "NOT_FOUND" }, 404);
		}

		const [activeCount] = await db
			.select({ count: count() })
			.from(sessions)
			.where(and(eq(sessions.agentId, id), eq(sessions.state, "active")))
			.limit(1);

		return c.json({
			id: updated.id,
			name: updated.name,
			role: updated.role,
			agentCategory: updated.agentCategory ?? null,
			soulPrompt: updated.soulPrompt ?? null,
			harnessType: updated.harnessType ?? null,
			modelTierPreference: updated.modelTierPreference ?? null,
			maxConcurrentSessions: updated.maxConcurrentSessions,
			status: updated.status,
			activeSessions: activeCount?.count ?? 0,
		});
	});

	// ── DELETE /:id — soft-delete (status = "retired") ──
	router.delete("/:id", requireBoundary({ kind: "public-data" }), async (c) => {
		const id = c.req.param("id");

		const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
		if (!existing) {
			return c.json({ error: "Agent not found", code: "NOT_FOUND" }, 404);
		}
		if (existing.kind !== "ai" || existing.role === "system") {
			return c.json({ error: "Cannot delete system agents", code: "FORBIDDEN" }, 403);
		}
		if (existing.status === "retired") {
			return c.json({ error: "Agent is already retired", code: "CONFLICT" }, 409);
		}

		await db.update(users).set({ status: "retired" }).where(eq(users.id, id));

		return c.json({ id, status: "retired" });
	});

	return router;
}
