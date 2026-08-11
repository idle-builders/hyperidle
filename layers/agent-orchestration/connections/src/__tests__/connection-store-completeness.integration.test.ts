import { serviceConnections, users } from "@hyperidle/db";
import { test } from "@hyperidle/db/test-fixtures";
import { describe, expect } from "vitest";
import {
	deleteConnection,
	insertConnection,
	listConnections,
	updateConnection,
} from "../service-connection-store.js";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-02T00:00:00.000Z";

describe("connection store completeness contract", () => {
	test("connection store composes auth-source/user/id filters and persists updates", async ({
		db,
		ids,
	}) => {
		await db.insert(users).values([
			{
				id: ids("connections-contract-a"),
				kind: "human",
				name: "Contract A",
				email: "connections-contract-a@example.test",
				role: "founder",
				status: "active",
				createdAt: NOW,
			},
			{
				id: ids("connections-contract-b"),
				kind: "human",
				name: "Contract B",
				email: "connections-contract-b@example.test",
				role: "member",
				status: "active",
				createdAt: NOW,
			},
		]);

		for (const row of [
			{
				id: ids("contract-a-token"),
				userId: ids("connections-contract-a"),
				authSource: "token",
			},
			{ id: ids("contract-a-mcp"), userId: ids("connections-contract-a"), authSource: "mcp" },
			{
				id: ids("contract-b-token"),
				userId: ids("connections-contract-b"),
				authSource: "token",
			},
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
			ids("contract-a-token"),
			ids("contract-b-token"),
		]);
		expect(
			await listConnections(db, {
				id: ids("contract-a-token"),
				userId: ids("connections-contract-b"),
			}),
		).toEqual([]);

		await updateConnection(
			db,
			{ id: ids("contract-a-token"), userId: ids("connections-contract-b") },
			{ health: "healthy", lastValidatedAt: LATER, updatedAt: LATER },
		);
		expect(await listConnections(db, { id: ids("contract-a-token") })).toMatchObject([
			{ health: "needs-attention", lastValidatedAt: null, updatedAt: NOW },
		]);

		await updateConnection(
			db,
			{ id: ids("contract-a-token"), userId: ids("connections-contract-a") },
			{
				health: "healthy",
				lastValidatedAt: LATER,
				updatedAt: LATER,
			},
		);
		expect(await listConnections(db, { id: ids("contract-a-token") })).toMatchObject([
			{ health: "healthy", lastValidatedAt: LATER, updatedAt: LATER },
		]);
	});

	test("connection deletion remains scoped to the owning user", async ({ db, ids }) => {
		await db.insert(users).values({
			id: ids("connections-delete-owner"),
			kind: "human",
			name: "Delete Owner",
			email: "connections-delete-owner@example.test",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(serviceConnections).values({
			id: ids("connections-delete-row"),
			userId: ids("connections-delete-owner"),
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
			id: ids("connections-delete-row"),
			userId: ids("not-the-owner"),
		});
		expect(await listConnections(db, { id: ids("connections-delete-row") })).toHaveLength(1);

		await deleteConnection(db, {
			id: ids("connections-delete-row"),
			userId: ids("connections-delete-owner"),
		});
		expect(await listConnections(db, { id: ids("connections-delete-row") })).toEqual([]);
	});
});
