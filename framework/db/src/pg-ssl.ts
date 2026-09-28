import { readFileSync } from "node:fs";

// @lore: pg-ssl — postgres-js verifies hostname by default; cluster cert SANs are headless not ClusterIP; sslmode=verify-ca must skip hostname check

export type PostgresSslOption =
	| false
	| {
			ca?: string;
			rejectUnauthorized: boolean;
			checkServerIdentity?: () => undefined;
	  };

/**
 * Strip TLS params postgres-js can't consume from the URL. postgres-js forwards
 * unknown query params to the server as startup parameters; `sslrootcert` is not
 * a Postgres GUC, so it triggers `unrecognized configuration parameter`. SSL is
 * applied via the explicit `ssl` option (resolvePostgresSsl), so these are
 * redundant in the URL. `options` (search_path etc.) is preserved.
 */
export function sanitizePostgresUrl(url: string): string {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return url;
	}
	for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey"]) {
		parsed.searchParams.delete(key);
	}
	return parsed.toString();
}

function readCa(path: string | null): string | undefined {
	if (!path) return undefined;
	try {
		return readFileSync(path, "utf-8");
	} catch {
		return undefined;
	}
}

export function resolvePostgresSsl(url: string): PostgresSslOption {
	let search: URLSearchParams;
	try {
		search = new URL(url).searchParams;
	} catch {
		return false;
	}
	const sslmode = search.get("sslmode");
	if (!sslmode || sslmode === "disable") return false;

	const ca = readCa(search.get("sslrootcert"));

	// Encrypt but do not verify (no CA trust required).
	if (sslmode === "require" || sslmode === "prefer" || sslmode === "allow") {
		return { rejectUnauthorized: false };
	}
	// verify-ca: trust the CA chain, skip the hostname check.
	if (sslmode === "verify-ca") {
		return { ca, rejectUnauthorized: true, checkServerIdentity: () => undefined };
	}
	// verify-full (and unknown stricter modes): CA + hostname.
	return { ca, rejectUnauthorized: true };
}
