// AE6 — Hono router for /api/artifacts.
// Updated from L3 (13 business-domain kinds) to AE6 (6 fundamental kinds + labels).
// Source: plans/AE6/architecture.md §3.

import * as crypto from "node:crypto";
import { artifacts, type HyperIdleDb, tasks } from "@hyperidle/db";
import {
	ARTIFACT_KINDS,
	type Artifact,
	type ArtifactCostFromSession,
	type ArtifactPage,
	type EventBus,
	isRegisteredKind,
	OLD_KIND_MAP,
} from "@hyperidle/shared";
import { getUserById } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import { createBodyLimit } from "../middleware/body-limit.js";
import { validateBody } from "../middleware/validate.js";
import { artifactPreviewSchema, fallbackPreviewSchema } from "../schemas/artifact-preview.js";
import { recordCostAndCheck } from "../services/cost-bindings.js";

const PREVIEW_BODY_LIMIT = 64 * 1024;
const DEFAULT_LIMIT = 50;
const HARD_LIMIT_CAP = 200;
// L3 review fix Sec-MED-4: cap intermediate task-id materialisation.
const MAX_TASK_ID_FANOUT = 1000;

const createArtifactSchema = z.object({
	producingTaskId: z.string().min(1),
	// AE6: kind constrained to the 6 fundamental kinds at create time (open for reads)
	kind: z.enum(ARTIFACT_KINDS),
	// AE6: optional business-domain tag
	label: z
		.string()
		.regex(/^[a-z][a-z0-9_]*$/, "Label must be lowercase_snake_case")
		.max(64)
		.optional()
		.nullable(),
	preview: artifactPreviewSchema.nullable(),
	// @lore O2: cost is accepted for wire compat; money_micros is now routed through
	// recordCostAndCheck when agentId resolves (AF10 §5.2). The artifacts table has no
	// cost columns — cost lands in bet/agent/team/factory accumulators, not the artifact
	// row itself (AC4 narrowed: per-artifact chip stays NULL_COST on GET, per §5.4).
	cost: z
		.object({
			money_micros: z.number().int().nonnegative().finite().nullable(),
			tokens_input: z.number().int().nonnegative().finite().nullable(),
			tokens_output: z.number().int().nonnegative().finite().nullable(),
		})
		.nullable()
		.optional(),
	// AF10 §5.1: optional agentId for cost attribution.
	// When absent, falls back to tasks.ownerAgentId. When neither resolves,
	// artifact is still created (201) but cost is not recorded (§5.3).
	agentId: z.string().min(1).optional(),
	// AF10 §5.4: optional sessionId for the dedup key.
	// When absent, synthesized as "artifact:<artifactId>" after id generation.
	sessionId: z.string().min(1).optional(),
});

const patchPreviewSchema = z.object({ preview: artifactPreviewSchema });

interface ArtifactRow {
	id: string;
	producingTaskId: string;
	kind: string;
	label: string | null;
	previewJson: string | null;
	createdAt: string;
}

/**
 * @lore O2: cost columns stripped from artifacts table. The Artifact wire
 * type still has a `cost` field (kept for API compat with existing consumers).
 * We return `{ money: null, tokens: null }` — cost is now a strategy concern.
 */
const NULL_COST: ArtifactCostFromSession = { money: null, tokens: null };

/**
 * @lore AE6: Read-time normalization for old artifact kinds.
 * Applies OLD_KIND_MAP as defense-in-depth — handles un-migrated DB rows.
 * Also handles stale preview JSON discriminants (old kind in preview JSON
 * doesn't match the normalized kind).
 *
 * For F1 (preview JSON schema incompatibility):
 * - code kind: AM5 K4b purge — old code_diff preview {file, hunks} is NOT compatible
 *   with the new pure code schema {path, lang, text}. Old {file, hunks} rows yield
 *   null preview at read time (pre-alpha purge; no migration). OLD_KIND_MAP still maps
 *   code_diff→code for the kind field. The preview is only populated for rows that
 *   already carry the pure {path,lang,text} shape.
 * - text kinds: old previews (contract {parties, title}, drafted_email {to, subject, bodyExcerpt},
 *   decision {claim, rationale}, etc.) are NOT compatible with new text schema {body, format}.
 *   These previews are nulled out at read time. The content is preserved in the DB
 *   but cannot be re-rendered without a full data migration of preview JSON.
 *   This is acceptable per F1 option (d): only 3 of 12 old kinds had renderer
 *   support (code_diff via text_diff, data_analysis via action_summary, dashboard via
 *   data_metrics). The text-like kinds never had a visual renderer.
 */
