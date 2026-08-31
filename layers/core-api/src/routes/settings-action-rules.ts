/**
 * Settings routes for action rules — scoped items that mark agent actions
 * requiring human approval before they can be executed.
 *
 * Routes:
 *   GET  /api/settings/action-rules          — list all rules
 *   POST /api/settings/action-rules          — create a rule
 *   DELETE /api/settings/action-rules/:id    — remove a rule
 *
 * @lore BA2: The table starts empty on a fresh install. No rule is ever
 * pre-populated — security is never preemptive (ruling 1).
 */
import type { HyperIdleDb } from "@hyperidle/db";
import {
	type ActionRule,
	createActionRule,
	deleteActionRule,
	listActionRules,
} from "@hyperidle/settings";
import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

export interface ActionRulesListResponse {
	rules: ActionRule[];
}

export interface ActionRuleResponse {
	rule: ActionRule;
}

// ---------------------------------------------------------------------------
// Input shapes (validated inline — simple enough to not need Zod here)
// ---------------------------------------------------------------------------

type ActionRuleScope = "global" | "team" | "agent";

function isValidScope(s: unknown): s is ActionRuleScope {
	return s === "global" || s === "team" || s === "agent";
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function createActionRulesRoutes(db: HyperIdleDb): Hono {
	const router = new Hono();

	router.get("/", async (c) => {
		const rules = await listActionRules(db);
		return c.json({ rules } satisfies ActionRulesListResponse);
	});

	router.post("/", async (c) => {
		const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
		if (!body || typeof body !== "object") {
			return c.json({ error: "Expected JSON body." }, 422);
		}

		const { pattern, description, scope, scopeId } = body;

		if (!pattern || typeof pattern !== "string" || pattern.trim() === "") {
			return c.json({ error: "pattern is required and must be a non-empty string." }, 422);
		}
		if (!description || typeof description !== "string" || description.trim() === "") {
			return c.json({ error: "description is required and must be a non-empty string." }, 422);
		}
		if (!isValidScope(scope)) {
			return c.json({ error: "scope must be 'global', 'team', or 'agent'." }, 422);
		}
		if (scope !== "global" && (!scopeId || typeof scopeId !== "string" || scopeId.trim() === "")) {
			return c.json({ error: "scopeId is required for team and agent scopes." }, 422);
		}

		const rule = await createActionRule(db, {
			pattern: pattern.trim(),
			description: description.trim(),
			scope,
			scopeId: scope === "global" ? null : (scopeId as string).trim(),
		});

		return c.json({ rule } satisfies ActionRuleResponse, 201);
	});

	router.delete("/:id", async (c) => {
		const id = c.req.param("id");
		const removed = await deleteActionRule(db, id);
		if (!removed) {
			return c.json({ error: "Action rule not found." }, 404);
		}
		return new Response(null, { status: 204 });
	});

	return router;
}
