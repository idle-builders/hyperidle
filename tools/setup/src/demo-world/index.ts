/**
 * Seeds the demo world in foreign-key order: people and agents first
 * (everything references users), then their files and the knowledge tree, the
 * conversations (a task can come from one), the work, its sessions, and last
 * the changes that point at all of it.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { seedActivity } from "./activity.js";
import { seedAgentFiles } from "./agent-files.js";
import { seedApps } from "./apps.js";
import { type DemoWorldPlaces, seedCast } from "./cast.js";
import { seedChanges } from "./changes-seed.js";
import { seedConversations } from "./conversations.js";
import { seedDocuments } from "./documents.js";
import type { DemoClock } from "./time.js";
import { seedWork } from "./work.js";

export async function seedDemoWorldContent(
	db: HyperIdleDb,
	clock: DemoClock,
	places: DemoWorldPlaces,
): Promise<void> {
	await seedCast(db, clock, places);
	await seedAgentFiles(db, clock);
	await seedDocuments(db, clock);
	await seedConversations(db, clock);
	await seedWork(db, clock);
	await seedApps(db, clock);
	await seedActivity(db, clock);
	await seedChanges(db, clock);
}
