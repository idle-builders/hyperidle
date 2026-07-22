/**
 * @deprecated seed() is the legacy monolithic seed function.
 * Use applyFactoryBootstrap() for production environments and
 * seedDemoWorld() for demo/test fixtures.
 *
 * @lore AF17: Seed split. The original seed() inserted both the factory
 * layer (system identities, facilitators, system prompt templates) and the demo world
 * (Acme team, human founder, demo agents, daily-digest trio, builtin routines).
 * These are now separated into applyFactoryBootstrap (factory-bootstrap.ts)
 * and seedDemoWorld (demo-fixture.ts). This wrapper calls both for backward
 * compatibility with tests that have not yet been migrated.
 *
 * The builtin routine loop (BUILTIN_ROUTINE_SEEDS) is intentionally removed
 * from this wrapper — the server's team-creation flow provisions builtins per team.
 * Tests that need builtins should use server fixtures or the AF17 team-routines
 * integration test.
 */

import type { HyperIdleDb } from "./connection.js";
import { seedDemoWorld } from "./demo-fixture.js";
import { applyFactoryBootstrap } from "./factory-bootstrap.js";

export async function seed(db: HyperIdleDb): Promise<void> {
	await applyFactoryBootstrap(db);
	await seedDemoWorld(db);
}
