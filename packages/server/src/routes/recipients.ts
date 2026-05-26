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

import { agents, type HyperIdleDb, sessions } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { escapeLikePattern } from "../services/like-escape.js";

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

	router.get("/", (c) => {
		const q = c.req.query("q") ?? "";
		const kind = c.req.query("kind");

		// For Q1, only "agent" kind exists. When kind=user is requested,
		// return empty (no user table yet). When kind=agent or no kind, return agents.
		if (kind === "user") {
			return c.json({ recipients: [] });
		}

		// Q1 review issue #13: fetch once with the appropriate filter rather than
		// fetching all unconditionally then re-fetching when a query is present.
		const allAgents =
			q.length > 0
				? db
						.select()
						.from(agents)
						.where(
							sql`LOWER(${agents.name}) LIKE ${`%${escapeLikePattern(q.toLowerCase())}%`} ESCAPE '\\'`,
						)
						.all()
				: db.select().from(agents).all();

		// Fetch active sessions to determine hasActiveSession
		const activeSessions = db.select().from(sessions).where(eq(sessions.state, "active")).all();
		const activeAgentIds = new Set(activeSessions.map((s) => s.agentId));

		const recipients: RecipientRow[] = allAgents.map((agent) => ({
			id: agent.id,
			kind: "agent" as const,
			name: agent.name,
			role: agent.role,
			status: agent.status,
			hasActiveSession: activeAgentIds.has(agent.id),
			avatarUrl: null,
		}));

		return c.json({ recipients });
	});

	return router;
}
