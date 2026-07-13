import type { HyperIdleDb } from "@hyperidle/db";
import {
	AgentBehaviorConfigError,
	listAgentBehaviorConfiguration,
	patchAgentBehaviorConfiguration,
} from "@hyperidle/settings";
import {
	type AgentBehaviorConfigErrorResponse,
	type AgentBehaviorConfigListResponse,
	type AgentBehaviorConfigPatchRequest,
	type AgentBehaviorConfigPatchResponse,
	isAgentBehaviorConfigKind,
} from "@hyperidle/shared";
import { Hono } from "hono";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import { createRateLimiter } from "../middleware/rate-limit.js";

export function createAgentBehaviorSettingsRoutes(db: HyperIdleDb): Hono {
	const router = new Hono();
	const mutateLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

	router.get("/config", requireBoundary({ kind: "public-data" }), async (c) => {
		const kind = c.req.query("kind");
		if (kind && !isAgentBehaviorConfigKind(kind)) {
			return c.json(errorResponse("INVALID_KIND", `Unsupported configuration kind: ${kind}`), 400);
		}
		const agentBehaviorKind = kind && isAgentBehaviorConfigKind(kind) ? kind : undefined;
		const items = await listAgentBehaviorConfiguration(db, {
			kind: agentBehaviorKind,
			occasionKind: c.req.query("occasionKind"),
		});
		return c.json({ items } satisfies AgentBehaviorConfigListResponse);
	});

	router.patch(
		"/config/:id",
		requireBoundary({ kind: "public-data" }),
		mutateLimiter,
		async (c) => {
			const body = (await c.req.json().catch(() => null)) as AgentBehaviorConfigPatchRequest | null;
			if (!body || typeof body !== "object" || !body.fields || typeof body.fields !== "object") {
				return c.json(errorResponse("INVALID_VALUE", "Expected fields object."), 422);
			}
			try {
				const item = await patchAgentBehaviorConfiguration(db, {
					id: c.req.param("id"),
					fields: body.fields,
				});
				return c.json({ item } satisfies AgentBehaviorConfigPatchResponse);
			} catch (err) {
				if (err instanceof AgentBehaviorConfigError) {
					const status = statusForError(err.code);
					return c.json(errorResponse(err.code, err.message), status);
				}
				throw err;
			}
		},
	);

	return router;
}

function errorResponse(
	code: AgentBehaviorConfigErrorResponse["code"],
	error: string,
): AgentBehaviorConfigErrorResponse {
	return { code, error };
}

function statusForError(code: AgentBehaviorConfigErrorResponse["code"]): 400 | 404 | 422 {
	switch (code) {
		case "INVALID_KIND":
		case "UNEDITABLE_FIELD":
			return 400;
		case "NOT_FOUND":
			return 404;
		default:
			return 422;
	}
}
