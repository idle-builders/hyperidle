import { describe, expect, it } from "vitest";
import {
	isLoopbackHost,
	isPrivateHostLiteral,
	isPrivateIPv4,
	isPrivateIPv6,
	resolveUrlForSSRF,
} from "../net/ssrf.js";

describe("shared/net/ssrf: isPrivateIPv4", () => {
	it("flags loopback + RFC1918 + link-local", () => {
		expect(isPrivateIPv4("127.0.0.1")).toBe(true);
		expect(isPrivateIPv4("10.0.0.5")).toBe(true);
		expect(isPrivateIPv4("192.168.1.1")).toBe(true);
		expect(isPrivateIPv4("169.254.169.254")).toBe(true); // cloud metadata
		expect(isPrivateIPv4("172.20.0.1")).toBe(true);
		expect(isPrivateIPv4("100.64.0.1")).toBe(true); // CGNAT
		expect(isPrivateIPv4("224.0.0.1")).toBe(true); // multicast
	});
	it("passes public addresses", () => {
		expect(isPrivateIPv4("8.8.8.8")).toBe(false);
		expect(isPrivateIPv4("1.1.1.1")).toBe(false);
	});
});

describe("shared/net/ssrf: isPrivateIPv6", () => {
	it("flags unique-local + loopback + link-local", () => {
		expect(isPrivateIPv6("::1")).toBe(true);
		expect(isPrivateIPv6("fe80::1")).toBe(true);
		expect(isPrivateIPv6("fc00::1")).toBe(true);
	});
	it("flags embedded IPv4 private", () => {
		expect(isPrivateIPv6("::ffff:127.0.0.1")).toBe(true);
	});
	it("flags embedded cloud metadata IPv4 (::ffff:169.254.169.254)", () => {
		expect(isPrivateIPv6("::ffff:169.254.169.254")).toBe(true);
	});
	it("passes public v6", () => {
		expect(isPrivateIPv6("2606:4700:4700::1111")).toBe(false);
	});
});

describe("shared/net/ssrf: isPrivateHostLiteral + isLoopbackHost", () => {
	it("catches localhost + .local + cloud metadata names", () => {
		expect(isPrivateHostLiteral("localhost")).toBe(true);
		expect(isPrivateHostLiteral("foo.local")).toBe(true);
		expect(isPrivateHostLiteral("metadata.google.internal")).toBe(true);
		expect(isLoopbackHost("localhost")).toBe(true);
		expect(isLoopbackHost("127.0.0.1")).toBe(true);
	});
	it("public hosts pass", () => {
		expect(isPrivateHostLiteral("example.com")).toBe(false);
	});
});

describe("shared/net/ssrf: resolveUrlForSSRF (H3 H-1)", () => {
	it("returns resolved public IPs so callers can pin them", async () => {
		const r = await resolveUrlForSSRF("https://traces.example.com", {
			lookup: async () => [{ address: "203.0.113.10", family: 4 }],
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.addresses).toHaveLength(1);
			expect(r.addresses[0]!.address).toBe("203.0.113.10");
		}
	});
	it("rejects when resolver returns a private IP", async () => {
		const r = await resolveUrlForSSRF("https://rebind.example.com", {
			lookup: async () => [{ address: "10.0.0.5", family: 4 }],
		});
		expect(r.ok).toBe(false);
	});
	it("rejects when resolver returns zero addresses", async () => {
		const r = await resolveUrlForSSRF("https://void.example.com", {
			lookup: async () => [],
		});
		expect(r.ok).toBe(false);
	});
	it("rejects when resolver throws", async () => {
		const r = await resolveUrlForSSRF("https://broken.example.com", {
			lookup: async () => {
				throw new Error("dns oops");
			},
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.reason).toContain("could not be resolved");
	});
	it("treats IP literals as already-validated", async () => {
		const r = await resolveUrlForSSRF("https://203.0.113.10");
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.addresses[0]!.address).toBe("203.0.113.10");
	});
});
