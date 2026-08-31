/**
 * Route integration tests for GET/POST/DELETE /api/settings/action-rules.
 *
 * Proves: mount path, auth guard, list/create/delete round-trips,
 * validation (missing fields, invalid scope, team/agent without scopeId),
 * 404 on unknown id, 204 on successful delete.
 */
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-action-rules-routes";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("GET /api/settings/action-rules", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns 401 without auth", async ({ requestWithoutAuth }) => {
		const res = await requestWithoutAuth("/api/settings/action-rules", { method: "GET" });
		expect(res.status).toBe(401);
	});

	test("returns empty rules array on fresh install", async ({ app }) => {
		const res = await app.request("/api/settings/action-rules", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { rules: unknown[] };
		expect(body.rules).toEqual([]);
	});
});

describe("POST /api/settings/action-rules", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns 401 without auth", async ({ requestWithoutAuth }) => {
		const res = await requestWithoutAuth("/api/settings/action-rules", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ pattern: "git push", description: "d", scope: "global" }),
		});
		expect(res.status).toBe(401);
	});

	test("creates a global rule and returns 201 with the rule", async ({ app }) => {
		const res = await app.request("/api/settings/action-rules", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ pattern: "git push", description: "Gate pushes", scope: "global" }),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			rule: { pattern: string; scope: string; scopeId: unknown };
		};
		expect(body.rule.pattern).toBe("git push");
		expect(body.rule.scope).toBe("global");
		expect(body.rule.scopeId).toBeNull();
	});

	test("creates a team-scoped rule", async ({ app }) => {
		const res = await app.request("/api/settings/action-rules", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				pattern: "deploy",
				description: "Gate deploys for the infra team",
				scope: "team",
				scopeId: "team-infra",
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { rule: { scope: string; scopeId: string } };
		expect(body.rule.scope).toBe("team");
		expect(body.rule.scopeId).toBe("team-infra");
	});

	test("creates an agent-scoped rule", async ({ app }) => {
		const res = await app.request("/api/settings/action-rules", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				pattern: "rm -rf",
				description: "Gate destructive deletes for ops bot",
				scope: "agent",
				scopeId: "agent-ops-bot",
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { rule: { scope: string; scopeId: string } };
		expect(body.rule.scope).toBe("agent");
		expect(body.rule.scopeId).toBe("agent-ops-bot");
	});

	test("returns 422 when pattern is missing", async ({ app }) => {
		const res = await app.request("/api/settings/action-rules", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ description: "d", scope: "global" }),
		});
		expect(res.status).toBe(422);
	});

	test("returns 422 when description is missing", async ({ app }) => {
		const res = await app.request("/api/settings/action-rules", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ pattern: "git push", scope: "global" }),
		});
		expect(res.status).toBe(422);
	});

	test("returns 422 when scope is invalid", async ({ app }) => {
		const res = await app.request("/api/settings/action-rules", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ pattern: "git push", description: "d", scope: "bad-scope" }),
		});
		expect(res.status).toBe(422);
	});

	test("returns 422 when team scope has no scopeId", async ({ app }) => {
		const res = await app.request("/api/settings/action-rules", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ pattern: "git push", description: "d", scope: "team" }),
		});
		expect(res.status).toBe(422);
	});

	test("returns 422 when agent scope has no scopeId", async ({ app }) => {
		const res = await app.request("/api/settings/action-rules", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ pattern: "git push", description: "d", scope: "agent" }),
		});
		expect(res.status).toBe(422);
	});

	test("newly created rule appears in the list", async ({ app }) => {
		await app.request("/api/settings/action-rules", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ pattern: "git push", description: "Gate pushes", scope: "global" }),
		});
		const listRes = await app.request("/api/settings/action-rules", {
			method: "GET",
			headers: authHeaders(),
		});
		const body = (await listRes.json()) as { rules: { pattern: string }[] };
		expect(body.rules.some((r) => r.pattern === "git push")).toBe(true);
	});
});

describe("DELETE /api/settings/action-rules/:id", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns 401 without auth", async ({ requestWithoutAuth }) => {
		const res = await requestWithoutAuth("/api/settings/action-rules/rule-fake", {
			method: "DELETE",
		});
		expect(res.status).toBe(401);
	});

	test("returns 404 when rule does not exist", async ({ app }) => {
		const res = await app.request("/api/settings/action-rules/rule-does-not-exist", {
			method: "DELETE",
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);
	});

	test("returns 204 and removes the rule", async ({ app }) => {
		// Create a rule first
		const createRes = await app.request("/api/settings/action-rules", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ pattern: "git push", description: "Gate pushes", scope: "global" }),
		});
		const { rule } = (await createRes.json()) as { rule: { id: string } };

		// Delete it
		const deleteRes = await app.request(`/api/settings/action-rules/${rule.id}`, {
			method: "DELETE",
			headers: authHeaders(),
		});
		expect(deleteRes.status).toBe(204);

		// Confirm gone from list
		const listRes = await app.request("/api/settings/action-rules", {
			method: "GET",
			headers: authHeaders(),
		});
		const body = (await listRes.json()) as { rules: { id: string }[] };
		expect(body.rules.some((r) => r.id === rule.id)).toBe(false);
	});
});
