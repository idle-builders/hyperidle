import { spawnSync } from "node:child_process";
import { redactDbUrl } from "@hyperidle/shared";

// @lore Real-Postgres smoke runner. When `DATABASE_URL` is unset we exit 0
// with a message — the pg-migration + pg-connection tests in the default
// `npm run test` already exercise pglite. Set `DATABASE_URL` to spawn a
// vitest run targeted at the db + server projects against a real cluster.
// We do NOT env-mutate the PGlite test path; real-PG integration is opt-in.

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
		["run", "--project=packages/db", "--project=packages/server"],
		{
			stdio: "inherit",
			env: process.env,
		},
	);
	return result.status ?? 1;
}

process.exit(main());
