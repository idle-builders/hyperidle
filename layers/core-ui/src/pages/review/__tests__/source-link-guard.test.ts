import { describe, expect, it } from "vitest";
import { isSafeSourceHref } from "../source-link-guard";

describe("isSafeSourceHref", () => {
	it.each([
		["https://example.com/record/1", true],
		["http://example.com/record/1", true],
		["HTTPS://Example.COM/record/1", true],
		["https://dashboard.stripe.com/payments/ch_3QspeeJ2a7kLmN0p", true],
		["javascript:alert(1)", false],
		["data:text/html,<script>alert(1)</script>", false],
		["ftp://files.example.com/readme.txt", false],
		["/relative/path", false],
		["../../elsewhere", false],
		["", false],
		["mailto:user@example.com", false],
	])("classifies %s as safe=%s", (href, expected) => {
		expect(isSafeSourceHref(href)).toBe(expected);
	});
});
