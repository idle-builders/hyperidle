/**
 * The document module's seam test — architecture.md §15.2, "the parity
 * contract". Every case is proven against the real `{ db, app, eventBus }`
 * fixture, driven once as a human over `POST /api/actions/<name>` (the
 * "human door") and once as an agent through the action tools
 * `actionsAsTools` builds (the "agent door") — the same two doors
 * `thread-actions.integration.test.ts`/`task-actions.integration.test.ts`
 * exercise, generalised here to run every case through both rather than
 * defaulting to the HTTP door and spot-checking the MCP one.
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import { listChanges } from "@hyperidle/changes";
import {
	documents,
	type HyperIdleDb,
	pluginContributions,
	plugins,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { DocumentRow, DocumentView, SearchDocumentsInput } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import {
	type AgentIdentityDeps,
	createAgentIdentityPort,
	insertSubscription,
} from "@hyperidle/user";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import type { Action, ActionContext } from "../actions/action.js";
import { actionsAsTools } from "../actions/actions-as-tools.js";
import { buildCoreActions } from "../actions/compose.js";

const TEST_API_KEY = "test-key-document-actions";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

/** The agent actor-override header the seam already uses (thread/task tests). */
function actorHeaders(actorId: string): Record<string, string> {
	return authHeaders({ "x-hyperidle-actor-id": actorId });
}

interface ActionEnvelope<T> {
	readonly ok: boolean;
	readonly data?: T;
	readonly problems?: ReadonlyArray<{
		readonly code: string;
		readonly message: string;
		readonly path?: string;
	}>;
}

/** Uniform across both doors — the HTTP envelope carries every problem,
 * the MCP `ToolResult` only its first (`actions-as-tools.ts`); comparing on
 * `problemCode` (first problem's code) is therefore the honest parity
 * surface, exactly as architecture.md §15.2's cases assert. */
interface DoorResult<T> {
	readonly ok: boolean;
	readonly data?: T;
	readonly problemCode?: string;
}

async function callHuman<T>(
	app: { request: (path: string, init: RequestInit) => Response | Promise<Response> },
	name: string,
	body: Record<string, unknown>,
	headers: Record<string, string> = authHeaders(),
): Promise<DoorResult<T>> {
	const res = await app.request(`/api/actions/${name}`, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
	const envelope = (await res.json()) as ActionEnvelope<T>;
	return { ok: envelope.ok, data: envelope.data, problemCode: envelope.problems?.[0]?.code };
}

interface AgentIdentity {
	readonly agentId: string;
	readonly sessionId: string;
	readonly taskId?: string;
	readonly threadId?: string;
	readonly teamId?: string;
}

/** The agent door — through `actionsAsTools`, the only production code that
 * fills `ctx.caller` (architecture.md §8.4). */
async function callAgent<T>(
	actions: readonly Action[],
	db: HyperIdleDb,
	eventBus: EventBus,
	name: string,
	body: Record<string, unknown>,
	agent: AgentIdentity,
): Promise<DoorResult<T>> {
	const tools = actionsAsTools(actions);
	const tool = tools.find((t) => t.name === name);
	if (!tool) throw new Error(`no "${name}" tool`);
	const result = await tool.handler(body, {
		db,
		eventBus,
		agentId: agent.agentId,
		sessionId: agent.sessionId,
		taskId: agent.taskId ?? "",
		threadId: agent.threadId,
		teamId: agent.teamId,
	} as Parameters<typeof tool.handler>[1]);
	return result.success
		? { ok: true, data: result.data as T }
		: { ok: false, problemCode: result.code };
}

/**
 * The internal-caller path — review finding: only a system-initiated call
 * (the subscription internal path, the agent identity helper, the plugin
 * installer) may name an `agent`/`subscription` parent through
 * `edit_document`. Neither client door (`callHuman`/`callAgent`) can reach
 * it any more; this simulates the same in-process binding those composition
 * roots use by hand-setting `ctx.internal` before calling the action's `run`
 * directly.
 */
async function callInternal<T>(
	actions: readonly Action[],
	db: HyperIdleDb,
	eventBus: EventBus,
	name: string,
	body: Record<string, unknown>,
	actor: string,
): Promise<DoorResult<T>> {
	const action = actions.find((a) => a.declaration.name === name);
	if (!action) throw new Error(`no "${name}" action`);
	const ctx: ActionContext = { actor, db, eventBus, now: new Date().toISOString(), internal: true };
	const result = await action.run(ctx, body);
	return result.ok
		? { ok: true, data: result.data as T }
		: { ok: false, problemCode: result.problems[0]?.code };
}

function buildRealActions(agentOrchestration: AgentOrchestrationPort): readonly Action[] {
	return buildCoreActions({
		agentOrchestration,
		agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
		reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
	});
}

// ---------------------------------------------------------------------------
// Seeding — the same shapes thread/task's own seam tests use.
// ---------------------------------------------------------------------------

const FOUNDER_ID = "u-founder";

async function seedTeam(db: HyperIdleDb, teamId: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: teamId, name: teamId, createdAt: now });
	await db
		.insert(users)
		.values([
			{
				id: FOUNDER_ID,
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				createdAt: now,
			},
			{
				id: "system:propagation",
				name: "Propagation System",
				role: "system",
				status: "active",
				createdAt: now,
			},
		])
		.onConflictDoNothing();
}

async function seedHuman(db: HyperIdleDb, id: string, teamId?: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values({
		id,
		kind: "human",
		name: id,
		role: "member",
		status: "active",
		...(teamId ? { teamId } : {}),
		createdAt: now,
	});
}

async function seedAgent(
	db: HyperIdleDb,
	agentId: string,
	opts?: { teamId?: string; ownerUserId?: string },
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: agentId,
		role: "builder",
		status: "active",
		...(opts?.teamId ? { teamId: opts.teamId } : {}),
		...(opts?.ownerUserId ? { ownerUserId: opts.ownerUserId } : {}),
		createdAt: now,
	});
}

