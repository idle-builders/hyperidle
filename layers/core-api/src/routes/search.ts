/**
 * @lore: search threads — participants LIKE-probe then JS-verified for exact membership; a substring LIKE could match a user whose id is a prefix of another
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type {
	ActionResult,
	ApiErrorResponse,
	DocumentRow,
	SearchDocumentsInput,
} from "@hyperidle/domain-model";
import { API_ERROR_CODES } from "@hyperidle/domain-model";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import type { EventBus } from "@hyperidle/event-bus";
import * as work from "@hyperidle/task";
import { listMessages, listThreads, searchConversations } from "@hyperidle/thread";
import { listTeams } from "@hyperidle/user";
import { Hono } from "hono";
import z from "zod";
import type { ActionContext } from "../actions/action.js";

type SearchDocumentsRunFn = (
	ctx: ActionContext,
	input: SearchDocumentsInput,
) => Promise<ActionResult<DocumentRow[]>>;

/** Max results per category */
const MAX_PER_CATEGORY = 5;

function hostKindToConversationKind(hostKind: string): "review" | "chat" {
	switch (hostKind) {
		case "task":
		case "document":
			return "review";
		default:
			return "chat";
	}
}

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

export function createSearchRoutes(
	db: HyperIdleDb,
	eventBus: EventBus,
	searchDocuments: SearchDocumentsRunFn,
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// Cap query length to prevent long full-table LIKE scans.
	const SEARCH_QUERY_SCHEMA = z.string().min(1).max(200);

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
		const ctx: ActionContext = { actor: userId, db, eventBus, now: new Date().toISOString() };

		const scope = c.req.query("scope");
		if (scope === "document") {
			const rawLimit = c.req.query("limit");
			const parsedLimit = rawLimit !== undefined ? Number.parseInt(rawLimit, 10) : undefined;
			const limit =
				parsedLimit !== undefined && Number.isFinite(parsedLimit) && parsedLimit > 0
					? parsedLimit
					: undefined;
			const result = await searchDocuments(ctx, {
				text: query,
				...(limit !== undefined ? { limit } : {}),
			});
			return c.json({ results: result.ok ? result.data : [] });
		}

		// Escape LIKE wildcards so user's literal chars do not become SQL operators.
		const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;

		// ── Conversations ──────────────────────────────────────────────────────

		const participantPattern = `%"${userId.replace(/[\\%_]/g, "\\$&")}"%`;

		// Over-fetch ordered desc(lastActiveAt), asc(threads.id) — JS cap picks the same top rows regardless of DB page order.
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

		// Three batch queries replace N+1: thread rows, first messages, latest messages.
		const conversationResults: Array<{
			id: string;
			title: string;
			snippet: string;
			timestamp: string;
			kind: "review" | "chat";
		}> = [];

		if (verifiedThreadIds.length > 0) {
			const threadRowMap = new Map<string, { hostKind: string; lastActiveAt: string }>();
			// Id ASC tiebreaker for deterministic order on tied lastActiveAt.
			const threadRowsBatch = await listThreads(db, {
				ids: verifiedThreadIds,
				order: "lastActive",
			});
			for (const row of threadRowsBatch) {
				threadRowMap.set(row.id, { hostKind: row.hostKind, lastActiveAt: row.lastActiveAt });
			}

			const allMsgs = await listMessages(db, {
				threadIds: verifiedThreadIds,
				includeDeleted: false,
				order: "createdAt",
			});

			const firstMsgMap = new Map<string, string>();
			const latestMsgMap = new Map<string, string>();
			for (const msg of allMsgs) {
				if (!firstMsgMap.has(msg.threadId)) {
					firstMsgMap.set(msg.threadId, msg.payload);
				}
				latestMsgMap.set(msg.threadId, msg.payload); // always overwrite → last wins
			}

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

		// ── Work ───────────────────────────────────────────────────────────────
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

		// ── Documents ──────────────────────────────────────────────────────────
		const documentResult = await searchDocuments(ctx, { text: query, limit: MAX_PER_CATEGORY });
		const documentRows = documentResult.ok ? documentResult.data : [];

		const documentResults = documentRows.map((row) => ({
			id: row.id,
			title: row.title,
			status: row.status,
			timestamp: row.updatedAt,
		}));

		return c.json({
			conversations: conversationResults,
			work: workResults,
			documents: documentResults,
		});
	});

	return router;
}
