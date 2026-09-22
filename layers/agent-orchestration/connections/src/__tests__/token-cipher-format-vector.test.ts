/**
 * The AES-256-GCM cipher, in its new home: `@hyperidle/connections`.
 *
 * @lore AU26 E1 (J1), carried through the server_credentials deletion: the
 * move's proof obligation is that the *format* did not change. A round-trip
 * alone cannot prove that — a cipher that silently changed its KDF, salt,
 * info string or byte layout still round-trips against itself. So the
 * load-bearing assertion here is the GOLDEN VECTOR: a base64 ciphertext
 * produced by the PRE-move implementation (`layers/core-api/connections/src/
 * credential-encryption.ts` at commit cf279e43) under a fixed key + plaintext,
 * which the relocated code must still decrypt to that exact plaintext. If it
 * ever stops decrypting, every connection token already at rest in a user's
 * local PGlite directory has become unreadable — the same class of break as
 * an un-rollbackable migration. The cipher moved a second time, verbatim,
 * when `server_credentials` was dropped and connection tokens became its
 * only production consumer — the vector still has to hold.
 */
import { describe, expect, test, vi } from "vitest";
import { decryptCredentialValue, encryptCredentialValue } from "../token-cipher.js";

/** Fixed key used to mint the golden vector below. */
const FIXED_KEY = "au26-e1-fixed-key";
/** Fixed plaintext used to mint the golden vector below. */
const FIXED_PLAINTEXT = "sk-au26-e1-fixed-plaintext-value";
/** base64(iv[12] + ciphertext[n] + authTag[16]) — minted by the pre-move code. */
const PRE_MOVE_CIPHERTEXT =
	"ECXJOo0uZOSVHOvxpkTARLtx43z0ghOVjZUYHVh/1yGPG4sbkanI4aN07lZJfWsx0l4VKMKGywkqfDCD";

const OTHER_KEY = "au26-e1-some-other-key";

function withSecret<T>(secret: string, fn: () => T): T {
	vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", secret);
	try {
		return fn();
	} finally {
		vi.unstubAllEnvs();
	}
}

describe("credential cipher — on-disk format is stable across the move to shared", () => {
	test("decrypts the pre-move golden vector to the original plaintext", () => {
		const decrypted = withSecret(FIXED_KEY, () => decryptCredentialValue(PRE_MOVE_CIPHERTEXT));
		expect(decrypted).toBe(FIXED_PLAINTEXT);
	});

	test("round-trips a fixed key + plaintext", () => {
		const roundTripped = withSecret(FIXED_KEY, () =>
			decryptCredentialValue(encryptCredentialValue(FIXED_PLAINTEXT)),
		);
		expect(roundTripped).toBe(FIXED_PLAINTEXT);
	});

	test("emits the pre-move wire format — base64 of iv[12] + ciphertext + authTag[16]", () => {
		const encrypted = withSecret(FIXED_KEY, () => encryptCredentialValue(FIXED_PLAINTEXT));
		const bytes = Buffer.from(encrypted, "base64");
		const golden = Buffer.from(PRE_MOVE_CIPHERTEXT, "base64");
		// Same plaintext length ⇒ byte-identical envelope length across the move.
		expect(bytes.length).toBe(golden.length);
		expect(bytes.length).toBe(12 + FIXED_PLAINTEXT.length + 16);
	});

	test("a different key cannot read the golden vector", () => {
		expect(withSecret(OTHER_KEY, () => decryptCredentialValue(PRE_MOVE_CIPHERTEXT))).toBeNull();
	});

	test("a tampered golden vector fails the auth tag", () => {
		const bytes = Buffer.from(PRE_MOVE_CIPHERTEXT, "base64");
		const last = bytes.length - 1;
		bytes[last] = (bytes[last] ?? 0) ^ 0xff;
		const tampered = bytes.toString("base64");
		expect(withSecret(FIXED_KEY, () => decryptCredentialValue(tampered))).toBeNull();
	});

	test("the primitive reads no database — it depends only on env + node:crypto", () => {
		// The J1 no-DB proof, re-discharged as behaviour: the cipher is callable
		// with no db handle, no connection, nothing injected but the env secret.
		const encrypted = withSecret(FIXED_KEY, () => encryptCredentialValue("no-db-needed"));
		expect(withSecret(FIXED_KEY, () => decryptCredentialValue(encrypted))).toBe("no-db-needed");
	});
});
