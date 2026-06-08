/**
 * L22 red phase — tests for loadRelevanceConfig in scoring-config.ts.
 *
 * These tests fail until loadRelevanceConfig is added to
 * packages/fabric/src/scoring-config.ts.
 */
import { createTestDb, factorySettings, type HyperIdleDb } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadRelevanceConfig, type RelevanceConfig } from "../scoring-config.js";

const NOW = "2026-05-06T00:00:00.000Z";

describe("loadRelevanceConfig (L22)", () => {
	let db: HyperIdleDb;
	let handle: Awaited<ReturnType<typeof createTestDb>>;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
	});

	afterEach(async () => {
		await handle.close();
	});

	// Returns defaults when no factory_settings rows exist
	it("returns default weights and shape constants when no settings rows exist", async () => {
		const config: RelevanceConfig = await loadRelevanceConfig(db);
		expect(config.weights.recency).toBe(0.4);
		expect(config.weights.frequency).toBe(0.4);
		expect(config.weights.citation).toBe(0.2);
		expect(config.shape.recencyHalflifeDays).toBe(14);
		expect(config.shape.frequencySaturation).toBe(5);
		expect(config.shape.frequencyWindowDays).toBe(30);
		expect(config.shape.citationSaturation).toBe(5);
	});

	// Reads custom weight from factory_settings
	it("reads custom relevance.weight.recency from factory_settings", async () => {
		await db
			.insert(factorySettings)
			.values({ key: "relevance.weight.recency", value: "0.6", updatedAt: NOW });
		const config = await loadRelevanceConfig(db);
		expect(config.weights.recency).toBe(0.6);
		// Others remain default
		expect(config.weights.frequency).toBe(0.4);
		expect(config.weights.citation).toBe(0.2);
	});

	// Reads custom frequency weight
	it("reads custom relevance.weight.frequency from factory_settings", async () => {
		await db
			.insert(factorySettings)
			.values({ key: "relevance.weight.frequency", value: "0.3", updatedAt: NOW });
		const config = await loadRelevanceConfig(db);
		expect(config.weights.frequency).toBe(0.3);
	});

	// Reads custom citation weight
	it("reads custom relevance.weight.citation from factory_settings", async () => {
		await db
			.insert(factorySettings)
			.values({ key: "relevance.weight.citation", value: "0.1", updatedAt: NOW });
		const config = await loadRelevanceConfig(db);
		expect(config.weights.citation).toBe(0.1);
	});

	// Reads custom shape constants
	it("reads custom relevance.recencyHalflifeDays from factory_settings", async () => {
		await db
			.insert(factorySettings)
			.values({ key: "relevance.recencyHalflifeDays", value: "7", updatedAt: NOW });
		const config = await loadRelevanceConfig(db);
		expect(config.shape.recencyHalflifeDays).toBe(7);
	});

	it("reads custom relevance.frequencySaturation from factory_settings", async () => {
		await db
			.insert(factorySettings)
			.values({ key: "relevance.frequencySaturation", value: "10", updatedAt: NOW });
		const config = await loadRelevanceConfig(db);
		expect(config.shape.frequencySaturation).toBe(10);
	});

	it("reads custom relevance.citationSaturation from factory_settings", async () => {
		await db
			.insert(factorySettings)
			.values({ key: "relevance.citationSaturation", value: "20", updatedAt: NOW });
		const config = await loadRelevanceConfig(db);
		expect(config.shape.citationSaturation).toBe(20);
	});

	// Rejects negative values — falls back to defaults (defense in depth)
	it("rejects negative weight value — falls back to default", async () => {
		await db
			.insert(factorySettings)
			.values({ key: "relevance.weight.recency", value: "-0.1", updatedAt: NOW });
		const config = await loadRelevanceConfig(db);
		expect(config.weights.recency).toBe(0.4); // default
	});

	// Rejects value > 1 for weights
	it("rejects weight > 1 — falls back to default", async () => {
		await db
			.insert(factorySettings)
			.values({ key: "relevance.weight.frequency", value: "1.5", updatedAt: NOW });
		const config = await loadRelevanceConfig(db);
		expect(config.weights.frequency).toBe(0.4); // default
	});

	// Rejects non-finite values (NaN, Infinity)
	it("rejects NaN weight value — falls back to default", async () => {
		await db
			.insert(factorySettings)
			.values({ key: "relevance.weight.citation", value: "not-a-number", updatedAt: NOW });
		const config = await loadRelevanceConfig(db);
		expect(config.weights.citation).toBe(0.2); // default
	});

	it("rejects Infinity weight value — falls back to default", async () => {
		await db
			.insert(factorySettings)
			.values({ key: "relevance.weight.recency", value: "Infinity", updatedAt: NOW });
		const config = await loadRelevanceConfig(db);
		expect(config.weights.recency).toBe(0.4); // default
	});

	// Rejects negative shape constants
	it("rejects negative recencyHalflifeDays — falls back to default", async () => {
		await db
			.insert(factorySettings)
			.values({ key: "relevance.recencyHalflifeDays", value: "-7", updatedAt: NOW });
		const config = await loadRelevanceConfig(db);
		expect(config.shape.recencyHalflifeDays).toBe(14); // default
	});

	// Multiple overrides in one call
	it("can override multiple keys in a single call", async () => {
		await db
			.insert(factorySettings)
			.values({ key: "relevance.weight.recency", value: "0.5", updatedAt: NOW });
		await db
			.insert(factorySettings)
			.values({ key: "relevance.weight.frequency", value: "0.3", updatedAt: NOW });
		await db
			.insert(factorySettings)
			.values({ key: "relevance.weight.citation", value: "0.1", updatedAt: NOW });
		const config = await loadRelevanceConfig(db);
		expect(config.weights.recency).toBe(0.5);
		expect(config.weights.frequency).toBe(0.3);
		expect(config.weights.citation).toBe(0.1);
	});
});
