/**
 * AU31 §3.2 — a real `AgentOrchestrationPort` for eval scenarios that drive
 * production code (`fireRoutine` and friends) directly, with no composed
 * HTTP app in the picture. Same shape as the service-lane test fixture's own
 * throwaway boot (`layers/core-api/src/__testing__/test-fixtures.ts`): a
 * real `bootAgentOrchestration({db, eventBus})`, dialled over its own bare
 * app.
 *
 * @lore agent-orchestration's app mounts its seam routes at
 * `/agent-orchestration/...` with NO `/api` prefix — the prefix is added
 * only by an application's `/api` router, and the port client always issues
 * `/api/agent-orchestration/...`. A transport bound straight to the bare app
 * therefore 404s unless the prefix is stripped first, which is what this
 * transport does.
 */

import { bootAgentOrchestration } from "@hyperidle/agent-orchestration";
import type { AgentOrchestrationPort, AgentOrchestrationTransport } from "@hyperidle/api-contract";
import { buildAgentOrchestrationPort } from "@hyperidle/core-api/services/agent-orchestration-port-composition";
import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import type { HyperIdleEnv } from "@hyperidle/http-middleware";
import type { Hono } from "hono";

function createEvalAgentOrchestrationTransport(
	app: Hono<HyperIdleEnv>,
): AgentOrchestrationTransport {
	return async (req: Request) => {
		const url = new URL(req.url);
		const target = new URL(`${url.pathname.replace(/^\/api/, "")}${url.search}`, url.origin);
		const hasBody = req.method !== "GET" && req.method !== "HEAD";
		const body = hasBody ? await req.text() : undefined;
		return app.fetch(new Request(target, { method: req.method, headers: req.headers, body }));
	};
}

export async function buildEvalAgentOrchestrationPort(
	db: HyperIdleDb,
	eventBus: EventBus,
): Promise<AgentOrchestrationPort> {
	const orchestrationBoot = await bootAgentOrchestration({ db, eventBus });
	return buildAgentOrchestrationPort(createEvalAgentOrchestrationTransport(orchestrationBoot.app));
}
