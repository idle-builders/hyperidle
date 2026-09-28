// @lore: hono sub-app — parent middleware/context/onError apply to mounted sub-app; notFound does NOT; register none here or 404 falls back to text/plain

import {
	decryptCredentialValue,
	encryptCredentialValue,
	type InheritedReach,
} from "@hyperidle/connections";
import type { HyperIdleDb } from "@hyperidle/db";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import type { EventBus } from "@hyperidle/event-bus";
import type { RegisteredTool } from "@hyperidle/harness-protocol";
import { createSessionActions, type SessionActionsDeps } from "@hyperidle/run-orchestration";
import { Hono } from "hono";
import type { Action } from "./actions/action.js";
import { actionsAsTools } from "./actions/actions-as-tools.js";
import { createActionsRouter } from "./actions/actions-router.js";
import { createAgentOrchestrationIntakeRoutes } from "./routes/agent-orchestration-intake.js";
import { createAgentOrchestrationSessionsRoutes } from "./routes/agent-orchestration-sessions.js";
import { createFilesystemRoutes } from "./routes/filesystems.js";

export interface AgentOrchestrationAppOptions {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly sessionActionsDeps: SessionActionsDeps;
	/** Connections reach cache for inherited projection. Absent → inherited group is empty. */
	readonly inheritedReach?: InheritedReach;
}

export interface AgentOrchestrationAppHandle {
	readonly app: Hono<HyperIdleEnv>;
	/** This Layer's own three session actions, MCP-projected. `bootAgentOrchestration` exposes this as its own `actionTools`. */
	readonly actionTools: readonly RegisteredTool<HyperIdleDb>[];
}

export function createAgentOrchestrationApp(
	options: AgentOrchestrationAppOptions,
): AgentOrchestrationAppHandle {
	const app = new Hono<HyperIdleEnv>();
	const { db, eventBus, sessionActionsDeps, inheritedReach } = options;
	const cipher = { encrypt: encryptCredentialValue, decrypt: decryptCredentialValue };

	const sessionActions = createSessionActions(sessionActionsDeps) as readonly Action[];
	app.route("/actions", createActionsRouter(sessionActions, { db, eventBus }));
	const actionTools = actionsAsTools(sessionActions);

	app.route("/agent-orchestration", createAgentOrchestrationSessionsRoutes(db));
	app.route(
		"/agent-orchestration",
		createAgentOrchestrationIntakeRoutes(db, eventBus, { inheritedReach, cipher }),
	);
	app.route("/filesystems", createFilesystemRoutes());

	return { app, actionTools };
}
