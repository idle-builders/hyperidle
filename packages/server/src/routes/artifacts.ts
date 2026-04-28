// L3 — Hono router for /api/artifacts.
// Source: docs/architecture-plans/L3.md §5.

import { artifacts, bets, type HyperIdleDb, tasks } from "@hyperidle/db";
import {
	ARTIFACT_KINDS,
	type Artifact,
	type ArtifactKind,
	type ArtifactPage,
	type ArtifactPreview,
	type EventBus,
	formatArtifactCost,
} from "@hyperidle/shared";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { createBodyLimit } from "../middleware/body-limit.js";
import { validateBody } from "../middleware/validate.js";

const RECOGNISED_KINDS = new Set<string>(ARTIFACT_KINDS);
const PREVIEW_BODY_LIMIT = 64 * 1024;
const DEFAULT_LIMIT = 50;
const HARD_LIMIT_CAP = 200;

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
			money_micros: z.number().nullable(),
			tokens_input: z.number().nullable(),
			tokens_output: z.number().nullable(),
		})
		.nullable(),
});

const patchPreviewSchema = z.object({ preview: artifactPreviewSchema });
const patchCostSchema = z.object({
	money_micros: z.number().nullable(),
	tokens_input: z.number().nullable(),
	tokens_output: z.number().nullable(),
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
	const recognised = RECOGNISED_KINDS.has(row.kind) && row.kind !== "unknown_kind";
	const kind = (recognised ? row.kind : "unknown_kind") as ArtifactKind;
	let preview: ArtifactPreview | null = null;
	if (recognised && row.previewJson) {
		try {
			const parsed = JSON.parse(row.previewJson) as ArtifactPreview;
			if (parsed.kind === kind) preview = parsed;
		} catch {
			preview = null;
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

export function createArtifactRoutes(db: HyperIdleDb, _eventBus: EventBus): Hono {
	const router = new Hono();

	// GET /api/artifacts (axis discriminator on query)
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
			const rows = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.betId, betId)).all();
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
				.all();
			taskIds = rows.map((r) => r.id);
		}

		// Build query
		const baseQuery = db
			.select({
				artifact: artifacts,
				taskTitle: tasks.title,
			})
			.from(artifacts)
			.innerJoin(tasks, eq(tasks.id, artifacts.producingTaskId));

		const rows =
			taskIds === null
				? baseQuery
						.orderBy(desc(artifacts.createdAt))
						.limit(limit + 1)
						.all()
				: taskIds.length === 0
					? []
					: baseQuery
							.where(inArray(artifacts.producingTaskId, taskIds))
							.orderBy(desc(artifacts.createdAt))
							.limit(limit + 1)
							.all();

		const sliced = rows.slice(0, limit);
		const items = sliced.map((r) => rowToArtifact(r.artifact, r.taskTitle));
		const nextCursor = rows.length > limit ? (items[items.length - 1]?.createdAt ?? null) : null;

		const page: ArtifactPage = { items, nextCursor };
		return c.json(page);
	});

	// GET /api/artifacts/:id (permalink)
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

	// POST /api/artifacts
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
				.select({ id: tasks.id })
				.from(tasks)
				.where(eq(tasks.id, body.producingTaskId))
				.get();
			if (!taskRow) {
				return c.json({ error: "producing_task_id not found", code: "INVALID_TASK" }, 400);
			}

			const id = crypto.randomUUID();
			const now = new Date().toISOString();

			db.insert(artifacts)
				.values({
					id,
					producingTaskId: body.producingTaskId,
					kind: body.kind,
					previewJson: body.preview ? JSON.stringify(body.preview) : null,
					costMoneyMicros: body.cost?.money_micros ?? null,
					costTokensInput: body.cost?.tokens_input ?? null,
					costTokensOutput: body.cost?.tokens_output ?? null,
					costSettledAt: body.cost ? now : null,
					createdAt: now,
				})
				.run();

			const row = db
				.select({ artifact: artifacts, taskTitle: tasks.title })
				.from(artifacts)
				.innerJoin(tasks, eq(tasks.id, artifacts.producingTaskId))
				.where(eq(artifacts.id, id))
				.get();
			if (!row) {
				return c.json({ error: "insert failed", code: "INTERNAL" }, 500);
			}
			return c.json(rowToArtifact(row.artifact, row.taskTitle), 201);
		},
	);

	// PATCH /api/artifacts/:id/preview
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

	// PATCH /api/artifacts/:id/cost
	router.patch("/:id/cost", validateBody(patchCostSchema), (c) => {
		const id = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof patchCostSchema>;
		const now = new Date().toISOString();
		// @lore L3: cost is "settled" when ANY of the cost columns is non-null
		// OR cost_settled_at is non-null. Race-safe SELECT-then-UPDATE-with-WHERE-NULL.
		const existing = db
			.select({
				money: artifacts.costMoneyMicros,
				ti: artifacts.costTokensInput,
				to: artifacts.costTokensOutput,
				settled: artifacts.costSettledAt,
			})
			.from(artifacts)
			.where(eq(artifacts.id, id))
			.get();
		if (!existing) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
		if (
			existing.money !== null ||
			existing.ti !== null ||
			existing.to !== null ||
			existing.settled !== null
		) {
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
			.where(
				and(
					eq(artifacts.id, id),
					isNull(artifacts.costMoneyMicros),
					isNull(artifacts.costTokensInput),
					isNull(artifacts.costTokensOutput),
				),
			)
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
	});

	return router;
}
