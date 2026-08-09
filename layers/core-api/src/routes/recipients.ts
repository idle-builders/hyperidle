/**
 * Q1 §3.3: GET /api/recipients
 *
 * Aggregates agents into a single recipient list for the picker.
 * Supports ?q=<search> (case-insensitive name substring) and
 * ?kind=agent|user filters.
 *
 * For Q1, recipients are agents only. User records do not yet have a
 * separate table — the "user" kind is reserved for future use.
 *
 * @lore AU26 J4: `hasActiveSession` is GONE from this response. It was core-api
 * reading `agent-orchestration`'s `sessions` table so the recipient picker could
 * show a live busy dot. Founder ruling: *"orchestration now has an api so that
 * the ui can get the agent run state from the orchestration directly and combine
 * this information in the ui."* `useRecipients` now fetches
 * `GET /api/agent-orchestration/runs/active-counts` alongside this list; the dot
 * renders exactly as before.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import { requireBoundary } from "@hyperidle/http-middleware";
import { listUsers } from "@hyperidle/users";
import { Hono } from "hono";

export interface RecipientRow {
	id: string;
	kind: "agent" | "user";
	name: string;
	role: string;
	status: string;
	avatarUrl: string | null;
}

export function createRecipientRoutes(_db: HyperIdleDb, _eventBus: EventBus): Hono;
export function createRecipientRoutes(db: HyperIdleDb): Hono;
export function createRecipientRoutes(db: HyperIdleDb, _eventBus?: EventBus): Hono {
	const router = new Hono();

	router.get("/", requireBoundary({ kind: "public-data" }), async (c) => {
		const q = c.req.query("q") ?? "";
		const kind = c.req.query("kind");

		// @lore P2: agents table renamed to users (P2 Unified User primitive).
		// Q1 originally fetched from agents; after the P2 merge, all rows live in users.
		// kind=user filter returns human users only; kind=agent returns AI users.
		// No kind filter returns all users (AI + human).
		const allUsers = q.length > 0 ? await listUsers(db, { nameContains: q }) : await listUsers(db);

		// Apply kind filter post-query (human/ai kinds both live in users table)
		const filtered =
			kind === "user"
				? allUsers.filter((u) => u.kind === "human")
				: kind === "agent"
					? allUsers.filter((u) => u.kind === "ai")
					: allUsers;

		const recipients: RecipientRow[] = filtered.map((user) => ({
			id: user.id,
			kind: user.kind === "human" ? "user" : ("agent" as const),
			name: user.name,
			role: user.role,
			status: user.status,
			avatarUrl: user.avatarUrl ?? null,
		}));

		return c.json({ recipients });
	});

	return router;
}