async function seedThreadRow(db: HyperIdleDb, id: string, teamId: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(threads).values({
		id,
		hostKind: "team",
		hostId: teamId,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
}

/** A real task with a real thread — `edit_document`'s `openParent` port
 * dials the real `open_task` runner, so the task must genuinely exist. */
async function seedTaskWithThread(db: HyperIdleDb, taskId: string, teamId: string): Promise<void> {
	const now = new Date().toISOString();
	const threadId = `thr-${taskId}`;
	await seedThreadRow(db, threadId, teamId);
	await db.insert(tasks).values({
		id: taskId,
		parentTaskId: null,
		teamId,
		title: taskId,
		state: "in_progress",
		threadId,
		createdAt: now,
		updatedAt: now,
	});
}

/** A real subscription row — `edit_document`'s internal path checks a named
 * `subscription` parent actually exists (`deps.systemParentExists`). */
async function seedSubscription(db: HyperIdleDb, id: string, userId: string): Promise<void> {
	const now = new Date().toISOString();
	await insertSubscription(db, {
		id,
		userId,
		event: "task.changed",
		paused: false,
		createdAt: now,
		updatedAt: now,
	});
}

async function seedPluginContribution(db: HyperIdleDb, documentId: string): Promise<void> {
	const now = new Date().toISOString();
	const pluginId = `plg-${documentId}`;
	await db.insert(plugins).values({
		id: pluginId,
		name: pluginId,
		version: "1.0.0",
		state: "enabled",
		scopeKind: "factory",
		installedAt: now,
		updatedAt: now,
	});
	await db.insert(pluginContributions).values({
		id: `pc-${documentId}`,
		pluginId,
		kind: "document",
		entityId: documentId,
		createdAt: now,
	});
}

/** A direct read of the stored row, bypassing the visibility predicate —
 * for cascade assertions (architecture.md §6.6 rule 7: "no visibility filter
 * on the walk"), a narrowed child can be a row the *asserting* actor cannot
 * open through the door, and the test must still see the true stored state. */
async function readDocumentRow(db: HyperIdleDb, id: string): Promise<DocumentRow> {
	const [row] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
	if (!row) throw new Error(`document ${id} not found`);
	return row as unknown as DocumentRow;
}

async function readContributionDetachedAt(
	db: HyperIdleDb,
	documentId: string,
): Promise<string | null> {
	const [row] = await db
		.select({ detachedAt: pluginContributions.detachedAt })
		.from(pluginContributions)
		.where(eq(pluginContributions.entityId, documentId));
	return row?.detachedAt ?? null;
}

// ---------------------------------------------------------------------------
// Door binders — one call site per case builds these once, then drives every
// action through both.
// ---------------------------------------------------------------------------

interface Doors {
	readonly edit: (
		body: Record<string, unknown>,
		humanHeaders?: Record<string, string>,
		agentOverride?: Partial<AgentIdentity>,
	) => Promise<{
		readonly human: DoorResult<DocumentView>;
		readonly agent: DoorResult<DocumentView>;
	}>;
	readonly open: (
		body: Record<string, unknown>,
		humanHeaders?: Record<string, string>,
		agentOverride?: Partial<AgentIdentity>,
	) => Promise<{
		readonly human: DoorResult<DocumentView>;
		readonly agent: DoorResult<DocumentView>;
	}>;
	readonly search: (
		body: Record<string, unknown>,
		humanHeaders?: Record<string, string>,
		agentOverride?: Partial<AgentIdentity>,
	) => Promise<{
		readonly human: DoorResult<DocumentRow[]>;
		readonly agent: DoorResult<DocumentRow[]>;
	}>;
}

function buildDoors(
	app: { request: (path: string, init: RequestInit) => Response | Promise<Response> },
	actions: readonly Action[],
	db: HyperIdleDb,
	eventBus: EventBus,
	defaultAgent: AgentIdentity,
): Doors {
	async function both<T>(
		name: string,
		body: Record<string, unknown>,
		humanHeaders: Record<string, string>,
		agentOverride?: Partial<AgentIdentity>,
	): Promise<{ readonly human: DoorResult<T>; readonly agent: DoorResult<T> }> {
		const human = await callHuman<T>(app, name, body, humanHeaders);
		const agent = await callAgent<T>(actions, db, eventBus, name, body, {
			...defaultAgent,
			...agentOverride,
		});
		return { human, agent };
	}
	return {
		edit: (body, humanHeaders = authHeaders(), agentOverride) =>
			both<DocumentView>("edit_document", body, humanHeaders, agentOverride),
		open: (body, humanHeaders = authHeaders(), agentOverride) =>
			both<DocumentView>("open_document", body, humanHeaders, agentOverride),
		search: (body, humanHeaders = authHeaders(), agentOverride) =>
			both<DocumentRow[]>("search_documents", body, humanHeaders, agentOverride),
	};
}

function requireDoc(result: DoorResult<DocumentView>): DocumentView {
	if (!(result.ok && result.data))
		throw new Error(`expected ok:true, got ${JSON.stringify(result)}`);
	return result.data;
}

// ---------------------------------------------------------------------------
// Case 1 — create, open, every field.
// ---------------------------------------------------------------------------

describe("case 1 — create a document, read it back with open_document, every field", () => {
	test("both doors: created row and reopened view agree on every field", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c1");
		await seedAgent(db, "c1-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c1-agent",
			sessionId: "c1-sess",
		});

		const { human, agent } = await doors.edit({
			title: "Case 1",
			body: "hello",
			format: "markdown",
		});
		const humanDoc = requireDoc(human).document;
		const agentDoc = requireDoc(agent).document;

		// `position` is a root-level sequence shared by every document with no
		// parent, not a per-actor counter — the human door's create runs first
		// (`buildDoors`'s `both()`), so it claims 0 and the agent's claims 1.
		for (const [doc, actor, position] of [
			[humanDoc, FOUNDER_ID, 0],
			[agentDoc, "c1-agent", 1],
		] as const) {
			expect(doc.title).toBe("Case 1");
			expect(doc.body).toBe("hello");
			expect(doc.format).toBe("markdown");
			expect(doc.status).toBe("proposed");
			expect(doc.slot).toBe("ordinary");
			expect(doc.scopeKind).toBe("factory");
			expect(doc.scopeId).toBeNull();
			expect(doc.parentKind).toBeNull();
			expect(doc.parentId).toBeNull();
			expect(doc.position).toBe(position);
			expect(doc.version).toBe(1);
			expect(doc.updatedBy).toBe(actor);
			expect(doc.readCount).toBe(0);
			expect(doc.lastReadAt).toBeNull();
			expect(doc.sessionUseCount).toBe(0);
			expect(doc.lastUsedAt).toBeNull();
			expect(doc.as).toBe("document");
		}

		const humanOpen = await callHuman<DocumentView>(app, "open_document", { id: humanDoc.id });
		expect(requireDoc(humanOpen).document.readCount).toBe(1);
		expect(requireDoc(humanOpen).document.title).toBe("Case 1");
		expect(requireDoc(humanOpen).scopeName).toBe("Factory");

		const agentOpen = await callAgent<DocumentView>(
			actions,
			db,
			eventBus,
			"open_document",
			{ id: agentDoc.id },
			{ agentId: "c1-agent", sessionId: "c1-sess" },
		);
		expect(requireDoc(agentOpen).document.readCount).toBe(1);
		expect(requireDoc(agentOpen).document.title).toBe("Case 1");
	});
});

// ---------------------------------------------------------------------------
// Case 2 — as:"memory".
// ---------------------------------------------------------------------------

describe('case 2 — create as:"memory"', () => {
	test("scopeKind is user, scopeId is the actor, parentKind is null — both doors", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c2");
		await seedAgent(db, "c2-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c2-agent",
			sessionId: "c2-sess",
		});

		const { human, agent } = await doors.edit({ title: "My note", as: "memory" });
		const humanDoc = requireDoc(human).document;
		const agentDoc = requireDoc(agent).document;
		expect(humanDoc.scopeKind).toBe("user");
		expect(humanDoc.scopeId).toBe(FOUNDER_ID);
		expect(humanDoc.parentKind).toBeNull();
		expect(agentDoc.scopeKind).toBe("user");
		expect(agentDoc.scopeId).toBe("c2-agent");
		expect(agentDoc.parentKind).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Case 2b — a `user`-scoped document WITH a parent is a private document, not
// a memory (gate-walk finding, founder decision): it may be widened to team
// and narrowed back like any tree document, and a genuine memory's scope
// stays refused, explicit `as:"memory"` or not.
// ---------------------------------------------------------------------------

describe("case 2b — a user-scoped document IN the tree is a private document, not a memory", () => {
	test('widening it to team is a real scope change — as:"document", not forced back, no forcing no-op', async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c2b");
		await seedAgent(db, "c2b-agent");
		const actions = buildRealActions(agentOrchestration);
		const agentIdentity: AgentIdentity = { agentId: "c2b-agent", sessionId: "c2b-sess" };

		const folder = requireDoc(
			await callHuman<DocumentView>(app, "edit_document", {
				title: "Folder",
				scopeKind: "factory",
			}),
		).document;

		const humanNote = requireDoc(
			await callHuman<DocumentView>(app, "edit_document", {
				title: "This quarter's focus",
				scopeKind: "user",
				parent: { kind: "document", id: folder.id },
			}),
		).document;
		expect(humanNote.as).toBe("document");

		const agentNote = requireDoc(
			await callAgent<DocumentView>(
				actions,
				db,
				eventBus,
				"edit_document",
				{
					title: "Agent's own private note in the tree",
					scopeKind: "user",
					parent: { kind: "document", id: folder.id },
				},
				agentIdentity,
			),
		).document;
		expect(agentNote.as).toBe("document");

		// Each door widens the note it can actually see — the human owns
		// `humanNote` (scopeId FOUNDER_ID), the agent owns `agentNote`
		// (scopeId "c2b-agent").
		const humanWidened = await callHuman<DocumentView>(app, "edit_document", {
			id: humanNote.id,
			version: humanNote.version,
			scopeKind: "team",
			scopeId: "c2b",
		});
		expect(humanWidened.ok).toBe(true);
		const humanWidenedDoc = requireDoc(humanWidened).document;
		expect(humanWidenedDoc.scopeKind).toBe("team");
		expect(humanWidenedDoc.scopeId).toBe("c2b");
		expect(humanWidenedDoc.as).toBe("document");
		// A real change — never a forced no-op: version actually advanced by
		// exactly one, and the stored row agrees.
		expect(humanWidenedDoc.version).toBe(humanNote.version + 1);
		const humanRow = await readDocumentRow(db, humanNote.id);
		expect(humanRow.scopeKind).toBe("team");
		expect(humanRow.scopeId).toBe("c2b");

		const agentWidened = await callAgent<DocumentView>(
			actions,
			db,
			eventBus,
			"edit_document",
			{ id: agentNote.id, version: agentNote.version, scopeKind: "team", scopeId: "c2b" },
			agentIdentity,
		);
		expect(agentWidened.ok).toBe(true);
		const agentWidenedDoc = requireDoc(agentWidened).document;
		expect(agentWidenedDoc.scopeKind).toBe("team");
		expect(agentWidenedDoc.scopeId).toBe("c2b");
		expect(agentWidenedDoc.as).toBe("document");
		expect(agentWidenedDoc.version).toBe(agentNote.version + 1);
		const agentRow = await readDocumentRow(db, agentNote.id);
		expect(agentRow.scopeKind).toBe("team");
		expect(agentRow.scopeId).toBe("c2b");
	});

	test('search_documents({as:"memory"}) excludes it; search_documents({as:"document"}) includes it; open_document derives as:"document"', async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c2bs");
		await seedAgent(db, "c2bs-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c2bs-agent",
			sessionId: "c2bs-sess",
		});

		const folder = requireDoc(
			(await doors.edit({ title: "Folder", scopeKind: "factory" })).human,
		).document;
		const note = requireDoc(
			(
				await doors.edit({
					title: "Private in the tree",
					scopeKind: "user",
					parent: { kind: "document", id: folder.id },
				})
			).human,
		).document;

		const memorySearch = await callHuman<DocumentRow[]>(app, "search_documents", { as: "memory" });
		expect(memorySearch.ok).toBe(true);
		expect((memorySearch.data ?? []).map((r) => r.id)).not.toContain(note.id);

		const documentSearch = await callHuman<DocumentRow[]>(app, "search_documents", {
			as: "document",
			parent: { kind: "document", id: folder.id },
		});
		expect(documentSearch.ok).toBe(true);
		expect((documentSearch.data ?? []).map((r) => r.id)).toContain(note.id);

		const opened = await callHuman<DocumentView>(app, "open_document", { id: note.id });
		expect(opened.ok).toBe(true);
		expect(requireDoc(opened).document.as).toBe("document");
	});

	test('a genuine memory\'s scope stays refused with memory_scope_fixed even without repeating as:"memory" on the edit — the forcing never lands as a silent no-op', async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c2bm");
		await seedAgent(db, "c2bm-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c2bm-agent",
			sessionId: "c2bm-sess",
		});

		const memory = requireDoc(
			(await doors.edit({ title: "My note", as: "memory" })).human,
		).document;

		const attempted = await callHuman<DocumentView>(app, "edit_document", {
			id: memory.id,
			version: memory.version,
			scopeKind: "team",
			scopeId: "c2bm",
		});
		expect(attempted.ok).toBe(false);
		expect(attempted.problemCode).toBe("memory_scope_fixed");

		const row = await readDocumentRow(db, memory.id);
		expect(row.scopeKind).toBe("user");
		expect(row.version).toBe(memory.version);
		expect(await listChanges(db, { object: "document", objectId: memory.id })).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// Case 3 — an agent's owner sees its memory; a third person gets not_found.
// ---------------------------------------------------------------------------

describe("case 3 — an agent's memory is visible to its owner, not to a third person", () => {
	test("owner opens it; a stranger gets not_found", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c3");
		await seedHuman(db, "c3-owner");
		await seedHuman(db, "c3-stranger");
		await seedAgent(db, "c3-agent", { ownerUserId: "c3-owner" });
		const actions = buildRealActions(agentOrchestration);

		const created = await callAgent<DocumentView>(
			actions,
			db,
			eventBus,
			"edit_document",
			{ title: "agent secret", as: "memory" },
			{ agentId: "c3-agent", sessionId: "c3-sess" },
		);
		const docId = requireDoc(created).document.id;

		const ownerOpen = await callHuman<DocumentView>(
			app,
			"open_document",
			{ id: docId },
			actorHeaders("c3-owner"),
		);
		expect(ownerOpen.ok).toBe(true);

		const strangerOpen = await callHuman<DocumentView>(
			app,
			"open_document",
			{ id: docId },
			actorHeaders("c3-stranger"),
		);
		expect(strangerOpen.ok).toBe(false);
		expect(strangerOpen.problemCode).toBe("not_found");
	});
});

