import { createPgDb } from "./pg-connection.js";
import { factorySettings, products } from "./schema.pg.js";

// @lore Minimal smoke seed against the PG schema — expands over time. The
// SQLite `seed()` still targets better-sqlite3 via sync `.run()`; reusing
// it against the async postgres-js driver requires a follow-up story to
// convert the 800+ server call sites to async. Documented in
// docs/DEPLOYMENT.md § "Switching SQLite → Postgres".

async function main(): Promise<number> {
	const url = process.env.DATABASE_URL;
	if (!url) {
		process.stderr.write("[seed:pg] DATABASE_URL is required for Postgres seeding.\n");
		return 1;
	}
	const { db, close } = createPgDb({ url });
	try {
		const now = new Date().toISOString();
		await db
			.insert(products)
			.values({
				id: "seed-product-1",
				name: "Nimmly",
				phase: "build",
				createdAt: now,
			})
			.onConflictDoNothing();

		await db
			.insert(factorySettings)
			.values({ key: "cost_cap", value: "20000", updatedAt: now })
			.onConflictDoNothing();

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
