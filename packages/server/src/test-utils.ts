import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import type { AppOptions } from "./app.js";
import { createApp } from "./app.js";

export async function createTestApp(options?: AppOptions): Promise<Hono> {
	return createApp(options);
}

export interface TestAppWithDeps {
	app: Hono;
	db: HyperIdleDb;
	eventBus: EventBus;
}
