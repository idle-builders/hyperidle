import { type Change, changes, type HyperIdleDb, type NewChange, type WriteExecutor } from "@hyperidle/db";
import { type SQL, and, desc, eq, gt } from "drizzle-orm";

/**
 * the event log the action mechanism writes to. Not an audit control,
 * no gate: the record of what happened, appended once per touched object in
 * the SAME transaction as the write (the architecture doc
 * §4). `before`/`after` on `row` carry only the fields that differ (plus
 * `id`), already JSON-encoded by the caller — this Service does not shape
 * the diff, only persists it.
 */
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
}

/** Newest first. `after` filters to rows recorded strictly after the given ISO timestamp. */
export async function listChanges(
	db: HyperIdleDb,
	filter: ListChangesFilter = {},
): Promise<Change[]> {
	const conds: SQL[] = [];
	if (filter.object !== undefined) conds.push(eq(changes.object, filter.object));
	if (filter.objectId !== undefined) conds.push(eq(changes.objectId, filter.objectId));
	if (filter.after !== undefined) conds.push(gt(changes.at, filter.after));
	return db
		.select()
		.from(changes)
		.where(conds.length > 0 ? and(...conds) : undefined)
		.orderBy(desc(changes.at));
}
