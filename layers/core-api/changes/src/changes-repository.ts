import {
	type Change,
	changes,
	type HyperIdleDb,
	type NewChange,
	type WriteExecutor,
} from "@hyperidle/db";
import { and, desc, eq, gt, inArray, type SQL } from "drizzle-orm";

// Event log the action mechanism writes to — appended once per touched object in the same transaction.
// before/after carry only the diffed fields (plus id), JSON-encoded by the caller.
export async function appendChange(exec: WriteExecutor, row: NewChange): Promise<Change> {
	const [inserted] = await exec.insert(changes).values(row).returning();
	if (!inserted) {
		throw new Error("appendChange: insert returned no row");
	}
	return inserted;
}

export interface ListChangesFilter {
	readonly object?: string;
	readonly objectId?: string;
	readonly after?: string;
	// `open_user` inbox batch-reads change rows by id.
	readonly ids?: readonly string[];
}

// Newest first; `after` filters to rows recorded strictly after the given ISO timestamp.
export function listChanges(db: HyperIdleDb, filter: ListChangesFilter = {}): Promise<Change[]> {
	if (filter.ids !== undefined && filter.ids.length === 0) return Promise.resolve([]);
	const conds: SQL[] = [];
	if (filter.object !== undefined) conds.push(eq(changes.object, filter.object));
	if (filter.objectId !== undefined) conds.push(eq(changes.objectId, filter.objectId));
	if (filter.after !== undefined) conds.push(gt(changes.at, filter.after));
	if (filter.ids !== undefined) conds.push(inArray(changes.id, Array.from(filter.ids)));
	return db
		.select()
		.from(changes)
		.where(conds.length > 0 ? and(...conds) : undefined)
		.orderBy(desc(changes.at));
}
