/**
 * X3 — /api/agents routes: Agent Configuration CRUD API.
 *
 * GET    /api/agents              — list AI agents (excludes system role, excludes retired)
 * POST   /api/agents              — create new agent (founder-only)
 * PATCH  /api/agents/:id         — update agent config (founder-only)
 * DELETE /api/agents/:id         — soft-delete to "retired" (founder-only)
 * GET    /api/agents/templates/:role — fetch system prompt template (docs-backed, AU18)
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
import type {
	AgentOrchestrationPort,
	AgentOrchestrationRunConfigPatch,
} from "@hyperidle/api-contract";
import type { HyperIdleDb } from "@hyperidle/db";
import { AGENT_CATEGORIES, findRoleCatalogEntry, MODEL_TIERS } from "@hyperidle/domain-model";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import { getTeam, readSystemPromptTemplateForRole } from "@hyperidle/org";
import { findUser, insertUser, listUsers, updateUser } from "@hyperidle/users";
import { Hono } from "hono";
import z from "zod";
import { catalogEntry } from "../model-utils.js";
import type { HarnessCapabilityReader } from "../services/harness-capability-reader.js";
import { handleAgentProfile } from "./agent-profile.js";
import { validateAgentConfig } from "./validate-agent-config.js";

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
	/**
	 * The harness options this agent's model runs with. Sparse — a key is present
	 * only where the user moved a control away from the harness's own default.
	 */
	modelOptions: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
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
	/**
	 * The harness options this agent's model runs with. Sparse — a key is present
	 * only where the user moved a control away from the harness's own default.
	 */
	modelOptions: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PatchAgentData = z.infer<typeof patchAgentSchema>;

/**
 * Mirrors `@hyperidle/run-orchestration`'s `DEFAULT_AGENT_RUN_CONFIG` — a
 * defensive fallback for a `readBatch` entry, even though
 * `AgentOrchestrationPort.runConfig.readBatch` (like the direct function it
 * backs) already fills every requested id. AU31 §2.2: this route no longer
 * imports `@hyperidle/run-orchestration` directly, so the value is a local
 * mirror, not an import.
 */
const EMPTY_RUN_CONFIG_VIEW = {
	systemPrompt: null,
	harnessType: null,
	modelTierPreference: null,
	modelId: null,
	modelProvider: null,
	maxConcurrentSessions: 1,
	modelOptions: {},
} as const;

/**
 * Build the `users` (identity) half of a PATCH. Only fields present in the
 * request are included.
 *
 * @lore AU26 G1 (architecture §D-L): `PATCH /api/agents/:id` used to write one
 * update set to `users`. The six run-config fields now live in
 * `agent_run_config`, so the patch splits in two — identity here, run config in
 * {@link buildRunConfigPatch}. The route STAYS core-hosted (§D-A rule 3: it
 * gates on `users`, a core table, and a two-sided route has exactly one legal
 * host) and delegates the run-config persist DOWN via
 * `AgentOrchestrationPort.runConfig` (AU31 §2.2) — the wire shape is unchanged,
 * the client still sends and receives one flat agent object.
 */
function buildIdentityUpdateSet(data: PatchAgentData): Record<string, unknown> {
	const updateSet: Record<string, unknown> = {};
	if (data.name !== undefined) updateSet.name = data.name;
	if (data.role !== undefined) updateSet.role = data.role;
	return updateSet;
}

