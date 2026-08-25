import type { HyperIdleDb } from "@hyperidle/db";
import {
	type AgentBehaviorConfigListResponse,
	type AgentBehaviorConfigPatchRequest,
	type AgentBehaviorConfigPatchResponse,
	isAgentBehaviorConfigKind,
} from "@hyperidle/domain-model";
import { Hono } from "hono";
import {
	AgentBehaviorConfigError,
	listAgentBehaviorConfiguration,
	patchAgentBehaviorConfiguration,
} from "./agent-behavior-config-impl.js";

type AgentBehaviorCode =
	| "INVALID_KIND"
	| "NOT_FOUND"
	| "UNEDITABLE_FIELD"
	| "INVALID_VALUE"
	| "SECRET_VALUE_REJECTED"
	| "RATE_LIMITED";

export function createAgentBehaviorSettingsRoutes(db: HyperIdleDb): Hono {
	const router = new Hono();

	router.get("/config", async (c) => {
		const kind = c.req.query("kind");
		if (kind && !isAgentBehaviorConfigKind(kind)) {
			return c.json(errorResponse("INVALID_KIND", `Unsupported configuration kind: ${kind}`), 400);
		}
		const agentBehaviorKind = kind && isAgentBehaviorConfigKind(kind) ? kind : undefined;
		const items = await listAgentBehaviorConfiguration(db, {
			kind: agentBehaviorKind,
		});
		return c.json({ items } satisfies AgentBehaviorConfigListResponse);
	});

	router.patch("/config/:id", async (c) => {
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
	});

	return router;
}

function errorResponse(
	code: AgentBehaviorCode,
	error: string,
): { code: AgentBehaviorCode; error: string } {
	return { code, error };
}

function statusForError(code: AgentBehaviorCode): 400 | 404 | 422 {
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
