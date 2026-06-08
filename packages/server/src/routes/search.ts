/**
 * AD7: Global search route — GET /api/search?q=<query>
 *
 * Returns grouped results across conversations (threads), work (bets), and
 * knowledge items. Three separate LIKE queries — not a UNION — for clarity
 * and independent per-category 5-result caps.
 *
 * @lore AD7: Three separate queries (not UNION) because each category has
 * distinct shape, join requirements, and auth filtering. A UNION would
 * require normalization across incompatible shapes and make auth boundaries
 * harder to reason about per category.
 *
 * @lore AD7: Thread title = first message's payload.text (truncated 80 chars).
 * Thread snippet = latest message's payload.text (truncated 120 chars).
 * Both retrieved via sub-selects to avoid N+1 queries.
 *
 * @lore AD7: Auth boundaries:
 * - Threads: filtered to where participants JSON LIKE-probes userId, then
 *   JS-verified for exact membership (prevents false positives from substring).
 * - Knowledge: scope_kind != 'user' OR updated_by = userId.
 */
import {
	bets,
	type HyperIdleDb,
	knowledgeItems,
	knowledgeStrategyFabric,
	messages,
	teams,
	threads,
} from "@hyperidle/db";
import type { ApiErrorResponse, BetStatus, EventBus } from "@hyperidle/shared";
import { API_ERROR_CODES, deriveTitle } from "@hyperidle/shared";
import { and, eq, ne, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { escapeLikePattern } from "../services/like-escape.js";

/** Max results per category */
const MAX_PER_CATEGORY = 5;

/**
 * Map DB hostKind to frontend conversation kind.
 * bet/task/knowledge_item/artifact → "review"
 * agent/user/team/factory → "chat"
 */
function hostKindToConversationKind(hostKind: string): "review" | "chat" {
	switch (hostKind) {
		case "bet":
		case "task":
		case "knowledge_item":
		case "artifact":
			return "review";
		default:
			return "chat";
	}
}

/**
 * Safely extract text from a message payload JSON string.
 * Returns empty string if the payload is malformed or has no .text field.
 */
function extractPayloadText(payloadJson: string): string {
	try {
		const parsed = JSON.parse(payloadJson) as unknown;
		if (typeof parsed === "object" && parsed !== null && "text" in parsed) {
			const text = (parsed as { text: unknown }).text;
			return typeof text === "string" ? text : "";
		}
		return "";
	} catch {
		return "";
	}
}

export function createSearchRoutes(db: HyperIdleDb, _eventBus: EventBus): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// I2 review M-4 / HIGH-5: cap query length to prevent long full-table LIKE scans.
	// Max 200 chars per AD7 architecture spec (knowledge route uses 500 — search is tighter).
	const SEARCH_QUERY_SCHEMA = z.string().min(1).max(200);

	// GET / — global search across conversations, work (bets), and knowledge
	router.get("/", async (c) => {
		const userId = c.get("userId");
		const rawQuery = c.req.query("q");

		// Trim before validation so whitespace-only strings fail the min(1) check.
		const parsed = SEARCH_QUERY_SCHEMA.safeParse(rawQuery?.trim());
		if (!parsed.success) {
			const response: ApiErrorResponse = {
				error: "Query parameter 'q' is required (1–200 chars)",
				code: API_ERROR_CODES.VALIDATION_ERROR,
			};
			return c.json(response, 400);
		}

		const query = parsed.data;

		// I2 V4: escape LIKE wildcards so user's literal chars do not become SQL operators.
		const pattern = `%${escapeLikePattern(query)}%`;

		// ── 1. Conversations (threads) ──────────────────────────────────────────
		//
		// Find threads where:
		// (a) A message payload LIKE-matches the query, OR
		// (b) The thread has a first message whose text LIKE-matches.
		//
		// Auth boundary: participants JSON contains userId.
		// We LIKE-probe the participants column first (fast), then JS-verify
		// exact membership to avoid substring false positives
		// (e.g. userId "abc" matching participants ["xabcy"]).
		//
		// @lore AD7: The participants column is a JSON array stored as text.
		// A LIKE probe `%"<userId>"%` is correct for a JSON array of quoted strings.
		// JS verification after fetch eliminates false positives from substrings.

		const participantPattern = `%"${escapeLikePattern(userId)}"%`;

		// Find all threads where the current user might be a participant and
		// at least one message matches the query.
		// @lore AD7: ILIKE (case-insensitive LIKE) used for search UX — users expect
		// case-insensitive matching. The ESCAPE clause is still supported by ILIKE in
		// PostgreSQL. The participant probe uses plain LIKE (JSON structure is ASCII).
		const matchingThreadRows = await db
			.select({
				id: threads.id,
				hostKind: threads.hostKind,
				lastActiveAt: threads.lastActiveAt,
				participants: threads.participants,
			})
			.from(threads)
			.innerJoin(messages, eq(messages.threadId, threads.id))
			.where(
				and(
					// Participant probe (LIKE on JSON text)
					sql`${threads.participants} LIKE ${participantPattern} ESCAPE '\\'`,
					// At least one message payload matches (case-insensitive)
					sql`${messages.payload} ILIKE ${pattern} ESCAPE '\\'`,
					// Only non-deleted messages
					sql`${messages.deletedAt} IS NULL`,
				),
			)
			.limit(MAX_PER_CATEGORY * 10); // over-fetch so we can JS-filter then cap

		// JS-verify exact participant membership and deduplicate threads
		const seenThreadIds = new Set<string>();
		const verifiedThreadIds: string[] = [];
		for (const row of matchingThreadRows) {
			if (seenThreadIds.has(row.id)) continue;
			seenThreadIds.add(row.id);
			// Parse participants and check for exact userId membership
			try {
				const parts = JSON.parse(row.participants) as unknown;
				if (Array.isArray(parts) && parts.includes(userId)) {
					verifiedThreadIds.push(row.id);
				}
			} catch {
				// Malformed participants JSON — skip this thread
			}
			if (verifiedThreadIds.length >= MAX_PER_CATEGORY) break;
		}

		// Fetch thread metadata with first + latest message for each verified thread
		const conversationResults: Array<{
			id: string;
			title: string;
			snippet: string;
			timestamp: string;
			kind: "review" | "chat";
		}> = [];

		for (const threadId of verifiedThreadIds) {
			// Fetch first message for title
			const [firstMsg] = await db
				.select({ payload: messages.payload, createdAt: messages.createdAt })
				.from(messages)
				.where(and(eq(messages.threadId, threadId), sql`${messages.deletedAt} IS NULL`))
				.orderBy(messages.createdAt)
				.limit(1);

			// Fetch latest message for snippet
			const [latestMsg] = await db
				.select({ payload: messages.payload, createdAt: messages.createdAt })
				.from(messages)
				.where(and(eq(messages.threadId, threadId), sql`${messages.deletedAt} IS NULL`))
				.orderBy(sql`${messages.createdAt} DESC`)
				.limit(1);

			// Fetch thread row for hostKind and timestamp
			const [thread] = await db
				.select({ hostKind: threads.hostKind, lastActiveAt: threads.lastActiveAt })
				.from(threads)
				.where(eq(threads.id, threadId))
				.limit(1);

			if (!thread) continue;

			const titleText = firstMsg ? extractPayloadText(firstMsg.payload) : "";
			const snippetText = latestMsg ? extractPayloadText(latestMsg.payload) : "";

			conversationResults.push({
				id: threadId,
				title: titleText.slice(0, 80) || threadId,
				snippet: snippetText.slice(0, 120),
				timestamp: thread.lastActiveAt,
				kind: hostKindToConversationKind(thread.hostKind),
			});
		}

		// ── 2. Work (bets) ──────────────────────────────────────────────────────
		//
		// Find bets where description LIKE-matches the query.
		// Join teams for the team name.
		//
		// @lore AD7: No auth boundary on bets — all authenticated users see all bets.
		// Bets are team-scoped, not user-private.

		const betRows = await db
			.select({
				id: bets.id,
				description: bets.description,
				status: bets.status,
				costAppetiteMinor: bets.costAppetiteMinor,
				costAppetiteCurrency: bets.costAppetiteCurrency,
				appetite: bets.appetite,
				teamName: teams.name,
			})
			.from(bets)
			.innerJoin(teams, eq(bets.teamId, teams.id))
			.where(sql`${bets.description} ILIKE ${pattern} ESCAPE '\\'`)
			.limit(MAX_PER_CATEGORY);

		const workResults = betRows.map((row) => ({
			id: row.id,
			title: deriveTitle(row.description, row.id),
			team: row.teamName,
			status: row.status as BetStatus,
			appetite: row.appetite ?? null,
		}));

		// ── 3. Knowledge items ──────────────────────────────────────────────────
		//
		// Find knowledge items where title OR body LIKE-matches the query.
		// LEFT JOIN knowledgeStrategyFabric for layer/kind.
		//
		// Auth boundary: scope_kind != 'user' OR updated_by = userId.
		// (user-scoped items are private to their author)

		const kiRows = await db
			.select({
				id: knowledgeItems.id,
				title: knowledgeItems.title,
				status: knowledgeItems.status,
				updatedAt: knowledgeItems.updatedAt,
				layer: knowledgeStrategyFabric.layer,
				kind: knowledgeStrategyFabric.kind,
			})
			.from(knowledgeItems)
			.leftJoin(
				knowledgeStrategyFabric,
				eq(knowledgeStrategyFabric.knowledgeItemId, knowledgeItems.id),
			)
			.where(
				and(
					// Auth boundary: exclude user-private items belonging to other users
					or(ne(knowledgeItems.scopeKind, "user"), eq(knowledgeItems.updatedBy, userId)),
					// Content match: title or body (case-insensitive)
					or(
						sql`${knowledgeItems.title} ILIKE ${pattern} ESCAPE '\\'`,
						sql`${knowledgeItems.body} ILIKE ${pattern} ESCAPE '\\'`,
					),
				),
			)
			.limit(MAX_PER_CATEGORY);

		const knowledgeResults = kiRows.map((row) => ({
			id: row.id,
			title: row.title,
			layer: row.layer ?? null,
			kind: row.kind ?? null,
			status: row.status,
			timestamp: row.updatedAt,
		}));

		return c.json({
			conversations: conversationResults,
			work: workResults,
			knowledge: knowledgeResults,
		});
	});

	return router;
}
