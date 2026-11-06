// @lore: hono sub-app — parent middleware/context/onError apply to mounted sub-app; notFound does NOT; register none here or 404 falls back to text/plain

import {
	decryptCredentialValue,
	encryptCredentialValue,
	type InheritedReach,
} from "@hyperidle/connections";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import type { EventBus } from "@hyperidle/event-bus";
import type { RegisteredTool } from "@hyperidle/harness-protocol";
import { createSessionActions, type SessionActionsDeps } from "@hyperidle/run-orchestration";
import type { RunnerDb } from "@hyperidle/runner-db";
import { Hono } from "hono";
import type { Action } from "./actions/action.js";
import { actionsAsTools } from "./actions/actions-as-tools.js";
import { createActionsRouter } from "./actions/actions-router.js";
import { createAgentOrchestrationIntakeRoutes } from "./routes/agent-orchestration-intake.js";

export interface AgentOrchestrationAppOptions {
	readonly runnerDb: RunnerDb;
	readonly eventBus: EventBus;
	readonly sessionActionsDeps: SessionActionsDeps;
	/** Connections reach cache for inherited projection. Absent → inherited group is empty. */
	readonly inheritedReach?: InheritedReach;
}

export interface AgentOrchestrationAppHandle {
	readonly app: Hono<HyperIdleEnv>;
	/** This Layer's own three session actions, MCP-projected. `bootAgentOrchestration` exposes this as its own `actionTools`. */
	readonly actionTools: readonly RegisteredTool<RunnerDb>[];
}

export function createAgentOrchestrationApp(
	options: AgentOrchestrationAppOptions,
): AgentOrchestrationAppHandle {
	const app = new Hono<HyperIdleEnv>();
	const { runnerDb, eventBus, sessionActionsDeps, inheritedReach } = options;
	const cipher = { encrypt: encryptCredentialValue, decrypt: decryptCredentialValue };

	const sessionActions = createSessionActions(sessionActionsDeps) as readonly Action[];
	app.route("/actions", createActionsRouter(sessionActions, { db: runnerDb, eventBus }));
	const actionTools = actionsAsTools(sessionActions);

	app.route(
		"/agent-orchestration",
		createAgentOrchestrationIntakeRoutes(runnerDb, { inheritedReach, cipher }),
	);

	return { app, actionTools };
}
