import { serviceConnections, users } from "@hyperidle/db";
import { test } from "@hyperidle/db/test-fixtures";
import { describe, expect } from "vitest";
import { deleteCredential, readCredentials, writeCredential } from "../credential-store.js";
import {
	deleteConnection,
	insertConnection,
	listConnections,
	updateConnection,
} from "../service-connection-store.js";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-02T00:00:00.000Z";

describe("connections store completeness contract", () => {
	test("credential store supports lookup, insert/upsert, validation update, listing, and delete", async ({
		db,
	}) => {
		await writeCredential(db, "anthropic_api_key", {
			encryptedValue: "ciphertext-v1",
			updatedAt: NOW,
		});
		expect(await readCredentials(db, { name: "anthropic_api_key" })).toMatchObject([
			{
				name: "anthropic_api_key",
				encryptedValue: "ciphertext-v1",
				validationState: "present_untested",
				lastValidatedAt: null,
			},
		]);

		await writeCredential(db, "anthropic_api_key", {
			encryptedValue: "ciphertext-v2",
			validationState: "valid",
			lastValidatedAt: LATER,
			updatedAt: LATER,
		});
		await writeCredential(db, "anthropic_api_key", {
			validationState: "invalid",
			lastValidatedAt: NOW,
			updatedAt: LATER,
		});

		const rows = await readCredentials(db);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			encryptedValue: "ciphertext-v2",
			validationState: "invalid",
			lastValidatedAt: NOW,
		});

		await deleteCredential(db, "anthropic_api_key");
		expect(await readCredentials(db, { name: "anthropic_api_key" })).toEqual([]);
	});

	test("concurrent same-name credential upserts leave one coherent winning value", async ({
		db,
	}) => {
		const first = {
			encryptedValue: "ciphertext-concurrent-a",
			validationState: "valid",
			lastValidatedAt: NOW,
			updatedAt: NOW,
		} as const;
		const second = {
			encryptedValue: "ciphertext-concurrent-b",
			validationState: "invalid",
			lastValidatedAt: LATER,
			updatedAt: LATER,
		} as const;

		await Promise.all([
			writeCredential(db, "concurrent_api_key", first),
			writeCredential(db, "concurrent_api_key", second),
		]);

		const rows = await readCredentials(db, { name: "concurrent_api_key" });
		expect(rows).toHaveLength(1);
		const persisted = {
			encryptedValue: rows[0]?.encryptedValue,
			validationState: rows[0]?.validationState,
			lastValidatedAt: rows[0]?.lastValidatedAt,
			updatedAt: rows[0]?.updatedAt,
		};
		// One whole contender must win; mixing fields from both is forbidden.
		expect([first, second]).toContainEqual(persisted);
	});

	test("connection store composes auth-source/user/id filters and persists updates", async ({
		db,
	}) => {
		await db.insert(users).values([
			{
				id: "connections-contract-a",
				kind: "human",
				name: "Contract A",
				email: "connections-contract-a@example.test",
				role: "founder",
				status: "active",
				createdAt: NOW,
			},
			{
				id: "connections-contract-b",
				kind: "human",
				name: "Contract B",
				email: "connections-contract-b@example.test",
				role: "member",
				status: "active",
				createdAt: NOW,
			},
		]);

		for (const row of [
			{ id: "contract-a-token", userId: "connections-contract-a", authSource: "token" },
			{ id: "contract-a-mcp", userId: "connections-contract-a", authSource: "mcp" },
			{ id: "contract-b-token", userId: "connections-contract-b", authSource: "token" },
		]) {
			await insertConnection(db, {
				...row,
				service: "github",
				encryptedToken: row.authSource === "token" ? "encrypted" : null,
				serverUrl: row.authSource === "mcp" ? "https://example.test/mcp" : null,
				health: "needs-attention",
				lastValidatedAt: null,
				createdAt: NOW,
				updatedAt: NOW,
			});
		}

		expect((await listConnections(db, { authSource: "token" })).map((row) => row.id)).toEqual([
			"contract-a-token",
			"contract-b-token",
		]);
		expect(
			await listConnections(db, {
				id: "contract-a-token",
				userId: "connections-contract-b",
			}),
		).toEqual([]);

		await updateConnection(
			db,
			{ id: "contract-a-token", userId: "connections-contract-b" },
			{ health: "healthy", lastValidatedAt: LATER, updatedAt: LATER },
		);
		expect(await listConnections(db, { id: "contract-a-token" })).toMatchObject([
			{ health: "needs-attention", lastValidatedAt: null, updatedAt: NOW },
		]);

		await updateConnection(
			db,
			{ id: "contract-a-token", userId: "connections-contract-a" },
			{
				health: "healthy",
				lastValidatedAt: LATER,
				updatedAt: LATER,
			},
		);
		expect(await listConnections(db, { id: "contract-a-token" })).toMatchObject([
			{ health: "healthy", lastValidatedAt: LATER, updatedAt: LATER },
		]);
	});

	test("connection deletion remains scoped to the owning user", async ({ db }) => {
		await db.insert(users).values({
			id: "connections-delete-owner",
			kind: "human",
			name: "Delete Owner",
			email: "connections-delete-owner@example.test",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(serviceConnections).values({
			id: "connections-delete-row",
			userId: "connections-delete-owner",
			service: "github",
			authSource: "token",
			encryptedToken: "encrypted",
			serverUrl: null,
			health: "healthy",
			lastValidatedAt: NOW,
			createdAt: NOW,
			updatedAt: NOW,
		});

		await deleteConnection(db, {
			id: "connections-delete-row",
			userId: "not-the-owner",
		});
		expect(await listConnections(db, { id: "connections-delete-row" })).toHaveLength(1);

		await deleteConnection(db, {
			id: "connections-delete-row",
			userId: "connections-delete-owner",
		});
		expect(await listConnections(db, { id: "connections-delete-row" })).toEqual([]);
	});
});
