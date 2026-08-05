import { describe, expect, it } from "vitest";
import { sanitizeRouteId } from "../layouts/AppShell";

/**
 * I4 security MED-1: route-segment ids coming from /api/search must be
 * validated before interpolation into a navigate() path. These tests prove
 * the guard rejects escapes, traversal, and absolute-URI smuggling.
 */
describe("sanitizeRouteId", () => {
	it("accepts typical alphanumeric ids", () => {
		expect(sanitizeRouteId("abc123")).toBe("abc123");
		expect(sanitizeRouteId("bet_42")).toBe("bet_42");
		expect(sanitizeRouteId("UUID-1234-5678")).toBe("UUID-1234-5678");
	});

	it("URI-encodes characters that are path-segment safe but need escaping", () => {
		// Colons are reserved but not forbidden in path segments; encode defensively.
		expect(sanitizeRouteId("bet+with+plus")).toBe("bet%2Bwith%2Bplus");
	});

	it("rejects empty and non-string inputs", () => {
		expect(sanitizeRouteId("")).toBeNull();
		// @ts-expect-error — deliberately testing runtime type mismatch
		expect(sanitizeRouteId(null)).toBeNull();
		// @ts-expect-error — deliberately testing runtime type mismatch
		expect(sanitizeRouteId(undefined)).toBeNull();
	});

	it("rejects path-traversal and relative-segment ids", () => {
		expect(sanitizeRouteId("..")).toBeNull();
		expect(sanitizeRouteId(".")).toBeNull();
		expect(sanitizeRouteId("../../../etc/passwd")).toBeNull();
		expect(sanitizeRouteId("foo/../bar")).toBeNull();
		expect(sanitizeRouteId("foo..bar")).toBeNull();
	});

	it("rejects ids containing slashes (would escape the segment)", () => {
		expect(sanitizeRouteId("foo/bar")).toBeNull();
		expect(sanitizeRouteId("a\\b")).toBeNull();
	});

	it("rejects ids containing query or fragment markers (smuggle routes)", () => {
		expect(sanitizeRouteId("foo?settings=open")).toBeNull();
		expect(sanitizeRouteId("foo#/anchor")).toBeNull();
	});

	it("rejects ids with absolute URI schemes", () => {
		expect(sanitizeRouteId("http://evil.example/x")).toBeNull();
		expect(sanitizeRouteId("https://evil.example/x")).toBeNull();
		expect(sanitizeRouteId("javascript:alert(1)")).toBeNull();
		expect(sanitizeRouteId("data:text/html,x")).toBeNull();
	});

	it("rejects ids containing whitespace or control characters", () => {
		expect(sanitizeRouteId("foo bar")).toBeNull();
		expect(sanitizeRouteId("foo\tbar")).toBeNull();
		expect(sanitizeRouteId("foo\nbar")).toBeNull();
		expect(sanitizeRouteId("foo\u0000bar")).toBeNull();
		expect(sanitizeRouteId("foo\u007fbar")).toBeNull();
	});

	it("rejects absurdly long ids (defensive bound)", () => {
		expect(sanitizeRouteId("a".repeat(201))).toBeNull();
	});
});