// ---------------------------------------------------------------------------
// Case 4 — as:"artifact" with no parent.
// ---------------------------------------------------------------------------

describe('case 4 — create as:"artifact" with no explicit parent', () => {
	test("agent arm stamps the calling task; human arm (no calling task) is refused artifact_no_parent", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c4");
		await seedTaskWithThread(db, "c4-task-1", "c4");
		await seedAgent(db, "c4-agent");
		const actions = buildRealActions(agentOrchestration);

		const agentResult = await callAgent<DocumentView>(
			actions,
			db,
			eventBus,
			"edit_document",
			{ title: "agent artifact", as: "artifact" },
			{ agentId: "c4-agent", sessionId: "c4-sess", taskId: "c4-task-1" },
		);
		const agentDoc = requireDoc(agentResult).document;
		expect(agentDoc.parentKind).toBe("task");
		expect(agentDoc.parentId).toBe("c4-task-1");

		const humanResult = await callHuman<DocumentView>(app, "edit_document", {
			title: "human artifact",
			as: "artifact",
		});
		expect(humanResult.ok).toBe(false);
		expect(humanResult.problemCode).toBe("artifact_no_parent");
	});
});

// ---------------------------------------------------------------------------
// Case 5 — a three-level tree: ancestors root-first, ordered children,
// siblings excluding self.
// ---------------------------------------------------------------------------

async function buildFourLevelTree(
	edit: (body: Record<string, unknown>) => Promise<DoorResult<DocumentView>>,
	prefix: string,
): Promise<{ r: string; c: string; m: string; m2: string; g: string }> {
	const r = requireDoc(await edit({ title: `${prefix}-R` })).document.id;
	const c = requireDoc(await edit({ title: `${prefix}-C`, parent: { kind: "document", id: r } }))
		.document.id;
	const m = requireDoc(await edit({ title: `${prefix}-M`, parent: { kind: "document", id: c } }))
		.document.id;
	const m2 = requireDoc(await edit({ title: `${prefix}-M2`, parent: { kind: "document", id: c } }))
		.document.id;
	const g = requireDoc(await edit({ title: `${prefix}-G`, parent: { kind: "document", id: m } }))
		.document.id;
	return { r, c, m, m2, g };
}

describe("case 5 — a tree: ancestors root-first, ordered children, siblings excluding self", () => {
	test("both doors agree on the shape of an identically-built tree", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c5");
		await seedAgent(db, "c5-agent");
		const actions = buildRealActions(agentOrchestration);

		const editHuman = (body: Record<string, unknown>) =>
			callHuman<DocumentView>(app, "edit_document", body);
		const editAgent = (body: Record<string, unknown>) =>
			callAgent<DocumentView>(actions, db, eventBus, "edit_document", body, {
				agentId: "c5-agent",
				sessionId: "c5-sess",
			});

		const humanIds = await buildFourLevelTree(editHuman, "c5h");
		const agentIds = await buildFourLevelTree(editAgent, "c5a");

		const humanOpen = requireDoc(
			await callHuman<DocumentView>(app, "open_document", { id: humanIds.m }),
		);
		expect(humanOpen.ancestors.map((a) => a.id)).toEqual([humanIds.r, humanIds.c]);
		expect(humanOpen.children.map((c) => c.id)).toEqual([humanIds.g]);
		expect(humanOpen.siblings.map((s) => s.id)).toEqual([humanIds.m2]);

		const agentOpen = requireDoc(
			await callAgent<DocumentView>(
				actions,
				db,
				eventBus,
				"open_document",
				{ id: agentIds.m },
				{
					agentId: "c5-agent",
					sessionId: "c5-sess",
				},
			),
		);
		expect(agentOpen.ancestors.map((a) => a.id)).toEqual([agentIds.r, agentIds.c]);
		expect(agentOpen.children.map((c) => c.id)).toEqual([agentIds.g]);
		expect(agentOpen.siblings.map((s) => s.id)).toEqual([agentIds.m2]);
	});
});

// ---------------------------------------------------------------------------
// Case 5b — `open_document`'s `ancestors` are filtered through the viewer's
// own visibility, never the raw stored chain (review finding: a team-A
// viewer opening a team-A child under a team-B parent must not receive the
// parent's title/body just because it sits above a document they CAN read).
// ---------------------------------------------------------------------------

