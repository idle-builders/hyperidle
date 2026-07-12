/**
 * X3 — /api/agents routes: Agent Configuration CRUD API.
 *
 * GET    /api/agents              — list AI agents (excludes system role, excludes retired)
 * POST   /api/agents              — create new agent (founder-only)
 * PATCH  /api/agents/:id         — update agent config (founder-only)
 * DELETE /api/agents/:id         — soft-delete to "retired" (founder-only)
 * GET    /api/agents/templates/:role — fetch system prompt template from factorySettings
 *
 * @lore X3: Separate from /api/users because the self-edit guard on PATCH /api/users/:id
 * returns 403 when the authenticated user tries to edit another user. Agent management
 * requires a founder editing any AI user — a different authorization model. New routes
 * keep the self-edit security boundary clean.
 *
 * @lore X3: System-role agents (role = "system") are excluded from all CRUD.
 * They are internal infrastructure (system:propagation) and must not be configurable.
 *
 * @lore AH2: Validation order on POST/PATCH: UNSUPPORTED_PROVIDER → UNKNOWN_HARNESS
 * → UNKNOWN_MODEL → INCOMPATIBLE_HARNESS_MODEL. The effective (harness, provider) pair
 * on PATCH is derived from data.harnessType ?? existing?.harnessType (reviewer NEW-1).
 */

import { randomUUID } from "node:crypto";
import { factorySettings, type HyperIdleDb, sessions, teamMembers } from "@hyperidle/db";
import {
	AGENT_CATEGORIES,
	catalogEntry,
	DEFAULT_AGENT_HARNESS,
	DEFAULT_AGENT_MODEL_ID,
	DEFAULT_AGENT_MODEL_PROVIDER,
	findRoleCatalogEntry,
	isCatalogModel,
	MODEL_TIERS,
} from "@hyperidle/shared";
import { and, count, eq } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import type { HyperIdleEnv } from "../middleware/auth.js";
import {
	type HarnessCapabilityReader,
	harnessRegistrationMeta,
} from "../services/harness-capability-read-model.js";
import { getUserById, insertUser, listAgentProfiles, updateUser } from "../services/user-store.js";
import { handleAgentProfile } from "./agent-profile.js";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const createAgentSchema = z.object({
	name: z.string().min(1).max(200),
	role: z.string().min(1).max(100),
	agentCategory: z.enum(AGENT_CATEGORIES).optional(),
	systemPrompt: z.string().max(50_000).nullable().optional(),
	harnessType: z.string().max(100).nullable().optional(),
	modelTierPreference: z.enum(MODEL_TIERS).nullable().optional(),
	modelId: z.string().max(200).nullable().optional(),
	modelProvider: z.string().max(100).nullable().optional(),
	maxConcurrentSessions: z.number().int().min(1).max(20).default(1),
	teamId: z.string().nullable().optional(),
});

