import type { HyperIdleDb } from "@hyperidle/db";
import { API_ERROR_CODES, EventBus } from "@hyperidle/shared";
import type { ApiErrorResponse } from "@hyperidle/shared";
import { Hono } from "hono";
import { authMiddleware } from "./middleware/auth.js";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/error-handler.js";
import { createAgentRoutes } from "./routes/agents.js";
import { createBetRoutes } from "./routes/bets.js";
import { createConversationRoutes } from "./routes/conversations.js";
import { createGitExportRoutes } from "./routes/git-export-routes.js";
import { health } from "./routes/health.js";
import { createKnowledgeRoutes } from "./routes/knowledge.js";
import { createRailRoutes } from "./routes/rail.js";
import { createRoutineRoutes } from "./routes/routines-routes.js";
import { createSessionRoutes } from "./routes/sessions-routes.js";
import { createStatusRoutes } from "./routes/status.js";
import { createTaskRoutes } from "./routes/tasks.js";
import { registerTestRoutes } from "./routes/test-routes.js";
import { registerBuiltinRoutineHandlers } from "./services/builtin-routines.js";
import { createGitRunner } from "./services/git-export-runner.js";
import { registerGitExportHandler } from "./services/git-export.js";
import { registerPolicyEngine } from "./services/policy-engine.js";
import { registerSessionReviewCreator } from "./services/session-review-creator.js";

interface AppOptions {
	db?: HyperIdleDb;
	eventBus?: EventBus;
	/**
	 * Optional override for the git-runner factory used by the
	 * `knowledge_updated` event handler. Tests can substitute a FakeGitRunner
	 * to prove the event-triggered path without spawning `git`.
	 */
	gitRunnerFactory?: (repoPath: string) => ReturnType<typeof createGitRunner>;
}

/**
 * Disposers returned from `createApp` so tests + graceful shutdown can
 * tear down event-bus subscriptions. Each function is safe to call more
 * than once.
 */
export interface AppDisposer {
	dispose(): void;
}

/**
 * Create the Hono application.
 * WebSocket routes are registered separately via registerWsRoute() in Bun-only context.
 */
function createApp(options?: AppOptions): Hono {
	const app = new Hono();

	// Backward-compat: /health without auth
	app.route("/", health);

	// ----- /api sub-router -----
	const api = new Hono();

	// CORS on all /api routes
	api.use("*", corsMiddleware);

	// Error handler
	api.onError(errorHandler);

	// Public: /api/health (no auth required)
	api.get("/health", (c) => {
		const response = {
			status: "ok" as const,
			timestamp: new Date().toISOString(),
		};
		return c.json(response);
	});

	// Auth middleware for all other /api routes (except /health above)
	api.use("*", authMiddleware);

	// Register test routes only in non-production environments
	if (process.env.NODE_ENV !== "production") {
		registerTestRoutes(api);
	}

	// Register work endpoints if db is provided
	if (options?.db) {
		const eventBus = options.eventBus ?? new EventBus();
		api.route("/bets", createBetRoutes(options.db, eventBus));
		api.route("/tasks", createTaskRoutes(options.db, eventBus));
		api.route("/knowledge", createKnowledgeRoutes(options.db, eventBus));
		api.route("/rail", createRailRoutes(options.db, eventBus));
		api.route("/conversations", createConversationRoutes(options.db, eventBus));
		api.route("/agents", createAgentRoutes(options.db, eventBus));
		api.route("/routines", createRoutineRoutes(options.db, eventBus));
		api.route("/sessions", createSessionRoutes(options.db, eventBus));
		api.route("/status", createStatusRoutes(options.db));
		api.route("/git-export", createGitExportRoutes(options.db));
		const disposers: Array<() => void> = [];
		disposers.push(registerSessionReviewCreator(options.db, eventBus));
		disposers.push(registerPolicyEngine(options.db, eventBus));
		disposers.push(registerBuiltinRoutineHandlers(options.db, eventBus));
		disposers.push(
			registerGitExportHandler(options.db, eventBus, {
				runnerFactory: options.gitRunnerFactory ?? ((repoPath) => createGitRunner(repoPath)),
			}),
		);
		// @lore Store disposers on the app so tests (and future graceful
		// shutdown) can tear down event-bus subscriptions without leaking
		// handlers across `createApp()` invocations.
		(app as unknown as { __disposers: Array<() => void> }).__disposers = disposers;
	}

	// 404 handler for unknown /api routes
	api.notFound((c) => {
		const response: ApiErrorResponse = {
			error: "Not found",
			code: API_ERROR_CODES.NOT_FOUND,
		};
		return c.json(response, 404);
	});

	app.route("/api", api);

	// Top-level 404 handler for all unmatched routes
	app.notFound((c) => {
		// Check if this is an /api route
		if (c.req.path.startsWith("/api")) {
			const response: ApiErrorResponse = {
				error: "Not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}
		return c.text("404 Not Found", 404);
	});

	return app;
}

const app = createApp();

/**
 * Dispose all event-bus subscriptions attached to an app created via
 * `createApp`. Safe no-op if `createApp` did not attach any (e.g. when
 * called without a `db`).
 */
export function disposeApp(hono: Hono): void {
	const bag = (hono as unknown as { __disposers?: Array<() => void> }).__disposers;
	if (!bag) return;
	for (const d of bag) {
		try {
			d();
		} catch {
			// @lore G4 dispose-swallow: dispose is best-effort. Each registered
			// disposer is a synchronous `EventBus.off` call; the tolerated failure
			// mode here is a second teardown (e.g. overlapping test lifecycles)
			// calling `unsubscribe` on a handler that was already removed. We
			// prefer to continue iterating the disposer list rather than abort
			// midway and leak the remaining subscriptions — a partial dispose
			// during test teardown causes unbounded handler accumulation and
			// flaky downstream assertions. If a disposer needs error visibility,
			// it should log internally rather than throw.
		}
	}
	bag.length = 0;
}

export { app, createApp };
export type { AppOptions };
