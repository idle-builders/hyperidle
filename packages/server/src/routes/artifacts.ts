// L3 — Hono router for /api/artifacts.
// Source: plans/L3/architecture.md §5.
// O2 — cost columns (costMoneyMicros, costTokensInput, costTokensOutput, costSettledAt)
// stripped from the artifacts kernel table. Cost is now a strategy concern.

import { artifacts, type HyperIdleDb, tasks } from "@hyperidle/db";
import {
	ARTIFACT_KINDS,
	type Artifact,
	type ArtifactCostFromSession,
	type ArtifactKind,
	type ArtifactPage,
	type ArtifactPreview,
} from "@hyperidle/shared";
import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import { createBodyLimit } from "../middleware/body-limit.js";
import { validateBody } from "../middleware/validate.js";

const RECOGNISED_KIND_VALUES = ARTIFACT_KINDS as readonly string[];
const PREVIEW_BODY_LIMIT = 64 * 1024;
const DEFAULT_LIMIT = 50;
const HARD_LIMIT_CAP = 200;
// L3 review fix Sec-MED-4: cap intermediate task-id materialisation.
const MAX_TASK_ID_FANOUT = 1000;

// @lore L3 / L1 forward-compat: when L1 ships threads.attached_host_*, the
// thread_count subquery (currently constant 0) reads:
//   SELECT COUNT(*) FROM threads
//   WHERE attached_host_type='artifact' AND attached_host_id=artifacts.id

const artifactPreviewSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("code_diff"),
		file: z.string(),
		hunks: z.array(
			z.object({
				header: z.string(),
				lines: z.array(z.object({ kind: z.enum(["add", "del", "ctx"]), text: z.string() })),
			}),
		),
	}),
	z.object({
		kind: z.literal("deck"),
		slideCount: z.number(),
		firstSlideTitle: z.string(),
	}),
	z.object({
		kind: z.literal("contract"),
		parties: z.array(z.string()),
		title: z.string(),
	}),
	z.object({
		kind: z.literal("dashboard"),
		metrics: z.array(z.object({ label: z.string(), value: z.string() })),
	}),
	z.object({
		kind: z.literal("screenshot"),
		imageUrl: z.string(),
		width: z.number(),
		height: z.number(),
	}),
	z.object({
		kind: z.literal("drafted_email"),
		to: z.array(z.string()),
		subject: z.string(),
		bodyExcerpt: z.string(),
	}),
	z.object({
		kind: z.literal("design"),
		imageUrl: z.string(),
		width: z.number(),
		height: z.number(),
	}),
	z.object({
		kind: z.literal("data_analysis"),
		findings: z.array(z.string()),
	}),
	z.object({
		kind: z.literal("decision"),
		claim: z.string(),
		rationale: z.string(),
	}),
	z.object({
		kind: z.literal("running_service"),
		url: z.string(),
		status: z.enum(["ok", "degraded", "down"]),
		statusLabel: z.string(),
	}),
	z.object({
		kind: z.literal("comm_draft"),
		channel: z.string(),
		firstMessage: z.string(),
	}),
	z.object({
		kind: z.literal("verification"),
		suite: z.string(),
		passed: z.number(),
		failed: z.number(),
	}),
]);

const createArtifactSchema = z.object({
	producingTaskId: z.string().min(1),
	kind: z.enum(ARTIFACT_KINDS).refine((k) => k !== "unknown_kind", {
		message: "unknown_kind is not allowed at create",
	}),
	preview: artifactPreviewSchema.nullable(),
	// @lore O2: cost is accepted as a no-op field for wire compat; values are
	// ignored since cost columns were stripped from the kernel artifacts table.
	cost: z
		.object({
			money_micros: z.number().int().nonnegative().finite().nullable(),
			tokens_input: z.number().int().nonnegative().finite().nullable(),
			tokens_output: z.number().int().nonnegative().finite().nullable(),
		})
		.nullable()
		.optional(),
});

const patchPreviewSchema = z.object({ preview: artifactPreviewSchema });

interface ArtifactRow {
	id: string;
	producingTaskId: string;
	kind: string;
	previewJson: string | null;
	createdAt: string;
}

