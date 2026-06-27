/**
 * AO2 — Integration tests for OwnerScopedAuthResolver (detached-safe FilesystemAuthResolver seam impl).
 *
 * These tests FAIL until `packages/server/src/services/owner-scoped-auth-resolver.ts` is created.
 *
 * Covers §3 of plans/AO2/architecture.md:
 *   - resolveToken: reads service_connections.userId → ServiceConnectionResolver.resolve(userId, id)
 *   - resolve: returns FilesystemAuth with provision:none (host enriched at mount time)
 *   - canResolve: true when connection exists + decrypts
 *   - sourceOf: returns null (seam constraint — host supplied by mounter, not resolver)
 *   - Wrong/missing connectionId → null (never throws)
 *   - No new method on ServiceConnectionResolver (seam correctness)
 *
 * Source of truth: plans/AO2/architecture.md §3
 */

import { type HyperIdleDb, serviceConnections, teamMembers, teams, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { encryptCredentialValue } from "../services/credential-encryption.js";
import { OwnerScopedAuthResolver } from "../services/owner-scoped-auth-resolver.js";
import { ServiceConnectionResolver } from "../services/service-connection-resolver.js";
import { test } from "../test-fixtures.js";

const NOW = "2026-06-27T00:00:00.000Z";
const CREDENTIAL_KEY = "ao2-owner-resolver-test-key-32c!";
const API_KEY = "test-key-ao2-resolver";

beforeEach(() => {
	vi.stubEnv("HYPERIDLE_API_KEY", API_KEY);
	vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", CREDENTIAL_KEY);
});

afterEach(() => {
	vi.unstubAllEnvs();
});

async function seedOwnerAndConnection(
	db: HyperIdleDb,
	prefix: string,
	plaintext: string,
) {
	const teamId = `team-resolver-${prefix}`;
	const teamMembersId = `tm-resolver-${prefix}`;
	const ownerId = `owner-resolver-${prefix}`;
	const connId = `conn-resolver-${prefix}`;

	await db
		.insert(teams)
		.values({ id: teamId, name: `Resolver Team ${prefix}`, phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: teamMembersId, teamId, capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(users).values({
		id: ownerId,
		kind: "human",
		name: "Owner",
		role: "founder",
		status: "active",
		teamId: teamMembersId,
		createdAt: NOW,
	});

	const encrypted = encryptCredentialValue(plaintext, CREDENTIAL_KEY);
	await db.insert(serviceConnections).values({
		id: connId,
		userId: ownerId,
		service: "github",
		authSource: "token",
		encryptedToken: encrypted,
		health: "working",
		createdAt: NOW,
		updatedAt: NOW,
	});

	return { teamId, ownerId, connId };
}

describe("OwnerScopedAuthResolver — resolveToken (§3)", () => {
	test("resolveToken resolves plaintext by looking up connection owner userId", async ({ db }) => {
		const plaintext = "ghp_owner_token_resolve";
		const { connId } = await seedOwnerAndConnection(db, "rt1", plaintext);

		const resolver = new OwnerScopedAuthResolver({
			db,
			resolver: new ServiceConnectionResolver(db, CREDENTIAL_KEY),
		});

		const token = await resolver.resolveToken(connId);
		expect(token).toBe(plaintext);
	});

	test("resolveToken returns null for non-existent connection", async ({ db }) => {
		const resolver = new OwnerScopedAuthResolver({
			db,
			resolver: new ServiceConnectionResolver(db, CREDENTIAL_KEY),
		});

		const token = await resolver.resolveToken("conn-does-not-exist-xyz");
		expect(token).toBeNull();
	});

	test("resolveToken returns null when serverSecret is wrong (decrypt fails gracefully)", async ({
		db,
	}) => {
		const { connId } = await seedOwnerAndConnection(db, "rt3", "secret_for_wrong_key");

		// Use a DIFFERENT key to decrypt — should return null, never throw.
		const resolver = new OwnerScopedAuthResolver({
			db,
			resolver: new ServiceConnectionResolver(db, "wrong-key-different-32-charss!"),
		});

		const token = await resolver.resolveToken(connId);
		expect(token).toBeNull();
	});
});

describe("OwnerScopedAuthResolver — resolve (§3)", () => {
	test("resolve returns FilesystemAuth with provision:{mode:'none'} (host enriched at mount time)", async ({
		db,
	}) => {
		const { connId } = await seedOwnerAndConnection(db, "res1", "ghp_resolve_shape");

		const resolver = new OwnerScopedAuthResolver({
			db,
			resolver: new ServiceConnectionResolver(db, CREDENTIAL_KEY),
		});

		const auth = await resolver.resolve(connId);
		// resolve() returns a FilesystemAuth shape (not raw token).
		// The mode is 'none' per §3 — the mounter enriches the host at mount time.
		expect(auth).not.toBeNull();
		expect(auth?.connectionId).toBe(connId);
		// provision.mode is 'none' because the adapter doesn't have the host context;
		// the mounter calls resolveToken separately to project into sandbox git config.
		expect(auth?.provision.mode).toBe("none");
	});

	test("resolve returns null for non-existent connection", async ({ db }) => {
		const resolver = new OwnerScopedAuthResolver({
			db,
			resolver: new ServiceConnectionResolver(db, CREDENTIAL_KEY),
		});

		const auth = await resolver.resolve("conn-not-found");
		expect(auth).toBeNull();
	});
});

describe("OwnerScopedAuthResolver — canResolve (§3)", () => {
	test("canResolve returns true when connection decrypts successfully", async ({ db }) => {
		const { connId } = await seedOwnerAndConnection(db, "cr1", "ghp_can_resolve");

		const resolver = new OwnerScopedAuthResolver({
			db,
			resolver: new ServiceConnectionResolver(db, CREDENTIAL_KEY),
		});

		const can = await resolver.canResolve(connId);
		expect(can).toBe(true);
	});

	test("canResolve returns false for missing connection", async ({ db }) => {
		const resolver = new OwnerScopedAuthResolver({
			db,
			resolver: new ServiceConnectionResolver(db, CREDENTIAL_KEY),
		});

		const can = await resolver.canResolve("conn-missing");
		expect(can).toBe(false);
	});
});

describe("OwnerScopedAuthResolver — sourceOf (§3)", () => {
	test("sourceOf always returns null (host supplied by mounter, not resolver)", async ({ db }) => {
		const { connId } = await seedOwnerAndConnection(db, "so1", "ghp_source_of");

		const resolver = new OwnerScopedAuthResolver({
			db,
			resolver: new ServiceConnectionResolver(db, CREDENTIAL_KEY),
		});

		// sourceOf must return null — the seam constraint. The mounter knows the host from resourceRef.
		const source = await resolver.sourceOf(connId);
		expect(source).toBeNull();
	});
});

describe("OwnerScopedAuthResolver — no new method on ServiceConnectionResolver (§3)", () => {
	test("ServiceConnectionResolver.resolve(userId, connectionId) is the only plaintext path", () => {
		// ServiceConnectionResolver must NOT have been extended with resolveByConnectionId
		// or any method that bypasses the (userId, connectionId) signature.
		// We assert this by checking the prototype methods.
		const proto = ServiceConnectionResolver.prototype;
		const methods = Object.getOwnPropertyNames(proto).filter((m) => m !== "constructor");

		// The only method should be `resolve` (the existing one).
		// A resolveTokenByConnectionId method would mean the seam is orphaned (rev2 bug).
		expect(methods).toContain("resolve");
		expect(methods).not.toContain("resolveTokenByConnectionId");
		expect(methods).not.toContain("resolveByConnectionId");
	});
});
