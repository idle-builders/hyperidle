/**
 * SSRF (Server-Side Request Forgery) defences.
 *
 * Moved here from the deleted `@hyperidle/host-process` package (AU44-b6).
 * The two public exports (`resolveUrlForSSRF`, `isPrivateHostLiteral`) are
 * the only symbols callers in this package need; the IP-level predicates
 * stay module-private.
 *
 * @lore H-1: `resolveUrlForSSRF` was earned from security review H-1 — the
 * DNS resolution gate + IP-check prevents DNS rebinding between the check
 * and the outbound connect. Never remove or stub this gate.
 */
import * as dns from "node:dns";
import * as net from "node:net";
import { promisify } from "node:util";

export type ResolveResult =
	| { ok: true; addresses: ReadonlyArray<{ address: string; family: 4 | 6 }> }
	| { ok: false; reason: string };

export interface SanitizeUrlOptions {
	readonly requireHttps?: boolean;
	readonly label?: string;
	readonly lookup?: (host: string) => Promise<Array<{ address: string; family: 4 | 6 }>>;
}

const PRIVATE_HOSTS: ReadonlySet<string> = new Set(["localhost", "localhost.", "broadcasthost"]);
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function isPrivateIPv4(ip: string): boolean {
	const parts = ip.split(".");
	if (parts.length !== 4) return false;
	const nums = parts.map(Number);
	if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return false;
	const a = nums[0] as number;
	const b = nums[1] as number;
	if (a === 10) return true;
	if (a === 127) return true;
	if (a === 0) return true;
	if (a === 169 && b === 254) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 192 && b === 168) return true;
	if (a === 100 && b >= 64 && b <= 127) return true;
	if (a >= 224) return true;
	return false;
}

function isPrivateIPv6(ip: string): boolean {
	const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
	if (lower === "::1") return true;
	if (lower === "::") return true;
	if (/^fe[89ab][0-9a-f]?:/i.test(lower)) return true;
	if (/^f[cd][0-9a-f]{0,2}:/i.test(lower)) return true;
	const embedded = lower.match(/::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
	if (embedded) return isPrivateIPv4(embedded[1] ?? "");
	return false;
}

function isLoopbackHost(hostname: string): boolean {
	const clean = hostname.replace(/^\[|\]$/g, "").toLowerCase();
	return LOOPBACK_HOSTS.has(clean);
}

export function isPrivateHostLiteral(hostname: string): boolean {
	const clean = hostname.replace(/^\[|\]$/g, "").toLowerCase();
	if (PRIVATE_HOSTS.has(clean)) return true;
	if (clean.endsWith(".local")) return true;
	if (clean === "metadata" || clean === "metadata.google.internal") return true;
	if (net.isIP(clean) === 4) return isPrivateIPv4(clean);
	if (net.isIP(clean) === 6) return isPrivateIPv6(clean);
	return false;
}

type ParseResult = { ok: true; url: URL } | { ok: false; reason: string };

function parseAndCheckUrl(input: string, opts: SanitizeUrlOptions): ParseResult {
	const label = opts.label ?? "url";
	const requireHttps = opts.requireHttps ?? true;
	if (typeof input !== "string" || input.length === 0) {
		return { ok: false, reason: `${label} must be a non-empty string` };
	}
	if (/[\0\r\n]/.test(input)) {
		return { ok: false, reason: `${label} must not contain control characters` };
	}
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		return { ok: false, reason: `${label} is not a valid URL` };
	}
	if (url.username.length > 0 || url.password.length > 0) {
		return { ok: false, reason: `${label} must not contain userinfo` };
	}
	const host = url.hostname.toLowerCase();
	if (url.protocol === "https:") {
		if (isPrivateHostLiteral(host) && !isLoopbackHost(host)) {
			return { ok: false, reason: `${label} resolves to a private / link-local host` };
		}
		return { ok: true, url };
	}
	if (url.protocol === "http:") {
		if (!requireHttps) return { ok: true, url };
		if (isLoopbackHost(host)) return { ok: true, url };
		return { ok: false, reason: "http:// is only permitted for loopback hosts" };
	}
	return { ok: false, reason: `${label} must be http:// or https://` };
}

const dnsLookup = promisify(dns.lookup);

export async function resolveUrlForSSRF(
	input: string,
	opts: SanitizeUrlOptions = {},
): Promise<ResolveResult> {
	const label = opts.label ?? "url";
	const parsed = parseAndCheckUrl(input, opts);
	if (!parsed.ok) return { ok: false, reason: parsed.reason };
	const host = parsed.url.hostname.replace(/^\[|\]$/g, "");
	if (net.isIP(host)) {
		const family = (net.isIP(host) === 6 ? 6 : 4) as 4 | 6;
		return { ok: true, addresses: [{ address: host, family }] };
	}
	const lookup =
		opts.lookup ??
		(async (h: string): Promise<Array<{ address: string; family: 4 | 6 }>> => {
			const resolved = await dnsLookup(h, { all: true });
			return resolved.map((r) => ({ address: r.address, family: r.family as 4 | 6 }));
		});
	try {
		const resolved = await lookup(host);
		const out: Array<{ address: string; family: 4 | 6 }> = [];
		for (const record of resolved) {
			const address = record.address;
			if (net.isIP(address) === 4) {
				if (isPrivateIPv4(address)) {
					return { ok: false, reason: `${label} host resolves to private IPv4 ${address}` };
				}
				out.push({ address, family: 4 });
			} else if (net.isIP(address) === 6) {
				if (isPrivateIPv6(address)) {
					return { ok: false, reason: `${label} host resolves to private IPv6 ${address}` };
				}
				out.push({ address, family: 6 });
			}
		}
		if (out.length === 0) {
			return { ok: false, reason: `${label} host resolved to no addresses` };
		}
		return { ok: true, addresses: out };
	} catch {
		return { ok: false, reason: `${label} host could not be resolved` };
	}
}