/** Build the `agent_run_config` half of a PATCH — same "present key wins, explicit null clears" semantics. */
function buildRunConfigPatch(data: PatchAgentData): AgentOrchestrationRunConfigPatch {
	const patch: AgentOrchestrationRunConfigPatch = {};
	if ("systemPrompt" in data) patch.systemPrompt = data.systemPrompt ?? null;
	if ("harnessType" in data) patch.harnessType = data.harnessType ?? null;
	if ("modelTierPreference" in data) patch.modelTierPreference = data.modelTierPreference ?? null;
	if ("modelId" in data) patch.modelId = data.modelId ?? null;
	if ("modelProvider" in data) patch.modelProvider = data.modelProvider ?? null;
	if (data.maxConcurrentSessions !== undefined)
		patch.maxConcurrentSessions = data.maxConcurrentSessions;
	if ("modelOptions" in data) patch.modelOptions = data.modelOptions ?? {};
	return patch;
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
	agentOrchestration: AgentOrchestrationPort,
	adapterPool?: HarnessCapabilityReader,
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// ── GET /:id/profile — agent profile (AB1) ──
	// @lore AB1: Must be registered BEFORE /:id so "profile" is not captured
	// as the id param when the URL is /api/agents/someId/profile.
	// Hono matches routes by registration order within the same method.
	router.get("/:id/profile", async (c) => {
		return handleAgentProfile(c, db, adapterPool, agentOrchestration);
	});

	// ── GET /templates/:role — MUST come before /:id to avoid route collision ──
	// @lore X3: Hono matches routes in registration order. If /:id was registered
	// first, "templates" would be captured as the id param. Register the static
	// path prefix first.
	//
	// @lore AU18 (round 3 CRITICAL fix): previously a DB-key lookup against
	// `factorySettings.system_template:<role>` (traversal-safe by construction —
	// a table key lookup, not a filesystem path). Now resolves via
	// `readSystemPromptTemplateForRole`, which maps `role` through the
	// canonical `SYSTEM_PROMPT_TEMPLATE_FILES` map BEFORE any filesystem
	// access — an untrusted `role` that isn't an exact map key returns `null`
	// (404) without ever touching `fs`, so traversal stays closed by
	// construction. See system-prompt-templates.ts for the full rationale.
	router.get("/templates/:role", async (c) => {
		const role = c.req.param("role");
		const content = readSystemPromptTemplateForRole(role);

		if (content === null) {
			return c.json({ error: "No template for role", code: "NOT_FOUND" }, 404);
		}

		return c.json({ role, content });
	});

	// ── GET / — list AI agents (excludes system role and retired) ──
	router.get("/", async (c) => {
		// Query all non-system, non-retired AI agents
		// List AI agents excluding system role and retired (former listAgentProfiles scope).
		const allAiRows = await listUsers(db, { kind: "ai" });
		const agentRows = allAiRows.filter((u) => u.role !== "system" && u.status !== "retired");

		// @lore AU26 J4: the `activeSessions` count is GONE from this response. It
		// was core-api counting rows in `agent-orchestration`'s `sessions` table so
		// Settings → Agents could render "N active". Founder ruling: *"orchestration
		// now has an api so that the ui can get the agent run state from the
		// orchestration directly and combine this information in the ui."*
		// `SettingsAgents.tsx` now fetches
		// `GET /api/agent-orchestration/runs/active-counts` alongside this list and
		// renders the same string. It also fixes a latent bug the split removes: the
		// PATCH responses used to re-serve the count purely so the client could
		// splice it back into the list row.

		// AU26 G1 / AU31 §2.2: the run-config half of each agent comes from
		// `agent_run_config` in ONE batched seam read — the wire shape stays flat.
		const runConfigs = await agentOrchestration.runConfig.readBatch(agentRows.map((a) => a.id));

		const result = agentRows.map((agent) => {
			const runConfig = runConfigs.get(agent.id) ?? EMPTY_RUN_CONFIG_VIEW;
			return {
				id: agent.id,
				name: agent.name,
				role: agent.role,
				agentCategory: agent.agentCategory ?? null,
				systemPrompt: runConfig.systemPrompt,
				harnessType: runConfig.harnessType,
				modelTierPreference: runConfig.modelTierPreference,
				modelId: runConfig.modelId,
				modelProvider: runConfig.modelProvider,
				maxConcurrentSessions: runConfig.maxConcurrentSessions,
				modelOptions: runConfig.modelOptions,
				status: agent.status,
			};
		});

		return c.json(result);
	});

	// ── POST / — create new agent ──
	router.post("/", async (c) => {
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

		// Nothing is chosen on the caller's behalf. An agent created without a
		// harness or a model stores neither, and the run resolves both: the pool
		// takes an available harness, and that harness runs its own default model.
		// A compiled-in vendor name here would present a decision nobody made back
		// to them as their own configuration.
		const effectiveHarnessType = data.harnessType ?? null;
		const effectiveProvider = data.modelProvider ?? null;
		const effectiveModelId = data.modelId ?? null;

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
			const tmRow = await getTeam(db, { id: data.teamId });
			if (!tmRow) {
				return c.json({ error: `teamId not found: ${data.teamId}`, code: "VALIDATION_ERROR" }, 422);
			}
		}

		// Derive agentCategory: explicit field > catalog lookup > default "team"
		const agentCatalogEntry = findRoleCatalogEntry(data.role);
		const agentCategory = data.agentCategory ?? agentCatalogEntry?.category ?? "team";

		const id = randomUUID();
		const now = new Date().toISOString();

		// AU26 G1: the run config is a second write, delegated down to its owner.
		//
		// AU31 §3.1 site 1 — RELINQUISHED (founder ruling, architecture.md
		// §3.1/§13 item 9): the two writes used to be one transaction; now the
		// seam write can never join a caller's transaction (§3.2), so `insertUser`
		// commits alone and `runConfig.write` follows. On a failed write, the
		// agent exists with `DEFAULT_AGENT_RUN_CONFIG` semantics (the read path
		// already defaults) — it stores no harness, so the pool picks one at
		// admission rather than the harness the caller asked for. The admin edit
		// path repairs it.
		await insertUser(db, {
			id,
			kind: "ai",
			name: data.name,
			role: data.role,
			agentCategory,
			status: "active",
			teamId: data.teamId ?? null,
			createdAt: now,
		});
		await agentOrchestration.runConfig.write(id, {
			systemPrompt: data.systemPrompt ?? null,
			harnessType: effectiveHarnessType,
			modelTierPreference: data.modelTierPreference ?? null,
			modelId: effectiveModelId,
			modelProvider: effectiveProvider,
			maxConcurrentSessions: data.maxConcurrentSessions,
			modelOptions: data.modelOptions ?? {},
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
				modelOptions: data.modelOptions ?? {},
				maxConcurrentSessions: data.maxConcurrentSessions,
				status: "active",
			},
			201,
		);
	});

	// ── PATCH /:id — update agent config ──
	router.patch("/:id", async (c) => {
		const id = c.req.param("id");

		const existing = await findUser(db, { id });
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
			// AU26 G1: the "?? existing" half of the effective triple now comes
			// from `agent_run_config`, not the `users` row.
			const existingRunConfig = await agentOrchestration.runConfig.read(id);
			const effectiveHarnessType =
				"harnessType" in data ? (data.harnessType ?? null) : existingRunConfig.harnessType;
			const effectiveProvider =
				"modelProvider" in data ? (data.modelProvider ?? null) : existingRunConfig.modelProvider;
			const effectiveModelId =
				"modelId" in data ? (data.modelId ?? null) : existingRunConfig.modelId;

			const validationError = validateAgentConfig(
				effectiveHarnessType,
				effectiveProvider,
				effectiveModelId,
				adapterPool ?? null,
			);
			if (validationError) {
				return c.json(validationError, 422);
			}

			const updateSet = buildIdentityUpdateSet(data);
			if (Object.keys(updateSet).length > 0) {
				await updateUser(db, id, updateSet);
			}
			const runConfigPatch = buildRunConfigPatch(data);
			if (Object.keys(runConfigPatch).length > 0) {
				await agentOrchestration.runConfig.write(id, runConfigPatch);
			}

			const updated = await findUser(db, { id });
			if (!updated) {
				return c.json({ error: "Agent not found after update", code: "NOT_FOUND" }, 404);
			}
			const updatedRunConfig = await agentOrchestration.runConfig.read(id);

			return c.json({
				id: updated.id,
				name: updated.name,
				role: updated.role,
				agentCategory: updated.agentCategory ?? null,
				// @lore AK1: systemPrompt is the post-rename persona field (harness-vocab rename).
				systemPrompt: updatedRunConfig.systemPrompt,
				harnessType: updatedRunConfig.harnessType,
				modelTierPreference: updatedRunConfig.modelTierPreference,
				modelId: updatedRunConfig.modelId,
				modelProvider: updatedRunConfig.modelProvider,
				maxConcurrentSessions: updatedRunConfig.maxConcurrentSessions,
				status: updated.status,
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
		// AU26 G1: the "?? existing" half now comes from `agent_run_config`.
		const existingRunConfig = await agentOrchestration.runConfig.read(id);
		const effectiveHarnessType =
			"harnessType" in data ? (data.harnessType ?? null) : existingRunConfig.harnessType;
		const effectiveProvider =
			"modelProvider" in data ? (data.modelProvider ?? null) : existingRunConfig.modelProvider;
		const effectiveModelId = "modelId" in data ? (data.modelId ?? null) : existingRunConfig.modelId;

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

		// Build update sets — only include fields explicitly provided
		const updateSet = buildIdentityUpdateSet(data);
		if (Object.keys(updateSet).length > 0) {
			await updateUser(db, id, updateSet);
		}
		const runConfigPatch = buildRunConfigPatch(data);
		if (Object.keys(runConfigPatch).length > 0) {
			await agentOrchestration.runConfig.write(id, runConfigPatch);
		}

		const updated = await findUser(db, { id });
		if (!updated) {
			return c.json({ error: "Agent not found after update", code: "NOT_FOUND" }, 404);
		}

		const updatedRunConfig = await agentOrchestration.runConfig.read(id);

		return c.json({
			id: updated.id,
			name: updated.name,
			role: updated.role,
			agentCategory: updated.agentCategory ?? null,
			systemPrompt: updatedRunConfig.systemPrompt,
			harnessType: updatedRunConfig.harnessType,
			modelTierPreference: updatedRunConfig.modelTierPreference,
			modelId: updatedRunConfig.modelId,
			modelProvider: updatedRunConfig.modelProvider,
			maxConcurrentSessions: updatedRunConfig.maxConcurrentSessions,
			status: updated.status,
		});
	});

	// ── DELETE /:id — soft-delete (status = "retired") ──
	router.delete("/:id", async (c) => {
		const id = c.req.param("id");

		const existing = await findUser(db, { id });
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
