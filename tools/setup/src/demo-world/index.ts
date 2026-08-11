/**
 * AX1 — demo world orchestrator.
 *
 * Seeds the lived-in Acme world in FK-safe order: cast first (everything
 * references users), then knowledge (bets carry provenance FKs into it),
 * then work, conversations, and activity.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { seedActivity } from "./activity.js";
import { seedCast } from "./cast.js";
import { seedConversations } from "./conversations.js";
import { seedKnowledge } from "./knowledge.js";
import type { DemoClock } from "./time.js";
import { seedWork } from "./work.js";

export async function seedDemoWorldContent(db: HyperIdleDb, clock: DemoClock): Promise<void> {
	await seedCast(db, clock);
	await seedKnowledge(db, clock);
	await seedWork(db, clock);
	await seedConversations(db, clock);
	await seedActivity(db, clock);
}
