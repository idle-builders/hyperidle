// Post-`drizzle-kit generate` step: strip the `"public".` schema qualifier that
// drizzle-kit emits in FK references, keeping migrations schema-neutral so they
// resolve through search_path. HyperIdle never uses the public schema — on the
// cluster it lives in a tenant schema, on the laptop in PGlite's default. The
// runtime is already schema-neutral; only generated DDL hardcodes public.
// See framework/db/src/migrate-pg.ts.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../drizzle", import.meta.url));
let changed = 0;
for (const file of readdirSync(dir)) {
	if (!file.endsWith(".sql")) continue;
	const path = `${dir}/${file}`;
	const before = readFileSync(path, "utf-8");
	const after = before.replaceAll('"public".', "");
	if (after !== before) {
		writeFileSync(path, after);
		changed++;
	}
}
process.stdout.write(`strip-public-schema: cleaned ${changed} migration file(s)\n`);
