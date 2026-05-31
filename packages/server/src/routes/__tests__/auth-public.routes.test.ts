/**
 * V1 — Route integration tests for auth-public endpoints.
 *
 * POST /api/auth/claim — claim an invite code (public, no auth required)
 *
 * These routes are only mounted when sharedMode: true.
 */

import { createTestDb, type HyperIdleDb, inviteCodes, users } from "@hyperidle/db";
import { API_ERROR_CODES, EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-auth-public";

describe("auth-public routes", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		// sharedMode: true is required to mount auth-public routes
		app = await createTestApp({ db, eventBus, sharedMode: true });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	async function seedInviteCode(
		opts: { code?: string; expiresAt?: string; claimedBy?: string | null } = {},
	): Promise<{ code: string; inviteId: string; creatorId: string }> {
		const now = new Date().toISOString();
		const creatorId = "creator-1";
		const code = opts.code ?? "valid-invite-code";
		const inviteId = "ic-1";
		const expiresAt = opts.expiresAt ?? new Date(Date.now() + 86400000).toISOString();

		// Create the creator user
		const existingUser = await db.select().from(users);
		if (!existingUser.some((u) => u.id === creatorId)) {
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
		it("returns 201 with token and user on valid invite claim", async () => {
			const { code } = await seedInviteCode();

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

		it("returns 400 when code is missing or empty", async () => {
			const res = await app.request("/api/auth/claim", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code: "", name: "New User" }),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
		});

		it("returns 400 when name is missing or empty", async () => {
			const res = await app.request("/api/auth/claim", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code: "some-code", name: "" }),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
		});

		it("returns 400 on invalid JSON body", async () => {
			const res = await app.request("/api/auth/claim", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "not-json{{{",
			});
			expect(res.status).toBe(400);
		});

		it("returns 404 when invite code does not exist", async () => {
			const res = await app.request("/api/auth/claim", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code: "non-existent-code", name: "New User" }),
			});
			expect(res.status).toBe(404);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe(API_ERROR_CODES.NOT_FOUND);
		});

		it("returns 410 (INVITE_CLAIMED) when code is already claimed", async () => {
			const now = new Date().toISOString();
			// Create a claimant user first
			await db.insert(users).values({
				id: "claimant-1",
				kind: "human",
				name: "Claimant",
				role: "member",
				status: "active",
				createdAt: now,
			});
			const { code } = await seedInviteCode({ code: "claimed-code", claimedBy: "claimant-1" });

			const res = await app.request("/api/auth/claim", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code, name: "Another User" }),
			});
			expect(res.status).toBe(410);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe(API_ERROR_CODES.INVITE_CLAIMED);
		});

		it("returns 410 (INVITE_EXPIRED) when code has expired", async () => {
			const pastDate = new Date(Date.now() - 3600000).toISOString();
			const { code } = await seedInviteCode({ code: "expired-code", expiresAt: pastDate });

			const res = await app.request("/api/auth/claim", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code, name: "New User" }),
			});
			expect(res.status).toBe(410);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe(API_ERROR_CODES.INVITE_EXPIRED);
		});

		it("creates user with email when provided", async () => {
			const { code } = await seedInviteCode({ code: "email-code" });

			const res = await app.request("/api/auth/claim", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code, name: "Email User", email: "user@example.com" }),
			});
			expect(res.status).toBe(201);
			const body = (await res.json()) as { user: { email?: string } };
			expect(body.user.email).toBe("user@example.com");
		});

		it("creates user without email when not provided", async () => {
			const { code } = await seedInviteCode({ code: "no-email-code" });

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
