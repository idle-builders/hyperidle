/**
 * AU20 completeness-contract: unit tests for the three delivery-chain
 * capabilities that were covered by the deleted adapter/redact test files.
 *
 * These replace (with equivalent behavioral coverage):
 *   - redact.test.ts       → scrubErrorMessage
 *   - smtp-adapter.test.ts → classifySmtpRetriable
 *   - ntfy-adapter.test.ts → priorityForSeverity
 *
 * All three are pure (no DB/network), so pure unit tests suffice.
 */

import { REDACTED_TAG } from "@hyperidle/diagnostics";
import { describe, expect, test } from "vitest";
import { classifySmtpRetriable, priorityForSeverity, scrubErrorMessage } from "../install.js";

// ---------------------------------------------------------------------------
// scrubErrorMessage — credential & pattern redaction (replaces redact.test.ts)
// ---------------------------------------------------------------------------

describe("scrubErrorMessage", () => {
	test("replaces SMTP password with REDACTED_TAG", () => {
		const result = scrubErrorMessage("auth error: my-secret-pass", {
			smtpPassword: "my-secret-pass",
		});
		expect(result).not.toContain("my-secret-pass");
		expect(result).toContain(REDACTED_TAG);
	});

	test("replaces ntfy auth token with REDACTED_TAG", () => {
		const result = scrubErrorMessage("request failed: Bearer tk_secret123", {
			ntfyAuthToken: "tk_secret123",
		});
		expect(result).not.toContain("tk_secret123");
		expect(result).toContain(REDACTED_TAG);
	});

	test("replaces SMTP username with REDACTED_TAG", () => {
		const result = scrubErrorMessage("login failed for user myuser@example.com", {
			smtpUsername: "myuser@example.com",
		});
		expect(result).not.toContain("myuser@example.com");
		expect(result).toContain(REDACTED_TAG);
	});

	test("handles empty context (no credentials)", () => {
		const result = scrubErrorMessage("connection refused", {});
		expect(result).toContain("connection refused");
	});

	test("handles missing context parameter", () => {
		const result = scrubErrorMessage("connection refused");
		expect(result).toContain("connection refused");
	});

	test("scrubs ERROR_TOKEN_PATTERNS (e.g. bearer tokens in error text)", () => {
		// bearer token pattern from @hyperidle/diagnostics ERROR_TOKEN_PATTERNS
		const result = scrubErrorMessage("error: Authorization: Bearer abc123token");
		expect(result).not.toContain("abc123token");
	});

	test("scrubs password= pattern from error text", () => {
		const result = scrubErrorMessage("SMTP PLAIN password=mysupersecret");
		expect(result).not.toContain("mysupersecret");
		expect(result).toContain(REDACTED_TAG);
	});

	test("does not modify message when no credentials match", () => {
		const result = scrubErrorMessage("ECONNREFUSED 127.0.0.1:25", {
			smtpPassword: "correct-password",
		});
		// The password doesn't appear in this error — message unchanged (modulo pattern checks)
		expect(result).toContain("ECONNREFUSED");
		expect(result).not.toContain("correct-password");
	});

	test("replaces all occurrences of the same secret", () => {
		const result = scrubErrorMessage("secret is 'mypass' and also mypass again", {
			smtpPassword: "mypass",
		});
		expect(result).not.toContain("mypass");
		const count = (result.match(new RegExp(REDACTED_TAG.replace(/[[\]]/g, "\\$&"), "g")) ?? [])
			.length;
		expect(count).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// classifySmtpRetriable — SMTP error triage (replaces smtp-adapter.test.ts)
// ---------------------------------------------------------------------------

describe("classifySmtpRetriable", () => {
	// Network-level errors: transient — retry
	test("ECONNREFUSED is retriable", () => {
		expect(classifySmtpRetriable({ code: "ECONNREFUSED" })).toBe(true);
	});

	test("ETIMEDOUT is retriable", () => {
		expect(classifySmtpRetriable({ code: "ETIMEDOUT" })).toBe(true);
	});

	test("EDNS is retriable", () => {
		expect(classifySmtpRetriable({ code: "EDNS" })).toBe(true);
	});

	test("ESOCKET is retriable", () => {
		expect(classifySmtpRetriable({ code: "ESOCKET" })).toBe(true);
	});

	test("ECONNECTION is retriable", () => {
		expect(classifySmtpRetriable({ code: "ECONNECTION" })).toBe(true);
	});

	// Authentication / envelope errors: permanent — don't retry
	test("EAUTH is NOT retriable (bad credentials — retrying will not help)", () => {
		expect(classifySmtpRetriable({ code: "EAUTH" })).toBe(false);
	});

	test("EENVELOPE is NOT retriable (bad recipient — permanent)", () => {
		expect(classifySmtpRetriable({ code: "EENVELOPE" })).toBe(false);
	});

	test("EMESSAGE is NOT retriable (malformed message — permanent)", () => {
		expect(classifySmtpRetriable({ code: "EMESSAGE" })).toBe(false);
	});

	// SMTP 4xx: temporary failures — retry
	test("responseCode 421 (service not available) is retriable", () => {
		expect(classifySmtpRetriable({ responseCode: 421 })).toBe(true);
	});

	test("responseCode 450 (mailbox unavailable, transient) is retriable", () => {
		expect(classifySmtpRetriable({ responseCode: 450 })).toBe(true);
	});

	// SMTP 5xx: permanent failures — do not retry
	test("responseCode 550 (user unknown, permanent) is NOT retriable", () => {
		expect(classifySmtpRetriable({ responseCode: 550 })).toBe(false);
	});

	test("responseCode 554 (transaction failed, permanent) is NOT retriable", () => {
		expect(classifySmtpRetriable({ responseCode: 554 })).toBe(false);
	});

	// Unknown errors: fail open (retry)
	test("unknown error with no code or responseCode defaults to retriable", () => {
		expect(classifySmtpRetriable(new Error("unknown internal error"))).toBe(true);
	});

	test("plain object with no known code is retriable (fail open)", () => {
		expect(classifySmtpRetriable({ code: "EUNKNOWN_CUSTOM" })).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// priorityForSeverity — ntfy urgency mapping (replaces ntfy-adapter.test.ts)
// ---------------------------------------------------------------------------

describe("priorityForSeverity", () => {
	test("blocking severity maps to urgent ntfy priority", () => {
		expect(priorityForSeverity("blocking")).toBe("urgent");
	});

	test("digest severity maps to default ntfy priority", () => {
		expect(priorityForSeverity("digest")).toBe("default");
	});
});
