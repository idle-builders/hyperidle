/**
 * @lore BC5 T7b: the retention sweep's replacement for `@hyperidle/notifications`'
 * deleted `reap(db, cutoff)` — same rule (a *read* row older than `cutoff` is
 * deleted), moved onto the subscription mechanism's own `inbox` table.
 *
 * `inbox` carries no timestamp of its own (a pointer at a `changes` row); the
 * age check reads `@hyperidle/changes`' own `listChanges` instead of this
 * layer reaching into the `changes` table directly. The delete itself stays
 * behind `@hyperidle/user`'s own store — this Layer never writes another
 * Service's table.
 */
import type { HyperIdleDb } from "@hyperidle/db";
import { listChanges } from "@hyperidle/changes";
import { deleteReapableInboxRows, listReadInboxChangeIds } from "@hyperidle/user";

/** Deletes every read inbox row whose change is older than `cutoff`. Returns the count deleted. */
export async function reapInbox(db: HyperIdleDb, cutoff: string): Promise<number> {
	const changeIds = await listReadInboxChangeIds(db);
	if (changeIds.length === 0) return 0;
	const changeRows = await listChanges(db, { ids: changeIds });
	const staleIds = changeRows.filter((c) => c.at < cutoff).map((c) => c.id);
	if (staleIds.length === 0) return 0;
	return deleteReapableInboxRows(db, staleIds);
}
