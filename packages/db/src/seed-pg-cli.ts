import { createPgDb } from "./connection.js";
import { seed } from "./seed.js";

// @lore Postgres seed CLI. Delegates to `seed(db)` (see seed.ts), which
// produces the PG fixture set. Boolean columns are PG-native (true/false).
// Phase 2: imports from unified seed.ts + connection.ts.

async function main(): Promise<number> {
	const url = process.env.DATABASE_URL;
	if (!url) {
		process.stderr.write("[seed:pg] DATABASE_URL is required for Postgres seeding.\n");
		return 1;
	}
	const { db, close } = createPgDb({ url });
	try {
		await seed(db);
		process.stdout.write("[seed:pg] Seed complete.\n");
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
