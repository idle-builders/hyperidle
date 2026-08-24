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
		});
		await writeCredential(db, "anthropic_api_key", {
			validationState: "invalid",
			lastValidatedAt: NOW,
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
		// updatedAt is stamped internally by writeCredential — not part of CredentialWrite.
		const first = {
			encryptedValue: "ciphertext-concurrent-a",
			validationState: "valid",
			lastValidatedAt: NOW,
		} as const;
		const second = {
			encryptedValue: "ciphertext-concurrent-b",
			validationState: "invalid",
			lastValidatedAt: LATER,
		} as const;

		await Promise.all([
			writeCredential(db, "concurrent_api_key", first),
			writeCredential(db, "concurrent_api_key", second),
		]);

		const rows = await readCredentials(db, { name: "concurrent_api_key" });
		expect(rows).toHaveLength(1);
		// One whole contender must win; mixing fields from both is forbidden.
		// updatedAt excluded — it is stamped by writeCredential, not the caller.
		const persisted = {
			encryptedValue: rows[0]?.encryptedValue,
			validationState: rows[0]?.validationState,
			lastValidatedAt: rows[0]?.lastValidatedAt,
		};
		expect([first, second]).toContainEqual(persisted);
	});
});
