import { createPostgresDb } from "@hyperidle/db";
import { runFactoryBootstrap } from "./factory-bootstrap-runner.js";

// @lore AF17: seed-pg-cli now calls runFactoryBootstrap (factory rows only).
// Demo rows are gone from the production seed path.
// For demo mode, use `npm run setup -- --demo` (setup-cli.ts with --demo flag).
// Phase 2 PGlite migration: imports from unified connection.ts.
// @lore AU29: file left `framework/db/src/__testing__/` for `tools/setup/src/`
// (no `__testing__` subfolder needed here) — `tools/*` sits outside the
// shipping roots (layers/ · framework/ · applications/), so every file under
// `tools/setup` is development world by that rule alone, the same status
// this file already had inside `__testing__/`.

async function main(): Promise<number> {
	const url = process.env.DATABASE_URL;
	if (!url) {
		process.stderr.write("[seed:pg] DATABASE_URL is required for Postgres seeding.\n");
		return 1;
	}
	const { db, close } = createPostgresDb(url);
	try {
		await runFactoryBootstrap(db);
		process.stdout.write("[seed:pg] Factory bootstrap complete.\n");
		return 0;
	} finally {
		await close();
	}
}

main()
	.then((code) => process.exit(code))
	.catch((err: unknown) => {
		process.stderr.write(`[seed:pg] ${(err as Error).message}\n`);
		process.exit(2);
	});
