import type { HyperIdleDb } from "@hyperidle/db";
import { API_ERROR_CODES, EventBus, createLogger } from "@hyperidle/shared";
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
import { createNotificationRoutes } from "./routes/notifications-routes.js";
import { createRailRoutes } from "./routes/rail.js";
import { createRoutineRoutes } from "./routes/routines-routes.js";
import { createSessionRoutes } from "./routes/sessions-routes.js";
import { createStatusRoutes } from "./routes/status.js";
import { createTaskRoutes } from "./routes/tasks.js";
import { registerTestRoutes } from "./routes/test-routes.js";
import { createGitRunner } from "./services/git-export-runner.js";
import { registerGitExportHandler } from "./services/git-export.js";
import type { NotificationConfig } from "./services/notifications/config.js";
import { createConsoleAdapter } from "./services/notifications/console-adapter.js";
import { registerNotificationDispatcher } from "./services/notifications/dispatcher.js";
import { createNtfyAdapter } from "./services/notifications/ntfy-adapter.js";
import { createSmtpAdapter } from "./services/notifications/smtp-adapter.js";
import type { NotificationAdapter } from "./services/notifications/types.js";
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
	/**
	 * Optional override for the notification adapter factory used by the
	 * dispatcher + HTTP `/notifications/test` + `/notifications/flush`
	 * routes. Tests inject a FakeAdapter that records every send.
	 */
	notificationAdapterFactory?: (cfg: NotificationConfig) => NotificationAdapter;
}

function defaultNotificationAdapterFactory(cfg: NotificationConfig): NotificationAdapter {
	switch (cfg.primaryChannel) {
		case "ntfy":
			return createNtfyAdapter({
				baseUrl: cfg.ntfy.baseUrl,
				authToken: cfg.ntfy.authToken,
			});
		case "smtp":
			if (!(cfg.smtp.host && cfg.smtp.from)) return createConsoleAdapter();
			return createSmtpAdapter({
				host: cfg.smtp.host,
				port: cfg.smtp.port,
				secure: cfg.smtp.secure,
				username: cfg.smtp.username,
				password: cfg.smtp.password,
				from: cfg.smtp.from,
				ignoreTls: cfg.smtpIgnoreTls,
			});
		default:
			return createConsoleAdapter();
	}
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
 * @lore Event-bus disposers live alongside the app instance but must not
 * appear on the public Hono surface. A module-scoped WeakMap keyed by
 * the Hono instance keeps the association without string-cast stash
 * patterns — disposers are garbage-collected with the app.
 */
const APP_DISPOSERS = new WeakMap<Hono, Array<() => void>>();
const appLogger = createLogger({ pkg: "server.app" });

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
		const adapterFactory = options.notificationAdapterFactory ?? defaultNotificationAdapterFactory;
		api.route("/notifications", createNotificationRoutes(options.db, { adapterFactory }));
		const disposers: Array<() => void> = [];
		disposers.push(registerSessionReviewCreator(options.db, eventBus));
		disposers.push(registerPolicyEngine(options.db, eventBus));
		disposers.push(
			registerGitExportHandler(options.db, eventBus, {
				runnerFactory: options.gitRunnerFactory ?? ((repoPath) => createGitRunner(repoPath)),
			}),
		);
		disposers.push(registerNotificationDispatcher(options.db, eventBus, { adapterFactory }));
		APP_DISPOSERS.set(app, disposers);
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
 * called without a `db`). A disposer that throws is logged and the
 * remaining disposers still run — individual handler cleanup failures
 * must not leak subscriptions.
 */
export function disposeApp(hono: Hono): void {
	const bag = APP_DISPOSERS.get(hono);
	if (!bag) return;
	for (const d of bag) {
		try {
			d();
		} catch (err) {
			appLogger.error("disposeApp: disposer threw", {
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}
	bag.length = 0;
	APP_DISPOSERS.delete(hono);
}

export { app, createApp };
export type { AppOptions };
