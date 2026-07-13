/**
 * Q1 §3.3: GET /api/recipients
 *
 * Aggregates agents into a single recipient list for the picker.
 * Supports ?q=<search> (case-insensitive name substring) and
 * ?kind=agent|user filters.
 *
 * For Q1, recipients are agents only. User records do not yet have a
 * separate table — the "user" kind is reserved for future use.
 * hasActiveSession is derived by joining against sessions with state=active.
 */

import { type HyperIdleDb, sessions } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import { listAllUsers, searchUsersByName } from "@hyperidle/core-app";

export interface RecipientRow {
	id: string;
	kind: "agent" | "user";
	name: string;
	role: string;
	status: string;
	hasActiveSession: boolean;
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
		const allUsers = q.length > 0 ? await searchUsersByName(db, q) : await listAllUsers(db);

		// Apply kind filter post-query (human/ai kinds both live in users table)
		const filtered =
			kind === "user"
				? allUsers.filter((u) => u.kind === "human")
				: kind === "agent"
					? allUsers.filter((u) => u.kind === "ai")
					: allUsers;

		// Fetch active sessions to determine hasActiveSession
		const activeSessions = await db.select().from(sessions).where(eq(sessions.state, "active"));
		const activeUserIds = new Set(activeSessions.map((s) => s.agentId));

		const recipients: RecipientRow[] = filtered.map((user) => ({
			id: user.id,
			kind: user.kind === "human" ? "user" : ("agent" as const),
			name: user.name,
			role: user.role,
			status: user.status,
			hasActiveSession: activeUserIds.has(user.id),
			avatarUrl: user.avatarUrl ?? null,
		}));

		return c.json({ recipients });
	});

	return router;
}