const patchAgentSchema = z.object({
	name: z.string().min(1).max(200).optional(),
	role: z.string().min(1).max(100).optional(),
	systemPrompt: z.string().max(50_000).nullable().optional(),
	harnessType: z.string().max(100).nullable().optional(),
	modelTierPreference: z.enum(MODEL_TIERS).nullable().optional(),
	modelId: z.string().max(200).nullable().optional(),
	modelProvider: z.string().max(100).nullable().optional(),
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
	if ("systemPrompt" in data) updateSet.systemPrompt = data.systemPrompt ?? null;
	if ("harnessType" in data) updateSet.harnessType = data.harnessType ?? null;
	if ("modelTierPreference" in data)
		updateSet.modelTierPreference = data.modelTierPreference ?? null;
	if ("modelId" in data) updateSet.modelId = data.modelId ?? null;
	if ("modelProvider" in data) updateSet.modelProvider = data.modelProvider ?? null;
	if (data.maxConcurrentSessions !== undefined)
		updateSet.maxConcurrentSessions = data.maxConcurrentSessions;
	return updateSet;
}

/**
 * AH2: Validate the (harnessType, modelProvider, modelId) triple against the adapter pool.
 *
 * Validation order (per plan + reviewer NEW-1):
 *  1. UNSUPPORTED_PROVIDER — openai-compatible cannot be used for per-agent model
 *  2. UNKNOWN_HARNESS — harnessType must be registered in the pool (when non-null)
 *  3. UNKNOWN_MODEL — for anthropic providers, modelId must be in the catalog
 *  4. INCOMPATIBLE_HARNESS_MODEL — provider must be in harness's modelProviders list
 *
 * @param effectiveHarnessType — the harness to validate (POST: data.harnessType ?? default;
 *   PATCH: data.harnessType ?? existing.harnessType).
 * @param effectiveProvider — the provider to validate (POST: data.modelProvider ?? default;
 *   PATCH: data.modelProvider ?? existing.modelProvider).
 * @param modelId — the model ID to validate (only for anthropic; null = no per-agent model)
 * @param pool — the adapter pool (null = no pool, skip registry checks)
 */
/**
 * AR4c: Exported so the assistant PATCH route can reuse the same triple validator
 * without a copy. The assistant row is an AI user with agent semantics.
 */
export function validateAgentConfig(
	effectiveHarnessType: string | null,
	effectiveProvider: string | null,
	modelId: string | null | undefined,
	pool: HarnessCapabilityReader | null,
): { error: string; code: string } | null {
	// 1. UNSUPPORTED_PROVIDER — openai-compatible is not valid for per-agent model
	if (effectiveProvider === "openai-compatible") {
		return {
			error:
				"Per-agent model provider 'openai-compatible' is not supported. Only 'anthropic' and 'openrouter' models are available for per-agent selection.",
			code: "UNSUPPORTED_PROVIDER",
		};
	}

	// 2. UNKNOWN_HARNESS — harnessType must match a registered adapter type
	if (effectiveHarnessType && pool) {
		const meta = harnessRegistrationMeta(pool, effectiveHarnessType);
		if (!meta) {
			return {
				error: `Harness type '${effectiveHarnessType}' is not registered. Check Settings → Agents.`,
				code: "UNKNOWN_HARNESS",
			};
		}
	}

	// 3. UNKNOWN_MODEL — for anthropic, modelId must be in the catalog
	if (modelId && effectiveProvider === "anthropic") {
		if (!isCatalogModel(modelId)) {
			return {
				error: `Model '${modelId}' is not in the catalog. Use a current model ID from the catalog.`,
				code: "UNKNOWN_MODEL",
			};
		}
	}

	// 4. INCOMPATIBLE_HARNESS_MODEL — provider must be in harness's registration metadata
	// modelProviders list. An empty list means provider-agnostic (CLI/inherited-login harness
	// that brings its own provider) — skip the check. Only reject when the harness declares
	// a non-empty explicit provider list that excludes the requested provider.
	//
	// @lore POLISH-060 B1: Use registration metadata (meta.modelProviders) not
	// adapter.getCapabilities().modelProviders. The two diverge: CLI adapters set
	// meta.modelProviders = ["anthropic"] (so select() can route them) but
	// getCapabilities() returns [] (CLI is provider-agnostic at runtime). Reading
	// capabilities caused "Supported: ." (empty list) errors for valid claude-code combos.
	if (effectiveHarnessType && effectiveProvider && pool) {
		const meta = harnessRegistrationMeta(pool, effectiveHarnessType);
		if (
			meta &&
			meta.modelProviders.length > 0 &&
			!meta.modelProviders.includes(effectiveProvider)
		) {
			return {
				error: `Harness '${effectiveHarnessType}' does not support provider '${effectiveProvider}'. Supported: ${meta.modelProviders.join(", ")}.`,
				code: "INCOMPATIBLE_HARNESS_MODEL",
			};
		}
	}

	return null;
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
export function createAgentRoutes(
	db: HyperIdleDb,
	adapterPool?: HarnessCapabilityReader,
): Hono<HyperIdleEnv> {
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
		const key = `system_template:${role}`;

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
		const agentRows = await listAgentProfiles(db);

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
			systemPrompt: agent.systemPrompt ?? null,
			harnessType: agent.harnessType ?? null,
			modelTierPreference: agent.modelTierPreference ?? null,
			modelId: agent.modelId ?? null,
			modelProvider: agent.modelProvider ?? null,
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

		// AH2: Apply defaults for harness and model when not specified
		const effectiveHarnessType = data.harnessType ?? DEFAULT_AGENT_HARNESS;
		const effectiveProvider = data.modelProvider ?? DEFAULT_AGENT_MODEL_PROVIDER;
		const effectiveModelId = data.modelId ?? DEFAULT_AGENT_MODEL_ID;

		// AH2: Validate (harness, provider, modelId) triple
		const validationError = validateAgentConfig(
			effectiveHarnessType,
			effectiveProvider,
			effectiveModelId,
			adapterPool ?? null,
		);
		if (validationError) {
			return c.json(validationError, 422);
		}

		// AH4: FK 422 — reject unknown teamId before the INSERT to surface a clear 422
		// rather than a FK constraint 500. teamId references team_members.id.
		if (data.teamId) {
			const [tmRow] = await db
				.select({ id: teamMembers.id })
				.from(teamMembers)
				.where(eq(teamMembers.id, data.teamId))
				.limit(1);
			if (!tmRow) {
				return c.json({ error: `teamId not found: ${data.teamId}`, code: "VALIDATION_ERROR" }, 422);
			}
		}

		// Derive agentCategory: explicit field > catalog lookup > default "team"
		const agentCatalogEntry = findRoleCatalogEntry(data.role);
		const agentCategory = data.agentCategory ?? agentCatalogEntry?.category ?? "team";

		const id = randomUUID();
		const now = new Date().toISOString();

		await insertUser(db, {
			id,
			kind: "ai",
			name: data.name,
			role: data.role,
			agentCategory,
			status: "active",
			systemPrompt: data.systemPrompt ?? null,
			harnessType: effectiveHarnessType,
			modelTierPreference: data.modelTierPreference ?? null,
			modelId: effectiveModelId,
			modelProvider: effectiveProvider,
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
				systemPrompt: data.systemPrompt ?? null,
				harnessType: effectiveHarnessType,
				modelTierPreference: data.modelTierPreference ?? null,
				modelId: effectiveModelId,
				modelProvider: effectiveProvider,
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

		const existing = await getUserById(db, id);
		if (!existing) {
			return c.json({ error: "Agent not found", code: "NOT_FOUND" }, 404);
		}
		if (existing.kind !== "ai" || existing.role === "system") {
			return c.json({ error: "Cannot modify system agents", code: "FORBIDDEN" }, 403);
		}

		// AH3 §4: MANDATORY server-side reject of systemPrompt writes to ast-* agents.
		// The canonical edit surface is PATCH /api/users/:id/assistant.
		// UI omission alone is insufficient — a raw API call could bypass it.
		//
		// @lore AH3 §4: We check the body BEFORE full parse to catch this early.
		// We need to read the body to check for systemPrompt, then re-use it below.
		// We do this check inside the parsed data block below.
		if (id.startsWith("ast-")) {
			// We must parse the body first to check if systemPrompt is being written.
			// Parse it here and check; if systemPrompt is present, reject.
			let earlyBody: unknown;
			try {
				earlyBody = await c.req.json();
			} catch {
				return c.json({ error: "Invalid JSON", code: "VALIDATION_ERROR" }, 400);
			}
			// @lore AK1: systemPrompt is the post-rename persona field (harness-vocab rename).
			if (typeof earlyBody === "object" && earlyBody !== null && "systemPrompt" in earlyBody) {
				return c.json(
					{
						error:
							"Cannot edit assistant persona via the Agents API. Use PATCH /api/users/:id/assistant instead.",
						code: "ASSISTANT_SOUL_EDIT_FORBIDDEN",
					},
					403,
				);
			}
			// Non-systemPrompt fields: allow through (other config changes ok)
			// Re-parse with schema
			const parsed = patchAgentSchema.safeParse(earlyBody);
			if (!parsed.success) {
				return c.json(
					{ error: "Validation error", code: "VALIDATION_ERROR", issues: parsed.error.issues },
					400,
				);
			}

			const data = parsed.data;
			const effectiveHarnessType =
				"harnessType" in data ? (data.harnessType ?? null) : (existing.harnessType ?? null);
			const effectiveProvider =
				"modelProvider" in data ? (data.modelProvider ?? null) : (existing.modelProvider ?? null);
			const effectiveModelId =
				"modelId" in data ? (data.modelId ?? null) : (existing.modelId ?? null);

			const validationError = validateAgentConfig(
				effectiveHarnessType,
				effectiveProvider,
				effectiveModelId,
				adapterPool ?? null,
			);
			if (validationError) {
				return c.json(validationError, 422);
			}

			const updateSet = buildPatchUpdateSet(data);
			if (Object.keys(updateSet).length > 0) {
				await updateUser(db, id, updateSet);
			}

			const updated = await getUserById(db, id);
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
				// @lore AK1: systemPrompt is the post-rename persona field (harness-vocab rename).
				systemPrompt: updated.systemPrompt ?? null,
				harnessType: updated.harnessType ?? null,
				modelTierPreference: updated.modelTierPreference ?? null,
				modelId: updated.modelId ?? null,
				modelProvider: updated.modelProvider ?? null,
				maxConcurrentSessions: updated.maxConcurrentSessions,
				status: updated.status,
				activeSessions: activeCount?.count ?? 0,
			});
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

		// AH2 reviewer NEW-1: derive effective pair from data fields ?? existing fields
		// so a single-field PATCH still validates the full cross-axis pair.
		const effectiveHarnessType =
			"harnessType" in data ? (data.harnessType ?? null) : (existing.harnessType ?? null);
		const effectiveProvider =
			"modelProvider" in data ? (data.modelProvider ?? null) : (existing.modelProvider ?? null);
		const effectiveModelId =
			"modelId" in data ? (data.modelId ?? null) : (existing.modelId ?? null);

		// AH2: Validate the effective (harness, provider, modelId) triple
		const validationError = validateAgentConfig(
			effectiveHarnessType,
			effectiveProvider,
			effectiveModelId,
			adapterPool ?? null,
		);
		if (validationError) {
			return c.json(validationError, 422);
		}

		// Build update set — only include fields explicitly provided
		const updateSet = buildPatchUpdateSet(data);

		if (Object.keys(updateSet).length === 0) {
			// Nothing to update — return current state
		} else {
			await updateUser(db, id, updateSet);
		}

		const updated = await getUserById(db, id);
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
			systemPrompt: updated.systemPrompt ?? null,
			harnessType: updated.harnessType ?? null,
			modelTierPreference: updated.modelTierPreference ?? null,
			modelId: updated.modelId ?? null,
			modelProvider: updated.modelProvider ?? null,
			maxConcurrentSessions: updated.maxConcurrentSessions,
			status: updated.status,
			activeSessions: activeCount?.count ?? 0,
		});
	});

	// ── DELETE /:id — soft-delete (status = "retired") ──
	router.delete("/:id", requireBoundary({ kind: "public-data" }), async (c) => {
		const id = c.req.param("id");

		const existing = await getUserById(db, id);
		if (!existing) {
			return c.json({ error: "Agent not found", code: "NOT_FOUND" }, 404);
		}
		if (existing.kind !== "ai" || existing.role === "system") {
			return c.json({ error: "Cannot delete system agents", code: "FORBIDDEN" }, 403);
		}
		if (existing.status === "retired") {
			return c.json({ error: "Agent is already retired", code: "CONFLICT" }, 409);
		}

		await updateUser(db, id, { status: "retired" });

		return c.json({ id, status: "retired" });
	});

	return router;
}

// Re-export catalogEntry for legacy callers that import from here
export { catalogEntry };
