// L3 — Hono router for /api/artifacts.
// Source: plans/architecture-plans/L3.md §5.

import { artifacts, type HyperIdleDb, tasks } from "@hyperidle/db";
import {
	ARTIFACT_KINDS,
	type Artifact,
	type ArtifactKind,
	type ArtifactPage,
	type ArtifactPreview,
	formatArtifactCost,
} from "@hyperidle/shared";
import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { createBodyLimit } from "../middleware/body-limit.js";
import { validateBody } from "../middleware/validate.js";

const RECOGNISED_KIND_VALUES = ARTIFACT_KINDS as readonly string[];
const PREVIEW_BODY_LIMIT = 64 * 1024;
// L3 review fix Sec-MED-1: cost payloads are tiny; cap at 4 KiB.
const COST_BODY_LIMIT = 4 * 1024;
const DEFAULT_LIMIT = 50;
const HARD_LIMIT_CAP = 200;
// L3 review fix Sec-MED-4: cap intermediate task-id materialisation. Beyond
// this we'd need a sub-select rewrite; reject with 400 to surface the limit
// rather than silently truncate.
const MAX_TASK_ID_FANOUT = 1000;

// L3 review fix Sec-MED-3: numeric cost fields must be non-negative finite
// integers. `z.number().nullable()` previously accepted -1, NaN, Infinity,
// and fractions — see security-review.md MEDIUM-3.
const costNumberSchema = z.number().int().nonnegative().finite().nullable();

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
	cost: z
		.object({
			money_micros: costNumberSchema,
			tokens_input: costNumberSchema,
			tokens_output: costNumberSchema,
		})
		.nullable(),
});

const patchPreviewSchema = z.object({ preview: artifactPreviewSchema });
const patchCostSchema = z.object({
	money_micros: costNumberSchema,
	tokens_input: costNumberSchema,
	tokens_output: costNumberSchema,
});

interface ArtifactRow {
	id: string;
	producingTaskId: string;
	kind: string;
	previewJson: string | null;
	costMoneyMicros: number | null;
	costTokensInput: number | null;
	costTokensOutput: number | null;
	costSettledAt: string | null;
	createdAt: string;
}

function rowToArtifact(row: ArtifactRow, producingTaskTitle: string): Artifact {
	const recognised = RECOGNISED_KIND_VALUES.includes(row.kind) && row.kind !== "unknown_kind";
	const kind = (recognised ? row.kind : "unknown_kind") as ArtifactKind;
	let preview: ArtifactPreview | null = null;
	if (recognised && row.previewJson) {
		// L3 review fix Sec-LOW-1: defence-in-depth. Even though we control
		// writes, validate data-at-rest with the same schema we apply to
		// inbound POST/PATCH. A schema mismatch (corruption, manual SQL,
		// future-version drift) yields preview=null instead of crashing or
		// trusting bad data. JSON.parse exceptions still propagate as 500.
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
		cost: formatArtifactCost({
			money_micros: row.costMoneyMicros,
			tokens_input: row.costTokensInput,
			tokens_output: row.costTokensOutput,
		}),
		threadCount: 0,
		createdAt: row.createdAt,
	};
}

