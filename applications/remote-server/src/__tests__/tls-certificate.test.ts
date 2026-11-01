/**
 * The server's certificate is renewed once fewer than 30 days are left, and HTTPS is served only
 * when both the name and the Cloudflare token are given.
 */
import { describe, expect, test } from "vitest";
import { needsRenewal, tlsConfigFrom } from "../tls-certificate.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-01T00:00:00Z");

describe("the server's certificate", () => {
	test.each([
		[31, false],
		[29, true],
		[-1, true],
	])("with %i days left, renew: %s", (daysLeft, renew) => {
		expect(needsRenewal(new Date(NOW.getTime() + daysLeft * DAY), NOW)).toBe(renew);
	});

	test.each([
		[{ HYPERIDLE_TLS_DOMAIN: "team.example.com", CLOUDFLARE_API_TOKEN: "t" }, "team.example.com"],
		[{ HYPERIDLE_TLS_DOMAIN: "team.example.com" }, null],
		[{}, null],
	])("HTTPS for %o: %s", (env, domain) => {
		expect(tlsConfigFrom(env)?.domain ?? null).toBe(domain);
	});
});
