// AE6 — Hono router for /api/artifacts.
// Updated from L3 (13 business-domain kinds) to AE6 (6 fundamental kinds + labels).
// Source: plans/AE6/architecture.md §3.

import * as crypto from "node:crypto";
import type { HyperIdleDb } from "@hyperidle/db";
import {
	ARTIFACT_KINDS,
	type Artifact,
	type ArtifactPage,
	artifactPreviewSchema,
	type EventBus,
	fallbackPreviewSchema,
	isRegisteredKind,
	OLD_KIND_MAP,
} from "@hyperidle/shared";
import * as work from "@hyperidle/work";
import { Hono } from "hono";
import z from "zod";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import { createBodyLimit } from "../middleware/body-limit.js";
import { validateBody } from "../middleware/validate.js";

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
});

const patchPreviewSchema = z.object({ preview: artifactPreviewSchema });

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
function rowToArtifact(row: work.ArtifactRow, producingTaskTitle: string): Artifact {
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
		threadCount: 0,
		createdAt: row.createdAt,
	};
}

// @lore AU21 Increment 14a: `eventBus` was only used to route artifact cost
// through `costOps.record` — deleted along with the rest of the cost
// feature. Kept as a parameter (unused, prefixed `_`) so this composition
// root's call signature stays stable for its caller.
export function createArtifactRoutes(db: HyperIdleDb, _eventBus?: EventBus): Hono {
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
			const rows = await work.list(db, "task", { betId, limit: MAX_TASK_ID_FANOUT + 1 });
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
			const rows = await work.list(db, "task", { teamId, limit: MAX_TASK_ID_FANOUT + 1 });
			if (rows.length > MAX_TASK_ID_FANOUT) {
				return c.json({ error: "Task fan-out too large", code: "FANOUT_TOO_LARGE" }, 400);
			}
			taskIds = rows.map((r) => r.id);
		}

		// L3 review fix Adv-B5: composite cursor on (createdAt, id)
		const cursorParam = c.req.query("cursor");
		let cursor: { createdAt: string; id: string } | null = null;
		if (cursorParam) {
			const sep = cursorParam.lastIndexOf("|");
			if (sep <= 0) {
				return c.json({ error: "Invalid cursor", code: "INVALID_CURSOR" }, 400);
			}
			cursor = { createdAt: cursorParam.slice(0, sep), id: cursorParam.slice(sep + 1) };
		}

		const rows = await work.list(db, "artifact", {
			taskIds,
			cursor,
			limit: limit + 1,
			include: "taskTitle",
		});

		const sliced = rows.slice(0, limit);
		const items = sliced.map((r) => rowToArtifact(r.artifact, r.taskTitle));
		const last = sliced[sliced.length - 1];
		const nextCursor =
			rows.length > limit && last ? `${last.artifact.createdAt}|${last.artifact.id}` : null;

		const page: ArtifactPage = { items, nextCursor };
		return c.json(page);
	});

	router.get("/:id", requireBoundary({ kind: "public-data" }), async (c) => {
		const id = c.req.param("id");
		const row = await work.get(db, "artifact", id, { include: "taskTitle" });
		if (!row) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
		return c.json(rowToArtifact(row.artifact, row.taskTitle));
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

			const taskRow = await work.get(db, "task", body.producingTaskId);
			if (!taskRow) {
				return c.json({ error: "producing_task_id not found", code: "INVALID_TASK" }, 400);
			}

			const id = crypto.randomUUID();
			const now = new Date().toISOString();

			await work.create(db, "artifact", {
				id,
				producingTaskId: body.producingTaskId,
				kind: body.kind,
				label: body.label ?? null,
				previewJson: body.preview ? JSON.stringify(body.preview) : null,
				createdAt: now,
			});

			const result: Artifact = {
				id,
				producingTaskId: body.producingTaskId,
				producingTaskTitle: taskRow.title,
				kind: body.kind,
				label: body.label ?? null,
				preview: body.preview as Artifact["preview"],
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
			const result = await work.transition(db, "artifact", {
				id,
				guard: { field: "previewJson", isNull: true },
				patch: { previewJson: JSON.stringify(body.preview) },
			});
			if (result.applied) return c.json({ ok: true });
			const existing = await work.get(db, "artifact", id);
			if (!existing) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
			return c.json({ error: "Preview already set", code: "IMMUTABLE" }, 409);
		},
	);

	// @lore O2: PATCH /:id/cost route removed — cost columns stripped from
	// artifacts table. Cost settlement is now handled at the strategy layer.

	return router;
}
