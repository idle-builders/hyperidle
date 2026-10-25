import type { HyperIdleDb } from "@hyperidle/db";
import { findUser, listUsers } from "./user-store.js";

/**
 * Whose services an agent reaches: its owner's, or — for an agent no one owns — the first person's,
 * the one who set the app up.
 */
export async function connectionOwnerFor(db: HyperIdleDb, agentId: string): Promise<string | null> {
	const agent = await findUser(db, { id: agentId });
	if (agent?.ownerUserId) return agent.ownerUserId;
	const [first] = (await listUsers(db, { kind: "human" })).sort(
		(a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
	);
	return first?.id ?? null;
}
