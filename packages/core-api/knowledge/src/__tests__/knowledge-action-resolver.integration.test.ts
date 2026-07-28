/**
 * AU21 Increment 3, knowledge_action wave (RED) — architecture.md §6 Decision B's
 * placement ruling: "`knowledge_action` → a resolver added to
 * `packages/core-api/knowledge/src/` (paired with `routes/knowledge.ts`)."
 *
 * This resolver must do EXACTLY what `resolveIntentInputInternal`'s
 * "knowledge_action" case does today (`session-requests/src/service.ts:738-756`),
 * reading only `knowledge`'s own tables + the shared `requireRunnableAgent`
 * invariant (`@hyperidle/users`), so the real emit call site
 * (`routes/knowledge.ts`'s `POST /:id/flag`) can bake the full request at emit
 * time instead of leaving it for the drain to resolve later:
 *   1. Strip the `knowledge:` prefix from the intent's `sourceId` to get the
 *      bare item id.
 *   2. Load the item; reject if it does not exist or is archived.
 *   3. Resolve the target agent as the item's own `updatedBy` (NOT the
 *      flagging `agentId` — this matches `resolveIntentInputInternal`'s
 *      current behavior verbatim: the reviewer is whoever last touched the
 *      item, not whoever requested the flag).
 *   4. Validate runnability of that agent via the shared core-api invariant.
 *   5. Bake the request: `defaultAgentId`, `sourceKind: "knowledge"`,
 *      `sourceId` (the full `knowledge:<id>` source id, unchanged),
 *      `streamId: knowledge:<id>`, `sourceCorrelation` (`knowledgeItemId`,
 *      `action: "review"`, optional `scopeId` when the item has one).
 *
 * Currently RED: no `knowledge-action-resolver.ts` module exists anywhere
 * under `packages/core-api/knowledge/src/` (nor from its barrel,
 * `@hyperidle/knowledge`) — this import fails to resolve at runtime.
 *
 * @lore naming: the architecture doc does not pin an exact export name for
 * this new resolver. `resolveKnowledgeActionRequest` is this wave's
 * best-guess interpretation (matching the sibling `resolveAssistantTurnRequest`/
 * `resolveTaskRunRequest` naming convention), flagged for reviewer
 * confirmation — if the implementer picks a different name, only this
 * import line needs to change.
 *
 * @lore Mechanism C: `requireRunnableAgent` (`@hyperidle/users`) is injected
 * via a `deps` 3rd argument, not statically imported — same shape as every
 * sibling resolver (`AssistantTurnResolverDeps`/`SessionStartResolverDeps`/
 * `TaskRunResolverDeps`). Test files live under `__tests__/` (guard-exempt,
 * matching `assistant-turn-resolver.integration.test.ts`'s own precedent), so
 * this file imports the real `requireRunnableAgent` to wire the same
 * dependency the real emit site (`routes/knowledge.ts`) wires in production.
 *
 * @lore CONFUSION (flagged for reviewer): `resolveIntentInputInternal`'s
 * knowledge_action case resolves `defaultAgentId` to `item.updatedBy` —
 * which can be a HUMAN user id (e.g. `updatedBy: "human"`, seeded by the
 * existing `knowledge.au14-round2.integration.test.ts` fixture), not
 * necessarily the flagging `agentId`. Under the OLD drain-time model this
 * never blocked the flag route itself (resolution only ran later, async, at
 * drain — a human `updatedBy` simply failed later with
 * `INVALID_WORK_SOURCE`, silently, at drain). Under resolve-AT-EMIT, calling
 * this resolver synchronously inside the SAME transaction as the flag write
 * (matching every sibling family's established pattern —
 * `bet-decomposition.ts`'s `resolveTaskRunRequest` call is co-located in the
 * task-creation transaction the same way) means a non-runnable `updatedBy`
 * now throws and rolls back the flag transition too — a user-visible
 * behavior change from "flag always succeeds, agent dispatch fails silently
 * later" to "flag itself fails when the item's last editor isn't a runnable
 * AI agent". This resolver is built to the letter of the architecture doc
 * (same validation, moved earlier) with this row seeded as a runnable AI
 * agent in every "happy path" test below, but the reviewer should confirm
 * whether `knowledge.au14-round2.integration.test.ts`'s "WITH agentId" fixture
 * (which seeds `updatedBy: "human"`) needs updating in GREEN phase to keep
 * passing, or whether the emit site needs to catch/tolerate this specific
 * failure instead of propagating it into the flag transaction.
 */

