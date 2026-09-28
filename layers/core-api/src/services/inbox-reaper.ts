// @lore: inbox age check reads `listChanges` (inbox has no own timestamp); delete through `@hyperidle/user` — this Layer never writes another Service table

import { listChanges } from "@hyperidle/changes";
import type { HyperIdleDb } from "@hyperidle/db";
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
