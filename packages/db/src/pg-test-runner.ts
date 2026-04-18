/**
 * H4 AC3: `bun run test:pg` runner.
 *
 * Intent: run the full server test suite with the Postgres driver.
 * Implementation: dispatch to vitest against the whole monorepo, but
 * gate the run on a real `DATABASE_URL`. When unset, we exit 0 with a
 * message — the pg-migration + pg-connection tests in the default
 * `bun run test` already exercise pglite, so this script is reserved for
 * real-Postgres smoke verification (CI or operator-run).
 *
 * @lore We do NOT swap the driver at test time by env-mutating Drizzle
 * imports; that path would require every test to re-author createTestDb()
 * usage. Instead the default suite uses SQLite (createTestDb) + pglite
 * (createPgTestDb); real Postgres is opt-in for operator smoke.
 */

import { spawnSync } from "node:child_process";

function main(): number {
	const url = process.env.DATABASE_URL;
	if (!url) {
		process.stdout.write(
			"[test:pg] DATABASE_URL not set. Skipping real-Postgres run.\n" +
				"[test:pg] The default `bun run test` already exercises the PG driver via pglite.\n" +
				"[test:pg] To run against a real Postgres, export DATABASE_URL and re-run.\n",
		);
		return 0;
	}
	process.stdout.write(`[test:pg] Target: ${redact(url)}\n`);
	const result = spawnSync(
		"vitest",
		["run", "--project=packages/db", "--project=packages/server"],
		{
			stdio: "inherit",
			env: { ...process.env, HYPERIDLE_DB_DRIVER: "postgres" },
		},
	);
	return result.status ?? 1;
}

function redact(url: string): string {
	return url.replace(/(:)([^:@/]+)(@)/, "$1***$3");
}

process.exit(main());
