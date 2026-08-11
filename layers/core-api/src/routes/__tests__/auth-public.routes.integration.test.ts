/**
 * V1 — Route integration tests for auth-public endpoints.
 *
 * POST /api/auth/claim — claim an invite code (public, no auth required)
 *
 * These routes are only mounted when sharedMode: true.
 */

import { type HyperIdleDb, inviteCodes, users } from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { API_ERROR_CODES } from "@hyperidle/domain-model";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";
import { createTestApp } from "../../__testing__/test-utils.js";

const TEST_API_KEY = "test-key-auth-public";

describe("auth-public routes", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	async function seedInviteCode(
		db: HyperIdleDb,
		ids: ScopedIds,
		opts: { code?: string; expiresAt?: string; claimedBy?: string | null } = {},
	): Promise<{ code: string; inviteId: string; creatorId: string }> {
		const now = new Date().toISOString();
		const creatorId = ids("creator-1");
		const code = opts.code ?? ids("valid-invite-code");
		const inviteId = ids("ic-1");
		const expiresAt = opts.expiresAt ?? new Date(Date.now() + 86400000).toISOString();

		// Create the creator user (scoped existence check — AU38 R2).
		const existingUser = await db.select().from(users).where(eq(users.id, creatorId));
		if (existingUser.length === 0) {
			await db.insert(users).values({
				id: creatorId,
				kind: "human",
				name: "Creator User",
				role: "admin",
				status: "active",
				createdAt: now,
			});
		}

		await db.insert(inviteCodes).values({
			id: inviteId,
			code,
			createdBy: creatorId,
			claimedBy: opts.claimedBy !== undefined ? opts.claimedBy : null,
			role: "member",
			expiresAt,
			createdAt: now,
		});

		return { code, inviteId, creatorId };
	}

	describe("POST /api/auth/claim", () => {
		test("returns 201 with token and user on valid invite claim", async ({ db, eventBus, ids }) => {
			const app = await createTestApp({ db, eventBus, sharedMode: true });
			const { code } = await seedInviteCode(db, ids);

			const res = await app.request("/api/auth/claim", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code, name: "New User" }),
			});
			expect(res.status).toBe(201);
			const body = (await res.json()) as {
				token: string;
				user: { id: string; name: string; kind: string; role: string };
			};
			expect(typeof body.token).toBe("string");
			expect(body.token.length).toBeGreaterThan(0);
			expect(body.user.name).toBe("New User");
			expect(body.user.kind).toBe("human");
		});

		test("returns 400 when code is missing or empty", async ({ db, eventBus }) => {
			const app = await createTestApp({ db, eventBus, sharedMode: true });
			const res = await app.request("/api/auth/claim", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code: "", name: "New User" }),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
		});

		test("returns 400 when name is missing or empty", async ({ db, eventBus }) => {
			const app = await createTestApp({ db, eventBus, sharedMode: true });
			const res = await app.request("/api/auth/claim", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code: "some-code", name: "" }),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
		});

		test("returns 400 on invalid JSON body", async ({ db, eventBus }) => {
			const app = await createTestApp({ db, eventBus, sharedMode: true });
			const res = await app.request("/api/auth/claim", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "not-json{{{",
			});
			expect(res.status).toBe(400);
		});

		test("returns 404 when invite code does not exist", async ({ db, eventBus, ids }) => {
			const app = await createTestApp({ db, eventBus, sharedMode: true });
			const res = await app.request("/api/auth/claim", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				// AU38 P4: a derived code nobody inserted stays absent in a populated world.
				body: JSON.stringify({ code: ids("non-existent-code"), name: "New User" }),
			});
			expect(res.status).toBe(404);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe(API_ERROR_CODES.NOT_FOUND);
		});

		test("returns 410 (INVITE_CLAIMED) when code is already claimed", async ({
			db,
			eventBus,
			ids,
		}) => {
			const app = await createTestApp({ db, eventBus, sharedMode: true });
			const now = new Date().toISOString();
			// Create a claimant user first
			await db.insert(users).values({
				id: ids("claimant-1"),
				kind: "human",
				name: "Claimant",
				role: "member",
				status: "active",
				createdAt: now,
			});
			const { code } = await seedInviteCode(db, ids, {
				code: ids("claimed-code"),
				claimedBy: ids("claimant-1"),
			});

			const res = await app.request("/api/auth/claim", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code, name: "Another User" }),
			});
			expect(res.status).toBe(410);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe(API_ERROR_CODES.INVITE_CLAIMED);
		});

		test("returns 410 (INVITE_EXPIRED) when code has expired", async ({ db, eventBus, ids }) => {
			const app = await createTestApp({ db, eventBus, sharedMode: true });
			const pastDate = new Date(Date.now() - 3600000).toISOString();
			const { code } = await seedInviteCode(db, ids, {
				code: ids("expired-code"),
				expiresAt: pastDate,
			});

			const res = await app.request("/api/auth/claim", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code, name: "New User" }),
			});
			expect(res.status).toBe(410);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe(API_ERROR_CODES.INVITE_EXPIRED);
		});

		test("creates user with email when provided", async ({ db, eventBus, ids }) => {
			const app = await createTestApp({ db, eventBus, sharedMode: true });
			const { code } = await seedInviteCode(db, ids, { code: ids("email-code") });

			const res = await app.request("/api/auth/claim", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code, name: "Email User", email: "user@example.com" }),
			});
			expect(res.status).toBe(201);
			const body = (await res.json()) as { user: { email?: string } };
			expect(body.user.email).toBe("user@example.com");
		});

		test("creates user without email when not provided", async ({ db, eventBus, ids }) => {
			const app = await createTestApp({ db, eventBus, sharedMode: true });
			const { code } = await seedInviteCode(db, ids, { code: ids("no-email-code") });

			const res = await app.request("/api/auth/claim", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code, name: "No Email User" }),
			});
			expect(res.status).toBe(201);
			const body = (await res.json()) as { user: { email?: string | null } };
			// email should be null or absent when not provided
			expect(body.user.email ?? null).toBeNull();
		});
	});
});
