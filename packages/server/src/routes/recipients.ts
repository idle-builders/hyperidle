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

		// Fetch all agents
		let allAgents = db.select().from(agents).all();

		// Apply name filter (case-insensitive substring)
		if (q.length > 0) {
			const pattern = `%${escapeLikePattern(q.toLowerCase())}%`;
			allAgents = db
				.select()
				.from(agents)
				.where(sql`LOWER(${agents.name}) LIKE ${pattern} ESCAPE '\\'`)
				.all();
		}

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
