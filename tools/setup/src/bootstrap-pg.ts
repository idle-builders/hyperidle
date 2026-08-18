import { createPostgresDb } from "@hyperidle/db";
import { seedDemoWorld } from "./demo-fixture.js";
import { runFactoryBootstrap } from "./factory-bootstrap-runner.js";

/**
 * Bootstrap CLI for the shared PG backend.
 * Connects via DATABASE_URL, calls runFactoryBootstrap (idempotent),
 * and exits. Mirrors migrate-pg.ts — run as a second init-container after migrate.
 *
 * @lore AF17: This is the deploy-time factory bootstrap. It is separate from the
 * migrate init-container so bootstrap failures are distinguishable from migration
 * failures (each init-container is its own K8s Init:Error state).
 *
 * @lore AX1: `--demo` (or HYPERIDLE_DEMO=1) additionally seeds the lived-in
 * Acme demo world — opt-in at database creation, never silent. Without the
 * flag this CLI behaves exactly as before (factory rows only).
 */
async function main(): Promise<number> {
	const url = process.env.DATABASE_URL;
	if (!url) {
		process.stderr.write("[bootstrap:pg] DATABASE_URL is required.\n");
		return 1;
	}
	const demo = process.argv.includes("--demo") || process.env.HYPERIDLE_DEMO === "1";
	const { db, close } = createPostgresDb(url);
	try {
		await runFactoryBootstrap(db);
		if (demo) {
			await seedDemoWorld(db);
			process.stdout.write("[bootstrap:pg] Demo world seeded (--demo).\n");
		}
		process.stdout.write("[bootstrap:pg] Factory bootstrap complete.\n");
		return 0;
	} finally {
		await close();
	}
}

main()
	.then((code) => process.exit(code))
	.catch((err: unknown) => {
		process.stderr.write(`[bootstrap:pg] ${(err as Error).message}\n`);
		process.exit(2);
	});
