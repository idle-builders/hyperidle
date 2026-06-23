/**
 * AN1 — Unit tests for ServiceConnectionResolver.
 *
 * AC: "A user can remove a connection — after which ServiceConnectionResolver.resolve(userId, id)
 *     returns null."
 * AC: "Connections are per user — one user's connection is never resolvable from another user's session."
 *
 * These tests fail until:
 *   packages/server/src/services/service-connection-resolver.ts is created.
 *
 * The resolver interface:
 *   resolve(userId: string, connectionId: string): Promise<string | null>
 *
 * Returns the plaintext token for a stored token connection (decrypted server-side),
 * or null for: absent row, deleted row, or wrong userId (cross-user → null).
 */

import { describe, expect } from "vitest";
import { test } from "../../test-fixtures.js";
import { ServiceConnectionResolver } from "../service-connection-resolver.js";

// The server secret must be ≥32 chars for AES-256.
const TEST_SERVER_SECRET = "a-test-secret-for-an1-resolver-32x";

describe("AN1 — ServiceConnectionResolver", () => {
	describe("resolve() — absent connection returns null", () => {
		test("returns null for a connection id that does not exist", async ({ db }) => {
			const resolver = new ServiceConnectionResolver(db, TEST_SERVER_SECRET);
			const result = await resolver.resolve("user-1", "sc-does-not-exist");
			expect(result).toBeNull();
		});
	});

	describe("resolve() — after revoke (DELETE) returns null", () => {
		test(
			"returns null for a connection that was revoked (row deleted)",
			async ({ db }) => {
				// Arrange: seed a user and a service connection row.
				// The green-phase builder imports serviceConnections from @hyperidle/db.
				// We seed via raw db insert to avoid depending on unbuilt route code.
				const { serviceConnections } = await import("@hyperidle/db");
				const { users } = await import("@hyperidle/db");
				const { encryptCredentialValue } = await import(
					"../credential-encryption.js"
				);
				const { eq, and } = await import("drizzle-orm");

				const now = new Date().toISOString();
				await db.insert(users).values({
					id: "u-revoke-test",
					kind: "human",
					name: "Revoke Tester",
					role: "founder",
					status: "active",
					createdAt: now,
				});

				const token = "stripe-test-token-xyz";
				const encryptedToken = encryptCredentialValue(token, TEST_SERVER_SECRET);

				await db.insert(serviceConnections).values({
					id: "sc-revoke-1",
					userId: "u-revoke-test",
					service: "Stripe",
					authSource: "token",
					encryptedToken,
					serverUrl: null,
					trustTier: "community",
					health: "usable",
					lastValidatedAt: null,
					createdAt: now,
					updatedAt: now,
				});

				// Act: resolve before revoke — should return plaintext.
				const resolver = new ServiceConnectionResolver(db, TEST_SERVER_SECRET);
				const beforeRevoke = await resolver.resolve("u-revoke-test", "sc-revoke-1");
				expect(beforeRevoke).toBe(token);

				// Act: revoke (delete the row).
				await db
					.delete(serviceConnections)
					.where(
						and(
							eq(serviceConnections.id, "sc-revoke-1"),
							eq(serviceConnections.userId, "u-revoke-test"),
						),
					);

				// Assert: resolve after revoke → null.
				const afterRevoke = await resolver.resolve("u-revoke-test", "sc-revoke-1");
				expect(afterRevoke).toBeNull();
			},
		);
	});

	describe("resolve() — per-user isolation", () => {
		test(
			"returns null when userId does not match the connection owner",
			async ({ db }) => {
				// Arrange: two users; connection belongs to user-A.
				const { serviceConnections } = await import("@hyperidle/db");
				const { users } = await import("@hyperidle/db");
				const { encryptCredentialValue } = await import(
					"../credential-encryption.js"
				);

				const now = new Date().toISOString();
				await db.insert(users).values([
					{
						id: "u-owner-a",
						kind: "human",
						name: "Owner A",
						role: "founder",
						status: "active",
						createdAt: now,
					},
					{
						id: "u-attacker-b",
						kind: "human",
						name: "Attacker B",
						role: "founder",
						status: "active",
						createdAt: now,
					},
				]);

				const token = "figma-secret-tok";
				const encryptedToken = encryptCredentialValue(token, TEST_SERVER_SECRET);
				await db.insert(serviceConnections).values({
					id: "sc-owner-a",
					userId: "u-owner-a",
					service: "Figma",
					authSource: "token",
					encryptedToken,
					serverUrl: null,
					trustTier: "community",
					health: "usable",
					lastValidatedAt: null,
					createdAt: now,
					updatedAt: now,
				});

				const resolver = new ServiceConnectionResolver(db, TEST_SERVER_SECRET);

				// Owner gets the token.
				const ownerResult = await resolver.resolve("u-owner-a", "sc-owner-a");
				expect(ownerResult).toBe(token);

				// Attacker with wrong userId → null (not a 403 here; null is the seam).
				const attackerResult = await resolver.resolve("u-attacker-b", "sc-owner-a");
				expect(attackerResult).toBeNull();
			},
		);
	});

	describe("resolve() — null when server secret is missing", () => {
		test("returns null when the resolver has no server secret", async ({ db }) => {
			// Resolver with null secret cannot decrypt → returns null.
			const resolver = new ServiceConnectionResolver(db, null);
			const result = await resolver.resolve("u-any", "sc-any");
			expect(result).toBeNull();
		});
	});
});