function rowToArtifact(row: ArtifactRow, producingTaskTitle: string): Artifact {
	let { kind, label } = row;

	// Apply read-time normalization for old kinds
	const oldMapping = OLD_KIND_MAP[kind];
	if (oldMapping) {
		kind = oldMapping.kind;
		// Only apply the old mapping label if the row doesn't already have one
		if (label === null) {
			label = oldMapping.label;
		}
	}

	let preview: Artifact["preview"] = null;
	if (row.previewJson) {
		try {
			const raw: unknown = JSON.parse(row.previewJson);

			if (isRegisteredKind(kind)) {
				// Validate against the kind's own schema from the registry.
				const parsed = artifactPreviewSchema.safeParse(raw);
				if (parsed.success && parsed.data.kind === kind) {
					preview = parsed.data as Artifact["preview"];
				}
				// Stale discriminant or schema mismatch → preview stays null.
				// @lore AM5 K4b: the code_diff→code re-inject branch is DELETED (pre-alpha purge).
				// code.ts schema is now {path,lang,text}; old {file,hunks} rows yield null preview
				// (unrenderable without a data migration). OLD_KIND_MAP still maps code_diff→code
				// for the kind field. The preview stays null for un-migrated rows.
			} else {
				// Unregistered kind: accept any JSON object (open vocabulary)
				const parsed = fallbackPreviewSchema.safeParse(raw);
				if (parsed.success) {
					preview = parsed.data as Artifact["preview"];
				}
			}
		} catch {
			// Malformed JSON — preview stays null
		}
	}

	return {
		id: row.id,
		producingTaskId: row.producingTaskId,
		producingTaskTitle,
		kind,
		label,
		preview,
		cost: NULL_COST,
		threadCount: 0,
		createdAt: row.createdAt,
	};
}

