import { REDACTED_TAG } from "@hyperidle/shared";
import { describe, expect, it } from "vitest";
import { scrubErrorMessage } from "../redact.js";

describe("scrubErrorMessage", () => {
	it("scrubs SMTP password from error message", () => {
		const message = "Authentication failed: bad password 'MyS3cr3tP@ss!'";
		const result = scrubErrorMessage(message, { smtpPassword: "MyS3cr3tP@ss!" });
		expect(result).not.toContain("MyS3cr3tP@ss!");
		expect(result).toContain(REDACTED_TAG);
	});

	it("scrubs ntfy auth token from error message", () => {
		const message = "ntfy request failed: bearer tk_abcdef12345678 rejected";
		const result = scrubErrorMessage(message, { ntfyAuthToken: "tk_abcdef12345678" });
		expect(result).not.toContain("tk_abcdef12345678");
		expect(result).toContain(REDACTED_TAG);
	});

	it("scrubs SMTP username from error message", () => {
		const message = "BadCredentials: Your username is 'admin@mail.com'";
		const result = scrubErrorMessage(message, { smtpUsername: "admin@mail.com" });
		expect(result).not.toContain("admin@mail.com");
		expect(result).toContain(REDACTED_TAG);
	});

	it("handles regex-special characters in credential values", () => {
		// Password with regex metacharacters: .+*?^${}()|[]\
		const password = "p@ss.w+rd*2024?";
		const message = `Failed with password: ${password}`;
		const result = scrubErrorMessage(message, { smtpPassword: password });
		expect(result).not.toContain(password);
		expect(result).toContain(REDACTED_TAG);
	});

	it("handles empty credentials gracefully (no crash)", () => {
		const message = "Some error occurred";
		const result = scrubErrorMessage(message, {
			smtpPassword: "",
			ntfyAuthToken: null,
			smtpUsername: undefined,
		});
		// Should return the original message with only generic pattern sweeps applied
		expect(result).toBe("Some error occurred");
	});

	it("scrubs generic token patterns (Bearer, sk-) from messages", () => {
		const message = "Error: Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature is invalid";
		const result = scrubErrorMessage(message);
		expect(result).not.toContain("eyJhbGciOiJIUzI1NiJ9");
	});

	it("scrubs password= and username= patterns from nodemailer-style errors", () => {
		const message = "SMTP error: password='leaked_secret' user='admin'";
		const result = scrubErrorMessage(message);
		expect(result).not.toContain("leaked_secret");
		expect(result).not.toContain("admin");
	});
});
