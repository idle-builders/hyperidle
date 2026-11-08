import { appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { API_ERROR_CODES } from "@hyperidle/domain-model";
import { Hono } from "hono";
import { registerAppDisposers } from "../app.js";
import { bootCoreApi, type CoreApiBootOptions, type SignIn } from "../boot.js";
import { health } from "../routes/health.js";

const TRACE_FILE = process.env.VITEST_TRACE_FILE;

export interface TestAppOptions extends CoreApiBootOptions {
	/** Where people sign in to join; omitted → this app has no join route. */
	signIn?: SignIn;
	/**
	 * Mount extra routes on the `/api` router at the exact point production's
	 * Application mounts the MCP bridge: after both Layers' pre-auth
	 * registrations, BEFORE `stack.auth`.
	 *
	 * @lore: registerPreAuthRoutes: mounting is an application decision (not layer); MCP client uses 64-char hex session token in URL, not X-API-Key; must be pre-auth
	 */
	registerPreAuthRoutes?: (apiRouter: Hono) => void;
}

/**
 * Build the core-API app for a test, without agent-orchestration.
 */
export async function createTestApp(options?: TestAppOptions): Promise<Hono> {
	const t0 = performance.now();

	const coreApi = await bootCoreApi({
		...options,
		...(options?.signIn ? { signIn: options.signIn } : {}),
	});

	const app = new Hono();
	app.route("/", health);

	const api = new Hono();
	const stack = coreApi.middleware;
	api.use("*", stack.cors);
	api.onError(stack.errorHandler);
	coreApi.registerPreAuthRoutes(api);
	options?.registerPreAuthRoutes?.(api);
	api.use("*", stack.auth);
	api.route("/", coreApi.app);
	app.route("/api", api);

	app.notFound((c) => {
		if (c.req.path.startsWith("/api")) {
			return c.json({ error: "Not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}
		return c.text("404 Not Found", 404);
	});

	registerAppDisposers(app, [...coreApi.disposers]);

	if (TRACE_FILE) {
		const ms = Math.round((performance.now() - t0) * 10) / 10;
		try {
			appendFileSync(
				TRACE_FILE,
				`${JSON.stringify({ ts: Date.now(), pid: process.pid, event: "createTestApp", ms })}\n`,
			);
		} catch {
			// Best-effort trace write — a failure here must never break the test run.
		}
	}
	return app;
}
