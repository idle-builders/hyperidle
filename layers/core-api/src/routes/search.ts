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
 * Retrieved via 3 batch queries (thread rows, first messages, latest messages)
 * for the full set of verified thread IDs — not per-thread loops.
 *
 * @lore AD7: Auth boundaries:
 * - Threads: filtered to where participants JSON LIKE-probes userId, then
 *   JS-verified for exact membership (prevents false positives from substring).
 * - Knowledge: scope_kind != 'user' OR updated_by = userId.
 */

import { listMessages, listThreads, searchConversations } from "@hyperidle/conversation";
import type { HyperIdleDb } from "@hyperidle/db";
import type { ApiErrorResponse } from "@hyperidle/domain-model";
import { API_ERROR_CODES } from "@hyperidle/domain-model";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import type { EventBus } from "@hyperidle/event-bus";
import { search as searchKnowledge } from "@hyperidle/knowledge";
import { listTeams } from "@hyperidle/org";
import * as work from "@hyperidle/task";
// BB1: deriveTitle removed — tasks use .title directly
import { Hono } from "hono";
import z from "zod";

/** Max results per category */
const MAX_PER_CATEGORY = 5;

/**
 * Map DB hostKind to frontend conversation kind.
 * task/knowledge_item → "review"
 * agent/user/team/factory → "chat"
 *
 * @lore BB1: "bet" removed — the bets table is deleted; every bet became a root task.
 * @lore artifacts-become-knowledge: "artifact" removed — threads hang off the
 * knowledge item itself; there is no artifact host kind.
 */
