import * as crypto from "node:crypto";
import { type HyperIdleDb, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";

/**
 * A person's own key: every request that carries it is that person. Only its hash is kept, so the
 * key itself exists only on the person's computer.
 */
export function newPersonKey(): string {
	return crypto.randomBytes(32).toString("hex");
}

function hashPersonKey(key: string): string {
	return crypto.createHash("sha256").update(key).digest("hex");
}

/** The person whose own key this is. */
export async function findPersonByKey(db: HyperIdleDb, key: string): Promise<string | undefined> {
	if (!key) return undefined;
	const [row] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.keyHash, hashPersonKey(key)))
		.limit(1);
	return row?.id;
}

export async function isEmailTaken(db: HyperIdleDb, email: string): Promise<boolean> {
	const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
	return row !== undefined;
}

/** Make `key` the person's own key, and `email` their id when given. */
export async function givePersonKey(
	db: HyperIdleDb,
	userId: string,
	key: string,
	email?: string,
): Promise<void> {
	await db
		.update(users)
		.set({ keyHash: hashPersonKey(key), ...(email !== undefined ? { email } : {}) })
		.where(eq(users.id, userId));
}
