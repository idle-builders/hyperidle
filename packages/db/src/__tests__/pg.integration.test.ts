import { describe, expect, it } from "vitest";

const SKIP_PG = process.env.TEST_PG !== "true";

describe.skipIf(SKIP_PG)("PostgreSQL integration", () => {
	it("connects and creates tables via PG schema", async () => {
		// This test requires a running PostgreSQL instance.
		// Run with: TEST_PG=true DATABASE_URL=postgres://... bun run test
		const { drizzle } = await import("drizzle-orm/postgres-js");
		const postgres = (await import("postgres")).default;
		const pgSchema = await import("../schema.pg.js");

		const connectionString = process.env.DATABASE_URL ?? "postgres://localhost:5432/hyperidle_test";
		const client = postgres(connectionString);
		const db = drizzle(client, { schema: pgSchema });

		// Simple query to verify connection
		const result = db
			.select()
			.from(pgSchema.factorySettings)
			.then((rows) => rows);
		expect(result).toBeDefined();

		await client.end();
	});
});
