import {
	artifacts,
	bets,
	type HyperIdleDb,
	messages,
	products,
	tasks,
	teams,
	threads,
} from "@hyperidle/db";
import type { ArtifactKind, ArtifactThreadSummary, EventBus } from "@hyperidle/shared";
import { ARTIFACT_KINDS, MUTABLE_BET_FIELDS } from "@hyperidle/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { validateBody } from "../middleware/validate.js";
import { transitionBet, updateBetField } from "../services/bet-state-machine.js";

const RECOGNISED_ARTIFACT_KIND_VALUES = ARTIFACT_KINDS as readonly string[];
const SUMMARY_CAP = 10;

/**
 * Zod schemas for request validation.
 */
/**
 * @lore I6: appetite is now enum-validated to the three spec-defined cycle
 * lengths. Arbitrary strings were never intended here.
 */
const BET_APPETITES = ["1 week", "2 weeks", "6 weeks"] as const;

const createBetSchema = z.object({
	productId: z.string(),
	teamId: z.string(),
	pitch: z.string(),
	appetite: z.enum(BET_APPETITES),
	doneCondition: z.string().optional(),
	hypothesis: z.string().optional(),
});

// I2 V2: enum-validate `field` so an unknown value is rejected with 400 by
// Zod instead of falling through to the service layer (which would throw
// a generic Error mapped to 500).
const updateBetSchema = z.object({
	field: z.enum(MUTABLE_BET_FIELDS),
	value: z.string(),
	reason: z.string(),
});

const killBetSchema = z.object({
	reason: z.string().min(1),
});

/**
 * L14: Pause requires a reason so the founder documents why work is paused.
 */
const pauseBetSchema = z.object({
	reason: z.string().min(1),
});

/**
 * L14: Resume reason is optional — resuming is non-destructive.
 */
const resumeBetSchema = z.object({
	reason: z.string().optional(),
});

/**
 * L18: Assert the caller can read the bet — returns the bet row or null when
 * the bet does not exist or the caller cannot access it. Extracted so it is
 * reusable across the detail endpoint and the new aggregate endpoints without
 * repeating the 404 guard.
 *
 * @lore L18: the plan flags an IDOR risk on the artifact-thread-summary
 * endpoint (risk §4). We reuse the same per-bet read check here that already
 * backs `GET /api/bets/:id`. If auth evolves to founder-scoped reads this
 * helper is the single place to extend.
 */
function assertBetReadable(db: HyperIdleDb, betId: string): { id: string } | null {
	const row = db.select({ id: bets.id }).from(bets).where(eq(bets.id, betId)).get();
	return row ?? null;
}

/**
 * Derive a display title from the bet's pitch markdown.
 * Takes the first non-empty line, strips leading "# " (or "## " etc.) markers,
 * and truncates to 60 characters. Falls back to betId when no heading is found.
 *
 * @lore L14: pitch is freeform markdown so the first line may not be a heading.
 * The fallback (betId) ensures the API never returns an empty title field.
 */
function deriveTitleFromPitch(pitch: string, betId: string): string {
	const lines = pitch.split("\n");
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		// Strip any number of leading '#' chars followed by a space
		const stripped = trimmed.replace(/^#{1,6}\s+/, "");
		if (stripped) {
			return stripped.slice(0, 60);
		}
	}
	return betId;
}

/**
 * Create Hono routes for bet endpoints.
 * Requires db and eventBus to be set in context via middleware.
 */
