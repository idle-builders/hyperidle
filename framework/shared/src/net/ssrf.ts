/**
 * Shared SSRF (Server-Side Request Forgery) defenses.
 *
 * Originally extracted from `packages/server/src/services/notifications/config.ts`
 * (H2 security review #5) so the same blocklist can guard
 * webhook adapters and any outbound HTTP that takes a
 * user-controlled URL.
 *
 * Two gates:
 *  - `sanitizeHttpUrl` — synchronous, runs at config PATCH time.
 *    Rejects userinfo, non-http(s) protocols, private/link-local/
 *    metadata IP literals, and `.local` mDNS.
 *  - `assertUrlNotSSRF` — async DNS resolution guard, runs immediately
 *    before the HTTP call. Catches the "public hostname resolves to a
 *    private IP" DNS-rebinding class of attack.
 *
 * Both helpers return a tagged union `SanitizeResult` rather than
 * throwing so callers can compose them with existing error reporting.
 */

import * as dns from "node:dns";
import * as net from "node:net";
import { promisify } from "node:util";

export type SanitizeResult = { ok: true } | { ok: false; reason: string };

/**
 * Extended result from `assertUrlNotSSRF` which returns the resolved
 * IPs so a caller can pin them for the subsequent fetch (protects
 * against DNS rebinding, security review H-1).
 */
export type ResolveResult =
	| { ok: true; addresses: ReadonlyArray<{ address: string; family: 4 | 6 }> }
	| { ok: false; reason: string };

export interface SanitizeUrlOptions {
	/**
	 * If `true`, http:// is only accepted for loopback hosts. Default `true`.
	 * Matches ntfy and similar adapters: both require https except when a test
	 * is targeting a local HTTP fixture.
	 */
	readonly requireHttps?: boolean;
	/**
	 * Label used in error messages (e.g. "ntfy url", "webhook url").
	 * Default "url".
	 */
	readonly label?: string;
	/**
	 * Injectable DNS resolver. Tests use this to simulate DNS rebinding
	 * (first call returns a public IP, second call returns a private IP)
	 * without patching the global `dns.lookup`.
	 *
	 * The function must return at least one `{ address, family }` record.
	 * A rejection is treated as "could not be resolved".
	 */
	readonly lookup?: (host: string) => Promise<Array<{ address: string; family: 4 | 6 }>>;
}

const PRIVATE_HOSTS: ReadonlySet<string> = new Set(["localhost", "localhost.", "broadcasthost"]);

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isPrivateIPv4(ip: string): boolean {
	const parts = ip.split(".");
	if (parts.length !== 4) return false;
	const nums = parts.map(Number);
	if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return false;
	// We checked parts.length === 4 above, so all four elements are present.
	const a = nums[0] as number;
	const b = nums[1] as number;
	if (a === 10) return true; // 10.0.0.0/8
	if (a === 127) return true; // loopback
	if (a === 0) return true; // 0.0.0.0/8 "this network"
	if (a === 169 && b === 254) return true; // link-local
	if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
	if (a === 192 && b === 168) return true; // 192.168.0.0/16
	if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
	if (a >= 224) return true; // multicast / reserved
	return false;
}

export function isPrivateIPv6(ip: string): boolean {
	const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
	if (lower === "::1") return true;
	if (lower === "::") return true;
	// Link-local fe80::/10
	if (/^fe[89ab][0-9a-f]?:/i.test(lower)) return true;
	// Unique-local fc00::/7
	if (/^f[cd][0-9a-f]{0,2}:/i.test(lower)) return true;
	// IPv4-mapped or IPv4-compatible addresses (::ffff:a.b.c.d)
	const embedded = lower.match(/::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
	// embedded[1] is the capture group — present whenever embedded is non-null.
	if (embedded) return isPrivateIPv4(embedded[1] ?? "");
	return false;
}

export function isPrivateHostLiteral(hostname: string): boolean {
	const clean = hostname.replace(/^\[|\]$/g, "").toLowerCase();
	if (PRIVATE_HOSTS.has(clean)) return true;
	// mDNS `.local` — rejected regardless (prevents local-network leakage)
	if (clean.endsWith(".local")) return true;
	// Cloud metadata endpoints — 169.254.169.254 (AWS/GCP/Azure/DO)
	if (clean === "metadata" || clean === "metadata.google.internal") return true;
	if (net.isIP(clean) === 4) return isPrivateIPv4(clean);
	if (net.isIP(clean) === 6) return isPrivateIPv6(clean);
	return false;
}

export function isLoopbackHost(hostname: string): boolean {
	const clean = hostname.replace(/^\[|\]$/g, "").toLowerCase();
	return LOOPBACK_HOSTS.has(clean);
}

type ParseResult = { ok: true; url: URL } | { ok: false; reason: string };

/**
 * Parse + sanity-check a URL in one shot. Internal helper so both the
 * sync `sanitizeHttpUrl` entry point and the async `assertUrlNotSSRF`
 * gate share exactly one `new URL(...)` call per invocation.
 */
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

/**
 * Synchronous URL sanitizer. Rejects CR/LF/NUL, userinfo, non-http(s)
 * protocols, and private/link-local/metadata IP literals. Loopback
 * hosts may use http:// for test fixtures.
 */
export function sanitizeHttpUrl(input: string, opts: SanitizeUrlOptions = {}): SanitizeResult {
	const r = parseAndCheckUrl(input, opts);
	if (!r.ok) return { ok: false, reason: r.reason };
	return { ok: true };
}

const dnsLookup = promisify(dns.lookup);

/**
 * Async DNS gate. Run immediately before issuing the outbound HTTP. If
 * the hostname resolves to a private address, refuse the request.
 * Single-parse: reuses the `URL` instance produced by the sync pre-check
 * so the input string is never parsed twice.
 */
export async function assertUrlNotSSRF(
	input: string,
	opts: SanitizeUrlOptions = {},
): Promise<SanitizeResult> {
	const r = await resolveUrlForSSRF(input, opts);
	if (!r.ok) return r;
	return { ok: true };
}

/**
 * Full SSRF gate: parse + sync pre-check + DNS resolution + private-IP
 * rejection. Returns the list of resolved public addresses so callers
 * can pin one for the subsequent fetch (prevents DNS rebinding between
 * this check and the outbound connect — security review H-1).
 *
 * @lore The public `assertUrlNotSSRF` is kept as a thin wrapper so the
 * existing call sites (notifications/ntfy, short-hand pre-checks) stay
 * unchanged. Callers that need the resolved IP list use this entry
 * point.
 */
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