describe("case 5b — ancestors are filtered through the viewer's own visibility", () => {
	test("a cross-team ancestor is absent from the path, exact length", async ({ app, db }) => {
		await seedTeam(db, "c5b-a");
		await seedTeam(db, "c5b-b");
		await seedHuman(db, "c5b-b-owner", "c5b-b");
		await seedHuman(db, "c5b-a-viewer", "c5b-a");

		// The team-B owner can see their own team-B parent, so they may nest a
		// narrower team-A-scoped child under it — the visibility check only
		// compares scope RANK (architecture.md §4.2), and both are "team" rank.
		const parent = requireDoc(
			await callHuman<DocumentView>(
				app,
				"edit_document",
				{ title: "team-B parent", scopeKind: "team", scopeId: "c5b-b" },
				actorHeaders("c5b-b-owner"),
			),
		).document;
		const child = requireDoc(
			await callHuman<DocumentView>(
				app,
				"edit_document",
				{
					title: "team-A child",
					scopeKind: "team",
					scopeId: "c5b-a",
					parent: { kind: "document", id: parent.id },
				},
				actorHeaders("c5b-b-owner"),
			),
		).document;

		// The team-A viewer CAN read the child itself (it is scoped to their
		// own team) but must not see the team-B parent above it.
		const opened = requireDoc(
			await callHuman<DocumentView>(
				app,
				"open_document",
				{ id: child.id },
				actorHeaders("c5b-a-viewer"),
			),
		);
		expect(opened.ancestors.map((a) => a.id)).not.toContain(parent.id);
		expect(opened.ancestors).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Case 6 — search_documents({inTree:true}) excludes artifacts and slotted
// documents.
// ---------------------------------------------------------------------------

describe("case 6 — search_documents({inTree:true}) excludes artifacts and slotted documents", () => {
	test("both doors", async ({ app, db, eventBus, agentOrchestration }) => {
		await seedTeam(db, "c6");
		await seedTaskWithThread(db, "c6-task-1", "c6");
		await seedAgent(db, "c6-agent");
		await seedSubscription(db, "c6-routine-1", "c6-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c6-agent",
			sessionId: "c6-sess",
		});

		const plain = requireDoc((await doors.edit({ title: "c6-plain" })).human).document.id;
		const artifact = requireDoc(
			(
				await doors.edit({ title: "c6-artifact", as: "artifact" }, undefined, {
					taskId: "c6-task-1",
				})
			).agent,
		).document.id;
		// A subscription parent is internal-only (`forbidden_parent_kind`) —
		// seeded through the internal path, the same in-process binding the
		// subscription actions use, never through a client door.
		const prompt = requireDoc(
			await callInternal<DocumentView>(
				actions,
				db,
				eventBus,
				"edit_document",
				{
					title: "c6-prompt",
					slot: "prompt",
					parent: { kind: "subscription", id: "c6-routine-1" },
				},
				FOUNDER_ID,
			),
		).document.id;

		const { human, agent } = await doors.search({ inTree: true });
		const humanIds = (human.data ?? []).map((d) => d.id);
		const agentIds = (agent.data ?? []).map((d) => d.id);
		expect(humanIds).toContain(plain);
		expect(humanIds).not.toContain(artifact);
		expect(humanIds).not.toContain(prompt);
		expect(agentIds).toContain(plain);
		expect(agentIds).not.toContain(artifact);
		expect(agentIds).not.toContain(prompt);
	});
});

// ---------------------------------------------------------------------------
// Case 7 — search_documents({as:"memory"}) returns only the caller's own.
// ---------------------------------------------------------------------------

describe('case 7 — search_documents({as:"memory"}) returns only the caller\'s own', () => {
	test("both doors: never another actor's memory", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c7");
		await seedHuman(db, "c7-other-human");
		await seedAgent(db, "c7-agent");
		await seedAgent(db, "c7-other-agent");
		const actions = buildRealActions(agentOrchestration);

		const founderMemory = requireDoc(
			await callHuman<DocumentView>(app, "edit_document", { title: "founder note", as: "memory" }),
		).document.id;
		await callHuman<DocumentView>(
			app,
			"edit_document",
			{ title: "other human note", as: "memory" },
			actorHeaders("c7-other-human"),
		);
		const agentMemory = requireDoc(
			await callAgent<DocumentView>(
				actions,
				db,
				eventBus,
				"edit_document",
				{ title: "agent note", as: "memory" },
				{ agentId: "c7-agent", sessionId: "c7-sess" },
			),
		).document.id;
		await callAgent<DocumentView>(
			actions,
			db,
			eventBus,
			"edit_document",
			{ title: "other agent note", as: "memory" },
			{ agentId: "c7-other-agent", sessionId: "c7-other-sess" },
		);

		const humanSearch = await callHuman<DocumentRow[]>(app, "search_documents", { as: "memory" });
		expect((humanSearch.data ?? []).map((d) => d.id)).toEqual([founderMemory]);

		const agentSearch = await callAgent<DocumentRow[]>(
			actions,
			db,
			eventBus,
			"search_documents",
			{ as: "memory" },
			{ agentId: "c7-agent", sessionId: "c7-sess" },
		);
		expect((agentSearch.data ?? []).map((d) => d.id)).toEqual([agentMemory]);
	});
});

// ---------------------------------------------------------------------------
// Case 8 — search_documents({parent:{kind: "subscription", ids:[a,b]}, slot:"prompt"})
// returns one row per subscription, in one query.
// ---------------------------------------------------------------------------

describe("case 8 — a batched parent.ids search returns one row per subscription", () => {
	test("both doors: exactly the two prompts, one per subscription id", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c8");
		await seedAgent(db, "c8-agent");
		await seedSubscription(db, "c8-routine-a", "c8-agent");
		await seedSubscription(db, "c8-routine-b", "c8-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c8-agent",
			sessionId: "c8-sess",
		});

		// A subscription parent is internal-only (`forbidden_parent_kind`) —
		// both seeded through the internal path (the same in-process binding
		// the subscription actions use), on two distinct subscription parents
		// so the second write never collides with the first on the same
		// (parent, slot).
		const a = requireDoc(
			await callInternal<DocumentView>(
				actions,
				db,
				eventBus,
				"edit_document",
				{ title: "prompt-a", slot: "prompt", parent: { kind: "subscription", id: "c8-routine-a" } },
				FOUNDER_ID,
			),
		).document.id;
		const b = requireDoc(
			await callInternal<DocumentView>(
				actions,
				db,
				eventBus,
				"edit_document",
				{ title: "prompt-b", slot: "prompt", parent: { kind: "subscription", id: "c8-routine-b" } },
				"c8-agent",
			),
		).document.id;

		const searchBody: SearchDocumentsInput = {
			parent: { kind: "subscription", ids: ["c8-routine-a", "c8-routine-b"] },
			slot: "prompt",
		};
		const { human, agent } = await doors.search(searchBody as unknown as Record<string, unknown>);
		expect((human.data ?? []).map((d) => d.id).sort()).toEqual([a, b].sort());
		expect((agent.data ?? []).map((d) => d.id).sort()).toEqual([a, b].sort());
	});
});

// ---------------------------------------------------------------------------
// Case 9 — a door proves it surfaces an invariant refusal correctly, at both
// HTTP and tool doors, for one pure (§4.1) and one DB-dependent (§4.2) code.
// Every code's own logic — pure or DB-dependent — has its one home in
// framework/domain-model's document-invariants.test.ts (pure) and
// document/src/__tests__/document-edit-action.integration.test.ts (DB-dependent);
// this suite is not the place to re-walk the list.
// ---------------------------------------------------------------------------

describe("case 9 — an invariant refusal round-trips through both doors", () => {
	test("a pure invariant refusal (title_required) reaches both doors with the same code", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c9i1");
		await seedAgent(db, "c9i1-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c9i1-agent",
			sessionId: "c9i1-sess",
		});
		const { human, agent } = await doors.edit({ title: "   " });
		expect(human.ok).toBe(false);
		expect(human.problemCode).toBe("title_required");
		expect(agent.ok).toBe(false);
		expect(agent.problemCode).toBe("title_required");
	});

	test("forbidden_parent: a DB-dependent refusal reaches both doors with the same code", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c9d8");
		await seedHuman(db, "c9d8-owner");
		await seedAgent(db, "c9d8-agent");
		const actions = buildRealActions(agentOrchestration);
		const memoryId = requireDoc(
			await callHuman<DocumentView>(
				app,
				"edit_document",
				{ title: "private", as: "memory" },
				actorHeaders("c9d8-owner"),
			),
		).document.id;
		const human = await callHuman<DocumentView>(app, "edit_document", {
			title: "x",
			parent: { kind: "document", id: memoryId },
		});
		expect(human.problemCode).toBe("forbidden_parent");
		const agent = await callAgent<DocumentView>(
			actions,
			db,
			eventBus,
			"edit_document",
			{ title: "x", parent: { kind: "document", id: memoryId } },
			{ agentId: "c9d8-agent", sessionId: "c9d8-sess" },
		);
		expect(agent.problemCode).toBe("forbidden_parent");
	});
});

// ---------------------------------------------------------------------------
// Case 9b — forbidden_parent_kind itself is owned by document-edit-action's
// own integration test; what is layer-specific here is that a client-named
// agent/subscription parent is refused at both client doors while the
// SAME parent kind stays reachable through the internal identity path —
// proof the door check does not also block the system's own writes.
// ---------------------------------------------------------------------------

describe("case 9b — forbidden_parent_kind refuses client doors, not the internal path", () => {
	test("HTTP door and tool door both refuse a client-named agent parent", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c9b1");
		await seedAgent(db, "c9b1-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c9b1-agent",
			sessionId: "c9b1-sess",
		});
		const { human, agent } = await doors.edit({
			title: "sneaky identity",
			parent: { kind: "agent", id: "c9b1-agent" },
		});
		expect(human.problemCode).toBe("forbidden_parent_kind");
		expect(agent.problemCode).toBe("forbidden_parent_kind");
	});

	test("the identity helper still creates an agent's identity document, unaffected by the client refusal", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c9b3");
		await seedAgent(db, "c9b3-agent");
		const actions = buildRealActions(agentOrchestration);
		const editDocument = actions.find((a) => a.declaration.name === "edit_document");
		const searchDocuments = actions.find((a) => a.declaration.name === "search_documents");
		if (!(editDocument && searchDocuments)) throw new Error("missing action");
		const identity = createAgentIdentityPort({
			searchDocuments: searchDocuments.run as AgentIdentityDeps["searchDocuments"],
			editDocument: editDocument.run as AgentIdentityDeps["editDocument"],
			eventBus,
		});
		const id = await identity.upsertAgentIdentity(db, {
			agentId: "c9b3-agent",
			agentName: "c9b3-agent",
			body: "identity body",
			updatedBy: "system:propagation",
		});
		const opened = requireDoc(
			await callAgent<DocumentView>(
				actions,
				db,
				eventBus,
				"open_document",
				{ id },
				{
					agentId: "c9b3-agent",
					sessionId: "c9b3-sess",
				},
			),
		);
		expect(opened.document.parentKind).toBe("agent");
		expect(opened.document.parentId).toBe("c9b3-agent");
	});
});

// ---------------------------------------------------------------------------
// Case 10 — the eight combined cases of §4.3 (the cascade family, case 1, is
// its own describe block — case 14 below).
// ---------------------------------------------------------------------------

