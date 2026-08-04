import { appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { bootAgentOrchestration } from "@hyperidle/agent-orchestration";
import type { HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import type { AppOptions } from "./app.js";
import { createCoreApiApp } from "./app.js";

const TRACE_FILE = process.env.VITEST_TRACE_FILE;

/**
 * Build the SAME two-app composition production boots, for a test.
 *
 * @lore AU26 B1a: a test harness is an Application. `createCoreApiApp` alone no
 * longer serves `GET /api/sessions`, `GET /api/sessions/starts/:startId`,
 * `GET /api/sessions/:id/activity` or `PATCH /api/sessions/:id` — those moved
 * onto agent-orchestration's app — so this helper boots both Layers and hands
 * the second one in, exactly as `server-factory.ts` does. A caller that passes
 * its own `agentOrchestration` keeps it; a db-less app gets neither Layer's
 * session routes, which is what it had before.
 */
export async function createTestApp(options?: AppOptions): Promise<Hono> {
	const t0 = performance.now();
	// The two Layers MUST share one EventBus instance — the activity buffer and
	// the gateway subscribe to the same stream the core routes emit on.
	const eventBus = options?.eventBus ?? new EventBus();
	const agentOrchestration =
		options?.agentOrchestration ??
		(options?.db ? bootAgentOrchestration({ db: options.db, eventBus }) : undefined);
	const app = await createCoreApiApp({
		...options,
		...(options?.db ? { eventBus } : {}),
		...(agentOrchestration ? { agentOrchestration } : {}),
	});
	if (TRACE_FILE) {
		const ms = Math.round((performance.now() - t0) * 10) / 10;
		try {
			appendFileSync(
				TRACE_FILE,
				`${JSON.stringify({ ts: Date.now(), pid: process.pid, event: "createTestApp", ms })}\n`,
			);
		} catch {}
	}
	return app;
}

export interface TestAppWithDeps {
	app: Hono;
	db: HyperIdleDb;
	eventBus: EventBus;
}
