import { createPgDb } from "./pg-connection.js";
import { seedPg } from "./seed-pg.js";

// @lore Postgres seed CLI. Delegates to `seedPg(db)` (see seed-pg.ts), which
// produces the same logical fixture set as the SQLite `seed()`. Boolean
// columns are PG-native (true/false) — see I3 / TRACK-I.md L161-164.

async function main(): Promise<number> {
	const url = process.env.DATABASE_URL;
	if (!url) {
		process.stderr.write("[seed:pg] DATABASE_URL is required for Postgres seeding.\n");
		return 1;
	}
	const { db, close } = createPgDb({ url });
	try {
		await seedPg(db);
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