describe("case 10 — the combined cases", () => {
	test("a move of a prompt document is refused before it ever reaches the scope-move rule", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c10c2");
		await seedAgent(db, "c10c2-agent");
		await seedSubscription(db, "c10c2-routine", "c10c2-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c10c2-agent",
			sessionId: "c10c2-sess",
		});
		const other = requireDoc((await doors.edit({ title: "elsewhere" })).human).document.id;
		// A subscription parent is internal-only (`forbidden_parent_kind`) —
		// seeded through the internal path, never a client door.
		const prompt = requireDoc(
			await callInternal<DocumentView>(
				actions,
				db,
				eventBus,
				"edit_document",
				{ title: "prompt", slot: "prompt", parent: { kind: "subscription", id: "c10c2-routine" } },
				FOUNDER_ID,
			),
		).document.id;
		const human = await callHuman<DocumentView>(app, "edit_document", {
			id: prompt,
			parent: { kind: "document", id: other },
		});
		expect(human.problemCode).toBe("slotted_document_cannot_move");
	});

	test('as:"artifact" + an explicit thread parent wins over the calling task\'s stamp', async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c10c3");
		await seedTaskWithThread(db, "c10c3-task", "c10c3");
		await seedThreadRow(db, "c10c3-thread", "c10c3");
		await seedAgent(db, "c10c3-agent");
		const actions = buildRealActions(agentOrchestration);
		const result = await callAgent<DocumentView>(
			actions,
			db,
			eventBus,
			"edit_document",
			{ title: "artifact", as: "artifact", parent: { kind: "thread", id: "c10c3-thread" } },
			{ agentId: "c10c3-agent", sessionId: "c10c3-sess", taskId: "c10c3-task" },
		);
		const doc = requireDoc(result).document;
		expect(doc.parentKind).toBe("thread");
		expect(doc.parentId).toBe("c10c3-thread");
	});

	test("a stale edit writes nothing, and cascades nothing", async ({ app, db }) => {
		await seedTeam(db, "c10c4");
		const parent = requireDoc(
			await callHuman<DocumentView>(app, "edit_document", { title: "parent" }),
		).document.id;
		const child = requireDoc(
			await callHuman<DocumentView>(app, "edit_document", {
				title: "child",
				parent: { kind: "document", id: parent },
			}),
		).document;
		const afterFirstEdit = requireDoc(
			await callHuman<DocumentView>(app, "edit_document", { id: parent, title: "v1-title" }),
		);
		expect(afterFirstEdit.document.version).toBe(2);

		// A stale edit that would ALSO narrow the scope — rejected before the
		// transaction (and the cascade inside it) ever opens.
		const stale = await callHuman<DocumentView>(app, "edit_document", {
			id: parent,
			title: "stale-title",
			scopeKind: "team",
			scopeId: "c10c4",
			version: 1,
		});
		expect(stale.problemCode).toBe("stale");

		const reread = requireDoc(await callHuman<DocumentView>(app, "open_document", { id: parent }));
		expect(reread.document.title).toBe("v1-title");
		expect(reread.document.scopeKind).toBe("factory");
		const childReread = requireDoc(
			await callHuman<DocumentView>(app, "open_document", { id: child.id }),
		);
		expect(childReread.document.scopeKind).toBe("factory");
		expect(await listChanges(db, { object: "document", objectId: child.id })).toHaveLength(1);
	});

	test('as:"memory" + slot on create: the slot is forced to ordinary, silently', async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c10c5");
		await seedAgent(db, "c10c5-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c10c5-agent",
			sessionId: "c10c5-sess",
		});
		const { human, agent } = await doors.edit({ title: "memo", as: "memory", slot: "skill" });
		expect(human.ok).toBe(true);
		expect(requireDoc(human).document.slot).toBe("ordinary");
		expect(agent.ok).toBe(true);
		expect(requireDoc(agent).document.slot).toBe("ordinary");
	});

	test("upsert-with-id + version: a version on a create is ignored, not an error", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c10c6");
		await seedAgent(db, "c10c6-agent");
		const actions = buildRealActions(agentOrchestration);
		// Distinct explicit ids per door — the same id would make the door
		// that runs second (`buildDoors`'s `both()` always human-then-agent)
		// land on an EDIT of the first door's just-created row instead of its
		// own create, tripping a `stale` refusal on the mismatched version.
		const human = await callHuman<DocumentView>(app, "edit_document", {
			id: "c10c6-brand-new-human",
			title: "brand new",
			version: 3,
		});
		const agent = await callAgent<DocumentView>(
			actions,
			db,
			eventBus,
			"edit_document",
			{ id: "c10c6-brand-new-agent", title: "brand new", version: 3 },
			{ agentId: "c10c6-agent", sessionId: "c10c6-sess" },
		);
		expect(human.ok).toBe(true);
		expect(agent.ok).toBe(true);
	});

	test("upsert-with-id + visibility: another person's id answers not_found and creates nothing", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c10c7");
		await seedHuman(db, "c10c7-owner");
		await seedAgent(db, "c10c7-agent");
		const actions = buildRealActions(agentOrchestration);
		await callHuman<DocumentView>(
			app,
			"edit_document",
			{ id: "c10c7-m1", title: "A's title", as: "memory" },
			actorHeaders("c10c7-owner"),
		);
		const human = await callHuman<DocumentView>(app, "edit_document", {
			id: "c10c7-m1",
			title: "x",
		});
		expect(human.problemCode).toBe("not_found");
		const agent = await callAgent<DocumentView>(
			actions,
			db,
			eventBus,
			"edit_document",
			{ id: "c10c7-m1", title: "x" },
			{ agentId: "c10c7-agent", sessionId: "c10c7-sess" },
		);
		expect(agent.problemCode).toBe("not_found");
		const reread = requireDoc(
			await callHuman<DocumentView>(
				app,
				"open_document",
				{ id: "c10c7-m1" },
				actorHeaders("c10c7-owner"),
			),
		);
		expect(reread.document.title).toBe("A's title");

		// The upsert probe never minted a second row with the same id — the
		// raw-and-unfiltered existence read decides create-vs-edit, and the
		// visibility predicate is applied only to what it found (architecture.md
		// §4.3 case 7).
		const stored = await db.select().from(documents).where(eq(documents.id, "c10c7-m1"));
		expect(stored).toHaveLength(1);
	});

	test("a shared task's artifact is readable across teams (successful half)", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c10c8-a");
		await seedTeam(db, "c10c8-b");
		await seedTaskWithThread(db, "c10c8-task", "c10c8-a");
		await seedHuman(db, "c10c8-teammate-b", "c10c8-b");
		await seedAgent(db, "c10c8-agent");
		const actions = buildRealActions(agentOrchestration);
		const artifact = requireDoc(
			await callAgent<DocumentView>(
				actions,
				db,
				eventBus,
				"edit_document",
				{ title: "shared artifact", as: "artifact" },
				{ agentId: "c10c8-agent", sessionId: "c10c8-sess", taskId: "c10c8-task" },
			),
		).document.id;
		const readByOtherTeam = await callHuman<DocumentView>(
			app,
			"open_document",
			{ id: artifact },
			actorHeaders("c10c8-teammate-b"),
		);
		expect(readByOtherTeam.ok).toBe(true);
	});

	// The refused (private-scope) half is pure-invariant-rejected before any
	// DB write.
	test("as:artifact + a private scope is refused", async ({ db, eventBus, agentOrchestration }) => {
		await seedTeam(db, "c10c8-a");
		await seedTaskWithThread(db, "c10c8-task", "c10c8-a");
		await seedAgent(db, "c10c8-agent");
		const actions = buildRealActions(agentOrchestration);
		const refused = await callAgent<DocumentView>(
			actions,
			db,
			eventBus,
			"edit_document",
			{ title: "x", as: "artifact", scopeKind: "user" },
			{ agentId: "c10c8-agent", sessionId: "c10c8-sess", taskId: "c10c8-task" },
		);
		expect(refused.problemCode).toBe("artifact_cannot_be_private");
	});
});

// ---------------------------------------------------------------------------
// Graduating a task/thread-parented artifact into the document tree is an
// ordinary `edit_document` parent change (architecture.md §3.4/§3.5) — there
// is no dedicated graduate route. `as` is derived, never stored, so moving
// `parent` from `{kind:"task",…}` to a `document` parent (or to the top of
// the tree, `parent: null`) is all "graduation" is.
// ---------------------------------------------------------------------------

