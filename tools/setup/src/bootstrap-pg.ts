import { createPostgresDb } from "@hyperidle/db";
import { seedDemoWorld } from "./demo-fixture.js";
import { runFactoryBootstrap } from "./factory-bootstrap-runner.js";

/**
 * Demo-seed CLI for the shared PG backend.
 * Connects via DATABASE_URL and seeds the Acme demo world when --demo or
 * HYPERIDLE_DEMO=1 is set. Without the flag this is a no-op.
 *
 * The server runs applyFactoryCoreState on every boot, so factory rows no
 * longer need a separate bootstrap step. This script exists solely for the
 * demo-world seed path.
 *
 * @lore AX1: `--demo` (or HYPERIDLE_DEMO=1) seeds the lived-in Acme demo
 * world — opt-in at database creation, never silent.
 */
async function main(): Promise<number> {
	const url = process.env.DATABASE_URL;
	if (!url) {
		process.stderr.write("[bootstrap:pg] DATABASE_URL is required.\n");
		return 1;
	}
	const demo = process.argv.includes("--demo") || process.env.HYPERIDLE_DEMO === "1";
	if (!demo) {
		process.stdout.write("[bootstrap:pg] Nothing to do (pass --demo to seed the demo world).\n");
		return 0;
	}
	const { db, close } = createPostgresDb(url);
	try {
		// Ensure factory state is present before seeding demo rows.
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);
		process.stdout.write("[bootstrap:pg] Demo world seeded (--demo).\n");
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