/**
 * @lore O2: cost columns stripped from artifacts table. The Artifact wire
 * type still has a `cost` field (kept for API compat with existing consumers).
 * We return `{ money: null, tokens: null }` — cost is now a strategy concern.
 */
const NULL_COST: ArtifactCostFromSession = { money: null, tokens: null };

function rowToArtifact(row: ArtifactRow, producingTaskTitle: string): Artifact {
	const recognised = RECOGNISED_KIND_VALUES.includes(row.kind) && row.kind !== "unknown_kind";
	const kind = (recognised ? row.kind : "unknown_kind") as ArtifactKind;
	let preview: ArtifactPreview | null = null;
	if (recognised && row.previewJson) {
		// L3 review fix Sec-LOW-1: defence-in-depth. Even though we control
		// writes, validate data-at-rest with the same schema we apply to
		// inbound POST/PATCH. A schema mismatch (corruption, manual SQL,
		// future-version drift) yields preview=null instead of crashing.
		const raw: unknown = JSON.parse(row.previewJson);
		const parsed = artifactPreviewSchema.safeParse(raw);
		if (parsed.success && parsed.data.kind === kind) {
			preview = parsed.data;
		}
	}
	return {
		id: row.id,
		producingTaskId: row.producingTaskId,
		producingTaskTitle,
		kind,
		preview,
		cost: NULL_COST,
		threadCount: 0,
		createdAt: row.createdAt,
	};
}

export function createArtifactRoutes(db: HyperIdleDb): Hono {
	const router = new Hono();

	router.get("/", async (c) => {
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
			const rows = await db
				.select({ id: tasks.id })
				.from(tasks)
				.where(eq(tasks.betId, betId))
				.limit(MAX_TASK_ID_FANOUT + 1);
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
			const rows = await db
				.select({ id: tasks.id })
				.from(tasks)
				.where(eq(tasks.teamId, teamId))
				.limit(MAX_TASK_ID_FANOUT + 1);
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
		const items = sliced.map((r) => rowToArtifact(r.artifact, r.taskTitle));
		const last = sliced[sliced.length - 1];
		const nextCursor =
			rows.length > limit && last ? `${last.artifact.createdAt}|${last.artifact.id}` : null;

		const page: ArtifactPage = { items, nextCursor };
		return c.json(page);
	});

	router.get("/:id", async (c) => {
		const id = c.req.param("id");
		const [row] = await db
			.select({ artifact: artifacts, taskTitle: tasks.title })
			.from(artifacts)
			.innerJoin(tasks, eq(tasks.id, artifacts.producingTaskId))
			.where(eq(artifacts.id, id))
			.limit(1);
		if (!row) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
		return c.json(rowToArtifact(row.artifact, row.taskTitle));
	});

	router.post(
		"/",
		createBodyLimit({ maxSize: PREVIEW_BODY_LIMIT }),
		validateBody(createArtifactSchema),
		async (c) => {
			const body = c.req.valid("json" as never) as z.infer<typeof createArtifactSchema>;

			if (body.preview && body.preview.kind !== body.kind) {
				return c.json({ error: "kind/preview discriminant mismatch", code: "KIND_MISMATCH" }, 400);
			}

			const [taskRow] = await db
				.select({ title: tasks.title })
				.from(tasks)
				.where(eq(tasks.id, body.producingTaskId))
				.limit(1);
			if (!taskRow) {
				return c.json({ error: "producing_task_id not found", code: "INVALID_TASK" }, 400);
			}

			const id = crypto.randomUUID();
			const now = new Date().toISOString();

			// @lore O2: cost fields from the request body are intentionally ignored
			// (cost columns stripped from artifacts table). The body still accepts
			// cost for wire compat with existing callers.
			await db.insert(artifacts).values({
				id,
				producingTaskId: body.producingTaskId,
				kind: body.kind,
				previewJson: body.preview ? JSON.stringify(body.preview) : null,
				createdAt: now,
			});

			const result: Artifact = {
				id,
				producingTaskId: body.producingTaskId,
				producingTaskTitle: taskRow.title,
				kind: body.kind,
				preview: body.preview,
				cost: NULL_COST,
				threadCount: 0,
				createdAt: now,
			};
			return c.json(result, 201);
		},
	);

	router.patch(
		"/:id/preview",
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
