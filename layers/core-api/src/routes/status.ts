import { listMessages } from "@hyperidle/conversation";
import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import { getDailyDigest } from "@hyperidle/notifications";
import { requireBoundary } from "@hyperidle/shared/http";
import { listUsers } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { Hono } from "hono";

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
		listVerdictItemIds: (db: HyperIdleDb, itemIds: string[]) =>
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
 * `/api/notifications/config`) backed by
 * `server_config`; there is no remaining legitimate key for a generic
 * settings surface to serve. Confirmed no web client depends on the raw-rows
 * shape (`layers/core-ui` has zero references to `/status/settings`) — the
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
	//
	// @lore AU26 J1: `activeSessions` (a raw `sessions` count) is DELETED. The
	// root `/api/status` route has zero consumers repo-wide — `layers/core-ui`,
	// `layers/core-ui/e2e`, `applications/desktop` and `tools/eval` reference only
	// `/api/status/health` and `/api/status/digest`. (`SettingsWorker.tsx`'s
	// `status.activeSessions` is the Electron `WorkerStatus` bridge object, a
	// different shape entirely.) Agent-run state is `agent-orchestration`'s;
	// core-api does not read it to decorate a response nobody reads.
	router.get("/", requireBoundary({ kind: "public-data" }), async (c) => {
		const allAgents = await listUsers(db);

		const agentStates: Record<string, number> = {};
		for (const agent of allAgents) {
			agentStates[agent.status] = (agentStates[agent.status] ?? 0) + 1;
		}

		// @lore AU18: `factory_start_time` had no writer anywhere in prod — the
		// read always fell back to SERVER_START_TIME already. Use it directly.
		const uptime = SERVER_START_TIME;

		// @lore AU21 Increment 14a: `totalCost` (sum of `users.costActual`) is
		// HARD-DELETED along with the rest of the cost-cap/accounting feature —
		// the column is dropped, no replacement.
		return c.json({
			agentStates,
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
