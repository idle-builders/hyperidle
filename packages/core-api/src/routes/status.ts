import { listMessages } from "@hyperidle/conversation";
import type { WriteExecutor } from "@hyperidle/db";
import { type HyperIdleDb, sessions } from "@hyperidle/db";
import { getDailyDigest } from "@hyperidle/notifications";
import { listUsers } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";

/**
 * @lore AU19 Increment 1g: `getDailyDigest` (`@hyperidle/notifications`) now
 * requires an injected deps bag (Mechanism C) — this route constructs it,
 * wiring the real `@hyperidle/work`/`@hyperidle/conversation` function
 * references directly (both real, migrated packages), zero behavior change.
 * @lore AU20 Ag6b: `NotificationsDigestDeps` removed from public API; type
 * inferred structurally — getDailyDigest uses structural typing.
 */
const digestDeps = {
	work: {
		listQueuedItemsSince: (exec: WriteExecutor, cutoff: string) =>
			work.list(exec, "item", { queued: true, createdSince: cutoff }),
		getItemById: (exec: WriteExecutor, id: string) => work.get(exec, "item", id),
	},
	verdicts: {
		listVerdictItemIds: (db, itemIds) =>
			listMessages(db, { types: ["verdict"], legacyItemIds: itemIds }).then((msgs) => [
				...new Set(msgs.map((m) => m.legacyItemId).filter((id): id is string => id !== null)),
			]),
	},
};

const SERVER_START_TIME = new Date().toISOString();

/**
 * Create Hono routes for status and settings endpoints (E6).
 *
 * @lore AU18 §3.1: the generic `GET`/`PATCH /settings` catch-all is retired
 * along with `factorySettings`. Every legitimate key it used to carry now
 * has a domain-specific route (`/api/notifications/config`,
 * `/api/observability/config`, `/api/git-export/config`) backed by
 * `server_config`; there is no remaining legitimate key for a generic
 * settings surface to serve. Confirmed no web client depends on the raw-rows
 * shape (`packages/web` has zero references to `/status/settings`) — the
 * endpoint is removed outright rather than repointed to a read-only
 * projection (plan §3.1's "removed" option), since inventing a new
 * unconsumed shape would be dead surface, not a real migration target.
 */
export function createStatusRoutes(db: HyperIdleDb): Hono {
	const router = new Hono();

	// GET /health — Authenticated status probe. Distinct from the public
	// `/api/health` (liveness) — this route sits behind the auth middleware
	// and is the canonical "status/health" endpoint referenced by I1 S1.
	router.get("/health", requireBoundary({ kind: "public-data" }), (c) => {
		return c.json({ status: "ok", timestamp: new Date().toISOString() });
	});

	// GET / — Factory-wide status
	router.get("/", requireBoundary({ kind: "public-data" }), async (c) => {
		const activeSessions = await db.select().from(sessions).where(eq(sessions.state, "active"));

		const allAgents = await listUsers(db);

		const agentStates: Record<string, number> = {};
		for (const agent of allAgents) {
			agentStates[agent.status] = (agentStates[agent.status] ?? 0) + 1;
		}

		const totalCost = allAgents.reduce((sum, a) => sum + (a.costActual ?? 0), 0);

		// @lore AU18: `factory_start_time` had no writer anywhere in prod — the
		// read always fell back to SERVER_START_TIME already. Use it directly.
		const uptime = SERVER_START_TIME;

		return c.json({
			activeSessions: activeSessions.length,
			agentStates,
			totalCost,
			uptime,
		});
	});

	// GET /digest — Daily digest of queued items from past 24h
	router.get("/digest", requireBoundary({ kind: "public-data" }), async (c) => {
		const digest = await getDailyDigest(db, undefined, digestDeps);
		return c.json(digest);
	});

	return router;
}
