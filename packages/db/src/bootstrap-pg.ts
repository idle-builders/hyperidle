import { createPgDb } from "./connection.js";
import { applyFactoryBootstrap } from "./factory-bootstrap.js";

/**
 * Bootstrap CLI for the shared PG backend.
 * Connects via DATABASE_URL, calls applyFactoryBootstrap (idempotent),
 * and exits. Mirrors migrate-pg.ts — run as a second init-container after migrate.
 *
 * @lore AF17: This is the deploy-time factory bootstrap. It is separate from the
 * migrate init-container so bootstrap failures are distinguishable from migration
 * failures (each init-container is its own K8s Init:Error state).
 */
async function main(): Promise<number> {
	const url = process.env.DATABASE_URL;
	if (!url) {
		process.stderr.write("[bootstrap:pg] DATABASE_URL is required.\n");
		return 1;
	}
	const { db, close } = createPgDb({ url });
	try {
		await applyFactoryBootstrap(db);
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
