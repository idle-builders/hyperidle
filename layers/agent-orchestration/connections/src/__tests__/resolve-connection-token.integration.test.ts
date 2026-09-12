/**
 * BA5 §2.4 — `resolveConnectionToken`: resolve a held connection's plaintext
 * token AS THE CONNECTION'S OWNER, with no caller-supplied `userId`. A
 * filesystem row carries a `connectionId` but no `userId` of its own (seams
 * §2), so the per-user `resolveHeldToken` this delegates to cannot be called
 * directly by a filesystem-mounting caller — this reads the row's own
 * `userId` first.
 */

import { decryptCredentialValue, encryptCredentialValue } from "@hyperidle/credentials";
import { type HyperIdleDb, serviceConnections, users } from "@hyperidle/db";
import { test } from "@hyperidle/db/test-fixtures";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { resolveConnectionToken } from "../service-connection-resolver.js";

const SERVER_SECRET = "integration-test-server-secret-ba5";
const NOW = new Date().toISOString();
const OWNER_ID = "u-ba5-resolve-connection-token";

describe("resolveConnectionToken (BA5 §2.4)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", SERVER_SECRET);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	async function seedOwner(db: HyperIdleDb): Promise<void> {
		await db
			.insert(users)
			.values({
				id: OWNER_ID,
				kind: "human",
				name: "Filesystem Connection Owner",
				email: "ba5-owner@resolvetoken.test",
				role: "founder",
				status: "active",
				createdAt: NOW,
			})
			.onConflictDoNothing();
	}

	test("resolves the token connection's own owner, with no userId supplied by the caller", async ({
		db,
	}) => {
		await seedOwner(db);
		const plaintext = "ghp_ba5-real-pat-value";
		const rowId = "sc-ba5-resolve-a";
		await db.insert(serviceConnections).values({
			id: rowId,
			userId: OWNER_ID,
			service: "github",
			authSource: "token",
			encryptedToken: encryptCredentialValue(plaintext),
			serverUrl: null,
			createdAt: NOW,
			updatedAt: NOW,
		});

		const result = await resolveConnectionToken(db, rowId, decryptCredentialValue);
		expect(result).toBe(plaintext);

		// Sanity break: pointing resolveConnectionToken at the wrong row's id
		// (never resolving row.userId at all) must NOT still find the token —
		// proven by the absent-id case below returning null on the same DB.
	});

	test("an mcp connection has no stored token — resolves null", async ({ db }) => {
		await seedOwner(db);
		const rowId = "sc-ba5-resolve-mcp";
		await db.insert(serviceConnections).values({
			id: rowId,
			userId: OWNER_ID,
			service: "figma.com",
			authSource: "mcp",
			encryptedToken: null,
			serverUrl: "https://mcp.figma.com",
			createdAt: NOW,
			updatedAt: NOW,
		});

		expect(await resolveConnectionToken(db, rowId, decryptCredentialValue)).toBeNull();
	});

	test("an unresolvable connection id resolves null, never throws", async ({ db }) => {
		await seedOwner(db);
		expect(
			await resolveConnectionToken(db, "sc-does-not-exist-ba5", decryptCredentialValue),
		).toBeNull();
	});

	test("a tampered encrypted token resolves null, never throws", async ({ db }) => {
		await seedOwner(db);
		const rowId = "sc-ba5-resolve-tampered";
		await db.insert(serviceConnections).values({
			id: rowId,
			userId: OWNER_ID,
			service: "github",
			authSource: "token",
			encryptedToken: "not-valid-aes-gcm-base64",
			serverUrl: null,
			createdAt: NOW,
			updatedAt: NOW,
		});

		let threw = false;
		let result: string | null = "sentinel";
		try {
			result = await resolveConnectionToken(db, rowId, decryptCredentialValue);
		} catch {
			threw = true;
		}
		expect(threw).toBe(false);
		expect(result).toBeNull();
	});
});