export function createArtifactRoutes(db: HyperIdleDb): Hono {
	const router = new Hono();

	router.get("/", (c) => {
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
			const rows = db
				.select({ id: tasks.id })
				.from(tasks)
				.where(eq(tasks.betId, betId))
				.limit(MAX_TASK_ID_FANOUT + 1)
				.all();
			if (rows.length > MAX_TASK_ID_FANOUT) {
				return c.json({ error: "Task fan-out too large", code: "FANOUT_TOO_LARGE" }, 400);
			}
			taskIds = rows.map((r) => r.id);
		} else if (axis === "product") {
			const productId = c.req.query("productId");
			if (!productId) {
				return c.json({ error: "productId required", code: "INVALID_QUERY" }, 400);
			}
			const rows = db
				.select({ id: tasks.id })
				.from(tasks)
				.where(eq(tasks.productId, productId))
				.limit(MAX_TASK_ID_FANOUT + 1)
				.all();
			if (rows.length > MAX_TASK_ID_FANOUT) {
				return c.json({ error: "Task fan-out too large", code: "FANOUT_TOO_LARGE" }, 400);
			}
			taskIds = rows.map((r) => r.id);
		}

		// L3 review fix Adv-B5: composite cursor on (createdAt, id) — ISO-only
		// timestamps cannot disambiguate ties. Encoded as `createdAt|id`.
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
				: (whereClause === undefined ? baseQuery : baseQuery.where(whereClause))
						.orderBy(desc(artifacts.createdAt), desc(artifacts.id))
						.limit(limit + 1)
						.all();

		const sliced = rows.slice(0, limit);
		const items = sliced.map((r) => rowToArtifact(r.artifact, r.taskTitle));
		// Cursor encodes the last returned row's (createdAt, id) so the next
		// page query is monotonically older.
		const last = sliced[sliced.length - 1];
		const nextCursor =
			rows.length > limit && last ? `${last.artifact.createdAt}|${last.artifact.id}` : null;

		const page: ArtifactPage = { items, nextCursor };
		return c.json(page);
	});

	router.get("/:id", (c) => {
		const id = c.req.param("id");
		const row = db
			.select({ artifact: artifacts, taskTitle: tasks.title })
			.from(artifacts)
			.innerJoin(tasks, eq(tasks.id, artifacts.producingTaskId))
			.where(eq(artifacts.id, id))
			.get();
		if (!row) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
		return c.json(rowToArtifact(row.artifact, row.taskTitle));
	});

	router.post(
		"/",
		createBodyLimit({ maxSize: PREVIEW_BODY_LIMIT }),
		validateBody(createArtifactSchema),
		(c) => {
			const body = c.req.valid("json" as never) as z.infer<typeof createArtifactSchema>;

			if (body.preview && body.preview.kind !== body.kind) {
				return c.json({ error: "kind/preview discriminant mismatch", code: "KIND_MISMATCH" }, 400);
			}

			const taskRow = db
				.select({ title: tasks.title })
				.from(tasks)
				.where(eq(tasks.id, body.producingTaskId))
				.get();
			if (!taskRow) {
				return c.json({ error: "producing_task_id not found", code: "INVALID_TASK" }, 400);
			}

			const id = crypto.randomUUID();
			const now = new Date().toISOString();
			const costMoneyMicros = body.cost?.money_micros ?? null;
			const costTokensInput = body.cost?.tokens_input ?? null;
			const costTokensOutput = body.cost?.tokens_output ?? null;
			const costSettledAt = body.cost ? now : null;

			db.insert(artifacts)
				.values({
					id,
					producingTaskId: body.producingTaskId,
					kind: body.kind,
					previewJson: body.preview ? JSON.stringify(body.preview) : null,
					costMoneyMicros,
					costTokensInput,
					costTokensOutput,
					costSettledAt,
					createdAt: now,
				})
				.run();

			const result: Artifact = {
				id,
				producingTaskId: body.producingTaskId,
				producingTaskTitle: taskRow.title,
				kind: body.kind,
				preview: body.preview,
				cost: formatArtifactCost({
					money_micros: costMoneyMicros,
					tokens_input: costTokensInput,
					tokens_output: costTokensOutput,
				}),
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
		(c) => {
			const id = c.req.param("id");
			const body = c.req.valid("json" as never) as z.infer<typeof patchPreviewSchema>;
			// Race-safe update: only updates rows where preview_json IS NULL.
			const updated = db
				.update(artifacts)
				.set({ previewJson: JSON.stringify(body.preview) })
				.where(and(eq(artifacts.id, id), isNull(artifacts.previewJson)))
				.run();
			if (updated.changes === 0) {
				const exists = db
					.select({ id: artifacts.id })
					.from(artifacts)
					.where(eq(artifacts.id, id))
					.get();
				if (!exists) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
				return c.json({ error: "Preview already set", code: "IMMUTABLE" }, 409);
			}
			return c.json({ ok: true });
		},
	);

	router.patch(
		"/:id/cost",
		// L3 review fix Sec-MED-1: explicit small body limit on cost payloads.
		createBodyLimit({ maxSize: COST_BODY_LIMIT }),
		validateBody(patchCostSchema),
		(c) => {
			const id = c.req.param("id");
			const body = c.req.valid("json" as never) as z.infer<typeof patchCostSchema>;
			const now = new Date().toISOString();
			// L3 review fix Adv-B6: settled is defined ONLY by `cost_settled_at IS
			// NOT NULL`. Conflating any non-null cost column with "settled"
			// previously locked partially-populated rows out of completion.
			const existing = db
				.select({ settled: artifacts.costSettledAt })
				.from(artifacts)
				.where(eq(artifacts.id, id))
				.get();
			if (!existing) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
			if (existing.settled !== null) {
				return c.json({ error: "Cost already settled", code: "IMMUTABLE" }, 409);
			}
			const updated = db
				.update(artifacts)
				.set({
					costMoneyMicros: body.money_micros,
					costTokensInput: body.tokens_input,
					costTokensOutput: body.tokens_output,
					costSettledAt: now,
				})
				.where(and(eq(artifacts.id, id), isNull(artifacts.costSettledAt)))
				.run();
			if (updated.changes === 0) {
				const exists = db
					.select({ id: artifacts.id })
					.from(artifacts)
					.where(eq(artifacts.id, id))
					.get();
				if (!exists) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
				return c.json({ error: "Cost already settled", code: "IMMUTABLE" }, 409);
			}
			return c.json({ ok: true });
		},
	);

	return router;
}
