/**
 * AR4c — Settings config: an assistant's harness+model is configurable, validated
 * against the triple, and persisted.
 *
 * AC2: harness+model configurable from Settings; PATCH valid triple → 200 + row
 * updated; PATCH incompatible triple → 422 (no write).
 *
 * @lore BA9f: this drove `PATCH /api/users/:userId/assistant`, a second agent
 * editor that existed only for assistants — because the persona was a column
 * with an assistant-shaped guard on it, and the guard needed a route of its own
 * to send people to. The persona is a document now, so the guard and
 * the route are both gone and an assistant is edited at `/api/agents/:id` like
 * every other agent. Same claims, one route.
 *
 * Uses service integration fixtures (real DB + real Hono app, no harness binary).
 */

import { agentRunConfig, type HyperIdleDb, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Seeds the human and the assistant agent that belongs to them. */
async function seedUser(db: HyperIdleDb, userId: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values([
		{
			id: userId,
			name: "AR4c Test User",
			role: "founder",
			status: "active",
			kind: "human",
			createdAt: now,
		},
		{
			id: `ast-${userId}`,
			name: "Assistant",
			role: "assistant",
			agentCategory: "individual",
			status: "active",
			kind: "ai",
			createdAt: now,
		},
	]);
}

/** Reads the assistant back off the agents list — the route the Settings editor reads. */
async function readAssistant(app: Hono, userId: string): Promise<Record<string, unknown>> {
	const res = await app.request("/api/agents", { headers: authHeaders(userId) });
	expect(res.status).toBe(200);
	const list = (await res.json()) as ReadonlyArray<Record<string, unknown>>;
	const row = list.find((a) => a.id === `ast-${userId}`);
	expect(row).toBeDefined();
	return row as Record<string, unknown>;
}

function authHeaders(userId: string): Record<string, string> {
	return {
		"Content-Type": "application/json",
		"X-API-Key": "test-token-ar4c",
		"X-Identity": userId,
		Authorization: `Bearer test-token-${userId}`,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AR4c: an assistant's harness+model config, through the one agent route", () => {
	beforeEach(() => vi.stubEnv("HYPERIDLE_API_KEY", "test-token-ar4c"));
	afterEach(() => vi.unstubAllEnvs());

	test("PATCH valid harness+model → 200 + row updated", async ({ db, app }) => {
		const userId = "ar4c-valid-triple-user";
		await seedUser(db, userId);

		const res = await app.request(`/api/agents/ast-${userId}`, {
			method: "PATCH",
			headers: authHeaders(userId),
			body: JSON.stringify({
				harnessType: "opencode",
				modelId: "deepseek/deepseek-v4-flash",
				modelProvider: "openrouter",
			}),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			id: string;
			name: string;
			systemPrompt: string | null;
			harnessType: string | null;
			modelId: string | null;
			modelProvider: string | null;
		};
		expect(body.harnessType).toBe("opencode");
		expect(body.modelId).toBe("deepseek/deepseek-v4-flash");
		expect(body.modelProvider).toBe("openrouter");

		// Verify persisted in DB — AU26 G1: the run config lives in `agent_run_config`.
		const assistantId = `ast-${userId}`;
		const [row] = await db
			.select()
			.from(agentRunConfig)
			.where(eq(agentRunConfig.agentUserId, assistantId))
			.limit(1);
		expect(row?.harnessType).toBe("opencode");
		expect(row?.modelId).toBe("deepseek/deepseek-v4-flash");
		expect(row?.modelProvider).toBe("openrouter");
	});

	test("PATCH incompatible triple (openai-compatible provider) → 422, no write", async ({
		db,
		app,
	}) => {
		const userId = "ar4c-invalid-provider-user";
		await seedUser(db, userId);

		const res = await app.request(`/api/agents/ast-${userId}`, {
			method: "PATCH",
			headers: authHeaders(userId),
			body: JSON.stringify({
				harnessType: "opencode",
				modelId: "some-model",
				modelProvider: "openai-compatible",
			}),
		});

		// validateAgentConfig rejects openai-compatible for per-agent model
		expect(res.status).toBe(422);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("UNSUPPORTED_PROVIDER");

		// No write: the assistant's run config must not have been created or modified
		const assistantId = `ast-${userId}`;
		const [row] = await db
			.select()
			.from(agentRunConfig)
			.where(eq(agentRunConfig.agentUserId, assistantId))
			.limit(1);
		// Either no row or the provider is not the rejected one (no contamination)
		expect(row?.modelProvider ?? null).not.toBe("openai-compatible");
	});

	test("an assistant is edited through the same route as any other agent", async ({ db, app }) => {
		const userId = "ar4c-no-carve-out-user";
		await seedUser(db, userId);

		// This used to be a 403 ASSISTANT_SOUL_EDIT_FORBIDDEN telling the caller to
		// go to `/api/users/:id/assistant` instead. There is no such route, and no
		// such rejection: an assistant is an agent.
		const res = await app.request(`/api/agents/ast-${userId}`, {
			method: "PATCH",
			headers: authHeaders(userId),
			body: JSON.stringify({ name: "Renamed assistant" }),
		});

		expect(res.status).toBe(200);
		expect((await res.json()) as { name: string }).toMatchObject({ name: "Renamed assistant" });
	});

	test("GET returns harness+model after PATCH", async ({ db, app }) => {
		const userId = "ar4c-get-returns-triple-user";
		await seedUser(db, userId);

		await app.request(`/api/agents/ast-${userId}`, {
			method: "PATCH",
			headers: authHeaders(userId),
			body: JSON.stringify({
				harnessType: "opencode",
				modelId: "deepseek/deepseek-v4-flash",
				modelProvider: "openrouter",
			}),
		});

		const body = await readAssistant(app, userId);
		expect(body.harnessType).toBe("opencode");
		expect(body.modelId).toBe("deepseek/deepseek-v4-flash");
		expect(body.modelProvider).toBe("openrouter");
	});

	test("model options set on an assistant persist, and come back on GET", async ({ db, app }) => {
		// The Agents editor is shared between normal agents and assistants. An
		// assistant on claude-code renders an Effort control, so an option the
		// assistant route dropped would be offered, set, saved and silently lost —
		// the exact defect this work removes, reproduced for assistants.
		const userId = "assistant-model-options-user";
		await seedUser(db, userId);

		const res = await app.request(`/api/agents/ast-${userId}`, {
			method: "PATCH",
			headers: authHeaders(userId),
			body: JSON.stringify({
				harnessType: "opencode",
				modelId: "deepseek/deepseek-v4-flash",
				modelProvider: "openrouter",
				modelOptions: { reasoning_effort: "high" },
			}),
		});

		expect(res.status).toBe(200);
		expect((await res.json()) as { modelOptions: Record<string, unknown> }).toMatchObject({
			modelOptions: { reasoning_effort: "high" },
		});

		expect(await readAssistant(app, userId)).toMatchObject({
			modelOptions: { reasoning_effort: "high" },
		});
	});

	test("an assistant nobody configured options for has none", async ({ db, app }) => {
		const userId = "assistant-no-options-user";
		await seedUser(db, userId);

		await app.request(`/api/agents/ast-${userId}`, {
			method: "PATCH",
			headers: authHeaders(userId),
			body: JSON.stringify({ name: "No options here" }),
		});

		expect(await readAssistant(app, userId)).toMatchObject({ modelOptions: {} });
	});
});
