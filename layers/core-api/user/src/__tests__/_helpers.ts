/**
 * Shared setup for the user module's `edit_user`/`open_user`/`search_users`
 * integration tests — the real document actions this module's own tests wire
 * standalone (the one genuinely external crossing user-actions has), plus a
 * founder seed every suite needs.
 */
import { changes, type HyperIdleDb, teams, users, type WriteExecutor } from "@hyperidle/db";
import { createDocumentActions, type DocumentActionsDeps } from "@hyperidle/document";
import type { ActionResult } from "@hyperidle/domain-model";
import { eq } from "drizzle-orm";
import type { Action, ActionContext } from "../action-types.js";
import { getSubscription } from "../subscriptions-store.js";

export const NOW = "2026-01-01T00:00:00.000Z";

export async function seedFounder(db: HyperIdleDb, id = "u-founder"): Promise<void> {
	await db
		.insert(users)
		.values({
			id,
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: NOW,
		})
		.onConflictDoNothing();
}

/** The real document actions, wired with raw-drizzle deps — the same
 * standalone shape `compose.ts`'s `buildStandaloneDocumentActions` and
 * `platform-actions.integration.test.ts`'s own fixture use. */
export function realDocumentActions(): readonly Action[] {
	const deps: DocumentActionsDeps = {
		changes: {
			appendChange: async (exec: WriteExecutor, row) => {
				await exec.insert(changes).values(row);
			},
		},
		users: {
			getUserById: async (exec, id) => {
				const [row] = await exec.select().from(users).where(eq(users.id, id)).limit(1);
				return row;
			},
			listOwnedBy: async (exec, ownerId) =>
				exec.select().from(users).where(eq(users.ownerUserId, ownerId)),
		},
		org: {
			getTeam: async (exec, q) => {
				const [row] = await exec.select().from(teams).where(eq(teams.id, q.id)).limit(1);
				return row;
			},
		},
		openParent: () => {
			throw new Error("user-actions test: openParent is unreachable");
		},
		systemParentExists: async (exec, kind, id) => {
			if (kind === "agent") {
				const [row] = await exec
					.select({ id: users.id })
					.from(users)
					.where(eq(users.id, id))
					.limit(1);
				return row !== undefined;
			}
			if (kind === "subscription")
				return (await getSubscription(exec as HyperIdleDb, id)) !== undefined;
			return false;
		},
		onBodyChanged: async () => undefined,
	};
	return createDocumentActions(deps) as readonly Action[];
}

export function runnerFor<I, O>(
	actions: readonly Action[],
	name: string,
): (ctx: ActionContext, input: I) => Promise<ActionResult<O>> {
	const found = actions.find((a) => a.declaration.name === name);
	if (!found) throw new Error(`no "${name}" action in the bag`);
	return found.run as never;
}