describe("graduation — a task-parented artifact moves into the document tree via a plain parent change", () => {
	test("moving parent from the calling task to a document root turns the artifact into a tree document", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "cgrad-1");
		await seedTaskWithThread(db, "cgrad-1-task", "cgrad-1");
		await seedAgent(db, "cgrad-1-agent");
		const actions = buildRealActions(agentOrchestration);

		const artifact = requireDoc(
			await callAgent<DocumentView>(
				actions,
				db,
				eventBus,
				"edit_document",
				{ title: "produced findings", as: "artifact" },
				{ agentId: "cgrad-1-agent", sessionId: "cgrad-1-sess", taskId: "cgrad-1-task" },
			),
		).document;
		expect(artifact.parentKind).toBe("task");

		const root = requireDoc(
			await callHuman<DocumentView>(app, "edit_document", { title: "Findings Archive" }),
		).document;

		const graduated = requireDoc(
			await callHuman<DocumentView>(app, "edit_document", {
				id: artifact.id,
				version: artifact.version,
				parent: { kind: "document", id: root.id },
			}),
		).document;

		expect(graduated.parentKind).toBe("document");
		expect(graduated.parentId).toBe(root.id);
	});

	test("moving parent to null graduates a task-parented artifact to the top of the tree", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "cgrad-2");
		await seedTaskWithThread(db, "cgrad-2-task", "cgrad-2");
		await seedAgent(db, "cgrad-2-agent");
		const actions = buildRealActions(agentOrchestration);

		const artifact = requireDoc(
			await callAgent<DocumentView>(
				actions,
				db,
				eventBus,
				"edit_document",
				{ title: "produced notes", as: "artifact" },
				{ agentId: "cgrad-2-agent", sessionId: "cgrad-2-sess", taskId: "cgrad-2-task" },
			),
		).document;

		const graduated = requireDoc(
			await callHuman<DocumentView>(app, "edit_document", {
				id: artifact.id,
				version: artifact.version,
				parent: null,
			}),
		).document;

		expect(graduated.parentKind).toBeNull();
		expect(graduated.parentId).toBeNull();
	});

	test('as:"artifact" + explicit parent:null from a task session is refused — null means the top of the tree, and an artifact cannot be there', async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "cgrad-3");
		await seedTaskWithThread(db, "cgrad-3-task", "cgrad-3");
		await seedAgent(db, "cgrad-3-agent");
		const actions = buildRealActions(agentOrchestration);

		// The tool door — the only one that ever carries `ctx.caller`, so this
		// is the exact shape the bug needed: a task session naming `as:
		// "artifact"` and an explicit `parent: null` together.
		const result = await callAgent<DocumentView>(
			actions,
			db,
			eventBus,
			"edit_document",
			{ title: "orphaned artifact", as: "artifact", parent: null },
			{ agentId: "cgrad-3-agent", sessionId: "cgrad-3-sess", taskId: "cgrad-3-task" },
		);
		expect(result.ok).toBe(false);
		expect(result.problemCode).toBe("artifact_parent_kind");
	});
});

// ---------------------------------------------------------------------------
// Case 11 — every successful edit appends exactly one `changes` row.
// ---------------------------------------------------------------------------

