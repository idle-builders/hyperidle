/**
 * AU26 B1a (§D-B) — `agent-orchestration`'s own Hono app.
 *
 * The Layer that owns `sessions`, `explicit_session_starts`,
 * `agent_session_requests` and (AU26 E3) `service_connections` now serves their
 * HTTP surface itself. What it does
 * NOT do is own the middleware stack: cors / rate-limit / body-limit / auth /
 * fail-closed / `onError` / `notFound` are **Application-applied** to the `/api`
 * router both apps mount on. `createAuthMiddleware` legitimately reads
 * `@hyperidle/users` (a core-api Service), and only an Application may choose to
 * put another Layer's routes behind it — so this app never imports core-api.
 *
 * Mounted at `/` on the Application's `/api` router, so every path string here
 * keeps its byte-identical public URL (§D-A rule 7).
 *
 * @lore AU26 B1a: the parent's middleware, context vars and `onError` DO apply
 * to a mounted sub-app, but its `notFound` does NOT — only the root's fires
 * (verified on the installed `hono@4.12.30`, `.pipeline/work/AU26/probes/
 * two-app-mount/`). This app therefore deliberately registers no `notFound` of
 * its own: an unknown `/api/*` path must fall through to the root's canonical
 * JSON `ApiErrorResponse` 404, never Hono's `text/plain` default (AC10).
 */

import {
	type InheritedReach,
	listConnections,
	resolveConnectionToken,
} from "@hyperidle/connections";
import type { HyperIdleDb } from "@hyperidle/db";
import type { ActivityEntry } from "@hyperidle/domain-model";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import type { EventBus } from "@hyperidle/event-bus";
import { Hono } from "hono";
import { createAgentOrchestrationIntakeRoutes } from "./routes/agent-orchestration-intake.js";
import { createAgentOrchestrationSessionsRoutes } from "./routes/agent-orchestration-sessions.js";
import { createConnectionRoutes } from "./routes/connections.js";
import { createFilesystemRoutes } from "./routes/filesystems.js";
import { createOrchestrationSessionRoutes } from "./routes/sessions.js";

export interface AgentOrchestrationAppOptions {
	readonly db: HyperIdleDb;
	/** Reads the Layer's own `SessionActivityBuffer` — see `boot.ts`. */
	readonly getRecentActivity: (sessionId: string) => ReadonlyArray<ActivityEntry>;
	/**
	 * AU36 D7: the connections domain's own reach cache, for `/connections`'
	 * inherited projection. Read-only and DB-free (`list()`), never a
	 * per-request probe. Absent → the inherited group is empty, exactly as it
	 * was when this route read no pool (kernel-only/bare test apps).
	 */
	readonly inheritedReach?: InheritedReach;
	/**
	 * AU44 batch2: injected cipher for connection token encrypt/decrypt.
	 * Absent → connections route uses a no-op cipher (token writes fail, reads return null).
	 */
	readonly cipher?: {
		readonly encrypt: (plaintext: string) => string;
		readonly decrypt: (ciphertext: string) => string | null;
	};
	/**
	 * The filesystems routes' `POST /:id/check` and registration publish
	 * `filesystem_needs_attention` through this. Absent (bare test apps) →
	 * the write still lands, nothing is emitted.
	 */
	readonly eventBus?: EventBus;
	/** Where a remote git filesystem's kept copy lives; absent → DELETE has nothing to forget. */
	readonly keptCopiesRoot?: string;
}

export function createAgentOrchestrationApp(
	options: AgentOrchestrationAppOptions,
): Hono<HyperIdleEnv> {
	const app = new Hono<HyperIdleEnv>();
	const { db, getRecentActivity, inheritedReach, cipher, eventBus, keptCopiesRoot } = options;

	app.route("/sessions", createOrchestrationSessionRoutes(db, getRecentActivity));
	app.route("/agent-orchestration", createAgentOrchestrationSessionsRoutes(db));
	// AU31 §3: the write side of `AgentOrchestrationPort`, mounted beside the
	// read routes above — same internal `/agent-orchestration` seam prefix.
	// `keptCopiesRoot` is what `releaseForTask` needs — the same value
	// `/filesystems` already holds for `forgetKeptCopy`.
	app.route("/agent-orchestration", createAgentOrchestrationIntakeRoutes(db, { keptCopiesRoot }));
	// AU26 E4: `/api/connections` — the path is unchanged; only the host app is.
	app.route("/connections", createConnectionRoutes(db, inheritedReach, cipher));
	// AU26 F2: `/api/filesystems` — same story. A filesystem row has no user
	// of its own, so Check/registration resolve its connection's token AS
	// THE CONNECTION'S OWNER (`resolveConnectionToken`), not per-request userId
	// like the deleted probe did.
	const decrypt = cipher?.decrypt ?? (() => null);
	app.route(
		"/filesystems",
		createFilesystemRoutes(db, {
			eventBus,
			keptCopiesRoot,
			resolveCredential: (connectionId) => resolveConnectionToken(db, connectionId, decrypt),
			lookupConnection: async (connectionId) => {
				const [row] = await listConnections(db, { id: connectionId });
				return row ? { service: row.service, authSource: row.authSource } : null;
			},
		}),
	);

	return app;
}
