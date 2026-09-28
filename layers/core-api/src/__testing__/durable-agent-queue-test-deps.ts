import type { HyperIdleDb } from "@hyperidle/db";

export function queueDeps(db: HyperIdleDb) {
	return { db };
}
