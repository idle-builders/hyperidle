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
import { API_ERROR_CODES, appSummary, appTitle } from "@hyperidle/domain-model";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import type { EventBus } from "@hyperidle/event-bus";
import * as work from "@hyperidle/task";
import { listMessages, searchAppMessages, searchConversations } from "@hyperidle/thread";
import { listTeams } from "@hyperidle/user";
import { Hono } from "hono";
import z from "zod";
import type { ActionContext } from "../actions/action.js";
import { excerpt } from "./excerpt.js";

type SearchDocumentsRunFn = (
	ctx: ActionContext,
	input: SearchDocumentsInput,
) => Promise<ActionResult<DocumentRow[]>>;

/** Max results per category */
const MAX_PER_CATEGORY = 5;

/** One hit in find: what it is, the stretch of its text that matched, and where it lives. */
interface Hit {
	readonly id: string;
	readonly title: string;
	readonly snippet: string;
	/** The team it belongs to, by name; a conversation belongs to no team. */
	readonly team: string | null;
	readonly at: string;
}

/**
 * An app found: a document or a message that is one. `on` is where it opens beside — the
 * conversation or task it was made in; null for one that is a page of its own.
 */
interface AppHit extends Hit {
	readonly kind: "document" | "message";
	readonly on: { readonly kind: "thread" | "task"; readonly id: string } | null;
}

/** A message's text as find shows it; an app shows what it says about itself, never its code. */
function payloadText(payloadJson: string): string {
	try {
		const parsed = JSON.parse(payloadJson) as unknown;
		if (typeof parsed === "object" && parsed !== null && "text" in parsed) {
			const { text, format } = parsed as { text: unknown; format?: unknown };
			if (typeof text !== "string") return "";
			return format === "html" ? (appSummary(text) ?? "") : text;
		}
		return "";
	} catch {
		return "";
	}
}

/** The first of `texts` that matches, as its excerpt; empty when only something unshown matched. */
function firstExcerpt(texts: readonly (string | null | undefined)[], query: string): string {
	for (const text of texts) {
		const found = text ? excerpt(text, query) : null;
		if (found) return found;
	}
	return "";
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
		const verified = new Map<string, (typeof matchingThreadRows)[number]>();
		for (const row of matchingThreadRows) {
			if (verified.has(row.id)) continue;
			try {
				const parts = JSON.parse(row.participants) as unknown;
				if (Array.isArray(parts) && parts.includes(userId)) verified.set(row.id, row);
			} catch {
				// Malformed participants JSON — skip this thread
			}
			if (verified.size >= MAX_PER_CATEGORY) break;
		}

		const threadIds = [...verified.keys()];
		const texts = new Map<string, string[]>();
		if (threadIds.length > 0) {
			const allMsgs = await listMessages(db, {
				threadIds,
				includeDeleted: false,
				order: "createdAt",
			});
			for (const msg of allMsgs)
				texts.set(msg.threadId, [...(texts.get(msg.threadId) ?? []), payloadText(msg.payload)]);
		}
		const conversations: Hit[] = [...verified.values()].map((row) => {
			const said = texts.get(row.id) ?? [];
			return {
				id: row.id,
				title: row.title ?? (said[0] ?? "").slice(0, 80),
				snippet: firstExcerpt([...said, row.title], query),
				team: null,
				at: row.lastActiveAt,
			};
		});

		// ── Apps in conversations ──────────────────────────────────────────────
		const appMessageRows = (
			await searchAppMessages(db, participantPattern, pattern, MAX_PER_CATEGORY * 10)
		)
			.filter((row) => {
				try {
					const parts = JSON.parse(row.participants) as unknown;
					return Array.isArray(parts) && parts.includes(userId);
				} catch {
					return false;
				}
			})
			.slice(0, MAX_PER_CATEGORY);
		const appMessageHits: AppHit[] = appMessageRows.map((row) => {
			const page = (JSON.parse(row.payload) as { text: string }).text;
			const title = appTitle(page) ?? "An app";
			return {
				kind: "message",
				id: row.id,
				title,
				snippet: firstExcerpt([appSummary(page), title], query),
				team: null,
				at: row.createdAt,
				on: { kind: "thread", id: row.threadId },
			};
		});

		// ── Work ───────────────────────────────────────────────────────────────
		const taskRows = await work.list(db, "task", {
			text: query,
			parentTaskId: null,
			limit: MAX_PER_CATEGORY,
		});

		// ── Documents ──────────────────────────────────────────────────────────
		const documentResult = await searchDocuments(ctx, { text: query, limit: MAX_PER_CATEGORY });
		const documentRows = documentResult.ok ? documentResult.data : [];

		const teamIds = [
			...taskRows.map((t) => t.teamId),
			...documentRows.flatMap((d) => (d.scopeKind === "team" && d.scopeId ? [d.scopeId] : [])),
		];
		const teamRows = teamIds.length > 0 ? await listTeams(db, { ids: [...new Set(teamIds)] }) : [];
		const teamName = new Map(teamRows.map((t) => [t.id, t.name]));

		const workHits: Hit[] = taskRows.map((row) => ({
			id: row.id,
			title: row.title,
			snippet: firstExcerpt(
				[
					row.descriptionFormat === "html" ? appSummary(row.description ?? "") : row.description,
					row.title,
				],
				query,
			),
			team: teamName.get(row.teamId) ?? null,
			at: row.updatedAt,
		}));
		const documentHit = (row: DocumentRow): Hit => ({
			id: row.id,
			title: row.title,
			snippet: firstExcerpt(
				[row.format === "html" ? appSummary(row.body) : row.body, row.title],
				query,
			),
			team: row.scopeKind === "team" ? (teamName.get(row.scopeId ?? "") ?? null) : null,
			at: row.updatedAt,
		});
		const documentHits = documentRows.filter((row) => row.format !== "html").map(documentHit);
		const appHits: AppHit[] = [
			...documentRows
				.filter((row) => row.format === "html")
				.map(
					(row): AppHit => ({
						...documentHit(row),
						kind: "document",
						on:
							(row.parentKind === "thread" || row.parentKind === "task") && row.parentId
								? { kind: row.parentKind, id: row.parentId }
								: null,
					}),
				),
			...appMessageHits,
		];

		return c.json({ conversations, work: workHits, documents: documentHits, apps: appHits });
	});

	return router;
}
