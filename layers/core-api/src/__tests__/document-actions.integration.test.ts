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
import { insertRoutine } from "@hyperidle/routine";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import type { Action, ActionContext } from "../actions/action.js";
import { actionsAsTools } from "../actions/actions-as-tools.js";
import { buildCoreActions } from "../actions/compose.js";
import { type AgentIdentityDeps, createAgentIdentityPort } from "../routes/agent-identity.js";

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
 * (the routines route, the agent identity helper, the plugin installer) may
 * name an `agent`/`routine` parent through `edit_document`. Neither client
 * door (`callHuman`/`callAgent`) can reach it any more; this simulates the
 * same in-process binding those composition roots use by hand-setting
 * `ctx.internal` before calling the action's `run` directly.
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
	await db.insert(teams).values({ id: teamId, name: teamId, phase: "build", createdAt: now });
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

/** A real routine row — `edit_document`'s internal path checks a named
 * `routine` parent actually exists (`deps.systemParentExists`). */
async function seedRoutine(db: HyperIdleDb, id: string, ownerAgentId: string): Promise<void> {
	await insertRoutine(db, {
		id,
		name: id,
		ownerAgentId,
		triggerType: "event",
		state: "active",
		active: true,
		createdAt: new Date().toISOString(),
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
		// narrower team-A-scoped child under it (D6 only compares scope RANK,
		// both are "team" rank — architecture.md §4.2's D6 note).
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
		await seedRoutine(db, "c6-routine-1", "c6-agent");
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
		// A routine parent is internal-only (`forbidden_parent_kind`) — seeded
		// through the internal path, the same in-process binding the routines
		// route uses, never through a client door.
		const prompt = requireDoc(
			await callInternal<DocumentView>(
				actions,
				db,
				eventBus,
				"edit_document",
				{ title: "c6-prompt", slot: "prompt", parent: { kind: "routine", id: "c6-routine-1" } },
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
// Case 8 — search_documents({parent:{kind:"routine", ids:[a,b]}, slot:"prompt"})
// returns one row per routine, in one query.
// ---------------------------------------------------------------------------

describe("case 8 — a batched parent.ids search returns one row per routine", () => {
	test("both doors: exactly the two prompts, one per routine id", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c8");
		await seedAgent(db, "c8-agent");
		await seedRoutine(db, "c8-routine-a", "c8-agent");
		await seedRoutine(db, "c8-routine-b", "c8-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c8-agent",
			sessionId: "c8-sess",
		});

		// A routine parent is internal-only (`forbidden_parent_kind`) — both
		// seeded through the internal path (the same in-process binding the
		// routines route uses), on two distinct routine parents so the second
		// write never collides with the first on the same (parent, slot).
		const a = requireDoc(
			await callInternal<DocumentView>(
				actions,
				db,
				eventBus,
				"edit_document",
				{ title: "prompt-a", slot: "prompt", parent: { kind: "routine", id: "c8-routine-a" } },
				FOUNDER_ID,
			),
		).document.id;
		const b = requireDoc(
			await callInternal<DocumentView>(
				actions,
				db,
				eventBus,
				"edit_document",
				{ title: "prompt-b", slot: "prompt", parent: { kind: "routine", id: "c8-routine-b" } },
				"c8-agent",
			),
		).document.id;

		const searchBody: SearchDocumentsInput = {
			parent: { kind: "routine", ids: ["c8-routine-a", "c8-routine-b"] },
			slot: "prompt",
		};
		const { human, agent } = await doors.search(searchBody as unknown as Record<string, unknown>);
		expect((human.data ?? []).map((d) => d.id).sort()).toEqual([a, b].sort());
		expect((agent.data ?? []).map((d) => d.id).sort()).toEqual([a, b].sort());
	});
});

// ---------------------------------------------------------------------------
// Case 9 — every pure (§4.1) and DB-dependent (§4.2) invariant, one case
// each, exact code — both doors.
// ---------------------------------------------------------------------------

describe("case 9 — every §4.1/§4.2 invariant, exact code, both doors", () => {
	test("I1 title_required: whitespace-only title", async ({
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

	test("I2 empty_edit: an id alone, on an existing row", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c9i2");
		await seedAgent(db, "c9i2-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c9i2-agent",
			sessionId: "c9i2-sess",
		});
		const humanPrev = requireDoc((await doors.edit({ title: "prev" })).human).document.id;
		const agentPrev = requireDoc((await doors.edit({ title: "prev" })).agent).document.id;
		const human = await callHuman<DocumentView>(app, "edit_document", { id: humanPrev });
		expect(human.problemCode).toBe("empty_edit");
		const agent = await callAgent<DocumentView>(
			actions,
			db,
			eventBus,
			"edit_document",
			{ id: agentPrev },
			{ agentId: "c9i2-agent", sessionId: "c9i2-sess" },
		);
		expect(agent.problemCode).toBe("empty_edit");
	});

	test('I3 memory_scope_fixed: as:"memory" with an explicit scopeKind', async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c9i3");
		await seedAgent(db, "c9i3-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c9i3-agent",
			sessionId: "c9i3-sess",
		});
		const { human, agent } = await doors.edit({ title: "x", as: "memory", scopeKind: "team" });
		expect(human.problemCode).toBe("memory_scope_fixed");
		expect(agent.problemCode).toBe("memory_scope_fixed");
	});

	test('I4 memory_has_parent: as:"memory" with a parent', async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c9i4");
		await seedAgent(db, "c9i4-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c9i4-agent",
			sessionId: "c9i4-sess",
		});
		const { human, agent } = await doors.edit({
			title: "x",
			as: "memory",
			parent: { kind: "document", id: "does-not-matter" },
		});
		expect(human.problemCode).toBe("memory_has_parent");
		expect(agent.problemCode).toBe("memory_has_parent");
	});

	test('I5 artifact_parent_kind: as:"artifact" with a document parent', async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c9i5");
		await seedAgent(db, "c9i5-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c9i5-agent",
			sessionId: "c9i5-sess",
		});
		const { human, agent } = await doors.edit({
			title: "x",
			as: "artifact",
			parent: { kind: "document", id: "does-not-matter" },
		});
		expect(human.problemCode).toBe("artifact_parent_kind");
		expect(agent.problemCode).toBe("artifact_parent_kind");
	});

	test('I6 artifact_no_parent: as:"artifact", no parent, caller has neither', async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c9i6");
		await seedAgent(db, "c9i6-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c9i6-agent",
			sessionId: "c9i6-sess",
		});
		const { human, agent } = await doors.edit({ title: "x", as: "artifact" });
		expect(human.problemCode).toBe("artifact_no_parent");
		expect(agent.problemCode).toBe("artifact_no_parent");
	});

	test("I7 scope_needs_id: scopeKind team with no scopeId", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c9i7");
		await seedAgent(db, "c9i7-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c9i7-agent",
			sessionId: "c9i7-sess",
		});
		const { human, agent } = await doors.edit({ title: "x", scopeKind: "team" });
		expect(human.problemCode).toBe("scope_needs_id");
		expect(agent.problemCode).toBe("scope_needs_id");
	});

	test('I8 as_is_create_only: as:"memory" on a row whose derived as is document', async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c9i8");
		await seedAgent(db, "c9i8-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c9i8-agent",
			sessionId: "c9i8-sess",
		});
		const humanPrev = requireDoc((await doors.edit({ title: "prev" })).human).document.id;
		const agentPrev = requireDoc((await doors.edit({ title: "prev" })).agent).document.id;
		const human = await callHuman<DocumentView>(app, "edit_document", {
			id: humanPrev,
			as: "memory",
		});
		expect(human.problemCode).toBe("as_is_create_only");
		const agent = await callAgent<DocumentView>(
			actions,
			db,
			eventBus,
			"edit_document",
			{ id: agentPrev, as: "memory" },
			{ agentId: "c9i8-agent", sessionId: "c9i8-sess" },
		);
		expect(agent.problemCode).toBe("as_is_create_only");
	});

	test("I9 slot_is_create_only: slot changes away from the stored one", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c9i9");
		await seedAgent(db, "c9i9-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c9i9-agent",
			sessionId: "c9i9-sess",
		});
		const humanPrev = requireDoc((await doors.edit({ title: "prev" })).human).document.id;
		const agentPrev = requireDoc((await doors.edit({ title: "prev" })).agent).document.id;
		const human = await callHuman<DocumentView>(app, "edit_document", {
			id: humanPrev,
			slot: "skill",
		});
		expect(human.problemCode).toBe("slot_is_create_only");
		const agent = await callAgent<DocumentView>(
			actions,
			db,
			eventBus,
			"edit_document",
			{ id: agentPrev, slot: "skill" },
			{ agentId: "c9i9-agent", sessionId: "c9i9-sess" },
		);
		expect(agent.problemCode).toBe("slot_is_create_only");
	});

	test("I10 slotted_document_cannot_move: a move on a slotted document", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c9i10");
		await seedAgent(db, "c9i10-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c9i10-agent",
			sessionId: "c9i10-sess",
		});
		const humanOther = requireDoc((await doors.edit({ title: "elsewhere" })).human).document.id;
		const agentOther = requireDoc((await doors.edit({ title: "elsewhere" })).agent).document.id;
		const humanPrev = requireDoc((await doors.edit({ title: "prev", slot: "skill" })).human)
			.document.id;
		const agentPrev = requireDoc((await doors.edit({ title: "prev", slot: "skill" })).agent)
			.document.id;
		const human = await callHuman<DocumentView>(app, "edit_document", {
			id: humanPrev,
			parent: { kind: "document", id: humanOther },
		});
		expect(human.problemCode).toBe("slotted_document_cannot_move");
		const agent = await callAgent<DocumentView>(
			actions,
			db,
			eventBus,
			"edit_document",
			{ id: agentPrev, parent: { kind: "document", id: agentOther } },
			{ agentId: "c9i10-agent", sessionId: "c9i10-sess" },
		);
		expect(agent.problemCode).toBe("slotted_document_cannot_move");
	});

	test("I11 self_parent: parent.id equals the document's own id", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c9i11");
		await seedAgent(db, "c9i11-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c9i11-agent",
			sessionId: "c9i11-sess",
		});
		const { human, agent } = await doors.edit({
			id: "c9i11-self",
			title: "x",
			parent: { kind: "document", id: "c9i11-self" },
		});
		expect(human.problemCode).toBe("self_parent");
		expect(agent.problemCode).toBe("self_parent");
	});

	test("I12 status_from_archived: a field other than status changes on an archived row", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c9i12");
		await seedAgent(db, "c9i12-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c9i12-agent",
			sessionId: "c9i12-sess",
		});
		const humanPrev = requireDoc((await doors.edit({ title: "prev" })).human).document.id;
		const agentPrev = requireDoc((await doors.edit({ title: "prev" })).agent).document.id;
		await callHuman<DocumentView>(app, "edit_document", { id: humanPrev, status: "archived" });
		await callAgent<DocumentView>(
			actions,
			db,
			eventBus,
			"edit_document",
			{ id: agentPrev, status: "archived" },
			{ agentId: "c9i12-agent", sessionId: "c9i12-sess" },
		);
		const human = await callHuman<DocumentView>(app, "edit_document", {
			id: humanPrev,
			title: "new title",
		});
		expect(human.problemCode).toBe("status_from_archived");
		const agent = await callAgent<DocumentView>(
			actions,
			db,
			eventBus,
			"edit_document",
			{ id: agentPrev, title: "new title" },
			{ agentId: "c9i12-agent", sessionId: "c9i12-sess" },
		);
		expect(agent.problemCode).toBe("status_from_archived");
	});

	test('I13 artifact_cannot_be_private: as:"artifact", scopeKind:"user"', async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c9i13");
		await seedTaskWithThread(db, "c9i13-task", "c9i13");
		await seedAgent(db, "c9i13-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c9i13-agent",
			sessionId: "c9i13-sess",
		});
		const body = {
			title: "x",
			as: "artifact",
			scopeKind: "user",
			parent: { kind: "task", id: "c9i13-task" },
		};
		const { human, agent } = await doors.edit(body);
		expect(human.problemCode).toBe("artifact_cannot_be_private");
		expect(agent.problemCode).toBe("artifact_cannot_be_private");
	});

	test('I14 artifact_search_needs_parent: search_documents({as:"artifact"}) with no parent', async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c9i14");
		await seedAgent(db, "c9i14-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c9i14-agent",
			sessionId: "c9i14-sess",
		});
		const { human, agent } = await doors.search({ as: "artifact" });
		expect(human.problemCode).toBe("artifact_search_needs_parent");
		expect(agent.problemCode).toBe("artifact_search_needs_parent");
	});

	test("D1 not_found: open an id the caller cannot see", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c9d1");
		await seedHuman(db, "c9d1-owner");
		await seedAgent(db, "c9d1-agent");
		const actions = buildRealActions(agentOrchestration);
		const memoryId = requireDoc(
			await callHuman<DocumentView>(
				app,
				"edit_document",
				{ title: "private", as: "memory" },
				actorHeaders("c9d1-owner"),
			),
		).document.id;
		const human = await callHuman<DocumentView>(app, "open_document", { id: memoryId });
		expect(human.problemCode).toBe("not_found");
		const agent = await callAgent<DocumentView>(
			actions,
			db,
			eventBus,
			"open_document",
			{ id: memoryId },
			{ agentId: "c9d1-agent", sessionId: "c9d1-sess" },
		);
		expect(agent.problemCode).toBe("not_found");
	});

	test('D2 parent_not_found: parent:{kind:"task", id:"nope"}', async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c9d2");
		await seedAgent(db, "c9d2-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c9d2-agent",
			sessionId: "c9d2-sess",
		});
		const { human, agent } = await doors.edit({
			title: "x",
			parent: { kind: "task", id: "nope" },
		});
		expect(human.problemCode).toBe("parent_not_found");
		expect(agent.problemCode).toBe("parent_not_found");
	});

	test("D3 cycle: move a root under its own grandchild", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c9d3");
		await seedAgent(db, "c9d3-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c9d3-agent",
			sessionId: "c9d3-sess",
		});
		for (const which of ["human", "agent"] as const) {
			const edit = (body: Record<string, unknown>) =>
				which === "human"
					? doors.edit(body).then((r) => r.human)
					: doors.edit(body).then((r) => r.agent);
			const r = requireDoc(await edit({ title: "root" })).document.id;
			const c = requireDoc(await edit({ title: "child", parent: { kind: "document", id: r } }))
				.document.id;
			const g = requireDoc(await edit({ title: "grandchild", parent: { kind: "document", id: c } }))
				.document.id;
			const result = await edit({ id: r, parent: { kind: "document", id: g } });
			expect(result.problemCode).toBe("cycle");
		}
	});

	test("D4 depth_exceeded: a 32-deep chain, then one more", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c9d4");
		await seedAgent(db, "c9d4-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c9d4-agent",
			sessionId: "c9d4-sess",
		});
		for (const which of ["human", "agent"] as const) {
			const edit = (body: Record<string, unknown>) =>
				which === "human"
					? doors.edit(body).then((r) => r.human)
					: doors.edit(body).then((r) => r.agent);
			let parentId: string | undefined;
			for (let depth = 0; depth < 32; depth++) {
				const body: Record<string, unknown> = { title: `d${depth}` };
				if (parentId) body.parent = { kind: "document", id: parentId };
				parentId = requireDoc(await edit(body)).document.id;
			}
			const result = await edit({
				title: "one too deep",
				parent: { kind: "document", id: parentId },
			});
			expect(result.problemCode).toBe("depth_exceeded");
		}
	}, 30_000);

	test('D5 slot_taken: a second "prompt" on one routine', async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c9d5");
		await seedAgent(db, "c9d5-agent");
		await seedRoutine(db, "c9d5-routine", "c9d5-agent");
		const actions = buildRealActions(agentOrchestration);
		// A routine parent is internal-only (`forbidden_parent_kind`) — D5
		// itself is about the slot, not about who called, so this simulates the
		// routines route's own in-process binding rather than a client door.
		await callInternal<DocumentView>(
			actions,
			db,
			eventBus,
			"edit_document",
			{ title: "first prompt", slot: "prompt", parent: { kind: "routine", id: "c9d5-routine" } },
			FOUNDER_ID,
		);
		const second = await callInternal<DocumentView>(
			actions,
			db,
			eventBus,
			"edit_document",
			{ title: "second prompt", slot: "prompt", parent: { kind: "routine", id: "c9d5-routine" } },
			FOUNDER_ID,
		);
		expect(second.problemCode).toBe("slot_taken");
	});

	test("D6 scope_too_wide: a factory child under a team parent", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		// Both actors must belong to "c9d6" — the team-scoped parent is only
		// visible to its own team's members, and a move needs to SEE its named
		// parent (`forbidden_parent`, D8) before `assertParentInvariants` ever
		// runs; this test is about D6, not D8, so both actors are team members.
		await seedTeam(db, "c9d6");
		await seedHuman(db, "c9d6-human", "c9d6");
		await seedAgent(db, "c9d6-agent", { teamId: "c9d6" });
		const actions = buildRealActions(agentOrchestration);
		const humanHeaders = actorHeaders("c9d6-human");

		const humanParentId = requireDoc(
			await callHuman<DocumentView>(
				app,
				"edit_document",
				{ title: "team parent", scopeKind: "team", scopeId: "c9d6" },
				humanHeaders,
			),
		).document.id;
		const agentParentId = requireDoc(
			await callAgent<DocumentView>(
				actions,
				db,
				eventBus,
				"edit_document",
				{ title: "team parent", scopeKind: "team", scopeId: "c9d6" },
				{ agentId: "c9d6-agent", sessionId: "c9d6-sess" },
			),
		).document.id;

		const human = await callHuman<DocumentView>(
			app,
			"edit_document",
			{
				title: "wide child",
				scopeKind: "factory",
				parent: { kind: "document", id: humanParentId },
			},
			humanHeaders,
		);
		expect(human.problemCode).toBe("scope_too_wide");
		const agent = await callAgent<DocumentView>(
			actions,
			db,
			eventBus,
			"edit_document",
			{
				title: "wide child",
				scopeKind: "factory",
				parent: { kind: "document", id: agentParentId },
			},
			{ agentId: "c9d6-agent", sessionId: "c9d6-sess" },
		);
		expect(agent.problemCode).toBe("scope_too_wide");
	});

	test("D7 stale: two edits, the second carrying version 1", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c9d7");
		await seedAgent(db, "c9d7-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c9d7-agent",
			sessionId: "c9d7-sess",
		});
		const humanPrev = requireDoc((await doors.edit({ title: "v1" })).human).document.id;
		const agentPrev = requireDoc((await doors.edit({ title: "v1" })).agent).document.id;
		await callHuman<DocumentView>(app, "edit_document", { id: humanPrev, title: "v2" });
		await callAgent<DocumentView>(
			actions,
			db,
			eventBus,
			"edit_document",
			{ id: agentPrev, title: "v2" },
			{ agentId: "c9d7-agent", sessionId: "c9d7-sess" },
		);
		const human = await callHuman<DocumentView>(app, "edit_document", {
			id: humanPrev,
			title: "v3-stale",
			version: 1,
		});
		expect(human.problemCode).toBe("stale");
		const agent = await callAgent<DocumentView>(
			actions,
			db,
			eventBus,
			"edit_document",
			{ id: agentPrev, title: "v3-stale", version: 1 },
			{ agentId: "c9d7-agent", sessionId: "c9d7-sess" },
		);
		expect(agent.problemCode).toBe("stale");
	});

	test("D8 forbidden_parent: the named parent is another person's memory", async ({
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
// Case 9b — forbidden_parent_kind (review finding): only a system-initiated
// call may name an `agent`/`routine` parent through `edit_document`. Both
// client doors refused; the internal path (the identity helper, the routines
// route) is unaffected and a missing routine on that path still answers
// parent_not_found.
// ---------------------------------------------------------------------------

describe("case 9b — forbidden_parent_kind: only the system attaches a document to an agent or a routine", () => {
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

	test("HTTP door and tool door both refuse a client-named routine parent", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c9b2");
		await seedAgent(db, "c9b2-agent");
		await seedRoutine(db, "c9b2-routine", "c9b2-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c9b2-agent",
			sessionId: "c9b2-sess",
		});
		const { human, agent } = await doors.edit({
			title: "sneaky prompt",
			parent: { kind: "routine", id: "c9b2-routine" },
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

	test("D2 parent_not_found: a missing routine on the internal path", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c9b4");
		await seedAgent(db, "c9b4-agent");
		const actions = buildRealActions(agentOrchestration);
		const result = await callInternal<DocumentView>(
			actions,
			db,
			eventBus,
			"edit_document",
			{ title: "orphaned prompt", parent: { kind: "routine", id: "c9b4-no-such-routine" } },
			"c9b4-agent",
		);
		expect(result.problemCode).toBe("parent_not_found");
	});
});

// ---------------------------------------------------------------------------
// Case 10 — the eight combined cases of §4.3 (the cascade family, case 1, is
// its own describe block — case 14 below).
// ---------------------------------------------------------------------------

describe("case 10 — the combined cases of §4.3 (2, 3, 4, 5, 6, 7, 8)", () => {
	test("§4.3 case 2 — a move of a prompt document is refused by I10, never reaching D5", async ({
		app,
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "c10c2");
		await seedAgent(db, "c10c2-agent");
		await seedRoutine(db, "c10c2-routine", "c10c2-agent");
		const actions = buildRealActions(agentOrchestration);
		const doors = buildDoors(app, actions, db, eventBus, {
			agentId: "c10c2-agent",
			sessionId: "c10c2-sess",
		});
		const other = requireDoc((await doors.edit({ title: "elsewhere" })).human).document.id;
		// A routine parent is internal-only (`forbidden_parent_kind`) — seeded
		// through the internal path, never a client door.
		const prompt = requireDoc(
			await callInternal<DocumentView>(
				actions,
				db,
				eventBus,
				"edit_document",
				{ title: "prompt", slot: "prompt", parent: { kind: "routine", id: "c10c2-routine" } },
				FOUNDER_ID,
			),
		).document.id;
		const human = await callHuman<DocumentView>(app, "edit_document", {
			id: prompt,
			parent: { kind: "document", id: other },
		});
		expect(human.problemCode).toBe("slotted_document_cannot_move");
	});

	test('§4.3 case 3 — as:"artifact" + an explicit thread parent wins over the calling task\'s stamp', async ({
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

	test("§4.3 case 4 — a stale edit writes nothing, and cascades nothing", async ({ app, db }) => {
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

	test('§4.3 case 5 — as:"memory" + slot on create: the slot is forced to ordinary, silently', async ({
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

	test("§4.3 case 6 — upsert-with-id + version: a version on a create is ignored, not an error", async ({
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
		// own create, tripping D7 `stale` on the mismatched version.
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

	test("§4.3 case 7 — upsert-with-id + visibility: another person's id answers not_found and creates nothing", async ({
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
	});

	test("§4.3 case 8 (successful half) — a shared task's artifact is readable across teams", async ({
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
	test("§4.3 case 8 (refused half) — as:artifact + a private scope is refused", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
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
// @lore document-module B20: carried over from the deleted
// `knowledge-graduation.integration.test.ts` — the dedicated
// `POST /:id/graduate` route is gone with no successor route; graduating a
// task/thread-parented artifact into the document tree is now an ordinary
// `edit_document` parent change (§3.4/§3.5). `as` is derived, never stored,
// so moving `parent` from `{kind:"task",…}` to a `document` parent (or to
// the top of the tree, `parent: null`) is all "graduation" is.
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
// Case 13 — the A4 default-scope derivation, all three arms.
// ---------------------------------------------------------------------------

describe("case 13 — A4: actor's team, else the calling task's team, else factory", () => {
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
		// parent needs to SEE that parent (D8's own gate), which is a separate
		// concern from the widening-never-cascades property this case proves.
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

	test("1f a memory can never be in the tree — refused by I4, so no cascade can ever touch it", async ({
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
