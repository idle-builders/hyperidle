/**
 * H4: Seed a Postgres DB specified by DATABASE_URL (vps/cloud profiles).
 *
 * The SQLite seed in `seed.ts` targets the SQLite schema. For the pg case
 * we call the equivalent inserts against the pg schema using Drizzle's
 * cross-driver query API. Keeping this as a thin standalone script
 * avoids pulling pg-specific code into `seed.ts` (which must stay
 * dialect-agnostic from the caller's point of view).
 *
 * Currently a minimal smoke seed — expands over time as needed. AC4
 * (config-only swap) is validated by the existing pg-schema parity test
 * and the pg-migration test; production seeds typically happen via a
 * migration-authored data file rather than a runtime seed.
 */

import { createPgDb } from "./pg-connection.js";
import { factorySettings, products } from "./schema.pg.js";

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