function hostKindToConversationKind(hostKind: string): "review" | "chat" {
	switch (hostKind) {
		case "task":
		case "knowledge_item":
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

		// @lore AU44 batch 4: scope=knowledge folds GET /api/knowledge/search into
		// GET /api/search — returns { results: [...] } matching the old dedicated route.
		// No visibility filter (preserving original knowledge search behaviour).
		// Max query length is now 200 chars (was 500 on the old route — behaviour change).
		const scope = c.req.query("scope");
		if (scope === "knowledge") {
			const rawLimit = c.req.query("limit");
			const parsedLimit = rawLimit !== undefined ? Number.parseInt(rawLimit, 10) : undefined;
			const limit =
				parsedLimit !== undefined && Number.isFinite(parsedLimit) && parsedLimit > 0
					? parsedLimit
					: undefined;
			const results = await searchKnowledge(db, query, {
				mode: "text",
				...(limit !== undefined ? { limit } : {}),
			});
			return c.json({ results });
		}

		// I2 V4: escape LIKE wildcards so user's literal chars do not become SQL operators.
		const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;

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

		const participantPattern = `%"${userId.replace(/[\\%_]/g, "\\$&")}"%`;

		// Find all threads where the current user might be a participant and
		// at least one message matches the query.
		// @lore AD7: ILIKE (case-insensitive LIKE) used for search UX — users expect
		// case-insensitive matching. The ESCAPE clause is still supported by ILIKE in
		// PostgreSQL. The participant probe uses plain LIKE (JSON structure is ASCII).
		// AF16 T7: over-fetch is ordered desc(lastActiveAt), asc(threads.id) so the
		// JS cap picks the same top rows regardless of DB page order (deterministic).
		const matchingThreadRows = await searchConversations(
			db,
			participantPattern,
			pattern,
			MAX_PER_CATEGORY * 10, // over-fetch so we can JS-filter then cap
		);

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

		// Fetch thread metadata with first + latest message for each verified thread.
		// @lore AD7: Three batch queries (thread rows, first messages, latest messages)
		// replace the previous N+1 loop (3 queries per thread). For up to 5 threads
		// this is always exactly 3 round-trips instead of up to 15.

		const conversationResults: Array<{
			id: string;
			title: string;
			snippet: string;
			timestamp: string;
			kind: "review" | "chat";
		}> = [];

		if (verifiedThreadIds.length > 0) {
			// Batch 1: thread rows for hostKind and lastActiveAt
			const threadRowMap = new Map<string, { hostKind: string; lastActiveAt: string }>();
			// AF16 T7: id ASC tiebreaker for deterministic order on tied lastActiveAt
			const threadRowsBatch = await listThreads(db, {
				ids: verifiedThreadIds,
				order: "lastActive",
			});
			for (const row of threadRowsBatch) {
				threadRowMap.set(row.id, { hostKind: row.hostKind, lastActiveAt: row.lastActiveAt });
			}

			// Batch 2: all non-deleted messages for these threads, ordered by createdAt ASC.
			// First occurrence per thread = title source; last occurrence = snippet source.
			const allMsgs = await listMessages(db, {
				threadIds: verifiedThreadIds,
				includeDeleted: false,
				order: "createdAt",
			});

			// Group messages per thread: first = title, last = snippet
			const firstMsgMap = new Map<string, string>();
			const latestMsgMap = new Map<string, string>();
			for (const msg of allMsgs) {
				if (!firstMsgMap.has(msg.threadId)) {
					firstMsgMap.set(msg.threadId, msg.payload);
				}
				latestMsgMap.set(msg.threadId, msg.payload); // always overwrite → last wins
			}

			// Build results in lastActiveAt DESC order (threadRowsBatch already sorted)
			for (const threadRow of threadRowsBatch) {
				const thread = threadRowMap.get(threadRow.id);
				if (!thread) continue;

				const titleText = extractPayloadText(firstMsgMap.get(threadRow.id) ?? "");
				const snippetText = extractPayloadText(latestMsgMap.get(threadRow.id) ?? "");

				conversationResults.push({
					id: threadRow.id,
					title: titleText.slice(0, 80) || threadRow.id,
					snippet: snippetText.slice(0, 120),
					timestamp: thread.lastActiveAt,
					kind: hostKindToConversationKind(thread.hostKind),
				});
			}
		}

		// ── 2. Work (bets) ──────────────────────────────────────────────────────
		//
		// Find bets where description LIKE-matches the query.
		// Join teams for the team name.
		//
		// @lore AD7: No auth boundary on bets — all authenticated users see all bets.
		// Bets are team-scoped, not user-private.

		// AF16 T7 (Z8-033): stable secondary sort by id ASC eliminates nondeterministic
		// ordering when multiple rows share the same createdAt timestamp.
		// AF16 T8 (Z8-033): match-rank CASE biases exact/prefix matches above mid-string
		// substring matches. Order: matchRank ASC, createdAt DESC, id ASC.
		//
		// @lore AU13 addendum §A2/§A9: this was a `.from(bets).innerJoin(teams, …)`
		// query — routing it through work-service would require a THIRD
		// foreign-table import past the two-function ceiling. Resolved by keeping
		// `searchBetsByText` bets-only (owns the matchRank + LIKE predicate, no
		// foreign columns) and doing the team-name lookup here as a separate
		// batch call. Same result set/order/values; only JOIN-vs-app-level-map
		// mechanics differ.
		//
		// @lore AU19 Increment 3 (teams table-ownership remediation, 2026-07-15
		// founder ruling): this used to be a direct `.from(teams)` query,
		// claiming "`teams` is not one of the five owned tables, so any file may
		// query it" — WRONG, `teams` IS `org`-owned (architecture.md §4 line 69).
		// Now calls `@hyperidle/org`'s `listTeamsByIds`.
		// BB1: search root tasks (parentTaskId: null) instead of deleted bets.
		const taskRows = await work.list(db, "task", {
			text: query,
			parentTaskId: null,
			limit: MAX_PER_CATEGORY,
		});
		const taskTeamRows =
			taskRows.length > 0 ? await listTeams(db, { ids: taskRows.map((t) => t.teamId) }) : [];
		const teamNameMap = new Map(taskTeamRows.map((t) => [t.id, t.name]));

		const workResults = taskRows.map((row) => ({
			id: row.id,
			title: row.title,
			team: teamNameMap.get(row.teamId) ?? row.teamId,
			status: row.state,
		}));

		// ── 3. Knowledge items ──────────────────────────────────────────────────
		//
		// Find knowledge items where title OR body LIKE-matches the query.
		//
		// Auth boundary: scope_kind != 'user' OR updated_by = userId.
		// (user-scoped items are private to their author)
		//
		// @lore AU19 Increment 5 item 4 (guard-retirement full-sweep, knowledge
		// sub-item): this used to be a direct `.from(knowledgeItems).leftJoin(
		// knowledgeAppProjection, …)` query — `knowledgeItems`/
		// `knowledgeAppProjection` are `knowledge`-owned (TABLE_OWNER since
		// Increment 1a). Now calls `@hyperidle/knowledge`'s `searchVisibleByText`
		// — same ILIKE/auth-filter/join/order/limit, zero behavior change.

		// @lore AU20 K1-reads: searchVisibleByText() deleted; search(mode:'text',
		// visibility) performs ILIKE on title/body/topic + Q2 auth filter.
		// Accepts raw query (builds %pattern% internally). Same result set.
		const kiRows = await searchKnowledge(db, query, {
			mode: "text",
			visibility: userId,
			limit: MAX_PER_CATEGORY,
		});

		const knowledgeResults = kiRows.map((row) => ({
			id: row.id,
			title: row.title,
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
