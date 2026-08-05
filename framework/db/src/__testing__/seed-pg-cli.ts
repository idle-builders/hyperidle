import { createPgDb } from "../connection.js";
import { applyFactoryBootstrap } from "../factory-bootstrap.js";

// @lore AF17: seed-pg-cli now calls applyFactoryBootstrap (factory rows only).
// Demo rows are gone from the production seed path.
// For demo mode, use `npm run setup -- --demo` (setup-cli.ts with --demo flag).
// Phase 2 PGlite migration: imports from unified connection.ts.

async function main(): Promise<number> {
	const url = process.env.DATABASE_URL;
	if (!url) {
		process.stderr.write("[seed:pg] DATABASE_URL is required for Postgres seeding.\n");
		return 1;
	}
	const { db, close } = createPgDb({ url });
	try {
		await applyFactoryBootstrap(db);
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
