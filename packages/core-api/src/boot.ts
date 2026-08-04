/**
 * AU26 B1a — `bootCoreApi`: everything an Application needs to run the
 * `core-api` Layer, in one call. The twin of `bootAgentOrchestration`.
 *
 * An Application opens the db and the EventBus, boots both Layers, and disposes
 * both. Today `bootCoreApi` still owns the `/api` router and the middleware
 * stack (it applies them inside `createCoreApiApp`) and mounts the other Layer's
 * app for the Application; B1b moves the router, the stack and the mounting out
 * to `remote-server/src/create-server.ts`, at which point this boot returns
 * core-api's own route table and nothing more.
 */

import type { Hono } from "hono";
import { type AppOptions, createCoreApiApp, disposeApp } from "./app.js";

export interface CoreApiBoot {
	readonly app: Hono;
	readonly dispose: () => void;
}

export async function bootCoreApi(options?: AppOptions): Promise<CoreApiBoot> {
	const app = await createCoreApiApp(options);
	return {
		app,
		dispose: () => {
			disposeApp(app);
		},
	};
}
