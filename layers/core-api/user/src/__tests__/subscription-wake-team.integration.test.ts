/**
 * An agent's context bundle carries its own team's team-scoped documents and
 * no other team's, though every person may read them all. The agent's team is
 * the one `edit_user` put it in; the bundle is the real `assembleSessionDocuments`.
 */
import { changes, documents, type HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { assembleSessionDocuments } from "@hyperidle/document";
import type { EditUserInput, UserView } from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import type { ActionContext } from "../action-types.js";
import { resolveSubscriptionWakeRequest } from "../subscription-wake.js";
import { createUserActions, type UserActionsDeps } from "../user-actions.js";
import { NOW, realDocumentActions, runnerFor, seedFounder } from "./_helpers.js";

function ctxFor(db: HyperIdleDb, actor: string): ActionContext {
	return { actor, db, eventBus: new EventBus(), now: NOW };
}

function deps(): UserActionsDeps {
	const documentActions = realDocumentActions();
	return {
		changes: {
			appendChange: async (exec, row) => {
				const [inserted] = await (exec as HyperIdleDb).insert(changes).values(row).returning();
				if (!inserted) throw new Error("appendChange: insert returned no row");
				return inserted;
			},
			listByIds: async () => [],
		},
		runConfig: {
			read: async () => ({
				harnessType: null,
				modelId: null,
				modelProvider: null,
				maxConcurrentSessions: 1,
				modelOptions: {},
			}),
			write: async () => {},
		},
		folders: {
			list: async () => [],
			add: async () => ({ ok: false, code: "TEAM_NOT_FOUND" }) as const,
			remove: async () => ({ ok: false, code: "NOT_FOUND" }) as const,
			give: async () => ({ ok: false, code: "NOT_FOUND" }) as const,
			take: async () => ({ ok: false, code: "NOT_FOUND" }) as const,
		},
		connections: {
			list: async () => ({ connections: [], inherited: [] }),
			add: async () => ({ ok: false, code: "MISSING_ROOT_SECRET" }) as const,
			remove: async () => ({ ok: false, code: "NOT_FOUND" }) as const,
			withhold: async () => ({ ok: false, code: "NOT_FOUND" }) as const,
		},
		searchDocuments: runnerFor(documentActions, "search_documents"),
		editDocument: runnerFor(documentActions, "edit_document"),
	};
}

async function teamDocument(db: HyperIdleDb, id: string, teamId: string): Promise<void> {
	await db.insert(documents).values({
		id,
		title: id,
		body: "pricing notes",
		format: "markdown",
		status: "active",
		slot: "ordinary",
		scopeKind: "team",
		scopeId: teamId,
		position: 0,
		updatedBy: "u-founder",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

describe("an agent's context bundle — its own team only", () => {
	test("an agent in Product gets Product's team document, never Support's", async ({ db }) => {
		await seedFounder(db);
		const editUser = runnerFor<EditUserInput, UserView>(createUserActions(deps()), "edit_user");
		const founder = await editUser(ctxFor(db, "u-founder"), {
			id: "u-founder",
			teams: ["Product", "Support"],
		});
		if (!founder.ok) throw new Error(JSON.stringify(founder.problems));
		const teamId = (name: string): string =>
			founder.data.user?.teams.find((t) => t.name === name)?.id as string;

		const agent = await editUser(ctxFor(db, "u-founder"), {
			kind: "ai",
			name: "Builder",
			ownerUserId: "u-founder",
			teams: ["Product"],
		});
		if (!agent.ok) throw new Error(JSON.stringify(agent.problems));
		const agentId = agent.data.user?.id as string;

		await teamDocument(db, "doc-product", teamId("Product"));
		await teamDocument(db, "doc-support", teamId("Support"));

		const baked = await resolveSubscriptionWakeRequest(
			ctxFor(db, "u-founder"),
			{
				subscription: { id: "sub-1", event: "task.changed", schedule: null },
				agentId,
				change: null,
				sourceId: "sub-1:now",
			},
			{ searchDocuments: deps().searchDocuments, assembleSessionDocuments },
		);

		const bundle = baked.contextBundle;
		if (bundle?.kind !== "subscription") throw new Error("no subscription bundle baked");
		const ids = bundle.documents.map((d) => d.id);
		expect(ids).toContain("doc-product");
		expect(ids).not.toContain("doc-support");
		expect(bundle.team?.name).toBe("Product");
	});
});
