// AE6 RED — Integration tests for artifact normalization (AC-3).
// Source of truth: plans/AE6/architecture.md §11 AC-3
//
// Tests:
// 1. POST artifact with old kind, GET it back, verify normalization
// 2. Read-time normalization for DB rows with old kinds
// 3. Label field present in responses
// 4. Artifact accepts new 6 fundamental kinds

import { artifacts, bets, type HyperIdleDb, tasks, teamMembers, teams } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-ae6";
const NOW = "2026-06-08T00:00:00.000Z";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seed(db: HyperIdleDb): Promise<{ taskId: string; betId: string }> {
	await db
		.insert(teams)
		.values({ id: "team-ae6", name: "AE6 Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: "tm-ae6", teamId: "team-ae6", capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(bets).values({
		id: "bet-ae6",
		teamId: "team-ae6",
		description: "AE6 bet",
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: "task-ae6",
		betId: "bet-ae6",
		teamId: "team-ae6",
		title: "AE6 Task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	return { taskId: "task-ae6", betId: "bet-ae6" };
}

describe("AE6 AC-3: artifact kind normalization and label support", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// ------------------------------------------------------------------
	// New 6 fundamental kinds accepted at create
	// ------------------------------------------------------------------

	test("POST accepts kind=text (new fundamental kind)", async ({ db, app }) => {
		await seed(db);
		const res = await app.request("/api/artifacts", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				producingTaskId: "task-ae6",
				kind: "text",
				preview: { kind: "text", body: "Hello world" },
				cost: null,
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { kind: string };
		expect(body.kind).toBe("text");
	});

	// AM5 K4b: code schema purified from {file,hunks} to {path,lang,text}
	test("POST accepts kind=code (new fundamental kind)", async ({ db, app }) => {
		await seed(db);
		const res = await app.request("/api/artifacts", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				producingTaskId: "task-ae6",
				kind: "code",
				preview: { kind: "code", path: "src/index.ts", lang: "typescript", text: "const x = 1;" },
				cost: null,
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { kind: string };
		expect(body.kind).toBe("code");
	});

	test("POST accepts kind=html (new fundamental kind)", async ({ db, app }) => {
		await seed(db);
		const res = await app.request("/api/artifacts", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				producingTaskId: "task-ae6",
				kind: "html",
				preview: { kind: "html", html: "<div>hi</div>", title: "Test" },
				cost: null,
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { kind: string };
		expect(body.kind).toBe("html");
	});

	test("POST accepts kind=url (new fundamental kind)", async ({ db, app }) => {
		await seed(db);
		const res = await app.request("/api/artifacts", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				producingTaskId: "task-ae6",
				kind: "url",
				preview: { kind: "url", url: "https://example.com" },
				cost: null,
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { kind: string };
		expect(body.kind).toBe("url");
	});

	test("POST accepts kind=image (new fundamental kind)", async ({ db, app }) => {
		await seed(db);
		const res = await app.request("/api/artifacts", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				producingTaskId: "task-ae6",
				kind: "image",
				preview: { kind: "image", url: "https://example.com/img.png", width: 800, height: 600 },
				cost: null,
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { kind: string };
		expect(body.kind).toBe("image");
	});

	test("POST accepts kind=data (new fundamental kind)", async ({ db, app }) => {
		await seed(db);
		const res = await app.request("/api/artifacts", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				producingTaskId: "task-ae6",
				kind: "data",
				preview: { kind: "data", headlines: [{ label: "Count", value: "42" }] },
				cost: null,
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { kind: string };
		expect(body.kind).toBe("data");
	});

	// ------------------------------------------------------------------
	// Label field
	// ------------------------------------------------------------------

	test("POST with optional label stores label and GET returns it", async ({ db, app }) => {
		await seed(db);
		const res = await app.request("/api/artifacts", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				producingTaskId: "task-ae6",
				kind: "text",
				label: "contract",
				preview: { kind: "text", body: "Service agreement text" },
				cost: null,
			}),
		});
		expect(res.status).toBe(201);
		const created = (await res.json()) as { id: string; label: string | null };
		expect(created.label).toBe("contract");

		// GET the artifact back
		const getRes = await app.request(`/api/artifacts/${created.id}`, { headers: authHeaders() });
		expect(getRes.status).toBe(200);
		const got = (await getRes.json()) as { kind: string; label: string | null };
		expect(got.kind).toBe("text");
		expect(got.label).toBe("contract");
	});

	test("POST without label returns null label", async ({ db, app }) => {
		await seed(db);
		const res = await app.request("/api/artifacts", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				producingTaskId: "task-ae6",
				kind: "code",
				preview: null,
				cost: null,
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { label: string | null };
		expect(body.label).toBeNull();
	});

	// ------------------------------------------------------------------
	// Read-time normalization: DB rows with old kinds
	// ------------------------------------------------------------------

	test("read-time normalization: DB row with kind=contract maps to kind=text, label=contract", async ({
		db,
		app,
	}) => {
		await seed(db);
		// Insert a row directly with the old kind (simulates un-migrated data)
		await db.insert(artifacts).values({
			id: "art-contract-old",
			producingTaskId: "task-ae6",
			kind: "contract",
			previewJson: null,
			createdAt: NOW,
		});

		const res = await app.request("/api/artifacts/art-contract-old", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { kind: string; label: string | null };
		expect(body.kind).toBe("text");
		expect(body.label).toBe("contract");
	});

	test("read-time normalization: DB row with kind=code_diff maps to kind=code, label=null", async ({
		db,
		app,
	}) => {
		await seed(db);
		await db.insert(artifacts).values({
			id: "art-codediff-old",
			producingTaskId: "task-ae6",
			kind: "code_diff",
			previewJson: null,
			createdAt: NOW,
		});

		const res = await app.request("/api/artifacts/art-codediff-old", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { kind: string; label: string | null };
		expect(body.kind).toBe("code");
		expect(body.label).toBeNull();
	});

	test("read-time normalization: DB row with kind=drafted_email maps to kind=text, label=email", async ({
		db,
		app,
	}) => {
		await seed(db);
		await db.insert(artifacts).values({
			id: "art-draftedemail-old",
			producingTaskId: "task-ae6",
			kind: "drafted_email",
			previewJson: null,
			createdAt: NOW,
		});

		const res = await app.request("/api/artifacts/art-draftedemail-old", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { kind: string; label: string | null };
		expect(body.kind).toBe("text");
		expect(body.label).toBe("email");
	});

	test("read-time normalization: DB row with kind=running_service maps to kind=url, label=service", async ({
		db,
		app,
	}) => {
		await seed(db);
		await db.insert(artifacts).values({
			id: "art-service-old",
			producingTaskId: "task-ae6",
			kind: "running_service",
			previewJson: null,
			createdAt: NOW,
		});

		const res = await app.request("/api/artifacts/art-service-old", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { kind: string; label: string | null };
		expect(body.kind).toBe("url");
		expect(body.label).toBe("service");
	});

	test("read-time normalization: DB row with kind=unknown_kind maps to kind=text", async ({
		db,
		app,
	}) => {
		await seed(db);
		await db.insert(artifacts).values({
			id: "art-unknown-old",
			producingTaskId: "task-ae6",
			kind: "unknown_kind",
			previewJson: null,
			createdAt: NOW,
		});

		const res = await app.request("/api/artifacts/art-unknown-old", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { kind: string };
		// unknown_kind should be normalized to text (or passed through if unregistered - either is OK)
		// The plan says unknown_kind -> text
		expect(body.kind).toBe("text");
	});

	// ------------------------------------------------------------------
	// Old kinds rejected on create (closed write rule)
	// ------------------------------------------------------------------

	test("POST rejects old kind=code_diff (closed write — must use 'code')", async ({ db, app }) => {
		await seed(db);
		const res = await app.request("/api/artifacts", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				producingTaskId: "task-ae6",
				kind: "code_diff",
				preview: null,
				cost: null,
			}),
		});
		expect(res.status).toBe(400);
	});

	test("POST rejects old kind=contract (closed write — must use 'text' + label)", async ({
		db,
		app,
	}) => {
		await seed(db);
		const res = await app.request("/api/artifacts", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				producingTaskId: "task-ae6",
				kind: "contract",
				preview: null,
				cost: null,
			}),
		});
		expect(res.status).toBe(400);
	});

	// ------------------------------------------------------------------
	// List response includes label field
	// ------------------------------------------------------------------

	test("GET list response items include label field", async ({ db, app }) => {
		await seed(db);
		await db.insert(artifacts).values({
			id: "art-labeled",
			producingTaskId: "task-ae6",
			kind: "text",
			previewJson: null,
			createdAt: NOW,
		});

		const res = await app.request("/api/artifacts?axis=task&taskId=task-ae6", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { items: Array<{ label: string | null }> };
		expect(body.items.length).toBeGreaterThan(0);
		// label field must exist (may be null)
		expect("label" in (body.items[0] ?? {})).toBe(true);
	});
});
