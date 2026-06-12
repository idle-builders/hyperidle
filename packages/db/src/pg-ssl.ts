import { readFileSync } from "node:fs";

// Resolve postgres-js TLS options from a libpq-style connection URL, honoring
// `sslmode` semantics that postgres-js does NOT implement on its own.
//
// @lore deploy: the shared cluster's self-signed PostgreSQL cert lists the
// headless service SANs (postgresql.infra…, *-hl.infra…) but NOT the primary
// ClusterIP name the tenant DATABASE_URL connects to (postgresql-primary.infra…).
// `sslmode=verify-ca` explicitly means "verify the CA chain, do NOT check the
// hostname" — but postgres-js does full verification by default and trips
// ERR_TLS_CERT_ALTNAME_INVALID. This helper builds the tls options that match
// the requested sslmode, and also loads `sslrootcert` (postgres-js ignores it
// from the URL). Used by both the runtime connection and drizzle-kit migrate.

/** TLS options for postgres-js, or `false` to disable TLS. */
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
