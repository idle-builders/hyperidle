import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./src/schema.pg.ts",
	out: "./drizzle-pg",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL ?? "postgres://localhost:5432/hyperidle",
	},
});
