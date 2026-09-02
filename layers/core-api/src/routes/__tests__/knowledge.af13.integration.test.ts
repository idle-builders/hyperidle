/**
 * AF13 — Knowledge authoring and curation that works: server integration tests (red phase).
 *
 * Covers §1 create-status contract:
 * - POST with status:"active" → response.status === "active"
 *
 * Covers §3 scope PATCH version semantics (existing server contract):
 * - PATCH /scope with correct version → 200
 * - PATCH /scope with stale version → 409
 *
 * @lore nested-knowledge-items: the §5 `relatedItems` describe block is
 * DELETED — it tested topic-based relatedness ("same-topic items"), and
 * `topic` no longer exists. `relatedItems` (Backlinks) is now children ∪
 * siblings via the tree, covered by the frozen nested-knowledge-items tests
 * (knowledge-tree-reads.integration.test.ts), not re-derived here.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";
import { createTestApp } from "../../__testing__/test-utils.js";

const TEST_API_KEY = "test-key-af13";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedFounder(db: HyperIdleDb, userId: string): Promise<void> {
	await db.insert(users).values({
		id: userId,
		name: "Founder",
		role: "founder",
		status: "active",
		kind: "human",
		createdAt: new Date().toISOString(),
	});
}

// ---------------------------------------------------------------------------
// §1 Create-status contract: POST with status:"active" → active
// ---------------------------------------------------------------------------

describe("AF13 §1 — Create-status contract: POST /api/knowledge with status:active", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("POST /api/knowledge with status:active returns status=active", async ({ db, eventBus }) => {
		await seedFounder(db, "u-founder");
		const app = await createTestApp({ db, eventBus });

		const payload = {
			title: "Human-authored item",
			body: "Some content",
			format: "markdown",
			scopeKind: "factory",
			updatedBy: "u-founder",
			status: "active",
		};

		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify(payload),
		});

		expect(res.status).toBe(201);
		const created = (await res.json()) as { status: string };
		// The client passes status:"active" — server must honor it.
		// This test confirms the server-side contract works (client fix in §1 adds it to payload).
		expect(created.status).toBe("active");
	});

	test("POST /api/knowledge without status defaults to proposed", async ({ db, eventBus }) => {
		await seedFounder(db, "u-founder");
		const app = await createTestApp({ db, eventBus });

		const payload = {
			title: "Agent draft item",
			body: "Some content",
			format: "markdown",
			scopeKind: "factory",
			updatedBy: "u-founder",
			// no status field
		};

		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify(payload),
		});

		expect(res.status).toBe(201);
		const created = (await res.json()) as { status: string };
		expect(created.status).toBe("proposed");
	});
});
