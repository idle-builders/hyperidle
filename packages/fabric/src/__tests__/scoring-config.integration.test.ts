import { factorySettings } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import {
	ATTENTION_THRESHOLD,
	getDefaultAttentionWeights,
	loadAttentionWeights,
} from "../scoring-config.js";

const NOW = "2026-04-18T00:00:00.000Z";

describe("loadAttentionWeights", () => {
	test("returns defaults when no settings rows exist", async ({ db }) => {
		const loaded = await loadAttentionWeights(db);
		const defaults = getDefaultAttentionWeights();
		expect(loaded).toEqual(defaults);
	});

	test("overrides per-key from factory_settings", async ({ db }) => {
		await db
			.insert(factorySettings)
			.values({ key: "attention.weight.novelty", value: "0.50", updatedAt: NOW });
		await db
			.insert(factorySettings)
			.values({ key: "attention.weight.conflict", value: "0.30", updatedAt: NOW });

		const loaded = await loadAttentionWeights(db);
		expect(loaded.novelty).toBe(0.5);
		expect(loaded.conflict).toBe(0.3);
		// Others remain default
		const defaults = getDefaultAttentionWeights();
		expect(loaded.tasteSensitivity).toBe(defaults.tasteSensitivity);
	});

	test("ignores out-of-range values (< 0, > 1, NaN)", async ({ db }) => {
		await db
			.insert(factorySettings)
			.values({ key: "attention.weight.novelty", value: "-0.1", updatedAt: NOW });
		await db
			.insert(factorySettings)
			.values({ key: "attention.weight.conflict", value: "1.2", updatedAt: NOW });
		await db.insert(factorySettings).values({
			key: "attention.weight.tasteSensitivity",
			value: "not-a-number",
			updatedAt: NOW,
		});

		const loaded = await loadAttentionWeights(db);
		const defaults = getDefaultAttentionWeights();
		expect(loaded.novelty).toBe(defaults.novelty);
		expect(loaded.conflict).toBe(defaults.conflict);
		expect(loaded.tasteSensitivity).toBe(defaults.tasteSensitivity);
	});

	test("exposes ATTENTION_THRESHOLD = 0.7", () => {
		expect(ATTENTION_THRESHOLD).toBe(0.7);
	});
});
