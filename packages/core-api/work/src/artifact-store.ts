/**
 * `artifacts` table accessor — AU19 Increment 4 forcing function.
 *
 * `artifacts` is `work`'s owned table per architecture §4 (never previously
 * had a `TABLE_OWNER` row — `create-artifact.ts`, a tool file, wrote to it
 * directly via `@hyperidle/db`). Moving that tool into the guarded
 * `tool-handlers` nested package surfaces the violation for real; this file
 * is the concrete closure, mirroring every other table-ownership closure in
 * this WP.
 */

import { artifacts, type HyperIdleDb } from "@hyperidle/db";

export interface CreateArtifactInput {
	readonly id: string;
	readonly producingTaskId: string;
	readonly kind: string;
	readonly label: string | null;
	readonly previewJson: string | null;
	readonly createdAt: string;
}

export async function createArtifact(db: HyperIdleDb, input: CreateArtifactInput): Promise<void> {
	await db.insert(artifacts).values(input);
}