import { type HyperIdleDb, knowledgeItems, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { requireRunnableAgent } from "@hyperidle/users";

async function seedAgent(
	db: HyperIdleDb,
	options: { readonly id: string; readonly kind?: string; readonly status?: string },
): Promise<void> {
	await db.insert(users).values({
		id: options.id,
		kind: options.kind ?? "ai",
		name: "Agent",
		role: "builder",
		status: options.status ?? "active",
		createdAt: new Date().toISOString(),
	});
}

async function seedKnowledgeItem(
	db: HyperIdleDb,
	options: {
		readonly id: string;
		readonly updatedBy: string;
		readonly status?: string;
		readonly scopeId?: string | null;
	},
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(knowledgeItems).values({
		id: options.id,
		scopeKind: options.scopeId ? "team" : "factory",
		scopeId: options.scopeId ?? null,
		title: "Flag me",
		body: "Body content",
		format: "markdown",
		status: options.status ?? "draft",
		version: 1,
		updatedBy: options.updatedBy,
		createdAt: now,
		updatedAt: now,
	});
}

describe("resolveKnowledgeActionRequest — emit-time knowledge_action resolver (knowledge)", () => {
	test("bakes the full request for a valid item, matching resolveIntentInputInternal's shape", async ({
		db,
	}) => {
		const { resolveKnowledgeActionRequest } = await import("../knowledge-action-resolver.js");
		await seedAgent(db, { id: "ast-knowledge-resolver-1" });
		await seedKnowledgeItem(db, {
			id: "item-resolver-1",
			updatedBy: "ast-knowledge-resolver-1",
		});

		const baked = await resolveKnowledgeActionRequest(db, "knowledge:item-resolver-1", {
			requireRunnableAgent,
		});

		expect(baked).toMatchObject({
			defaultAgentId: "ast-knowledge-resolver-1",
			sourceKind: "knowledge",
			sourceId: "knowledge:item-resolver-1",
			streamId: "knowledge:item-resolver-1",
			sourceCorrelation: {
				knowledgeItemId: "item-resolver-1",
				action: "review",
			},
		});
	});

	test("includes scopeId in sourceCorrelation when the item has one", async ({ db }) => {
		const { resolveKnowledgeActionRequest } = await import("../knowledge-action-resolver.js");
		await seedAgent(db, { id: "ast-knowledge-resolver-scope" });
		await seedKnowledgeItem(db, {
			id: "item-resolver-scope",
			updatedBy: "ast-knowledge-resolver-scope",
			scopeId: "team-resolver-scope",
		});

		const baked = await resolveKnowledgeActionRequest(db, "knowledge:item-resolver-scope", {
			requireRunnableAgent,
		});

		expect(baked.sourceCorrelation).toMatchObject({
			knowledgeItemId: "item-resolver-scope",
			action: "review",
			scopeId: "team-resolver-scope",
		});
	});

	test("rejects a knowledge item that does not exist", async ({ db }) => {
		const { resolveKnowledgeActionRequest } = await import("../knowledge-action-resolver.js");

		await expect(
			resolveKnowledgeActionRequest(db, "knowledge:does-not-exist", { requireRunnableAgent }),
		).rejects.toThrow();
	});

	test("rejects an archived knowledge item", async ({ db }) => {
		const { resolveKnowledgeActionRequest } = await import("../knowledge-action-resolver.js");
		await seedAgent(db, { id: "ast-knowledge-resolver-archived" });
		await seedKnowledgeItem(db, {
			id: "item-resolver-archived",
			updatedBy: "ast-knowledge-resolver-archived",
			status: "archived",
		});

		await expect(
			resolveKnowledgeActionRequest(db, "knowledge:item-resolver-archived", {
				requireRunnableAgent,
			}),
		).rejects.toThrow();
	});

	test("rejects when the item's updatedBy is not a runnable AI agent (never trusts a human editor)", async ({
		db,
	}) => {
		const { resolveKnowledgeActionRequest } = await import("../knowledge-action-resolver.js");
		// Deliberately do NOT seed "human-resolver-1" as an AI agent — the
		// resolver must reload the real users row for `item.updatedBy` and
		// reject, never trust that whoever last touched the item is a
		// runnable agent.
		await seedKnowledgeItem(db, {
			id: "item-resolver-unrunnable",
			updatedBy: "human-resolver-1",
		});

		await expect(
			resolveKnowledgeActionRequest(db, "knowledge:item-resolver-unrunnable", {
				requireRunnableAgent,
			}),
		).rejects.toThrow();
	});

	test("rejects when the resolved agent exists but is not runnable (inactive AI agent)", async ({
		db,
	}) => {
		const { resolveKnowledgeActionRequest } = await import("../knowledge-action-resolver.js");
		await seedAgent(db, {
			id: "ast-knowledge-resolver-inactive",
			kind: "ai",
			status: "paused",
		});
		await seedKnowledgeItem(db, {
			id: "item-resolver-inactive-agent",
			updatedBy: "ast-knowledge-resolver-inactive",
		});

		await expect(
			resolveKnowledgeActionRequest(db, "knowledge:item-resolver-inactive-agent", {
				requireRunnableAgent,
			}),
		).rejects.toThrow();
	});
});