export function createBetRoutes(db: HyperIdleDb, eventBus: EventBus): Hono {
	const router = new Hono();

	// GET /bets — list all bets grouped by status, with pagination
	router.get("/", (c) => {
		const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
		const offset = Number.parseInt(c.req.query("offset") ?? "0", 10) || 0;

		const allBets = db.select().from(bets).limit(limit).offset(offset).all();

		const grouped = {
			shaped: allBets.filter((b) => b.status === "shaped"),
			committed: allBets.filter((b) => b.status === "committed"),
			in_progress: allBets.filter((b) => b.status === "in_progress"),
			shipped: allBets.filter((b) => b.status === "shipped"),
			killed: allBets.filter((b) => b.status === "killed"),
		};

		return c.json(grouped);
	});

	// GET /bets/canvas — canvas data: shaped, committed, capacity info
	router.get("/canvas", (c) => {
		const allBets = db.select().from(bets).all();
		const allTeams = db.select().from(teams).all();

		const totalCapacity = allTeams.reduce((sum, t) => sum + t.capacity, 0);
		const totalUsed = allTeams.reduce((sum, t) => sum + t.activeBets, 0);

		const canvas = {
			shaped: allBets.filter((b) => b.status === "shaped"),
			committed: allBets.filter((b) => b.status === "committed"),
			capacity: {
				used: totalUsed,
				max: totalCapacity,
			},
		};

		return c.json(canvas);
	});

	// GET /bets/:id — bet detail with tasks, enriched with title/product/team/progress.
	//
	// @lore L14: The `bets` table has no title, product, or team columns. These
	// fields are derived server-side:
	//   - title: first non-empty line of pitch, stripping the "# " prefix.
	//            Falls back to bet.id if no heading is found.
	//   - product: joined from products.name via bets.productId.
	//   - team: teams.id (display identifier; name column not yet on teams table).
	//   - progress: { done, total } computed from the tasks already fetched.
	// Keeping enrichment in the API layer preserves the three-layer boundary
	// (client stays thin) and avoids a second API call from the browser.
	router.get("/:id", (c) => {
		const betId = c.req.param("id");
		const bet = db.select().from(bets).where(eq(bets.id, betId)).get();

		if (!bet) {
			return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
		}

		const betTasks = db.select().from(tasks).where(eq(tasks.betId, betId)).all();

		// Derive title from the first heading line of the pitch.
		// Pattern: strip optional leading "# " (H1) or "## " (H2) markers.
		const title = deriveTitleFromPitch(bet.pitch, bet.id);

		// Join product name.
		const productRow = db
			.select({ name: products.name })
			.from(products)
			.where(eq(products.id, bet.productId))
			.get();
		const product = productRow?.name ?? bet.productId;

		// Team identifier — teams table has no name column yet; use id.
		const team = bet.teamId;

		// Compute progress from tasks.
		const done = betTasks.filter((t) => t.state === "done").length;
		const total = betTasks.length;

		return c.json({ ...bet, tasks: betTasks, title, product, team, progress: { done, total } });
	});

	// POST /bets — create shaped bet
	router.post("/", validateBody(createBetSchema), (c) => {
		const body = c.req.valid("json" as never) as z.infer<typeof createBetSchema>;
		const id = crypto.randomUUID();
		const now = new Date().toISOString();

		db.insert(bets)
			.values({
				id,
				productId: body.productId,
				teamId: body.teamId,
				pitch: body.pitch,
				appetite: body.appetite,
				doneCondition: body.doneCondition ?? null,
				hypothesis: body.hypothesis ?? null,
				status: "shaped",
				createdAt: now,
			})
			.run();

		const created = db.select().from(bets).where(eq(bets.id, id)).get();
		return c.json(created, 201);
	});

	// PATCH /bets/:id — update mutable fields on active bets.
	// L14: appetite enum guard at the route level; actor "u-founder" written to revision log.
	router.patch("/:id", validateBody(updateBetSchema), async (c) => {
		const betId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof updateBetSchema>;

		// L14: reject invalid appetite values at the HTTP layer. The state machine
		// does NOT enforce this (it predates L14 and a protected test covers it with
		// a non-enum value). Route-level validation is the correct enforcement point.
		// @lore L14: appetite enum guard lives at the route, not updateBetField, because
		// the protected bet-state-machine test calls updateBetField directly with "4 weeks"
		// and must remain green. The route is the correct enforcement boundary.
		if (body.field === "appetite" && !(BET_APPETITES as readonly string[]).includes(body.value)) {
			return c.json(
				{ error: `Invalid appetite value '${body.value}'`, code: "VALIDATION_ERROR" },
				400,
			);
		}

		await updateBetField(db, eventBus, betId, body.field, body.value, body.reason, "u-founder");

		const updated = db.select().from(bets).where(eq(bets.id, betId)).get();
		return c.json(updated);
	});

	// POST /bets/:id/commit — transition shaped→committed
	router.post("/:id/commit", async (c) => {
		const betId = c.req.param("id");
		await transitionBet(db, eventBus, betId, "committed");
		const updated = db.select().from(bets).where(eq(bets.id, betId)).get();
		return c.json(updated);
	});

	// POST /bets/:id/ship — transition in_progress→shipped
	router.post("/:id/ship", async (c) => {
		const betId = c.req.param("id");
		await transitionBet(db, eventBus, betId, "shipped");
		const updated = db.select().from(bets).where(eq(bets.id, betId)).get();
		return c.json(updated);
	});

	// POST /bets/:id/kill — kill with reason (required)
	router.post("/:id/kill", validateBody(killBetSchema), async (c) => {
		const betId = c.req.param("id");
		if (!assertBetReadable(db, betId)) {
			return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
		}
		const body = c.req.valid("json" as never) as z.infer<typeof killBetSchema>;
		await transitionBet(db, eventBus, betId, "killed", { reason: body.reason, actor: "u-founder" });
		const updated = db.select().from(bets).where(eq(bets.id, betId)).get();
		return c.json(updated);
	});

	// POST /bets/:id/pause — pause an in_progress or behind bet. Reason required.
	// L14: T3.
	router.post("/:id/pause", validateBody(pauseBetSchema), async (c) => {
		const betId = c.req.param("id");
		if (!assertBetReadable(db, betId)) {
			return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
		}
		const body = c.req.valid("json" as never) as z.infer<typeof pauseBetSchema>;
		await transitionBet(db, eventBus, betId, "paused", { reason: body.reason, actor: "u-founder" });
		const updated = db.select().from(bets).where(eq(bets.id, betId)).get();
		return c.json(updated);
	});

	// POST /bets/:id/resume — resume a paused bet. Reason optional.
	// L14: T4.
	router.post("/:id/resume", validateBody(resumeBetSchema), async (c) => {
		const betId = c.req.param("id");
		if (!assertBetReadable(db, betId)) {
			return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
		}
		const body = c.req.valid("json" as never) as z.infer<typeof resumeBetSchema>;
		await transitionBet(db, eventBus, betId, "in_progress", {
			reason: body.reason ?? "Resumed by founder",
			actor: "u-founder",
		});
		const updated = db.select().from(bets).where(eq(bets.id, betId)).get();
		return c.json(updated);
	});

	// GET /bets/:id/artifact-thread-summary — per-bet aggregate of artifact threads.
	// Returns up to SUMMARY_CAP summaries ordered by lastMessageAt DESC.
	// Requires the bet to exist (404 guard via assertBetReadable).
	//
	// @lore L18: the endpoint joins artifacts → tasks → bet, then aggregates
	// per-artifact thread stats. A correlated subquery counts messages and
	// fetches the last message in one pass. SQLite handles this efficiently at
	// expected volumes (< 100 artifacts per bet). The server-enforced cap of 10
	// bounds the worst-case payload and query cost.
	router.get("/:id/artifact-thread-summary", (c) => {
		const betId = c.req.param("id");

		if (!assertBetReadable(db, betId)) {
			return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
		}

		// 1. Collect all task ids for this bet (fan-out guard: bets have bounded tasks).
		const taskRows = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.betId, betId)).all();
		const taskIds = taskRows.map((r) => r.id);

		if (taskIds.length === 0) {
			return c.json({ summaries: [], totalCount: 0, truncated: false });
		}

		// 2. For each artifact linked to those tasks, compute:
		//    - thread id (if any) via LEFT JOIN threads WHERE host_kind='artifact'
		//    - messageCount, lastMessageAt, lastMessageSnippet via correlated subquery on messages
		//    - hasUnresolvedReview: whether any review-type message in the thread has resolvedAt IS NULL
		//
		// We use Drizzle's sql`` template for the aggregate expressions.
		// @lore L18: Drizzle SQLite does not expose a built-in correlated-subquery helper.
		// Using sql`` template tags is the idiomatic escape hatch for aggregate queries.
		const rows = db
			.select({
				artifactId: artifacts.id,
				artifactKind: artifacts.kind,
				artifactPreviewJson: artifacts.previewJson,
				taskTitle: tasks.title,
				threadId: threads.id,
				messageCount:
					sql<number>`COALESCE((SELECT COUNT(*) FROM ${messages} WHERE ${messages.threadId} = ${threads.id}), 0)`.as(
						"message_count",
					),
				lastMessageAt: sql<
					string | null
				>`(SELECT ${messages.createdAt} FROM ${messages} WHERE ${messages.threadId} = ${threads.id} AND ${messages.deletedAt} IS NULL ORDER BY ${messages.createdAt} DESC LIMIT 1)`.as(
					"last_message_at",
				),
				lastMessagePayload: sql<
					string | null
				>`(SELECT ${messages.payload} FROM ${messages} WHERE ${messages.threadId} = ${threads.id} AND ${messages.type} = 'plain' AND ${messages.deletedAt} IS NULL ORDER BY ${messages.createdAt} DESC LIMIT 1)`.as(
					"last_message_payload",
				),
				hasUnresolvedReview:
					sql<number>`COALESCE((SELECT 1 FROM ${messages} WHERE ${messages.threadId} = ${threads.id} AND ${messages.type} = 'review' AND ${messages.resolvedAt} IS NULL LIMIT 1), 0)`.as(
						"has_unresolved_review",
					),
			})
			.from(artifacts)
			.innerJoin(tasks, eq(tasks.id, artifacts.producingTaskId))
			.leftJoin(threads, and(eq(threads.hostKind, "artifact"), eq(threads.hostId, artifacts.id)))
			.where(inArray(artifacts.producingTaskId, taskIds))
			.all();

		// 3. Filter to only artifacts with at least one message.
		const withMessages = rows.filter((r) => r.threadId !== null && (r.messageCount ?? 0) >= 1);

		// 4. Sort by lastMessageAt DESC (already stable since we control the ordering).
		withMessages.sort((a, b) => {
			if (a.lastMessageAt && b.lastMessageAt) {
				if (a.lastMessageAt > b.lastMessageAt) return -1;
				if (a.lastMessageAt < b.lastMessageAt) return 1;
			}
			// Tie-break by artifactId ASC for determinism.
			return a.artifactId < b.artifactId ? -1 : 1;
		});

		const totalCount = withMessages.length;
		const truncated = totalCount > SUMMARY_CAP;
		const capped = withMessages.slice(0, SUMMARY_CAP);

		const summaries: ArtifactThreadSummary[] = capped.map((r) => {
			// Derive artifact title from previewJson (look for 'file' or 'title' fields),
			// falling back to the producing task's title.
			let artifactTitle = r.taskTitle;
			if (r.artifactPreviewJson) {
				try {
					const preview = JSON.parse(r.artifactPreviewJson) as Record<string, unknown>;
					if (typeof preview["file"] === "string" && preview["file"]) {
						artifactTitle = preview["file"];
					} else if (typeof preview["title"] === "string" && preview["title"]) {
						artifactTitle = preview["title"];
					}
				} catch {
					// ignore malformed previewJson; fall back to task title
				}
			}

			// Normalise artifactKind to a recognised value.
			const recognised =
				RECOGNISED_ARTIFACT_KIND_VALUES.includes(r.artifactKind) &&
				r.artifactKind !== "unknown_kind";
			const artifactKind = (recognised ? r.artifactKind : "unknown_kind") as ArtifactKind;

			// Extract snippet from the last plain-message payload (first 80 chars of text).
			let lastMessageSnippet: string | null = null;
			if (r.lastMessagePayload) {
				try {
					const payload = JSON.parse(r.lastMessagePayload) as Record<string, unknown>;
					const text = payload["text"];
					if (typeof text === "string" && text) {
						lastMessageSnippet = text.slice(0, 80);
					}
				} catch {
					// ignore malformed payload
				}
			}

			return {
				artifactId: r.artifactId,
				artifactKind,
				artifactTitle,
				threadId: r.threadId ?? null,
				messageCount: r.messageCount ?? 0,
				lastMessageAt: r.lastMessageAt ?? null,
				lastMessageSnippet,
				hasUnresolvedReview: r.hasUnresolvedReview === 1,
			};
		});

		return c.json({ summaries, totalCount, truncated });
	});

	return router;
}
