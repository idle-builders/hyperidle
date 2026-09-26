/**
 * SSRF (Server-Side Request Forgery) defences.
 *
 * Moved here from the deleted `@hyperidle/host-process` package.
 * `isPrivateHostLiteral` is the only symbol callers in this package need; the
 * IP-level predicates stay module-private.
 *
 * @lore BC5 T11: `resolveUrlForSSRF` (the DNS-rebinding-guarded resolve —
 * H-1) is deleted with it — its one caller was AN2's live MCP reachability
 * probe, itself deleted with the `createConnectionRoutes` HTTP surface. The
 * connections seam's own guard is `isBlockedUrl` (`routes/connections.ts`),
 * checked at add-time, not a live per-request DNS resolve. The still-used
 * `run-orchestration` package keeps its own `resolveUrlForSSRF` copy — spawn
 * provisioning resolves live, at connect time, and needs the pinned-IP gate.
 */
import * as net from "node:net";

const PRIVATE_HOSTS: ReadonlySet<string> = new Set(["localhost", "localhost.", "broadcasthost"]);

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

export function isPrivateHostLiteral(hostname: string): boolean {
	const clean = hostname.replace(/^\[|\]$/g, "").toLowerCase();
	if (PRIVATE_HOSTS.has(clean)) return true;
	if (clean.endsWith(".local")) return true;
	if (clean === "metadata" || clean === "metadata.google.internal") return true;
	if (net.isIP(clean) === 4) return isPrivateIPv4(clean);
	if (net.isIP(clean) === 6) return isPrivateIPv6(clean);
	return false;
}
