import { spawnSync } from "node:child_process";

/** Redact the password from a DB connection URL for safe logging. */
function redactDbUrl(url: string): string {
	let out = url;
	try {
		const parsed = new URL(url);
		if (parsed.password) parsed.password = "***";
		for (const key of ["password", "pwd", "pass"]) {
			if (parsed.searchParams.has(key)) parsed.searchParams.set(key, "***");
		}
		out = parsed.toString();
	} catch {
		// Not a URL-parseable string — fall through to the regex.
	}
	out = out.replace(/(:\/\/[^:@/]+:)([^:@/]+)(@)/, "$1***$3");
	return out;
}

function main(): number {
	const url = process.env.DATABASE_URL;
	if (!url) {
		process.stdout.write(
			"[test:pg] DATABASE_URL not set. Skipping real-Postgres run.\n" +
				"[test:pg] The default `npm run test` already exercises the PG driver via pglite.\n" +
				"[test:pg] To run against a real Postgres, export DATABASE_URL and re-run.\n",
		);
		return 0;
	}
	process.stdout.write(`[test:pg] Target: ${redactDbUrl(url)}\n`);
	const result = spawnSync(
		"vitest",
		["run", "--project=framework/db", "--project=packages/server"],
		{
			stdio: "inherit",
			env: process.env,
		},
	);
	return result.status ?? 1;
}

process.exit(main());
