import * as crypto from "node:crypto";
import { type HyperIdleDb, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";

/**
 * A user's own key: every request that carries it is that user. Only its hash is kept, so the key
 * itself exists only where the user is — a person's computer, or the runner an agent lives in.
 */
export function newUserKey(): string {
	return crypto.randomBytes(32).toString("hex");
}

function hashUserKey(key: string): string {
	return crypto.createHash("sha256").update(key).digest("hex");
}

/** The person or agent whose own key this is. */
export async function findUserByKey(
	db: HyperIdleDb,
	key: string,
): Promise<{ readonly id: string; readonly kind: string } | undefined> {
	if (!key) return undefined;
	const [row] = await db
		.select({ id: users.id, kind: users.kind })
		.from(users)
		.where(eq(users.keyHash, hashUserKey(key)))
		.limit(1);
	return row;
}

export async function findPersonByEmail(
	db: HyperIdleDb,
	email: string,
): Promise<string | undefined> {
	const [row] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, email))
		.limit(1);
	return row?.id;
}

/** Make `key` the user's own key — any older one stops working — and `email` their id when given. */
export async function giveUserKey(
	db: HyperIdleDb,
	userId: string,
	key: string,
	email?: string,
): Promise<void> {
	await db
		.update(users)
		.set({ keyHash: hashUserKey(key), ...(email !== undefined ? { email } : {}) })
		.where(eq(users.id, userId));
}
