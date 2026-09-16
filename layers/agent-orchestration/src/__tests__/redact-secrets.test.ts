import { describe, expect, test } from "vitest";
import { redactSecrets } from "../redact-secrets.js";

describe("redactSecrets", () => {
	test("replaces a literal secret wherever it appears", () => {
		const text =
			"git clone failed (128): Authentication failed for token ghp_abcdefghijklmnopqrstuvwx";
		expect(redactSecrets(text, ["ghp_abcdefghijklmnopqrstuvwx"])).not.toContain(
			"ghp_abcdefghijklmnopqrstuvwx",
		);
	});

	test("strips scheme://user:pass@ userinfo embedded inside a sentence", () => {
		const text =
			"fatal: unable to access 'https://x-access-token:s3cr3t@github.com/o/r.git/': failed";
		const out = redactSecrets(text, []);
		expect(out).toBe("fatal: unable to access 'https://github.com/o/r.git/': failed");
	});

	test("strips a gh*_ token pattern even without being told the literal value", () => {
		const text = "remote rejected ghp_zzzzzzzzzzzzzzzzzzzzzzzz1234";
		expect(redactSecrets(text, [])).not.toMatch(/ghp_[A-Za-z0-9]{20,}/);
	});

	test("leaves ordinary text untouched", () => {
		expect(redactSecrets("branch 'main' not found", [])).toBe("branch 'main' not found");
	});
});