export function createArtifactRoutes(db: HyperIdleDb, eventBus?: EventBus): Hono {
	const router = new Hono();

	router.get("/", requireBoundary({ kind: "public-data" }), async (c) => {
		const axis = c.req.query("axis");
		if (axis !== "task" && axis !== "bet" && axis !== "product" && axis !== "portfolio") {
			return c.json({ error: "Invalid axis", code: "INVALID_QUERY" }, 400);
		}

		const limitRaw = Number.parseInt(c.req.query("limit") ?? "", 10);
		const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : DEFAULT_LIMIT;
		if (limit > HARD_LIMIT_CAP) {
			return c.json({ error: "Limit too high", code: "LIMIT_TOO_HIGH" }, 400);
		}

		let taskIds: string[] | null = null;
		if (axis === "task") {
			const taskId = c.req.query("taskId");
			if (!taskId) {
				return c.json({ error: "taskId required", code: "INVALID_QUERY" }, 400);
			}
			taskIds = [taskId];
		} else if (axis === "bet") {
			const betId = c.req.query("betId");
			if (!betId) {
				return c.json({ error: "betId required", code: "INVALID_QUERY" }, 400);
			}
			// L3 review fix Sec-MED-4: cap intermediate id materialisation.
			const rows = await work.listTasks(db, { betId, limit: MAX_TASK_ID_FANOUT + 1 });
			if (rows.length > MAX_TASK_ID_FANOUT) {
				return c.json({ error: "Task fan-out too large", code: "FANOUT_TOO_LARGE" }, 400);
			}
			taskIds = rows.map((r) => r.id);
		} else if (axis === "product") {
			// @lore U1: `productId` query param renamed to `teamId`; `tasks.productId` column dropped.
			const teamId = c.req.query("teamId") ?? c.req.query("productId");
			if (!teamId) {
				return c.json({ error: "teamId required", code: "INVALID_QUERY" }, 400);
			}
			const rows = await work.listTasks(db, { teamId, limit: MAX_TASK_ID_FANOUT + 1 });
			if (rows.length > MAX_TASK_ID_FANOUT) {
				return c.json({ error: "Task fan-out too large", code: "FANOUT_TOO_LARGE" }, 400);
			}
			taskIds = rows.map((r) => r.id);
		}

		// L3 review fix Adv-B5: composite cursor on (createdAt, id)
		const cursorParam = c.req.query("cursor");
		let cursorClause: ReturnType<typeof or> | undefined;
		if (cursorParam) {
			const sep = cursorParam.lastIndexOf("|");
			if (sep <= 0) {
				return c.json({ error: "Invalid cursor", code: "INVALID_CURSOR" }, 400);
			}
			const cursorCreatedAt = cursorParam.slice(0, sep);
			const cursorId = cursorParam.slice(sep + 1);
			cursorClause = or(
				lt(artifacts.createdAt, cursorCreatedAt),
				and(eq(artifacts.createdAt, cursorCreatedAt), lt(artifacts.id, cursorId)),
			);
		}

		const baseQuery = db
			.select({
				artifact: artifacts,
				taskTitle: tasks.title,
			})
			.from(artifacts)
			.innerJoin(tasks, eq(tasks.id, artifacts.producingTaskId));

		const filterClauses = [
			taskIds === null ? undefined : inArray(artifacts.producingTaskId, taskIds),
			cursorClause,
		].filter((c) => c !== undefined);
		const whereClause = filterClauses.length > 0 ? and(...filterClauses) : undefined;

		const rows =
			taskIds !== null && taskIds.length === 0
				? []
				: await (whereClause === undefined ? baseQuery : baseQuery.where(whereClause))
						.orderBy(desc(artifacts.createdAt), desc(artifacts.id))
						.limit(limit + 1);

		const sliced = rows.slice(0, limit);
		const items = sliced.map((r) =>
			rowToArtifact(
				{
					id: r.artifact.id,
					producingTaskId: r.artifact.producingTaskId,
					kind: r.artifact.kind,
					label: r.artifact.label ?? null,
					previewJson: r.artifact.previewJson ?? null,
					createdAt: r.artifact.createdAt,
				},
				r.taskTitle,
			),
		);
		const last = sliced[sliced.length - 1];
		const nextCursor =
			rows.length > limit && last ? `${last.artifact.createdAt}|${last.artifact.id}` : null;

		const page: ArtifactPage = { items, nextCursor };
		return c.json(page);
	});

	router.get("/:id", requireBoundary({ kind: "public-data" }), async (c) => {
		const id = c.req.param("id");
		const [row] = await db
			.select({ artifact: artifacts, taskTitle: tasks.title })
			.from(artifacts)
			.innerJoin(tasks, eq(tasks.id, artifacts.producingTaskId))
			.where(eq(artifacts.id, id))
			.limit(1);
		if (!row) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
		return c.json(
			rowToArtifact(
				{
					id: row.artifact.id,
					producingTaskId: row.artifact.producingTaskId,
					kind: row.artifact.kind,
					label: row.artifact.label ?? null,
					previewJson: row.artifact.previewJson ?? null,
					createdAt: row.artifact.createdAt,
				},
				row.taskTitle,
			),
		);
	});

	router.post(
		"/",
		requireBoundary({ kind: "public-data" }),
		createBodyLimit({ maxSize: PREVIEW_BODY_LIMIT }),
		validateBody(createArtifactSchema),
		async (c) => {
			const body = c.req.valid("json" as never) as z.infer<typeof createArtifactSchema>;

			if (body.preview && body.preview.kind !== body.kind) {
				return c.json({ error: "kind/preview discriminant mismatch", code: "KIND_MISMATCH" }, 400);
			}

			const taskRow = await work.getTaskById(db, body.producingTaskId);
			if (!taskRow) {
				return c.json({ error: "producing_task_id not found", code: "INVALID_TASK" }, 400);
			}

			const id = crypto.randomUUID();
			const now = new Date().toISOString();

			await db.insert(artifacts).values({
				id,
				producingTaskId: body.producingTaskId,
				kind: body.kind,
				label: body.label ?? null,
				previewJson: body.preview ? JSON.stringify(body.preview) : null,
				createdAt: now,
			});

			// AF10 §5.2: Route artifact cost through recordCostAndCheck accumulators.
			// agentId: prefer body.agentId, fall back to tasks.ownerAgentId (both nullable).
			// teamId: resolved via users.teamId = teamMembers.id (@lore U1: NOT tasks.teamId).
			// sessionId: body.sessionId or synthesized as "artifact:<id>" (dedup scope, §5.4).
			// Null-owner rule (§5.3): if no agentId resolves, create artifact but skip recording.
			const moneyMicros = body.cost?.money_micros;
			const resolvedAgentId = body.agentId ?? taskRow.ownerAgentId ?? null;

			if (
				resolvedAgentId !== null &&
				moneyMicros !== null &&
				moneyMicros !== undefined &&
				moneyMicros > 0 &&
				eventBus !== undefined
			) {
				// Resolve teamMembers.id from users.teamId (§5.2 — NOT tasks.teamId which is teams.id)
				const agentRow = await getUserById(db, resolvedAgentId);

				if (agentRow) {
					const resolvedSessionId = body.sessionId ?? `artifact:${id}`;
					// @lore AF10 AC4: costMinor = money_micros / 10000 (micros→cents conversion).
					// This is a delta w.r.t. the accumulators (artifact cost recorded once, §1 contract).
					// sessionId "artifact:<id>" is used exactly once — releaseSessionDedup is moot.
					await recordCostAndCheck(db, eventBus, {
						sessionId: resolvedSessionId,
						costMinor: Math.round(moneyMicros / 10000),
						currency: "USD",
						agentId: resolvedAgentId,
						teamId: agentRow.teamId ?? undefined,
						taskId: body.producingTaskId,
					});
				}
			}

			const result: Artifact = {
				id,
				producingTaskId: body.producingTaskId,
				producingTaskTitle: taskRow.title,
				kind: body.kind,
				label: body.label ?? null,
				preview: body.preview as Artifact["preview"],
				cost: NULL_COST,
				threadCount: 0,
				createdAt: now,
			};
			return c.json(result, 201);
		},
	);

	router.patch(
		"/:id/preview",
		requireBoundary({ kind: "public-data" }),
		createBodyLimit({ maxSize: PREVIEW_BODY_LIMIT }),
		validateBody(patchPreviewSchema),
		async (c) => {
			const id = c.req.param("id");
			const body = c.req.valid("json" as never) as z.infer<typeof patchPreviewSchema>;
			// Race-safe update: only updates rows where preview_json IS NULL.
			const updated = await db
				.update(artifacts)
				.set({ previewJson: JSON.stringify(body.preview) })
				.where(and(eq(artifacts.id, id), isNull(artifacts.previewJson)))
				.returning({ id: artifacts.id });
			if (updated.length === 0) {
				const [exists] = await db
					.select({ id: artifacts.id })
					.from(artifacts)
					.where(eq(artifacts.id, id))
					.limit(1);
				if (!exists) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
				return c.json({ error: "Preview already set", code: "IMMUTABLE" }, 409);
			}
			return c.json({ ok: true });
		},
	);

	// @lore O2: PATCH /:id/cost route removed — cost columns stripped from
	// artifacts table. Cost settlement is now handled at the strategy layer.

	return router;
}
