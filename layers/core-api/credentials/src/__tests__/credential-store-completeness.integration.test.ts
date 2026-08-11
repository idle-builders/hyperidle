import { test } from "@hyperidle/db/test-fixtures";
import { describe, expect } from "vitest";
import { deleteCredential, readCredentials, writeCredential } from "../credential-store.js";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-02T00:00:00.000Z";

describe("credential store completeness contract", () => {
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

		// @lore AU38: scoped to the catalog name this test writes — the
		// whole-table count would see other tests' credential rows in a
		// populated world (AU38 P10: scope the assertion, not the fixed name).
		const rows = await readCredentials(db, { name: "anthropic_api_key" });
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
		ids,
	}) => {
		// @lore AU38: the name is test-chosen (not the fixed catalog), so it is
		// scoped — concurrent upserts from other tests can't collide with it.
		const name = ids("concurrent_api_key");
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

		await Promise.all([writeCredential(db, name, first), writeCredential(db, name, second)]);

		const rows = await readCredentials(db, { name });
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
});
