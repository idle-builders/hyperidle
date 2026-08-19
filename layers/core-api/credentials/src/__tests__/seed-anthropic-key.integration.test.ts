/**
 * seedAnthropicKeyFromEnv — contract test.
 *
 * The function must write and idempotency-check using the canonical
 * credential name "anthropic_api_key", not the bare "anthropic" name.
 *
 * @lore AU44 batch2 review: the original implementation used "anthropic"
 * for both the existence check and the insert, which silently diverged from
 * the name that all resolvers and the settings routes read. Fixed to
 * "anthropic_api_key" throughout.
 */

import { test } from "@hyperidle/db/test-fixtures";
import { afterEach, describe, expect } from "vitest";
import { readCredentials, seedAnthropicKeyFromEnv } from "../credential-store.js";

const TEST_KEY = "sk-ant-test-seed-key-12345";

describe("seedAnthropicKeyFromEnv", () => {
	afterEach(() => {
		delete process.env.ANTHROPIC_API_KEY;
	});

	test("writes under the 'anthropic_api_key' name, not 'anthropic'", async ({ db }) => {
		process.env.ANTHROPIC_API_KEY = TEST_KEY;
		const encrypt = (v: string) => `enc:${v}`;

		await seedAnthropicKeyFromEnv(db, encrypt);

		// Must be findable by the canonical name
		const byCanonical = await readCredentials(db, { name: "anthropic_api_key" });
		expect(byCanonical).toHaveLength(1);
		expect(byCanonical[0]?.encryptedValue).toBe(`enc:${TEST_KEY}`);

		// Must NOT have written under the bare name
		const byBare = await readCredentials(db, { name: "anthropic" });
		expect(byBare).toHaveLength(0);
	});

	test("is idempotent — second call does not overwrite when 'anthropic_api_key' exists", async ({
		db,
	}) => {
		process.env.ANTHROPIC_API_KEY = TEST_KEY;
		const encrypt = (v: string) => `enc:${v}`;

		await seedAnthropicKeyFromEnv(db, encrypt);
		// Change the env key and call again — must not overwrite
		process.env.ANTHROPIC_API_KEY = "sk-ant-different-key";
		await seedAnthropicKeyFromEnv(db, encrypt);

		const rows = await readCredentials(db, { name: "anthropic_api_key" });
		expect(rows).toHaveLength(1);
		expect(rows[0]?.encryptedValue).toBe(`enc:${TEST_KEY}`);
	});

	test("no-op when ANTHROPIC_API_KEY is unset", async ({ db }) => {
		delete process.env.ANTHROPIC_API_KEY;
		await seedAnthropicKeyFromEnv(db, (v) => `enc:${v}`);
		const rows = await readCredentials(db);
		expect(rows).toHaveLength(0);
	});
});
