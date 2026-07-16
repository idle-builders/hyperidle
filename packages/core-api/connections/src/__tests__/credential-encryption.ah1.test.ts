/**
 * AH1 RED — requireServerSecret() unit tests.
 *
 * AC3: getServerSecret() returning "" must no longer silently disable encryption.
 * requireServerSecret() is the new function AH1 §6 adds — throws MISSING_ROOT_SECRET
 * when both HYPERIDLE_CREDENTIAL_KEY and HYPERIDLE_API_KEY are unset/empty.
 *
 * Proof type: unit (pure function, no DB, no HTTP).
 *
 * @lore AH1 §6: requireServerSecret() is only used at write/validate boundaries.
 * getServerSecret() is kept for read paths (returns string | null after AH1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// requireServerSecret does not exist yet — this import will fail at runtime.
// The test is designed to fail for the RIGHT reason:
//   "Module has no exported member 'requireServerSecret'" (green phase adds it).
// We use a dynamic import pattern to avoid a compile-time hard error that blocks
// other tests from running.

describe("requireServerSecret() unit", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", "");
		vi.stubEnv("HYPERIDLE_API_KEY", "");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("requireServerSecret throws when both credential env vars are absent/empty", async () => {
		// Dynamic import so we can test the "function missing" case gracefully.
		const mod = await import("../credential-encryption.js");
		const { requireServerSecret } = mod as typeof mod & {
			requireServerSecret?: () => string;
		};

		// Fails today (red phase): requireServerSecret is undefined — function not yet added.
		expect(requireServerSecret).toBeDefined();

		if (requireServerSecret) {
			expect(() => requireServerSecret()).toThrow();
		}
	});

	it("requireServerSecret throws with code MISSING_ROOT_SECRET", async () => {
		const mod = await import("../credential-encryption.js");
		const { requireServerSecret } = mod as typeof mod & {
			requireServerSecret?: () => string;
		};

		if (!requireServerSecret) {
			// Function not yet added — fail the test explicitly.
			throw new Error(
				"requireServerSecret is not exported from credential-encryption.ts — AH1 §6 not implemented yet",
			);
		}

		try {
			requireServerSecret();
			throw new Error("Expected requireServerSecret to throw");
		} catch (err) {
			expect(err).toBeInstanceOf(Error);
			const code = (err as Error & { code?: string }).code;
			expect(code).toBe("MISSING_ROOT_SECRET");
		}
	});

	it("getServerSecret returns null (not empty string) when both vars absent/empty after AH1", async () => {
		const { getServerSecret } = await import("../credential-encryption.js");
		// Fails today: getServerSecret() returns "" (empty string).
		// After AH1, it returns null.
		const secret = getServerSecret();
		expect(secret).toBeNull();
	});

	it("getServerSecret returns the credential key when HYPERIDLE_CREDENTIAL_KEY is set", async () => {
		vi.unstubAllEnvs();
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", "my-cred-key-32chars-long!!!!!!");
		vi.stubEnv("HYPERIDLE_API_KEY", "");

		const { getServerSecret } = await import("../credential-encryption.js");
		const secret = getServerSecret();
		expect(secret).toBe("my-cred-key-32chars-long!!!!!!");
	});

	it("requireServerSecret returns the key when set", async () => {
		vi.unstubAllEnvs();
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", "my-cred-key-32chars-long!!!!!!");
		vi.stubEnv("HYPERIDLE_API_KEY", "");

		const mod = await import("../credential-encryption.js");
		const { requireServerSecret } = mod as typeof mod & {
			requireServerSecret?: () => string;
		};

		if (!requireServerSecret) {
			throw new Error("requireServerSecret not yet exported — AH1 §6 not implemented");
		}

		expect(requireServerSecret()).toBe("my-cred-key-32chars-long!!!!!!");
	});
});