describe("case 11 — every successful edit appends exactly one changes row; a failed edit appends none", () => {
	test("both doors", async ({ app, db, eventBus, agentOrchestration }) => {
		await seedTeam(db, "c11");
		await seedAgent(db, "c11-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c11-agent",
			sessionId: "c11-sess",
		});

		const { human, agent } = await doors.edit({ title: "created" });
		const humanId = requireDoc(human).document.id;
		const agentId = requireDoc(agent).document.id;
		let humanChanges = await listChanges(db, { object: "document", objectId: humanId });
		expect(humanChanges).toHaveLength(1);
		expect(humanChanges[0]?.kind).toBe("created");
		let agentChanges = await listChanges(db, { object: "document", objectId: agentId });
		expect(agentChanges).toHaveLength(1);
		expect(agentChanges[0]?.kind).toBe("created");

		await callHuman<DocumentView>(app, "edit_document", { id: humanId, title: "changed" });
		await callAgent<DocumentView>(
			actions,
			db,
			eventBus,
			"edit_document",
			{ id: agentId, title: "changed" },
			{ agentId: "c11-agent", sessionId: "c11-sess" },
		);
		humanChanges = await listChanges(db, { object: "document", objectId: humanId });
		expect(humanChanges).toHaveLength(2);
		agentChanges = await listChanges(db, { object: "document", objectId: agentId });
		expect(agentChanges).toHaveLength(2);

		const failedHuman = await callHuman<DocumentView>(app, "edit_document", { id: humanId });
		expect(failedHuman.ok).toBe(false);
		expect(await listChanges(db, { object: "document", objectId: humanId })).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// Case 12 — version bumps by exactly 1 on every successful edit, including
// an archive.
// ---------------------------------------------------------------------------

describe("case 12 — version bumps by exactly 1 on every successful edit, including an archive", () => {
	test("both doors", async ({ app, db, eventBus, agentOrchestration }) => {
		await seedTeam(db, "c12");
		await seedAgent(db, "c12-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c12-agent",
			sessionId: "c12-sess",
		});
		const { human, agent } = await doors.edit({ title: "v1" });
		const humanId = requireDoc(human).document.id;
		const agentId = requireDoc(agent).document.id;
		expect(requireDoc(human).document.version).toBe(1);
		expect(requireDoc(agent).document.version).toBe(1);

		const humanArchived = requireDoc(
			await callHuman<DocumentView>(app, "edit_document", { id: humanId, status: "archived" }),
		);
		expect(humanArchived.document.version).toBe(2);
		const agentArchived = requireDoc(
			await callAgent<DocumentView>(
				actions,
				db,
				eventBus,
				"edit_document",
				{ id: agentId, status: "archived" },
				{ agentId: "c12-agent", sessionId: "c12-sess" },
			),
		);
		expect(agentArchived.document.version).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// Case 13 — the default-scope derivation, all three arms.
// ---------------------------------------------------------------------------

describe("case 13 — default-scope derivation: actor's team, else the calling task's team, else factory", () => {
	test("an agent with a team gets team/teamId", async ({ db, eventBus, agentOrchestration }) => {
		await seedTeam(db, "c13-team");
		await seedAgent(db, "c13-teamed-agent", { teamId: "c13-team" });
		const actions = buildRealActions(agentOrchestration);
		const result = requireDoc(
			await callAgent<DocumentView>(
				actions,
				db,
				eventBus,
				"edit_document",
				{ title: "teamed" },
				{ agentId: "c13-teamed-agent", sessionId: "c13-sess" },
			),
		);
		expect(result.document.scopeKind).toBe("team");
		expect(result.document.scopeId).toBe("c13-team");
	});

	test("an agent with no team, called from a task session, gets the task's team", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c13-task-team");
		await seedTaskWithThread(db, "c13-task", "c13-task-team");
		await seedAgent(db, "c13-taskless-agent");
		const actions = buildRealActions(agentOrchestration);
		const result = requireDoc(
			await callAgent<DocumentView>(
				actions,
				db,
				eventBus,
				"edit_document",
				{ title: "from a task" },
				{ agentId: "c13-taskless-agent", sessionId: "c13-sess", taskId: "c13-task" },
			),
		);
		expect(result.document.scopeKind).toBe("team");
		expect(result.document.scopeId).toBe("c13-task-team");
	});

	test("an agent with neither a team nor a calling task gets factory", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c13-none");
		await seedAgent(db, "c13-bare-agent");
		const actions = buildRealActions(agentOrchestration);
		const result = requireDoc(
			await callAgent<DocumentView>(
				actions,
				db,
				eventBus,
				"edit_document",
				{ title: "nowhere" },
				{ agentId: "c13-bare-agent", sessionId: "c13-sess" },
			),
		);
		expect(result.document.scopeKind).toBe("factory");
		expect(result.document.scopeId).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Case 14 — the cascade family (§4.3 case 1), six sub-cases.
// ---------------------------------------------------------------------------

describe("case 14 — the scope cascade family", () => {
	test("1a narrowing cascades: a factory child and a team grandchild — the child narrows, the grandchild is untouched", async ({
		app,
		db,
	}) => {
		await seedTeam(db, "c14a");
		const parent = requireDoc(
			await callHuman<DocumentView>(app, "edit_document", {
				title: "parent",
				scopeKind: "factory",
			}),
		).document.id;
		const child = requireDoc(
			await callHuman<DocumentView>(app, "edit_document", {
				title: "child",
				scopeKind: "factory",
				parent: { kind: "document", id: parent },
			}),
		).document.id;
		const grandchild = requireDoc(
			await callHuman<DocumentView>(app, "edit_document", {
				title: "grandchild",
				scopeKind: "team",
				scopeId: "c14a",
				parent: { kind: "document", id: child },
			}),
		).document.id;

		const narrowed = requireDoc(
			await callHuman<DocumentView>(app, "edit_document", {
				id: parent,
				scopeKind: "team",
				scopeId: "c14a",
			}),
		);
		expect(narrowed.document.scopeKind).toBe("team");

		// Direct DB reads, not `open_document` — the acting actor (founder) is
		// not a member of team "c14a", and the cascade's whole point (§6.6 rule
		// 7) is that it narrows regardless of the actor's own visibility.
		const childRow = await readDocumentRow(db, child);
		expect(childRow.scopeKind).toBe("team");
		expect(childRow.scopeId).toBe("c14a");
		const grandchildRow = await readDocumentRow(db, grandchild);
		expect(grandchildRow.scopeKind).toBe("team");
		expect(grandchildRow.scopeId).toBe("c14a");

		const parentChanges = await listChanges(db, { object: "document", objectId: parent });
		const childChanges = await listChanges(db, { object: "document", objectId: child });
		const grandchildChanges = await listChanges(db, { object: "document", objectId: grandchild });
		expect(parentChanges).toHaveLength(2); // create + narrow
		expect(childChanges).toHaveLength(2); // create + cascade
		expect(grandchildChanges).toHaveLength(1); // create only, untouched
		const cascadeRow = childChanges[0];
		expect(cascadeRow?.actor).toBe(FOUNDER_ID);
		expect(JSON.parse(cascadeRow?.before ?? "{}")).toEqual(
			expect.objectContaining({ id: child, scopeKind: "factory" }),
		);
		expect(JSON.parse(cascadeRow?.after ?? "{}")).toEqual(
			expect.objectContaining({ id: child, scopeKind: "team", scopeId: "c14a" }),
		);
	});

	test("1b widening never cascades: exactly one change row, children untouched", async ({
		app,
		db,
	}) => {
		// A team member throughout — creating a child under a team-scoped
		// parent needs to SEE that parent, which is a separate concern from the
		// widening-never-cascades property this case proves.
		await seedTeam(db, "c14b");
		await seedHuman(db, "c14b-human", "c14b");
		const headers = actorHeaders("c14b-human");
		const parent = requireDoc(
			await callHuman<DocumentView>(
				app,
				"edit_document",
				{ title: "parent", scopeKind: "team", scopeId: "c14b" },
				headers,
			),
		).document.id;
		const child = requireDoc(
			await callHuman<DocumentView>(
				app,
				"edit_document",
				{
					title: "child",
					scopeKind: "team",
					scopeId: "c14b",
					parent: { kind: "document", id: parent },
				},
				headers,
			),
		).document.id;
		await callHuman<DocumentView>(
			app,
			"edit_document",
			{ id: parent, scopeKind: "factory" },
			headers,
		);
		const childChanges = await listChanges(db, { object: "document", objectId: child });
		expect(childChanges).toHaveLength(1);
		const childRow = await readDocumentRow(db, child);
		expect(childRow.scopeKind).toBe("team");
	});

	test("1c a named-slot child is narrowed too: scope changes, slot does not", async ({
		app,
		db,
	}) => {
		await seedTeam(db, "c14c");
		const parent = requireDoc(
			await callHuman<DocumentView>(app, "edit_document", {
				title: "parent",
				scopeKind: "factory",
			}),
		).document.id;
		const child = requireDoc(
			await callHuman<DocumentView>(app, "edit_document", {
				title: "child",
				scopeKind: "factory",
				slot: "skill",
				parent: { kind: "document", id: parent },
			}),
		).document.id;
		await callHuman<DocumentView>(app, "edit_document", {
			id: parent,
			scopeKind: "team",
			scopeId: "c14c",
		});
		const childRow = await readDocumentRow(db, child);
		expect(childRow.scopeKind).toBe("team");
		expect(childRow.slot).toBe("skill");
	});

	test("1d a child the actor cannot see is narrowed too", async ({ app, db }) => {
		// Rank, not team identity, decides "wider" (§6.6 rule 1: factory <
		// team < user). A team-scoped child is only narrowed by a parent that
		// moves to something RANKED narrower than team — i.e. "user" — so this
		// case parks the child on a team the narrowing actor does not belong
		// to (proving the walk ignores the actor's visible set) while the
		// parent narrows all the way to a person-private scope.
		await seedTeam(db, "c14d");
		await seedTeam(db, "c14d-other");
		const parent = requireDoc(
			await callHuman<DocumentView>(app, "edit_document", {
				title: "parent",
				scopeKind: "factory",
			}),
		).document.id;
		const child = requireDoc(
			await callHuman<DocumentView>(app, "edit_document", {
				title: "child",
				scopeKind: "team",
				scopeId: "c14d-other",
				parent: { kind: "document", id: parent },
			}),
		).document.id;
		await callHuman<DocumentView>(app, "edit_document", {
			id: parent,
			scopeKind: "user",
			scopeId: FOUNDER_ID,
		});
		const childRow = await readDocumentRow(db, child);
		expect(childRow.scopeKind).toBe("user");
		expect(childRow.scopeId).toBe(FOUNDER_ID);
	});

	test("1e an archived child is narrowed too", async ({ app, db }) => {
		await seedTeam(db, "c14e");
		const parent = requireDoc(
			await callHuman<DocumentView>(app, "edit_document", {
				title: "parent",
				scopeKind: "factory",
			}),
		).document.id;
		const child = requireDoc(
			await callHuman<DocumentView>(app, "edit_document", {
				title: "child",
				scopeKind: "factory",
				parent: { kind: "document", id: parent },
			}),
		).document.id;
		await callHuman<DocumentView>(app, "edit_document", { id: child, status: "archived" });
		await callHuman<DocumentView>(app, "edit_document", {
			id: parent,
			scopeKind: "team",
			scopeId: "c14e",
		});
		const childRow = await readDocumentRow(db, child);
		expect(childRow.status).toBe("archived");
		expect(childRow.scopeKind).toBe("team");
	});

	test("1f a memory can never be in the tree — refused before it can ever be, so no cascade can touch it", async ({
		app,
		db,
	}) => {
		await seedTeam(db, "c14f");
		const parent = requireDoc(
			await callHuman<DocumentView>(app, "edit_document", {
				title: "parent",
				scopeKind: "factory",
			}),
		).document.id;
		const refused = await callHuman<DocumentView>(app, "edit_document", {
			title: "sneaky memory",
			as: "memory",
			parent: { kind: "document", id: parent },
		});
		expect(refused.ok).toBe(false);
		expect(refused.problemCode).toBe("memory_has_parent");
		const rows = await db.select().from(documents).where(eq(documents.title, "sneaky memory"));
		expect(rows).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Case 15 — open_document raises the read count and nothing else.
// ---------------------------------------------------------------------------

describe("case 15 — open_document raises the read count and nothing else", () => {
	test("both doors: readCount to 2, lastReadAt moves, version/updatedAt/changes untouched; a refused open counts nothing", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c15");
		await seedHuman(db, "c15-stranger");
		await seedAgent(db, "c15-agent");
		const actions = buildRealActions(agentOrchestration);

		const humanDoc = requireDoc(
			await callHuman<DocumentView>(app, "edit_document", { title: "x" }),
		).document;
		await callHuman<DocumentView>(app, "open_document", { id: humanDoc.id });
		const secondOpen = requireDoc(
			await callHuman<DocumentView>(app, "open_document", { id: humanDoc.id }),
		).document;
		expect(secondOpen.readCount).toBe(2);
		expect(secondOpen.lastReadAt).not.toBeNull();
		expect(secondOpen.version).toBe(humanDoc.version);
		expect(secondOpen.updatedAt).toBe(humanDoc.updatedAt);
		expect(await listChanges(db, { object: "document", objectId: humanDoc.id })).toHaveLength(1);

		const agentDoc = requireDoc(
			await callAgent<DocumentView>(
				actions,
				db,
				eventBus,
				"edit_document",
				{ title: "x" },
				{ agentId: "c15-agent", sessionId: "c15-sess" },
			),
		).document;
		await callAgent<DocumentView>(
			actions,
			db,
			eventBus,
			"open_document",
			{ id: agentDoc.id },
			{ agentId: "c15-agent", sessionId: "c15-sess" },
		);
		const agentSecondOpen = requireDoc(
			await callAgent<DocumentView>(
				actions,
				db,
				eventBus,
				"open_document",
				{ id: agentDoc.id },
				{ agentId: "c15-agent", sessionId: "c15-sess" },
			),
		).document;
		expect(agentSecondOpen.readCount).toBe(2);
		expect(agentSecondOpen.version).toBe(agentDoc.version);
		expect(agentSecondOpen.updatedAt).toBe(agentDoc.updatedAt);

		// a refused open (another person's memory) leaves readCount at 0.
		const strangerMemory = requireDoc(
			await callHuman<DocumentView>(
				app,
				"edit_document",
				{ title: "secret", as: "memory" },
				actorHeaders("c15-stranger"),
			),
		).document;
		expect(strangerMemory.readCount).toBe(0);
		const refused = await callHuman<DocumentView>(app, "open_document", { id: strangerMemory.id });
		expect(refused.ok).toBe(false);
		const rereadAsOwner = requireDoc(
			await callHuman<DocumentView>(
				app,
				"open_document",
				{ id: strangerMemory.id },
				actorHeaders("c15-stranger"),
			),
		).document;
		expect(rereadAsOwner.readCount).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Case 16 — search raises nothing; an edit is never a read.
// ---------------------------------------------------------------------------

describe("case 16 — search_documents raises nothing; edit_document is never a read", () => {
	test("both doors", async ({ app, db, eventBus, agentOrchestration }) => {
		await seedTeam(db, "c16");
		await seedAgent(db, "c16-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c16-agent",
			sessionId: "c16-sess",
		});

		const ids: string[] = [];
		for (let i = 0; i < 5; i++) {
			ids.push(requireDoc((await doors.edit({ title: `c16-${i}` })).human).document.id);
		}
		const { human } = await doors.search({});
		expect((human.data ?? []).length).toBeGreaterThanOrEqual(5);
		for (const row of human.data ?? []) {
			expect(row.readCount).toBe(0);
		}

		const edited = requireDoc(
			await callHuman<DocumentView>(app, "edit_document", { id: ids[0], title: "changed" }),
		).document;
		expect(edited.readCount).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Case 17 — unusedSince and sort:"least_used".
// ---------------------------------------------------------------------------

async function seedDocumentRow(
	db: HyperIdleDb,
	overrides: Partial<typeof documents.$inferInsert> & { id: string },
): Promise<void> {
	const ts = "2020-01-01T00:00:00.000Z";
	await db.insert(documents).values({
		title: overrides.id,
		body: "x",
		format: "markdown",
		status: "active",
		scopeKind: "factory",
		updatedBy: FOUNDER_ID,
		createdAt: ts,
		updatedAt: ts,
		...overrides,
	});
}

describe('case 17 — unusedSince and sort:"least_used"', () => {
	test("both doors: unusedSince excludes a document created yesterday, includes one older than the cutoff; least_used puts the never-used first", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c17");
		await seedAgent(db, "c17-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c17-agent",
			sessionId: "c17-sess",
		});

		const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
		await seedDocumentRow(db, { id: "c17-recent", createdAt: yesterday, updatedAt: yesterday });
		await seedDocumentRow(db, { id: "c17-old" });

		const cutoff = "2024-01-01T00:00:00.000Z";
		const { human, agent } = await doors.search({ unusedSince: cutoff });
		const humanIds = (human.data ?? []).map((d) => d.id);
		const agentIds = (agent.data ?? []).map((d) => d.id);
		expect(humanIds).toContain("c17-old");
		expect(humanIds).not.toContain("c17-recent");
		expect(agentIds).toContain("c17-old");
		expect(agentIds).not.toContain("c17-recent");

		await seedDocumentRow(db, { id: "c17-used", lastUsedAt: "2026-05-01T00:00:00.000Z" });
		const sorted = await doors.search({ ids: ["c17-old", "c17-used"], sort: "least_used" });
		expect((sorted.human.data ?? []).map((d) => d.id)).toEqual(["c17-old", "c17-used"]);
		expect((sorted.agent.data ?? []).map((d) => d.id)).toEqual(["c17-old", "c17-used"]);
	});
});

// ---------------------------------------------------------------------------
// Cross-door proof — the same input through both doors yields deep-equal
// `data`, modulo ids and timestamps.
// ---------------------------------------------------------------------------

describe("cross-door proof — identical input yields deep-equal data, modulo ids and timestamps", () => {
	test("both doors: the same edit_document input produces the same document shape", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "cdp1");
		await seedAgent(db, "cdp1-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "cdp1-agent",
			sessionId: "cdp1-sess",
		});

		const { human, agent } = await doors.edit({
			title: "Cross-door parity",
			body: "same content",
			format: "markdown",
			status: "active",
		});
		const humanDoc = requireDoc(human).document;
		const agentDoc = requireDoc(agent).document;

		// `id`/`updatedBy`/`scopeId`/timestamps are the point of difference (two
		// distinct actors, two distinct rows); `position` is a shared root-level
		// sequence, not a per-actor counter (case 1's own comment) — the human
		// door runs first in `buildDoors`'s `both()`, so it always claims the
		// lower slot. Every other field must agree exactly.
		const strip = (d: DocumentRow) => {
			const {
				id: _id,
				updatedBy: _updatedBy,
				scopeId: _scopeId,
				position: _position,
				createdAt: _createdAt,
				updatedAt: _updatedAt,
				...rest
			} = d;
			return rest;
		};
		expect(strip(humanDoc)).toEqual(strip(agentDoc));

		const humanOpen = requireDoc(
			await callHuman<DocumentView>(app, "open_document", { id: humanDoc.id }),
		).document;
		const agentOpen = requireDoc(
			await callAgent<DocumentView>(
				actions,
				db,
				eventBus,
				"open_document",
				{ id: agentDoc.id },
				{ agentId: "cdp1-agent", sessionId: "cdp1-sess" },
			),
		).document;
		expect(humanOpen.readCount).toBe(1);
		expect(agentOpen.readCount).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Cross-door proof — `onBodyChanged` really marks a plugin-contributed
// document detached; a title-only edit does not.
// ---------------------------------------------------------------------------

describe("cross-door proof — onBodyChanged detaches a plugin contribution on a body edit only", () => {
	test("both doors: editing body detaches; editing only title does not", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "cdp2");
		await seedAgent(db, "cdp2-agent");
		const actions = buildRealActions(agentOrchestration);

		const humanDoc = requireDoc(
			await callHuman<DocumentView>(app, "edit_document", { title: "contributed", body: "v1" }),
		).document;
		await seedPluginContribution(db, humanDoc.id);
		expect(await readContributionDetachedAt(db, humanDoc.id)).toBeNull();
		await callHuman<DocumentView>(app, "edit_document", { id: humanDoc.id, title: "renamed only" });
		expect(await readContributionDetachedAt(db, humanDoc.id)).toBeNull();
		await callHuman<DocumentView>(app, "edit_document", { id: humanDoc.id, body: "v2" });
		expect(await readContributionDetachedAt(db, humanDoc.id)).not.toBeNull();

		const agentDoc = requireDoc(
			await callAgent<DocumentView>(
				actions,
				db,
				eventBus,
				"edit_document",
				{ title: "contributed-agent", body: "v1" },
				{ agentId: "cdp2-agent", sessionId: "cdp2-sess" },
			),
		).document;
		await seedPluginContribution(db, agentDoc.id);
		expect(await readContributionDetachedAt(db, agentDoc.id)).toBeNull();
		await callAgent<DocumentView>(
			actions,
			db,
			eventBus,
			"edit_document",
			{ id: agentDoc.id, title: "renamed only" },
			{ agentId: "cdp2-agent", sessionId: "cdp2-sess" },
		);
		expect(await readContributionDetachedAt(db, agentDoc.id)).toBeNull();
		await callAgent<DocumentView>(
			actions,
			db,
			eventBus,
			"edit_document",
			{ id: agentDoc.id, body: "v2" },
			{ agentId: "cdp2-agent", sessionId: "cdp2-sess" },
		);
		expect(await readContributionDetachedAt(db, agentDoc.id)).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// HTTP door — 422 problem lists (mirrors thread/task's own case).
// ---------------------------------------------------------------------------

describe("HTTP door — 422 problem lists", () => {
	test("a refused edit returns a 422 with a problems array over POST /api/actions/edit_document", async ({
		app,
	}) => {
		const res = await app.request("/api/actions/edit_document", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ title: "   " }),
		});
		expect(res.status).toBe(422);
		const body = (await res.json()) as ActionEnvelope<unknown>;
		expect(Array.isArray(body.problems)).toBe(true);
		expect(body.problems?.length ?? 0).toBeGreaterThan(0);
	});

	test("a successful edit returns 200", async ({ app, db }) => {
		// `changes.actor` FKs to `users.id` — the auth middleware resolves an
		// unseeded DB's actor to the literal string "u-founder" regardless
		// (`resolveApiKeyActorUserId`'s documented fallback), so the write
		// needs a real founder row to satisfy the FK, exactly like every other
		// case in this file seeds one via `seedTeam`.
		await seedTeam(db, "c422-200");
		const res = await app.request("/api/actions/edit_document", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ title: "HTTP 200 proof", body: "x" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as ActionEnvelope<DocumentView>;
		expect(body.ok).toBe(true);
		expect(body.data?.document.title).toBe("HTTP 200 proof");
	});
});

// ---------------------------------------------------------------------------
// case 18 — the blocker: search_documents's `parent` filter must name
// exactly one of `id`/`ids`, over HTTP with a real 422, not just a
// problem-list shape.
// ---------------------------------------------------------------------------

describe("case 18 — search_documents({parent}) must name exactly one of id/ids", () => {
	test("both doors: {as:'artifact', parent:{kind:'task'}} with no id/ids is refused with 422 parent_needs_id and returns no rows — the legitimate {id} and {ids} shapes still find the artifact", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c18-a");
		await seedTeam(db, "c18-b");
		await seedTaskWithThread(db, "c18-task", "c18-a");
		await seedHuman(db, "c18-outsider", "c18-b");
		await seedAgent(db, "c18-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c18-agent",
			sessionId: "c18-sess",
		});

		// A real artifact on the task — if the bug were still live, the
		// unbounded parent-kind-only query would hand it to anyone.
		const artifact = requireDoc(
			await callAgent<DocumentView>(
				actions,
				db,
				eventBus,
				"edit_document",
				{ title: "task artifact", as: "artifact" },
				{ agentId: "c18-agent", sessionId: "c18-sess", taskId: "c18-task" },
			),
		).document;

		const res = await app.request("/api/actions/search_documents", {
			method: "POST",
			headers: actorHeaders("c18-outsider"),
			body: JSON.stringify({ as: "artifact", parent: { kind: "task" } }),
		});
		expect(res.status).toBe(422);
		const body = (await res.json()) as ActionEnvelope<DocumentRow[]>;
		expect(body.problems?.[0]?.code).toBe("parent_needs_id");
		expect(body.data).toBeUndefined();

		const { human, agent } = await doors.search(
			{ as: "artifact", parent: { kind: "task" } },
			actorHeaders("c18-outsider"),
		);
		expect(human.problemCode).toBe("parent_needs_id");
		expect(human.data).toBeUndefined();
		expect(agent.problemCode).toBe("parent_needs_id");
		expect(agent.data).toBeUndefined();

		const byId = await doors.search({ parent: { kind: "task", id: "c18-task" } });
		expect((byId.human.data ?? []).map((d) => d.id)).toEqual([artifact.id]);
		expect((byId.agent.data ?? []).map((d) => d.id)).toEqual([artifact.id]);

		const byIds = await doors.search({ parent: { kind: "task", ids: ["c18-task"] } });
		expect((byIds.human.data ?? []).map((d) => d.id)).toEqual([artifact.id]);
		expect((byIds.agent.data ?? []).map((d) => d.id)).toEqual([artifact.id]);
	});
});
