import { appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import type { AppOptions } from "./app.js";
import { createApp } from "./app.js";

const TRACE_FILE = process.env.VITEST_TRACE_FILE;

export async function createTestApp(options?: AppOptions): Promise<Hono> {
	const t0 = performance.now();
	const app = await createApp(options);
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
