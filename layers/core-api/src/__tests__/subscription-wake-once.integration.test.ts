/**
 * An agent subscribed to everything wakes once per change.
 *
 * A change whose own path already starts an agent's work — a person's
 * message to their assistant, a task handed to an agent, a verdict on its
 * review — names that agent on its event, and that agent's subscriptions
 * skip it. A subscription only hears changes made after it exists, so an
 * agent never wakes on its own creation. Driven through the real app: the
 * real `send_message`/`edit_task`/`edit_user` actions and the subscription
 * fire mechanism `app.ts` registers, counted on `agent_work_intents`.
 */
import {
	agentWorkIntents,
	type HyperIdleDb,
	messages,
	subscriptions,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { ObjectChangeEvent } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const EARLIER = "2026-01-01T00:00:00.000Z";

interface ActionEnvelope<T> {
	readonly ok: boolean;
	readonly data?: T;
	readonly problems?: unknown;
}

async function call<T>(
	app: { request: (path: string, init: RequestInit) => Response | Promise<Response> },
	name: string,
	body: Record<string, unknown>,
): Promise<ActionEnvelope<T>> {
	const res = await app.request(`/api/actions/${name}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	const envelope = (await res.json()) as ActionEnvelope<T>;
	if (res.status !== 200 || !envelope.ok) {
		throw new Error(`${name} failed (${res.status}): ${JSON.stringify(envelope)}`);
	}
	return envelope;
}

async function seedFounder(db: HyperIdleDb, id: string, teamId: string): Promise<void> {
	await db.insert(teams).values({ id: teamId, name: teamId, createdAt: EARLIER });
	await db.insert(users).values({
		id,
		kind: "human",
		name: "Founder",
		role: "founder",
		status: "active",
		teamId,
		createdAt: EARLIER,
	});
}

async function subscribe(
	db: HyperIdleDb,
	userId: string,
	events: readonly (typeof subscriptions.$inferInsert)["event"][],
): Promise<void> {
	for (const event of events) {
		await db.insert(subscriptions).values({
			id: `sub-${userId}-${event}`,
			userId,
			event,
			schedule: null,
			paused: false,
			nextRunAt: null,
			createdAt: EARLIER,
			updatedAt: EARLIER,
		});
	}
}

async function intentsFor(db: HyperIdleDb, agentId: string) {
	const rows = await db.select().from(agentWorkIntents);
	return rows.filter((r) => r.sourceId.includes(agentId) || r.requestedBy === agentId);
}

describe("an agent subscribed to everything wakes once per change", () => {
	test("a person's first message to their assistant starts one session, not one per subscription", async ({
		db,
		app,
	}) => {
		await seedFounder(db, "founder-once-dm", "team-once-dm");
		await db.insert(users).values({
			id: "assistant-once-dm",
			kind: "ai",
			name: "Founder's Assistant",
			role: "assistant",
			status: "active",
			agentCategory: "individual",
			ownerUserId: "founder-once-dm",
			createdAt: EARLIER,
		});
		await subscribe(db, "assistant-once-dm", ["thread.created", "thread.message"]);

		await call(app, "send_message", { recipients: ["assistant-once-dm"], text: "hello" });

		await vi.waitFor(async () => {
			const intents = await intentsFor(db, "assistant-once-dm");
			expect(intents.map((i) => i.kind)).toEqual(["thread_turn"]);
		});
	});

	test("a task handed to an agent starts its task run and nothing else", async ({ db, app }) => {
		await seedFounder(db, "founder-once-task", "team-once-task");
		await db.insert(users).values({
			id: "agent-once-task",
			kind: "ai",
			name: "Team agent",
			role: "agent",
			status: "active",
			agentCategory: "team",
			teamId: "team-once-task",
			createdAt: EARLIER,
		});
		await subscribe(db, "agent-once-task", ["task.changed"]);
		await db.insert(threads).values({
			id: "thread-once-task",
			hostKind: "team",
			hostId: "team-once-task",
			initiatorId: "founder-once-task",
			participants: "[]",
			lastActiveAt: EARLIER,
			createdAt: EARLIER,
		});
		await db.insert(tasks).values({
			id: "task-once-task",
			threadId: "thread-once-task",
			teamId: "team-once-task",
			ownerAgentId: null,
			title: "Hand me over",
			state: "proposed",
			createdAt: EARLIER,
			updatedAt: EARLIER,
		});

		await call(app, "edit_task", {
			id: "task-once-task",
			ownerAgentId: "agent-once-task",
			state: "accepted",
		});

		await vi.waitFor(async () => {
			const intents = await intentsFor(db, "agent-once-task");
			expect(intents.map((i) => i.kind)).toEqual(["task_run"]);
		});
	});

	test("an agent created with subscriptions does not wake on its own creation", async ({
		db,
		app,
	}) => {
		await seedFounder(db, "founder-once-new", "team-once-new");
		// A subscriber that EXISTS BEFORE the create — it DOES wake on it. Its
		// real intent is the completion signal that the same user.created
		// subscription pass has run, in place of a fixed wait, before checking
		// the just-created agent's own subscriptions produced nothing.
		await db.insert(users).values({
			id: "sentinel-once-new",
			kind: "ai",
			name: "Sentinel",
			role: "assistant",
			status: "active",
			agentCategory: "individual",
			ownerUserId: "founder-once-new",
			createdAt: EARLIER,
		});
		await subscribe(db, "sentinel-once-new", ["user.created"]);

		const created = await call<{ user: { id: string } | null }>(app, "edit_user", {
			kind: "ai",
			name: "Founder's Assistant",
			role: "assistant",
			ownerUserId: "founder-once-new",
			subscriptions: { add: [{ event: "user.created" }, { event: "user.changed" }] },
		});

		await vi.waitFor(async () => {
			const intents = await intentsFor(db, "sentinel-once-new");
			expect(intents.map((i) => i.kind)).toEqual(["subscription_run"]);
		});

		const agentId = created.data?.user?.id ?? "";
		expect(agentId).not.toBe("");
		const ownIntents = await intentsFor(db, agentId);
		expect(ownIntents.filter((r) => r.kind === "subscription_run")).toEqual([]);
	});

	test("a verdict on an agent's review names the agent on every change it makes", async ({
		db,
		app,
		eventBus,
	}) => {
		await seedFounder(db, "founder-once-verdict", "team-once-verdict");
		await db.insert(users).values([
			{
				id: "agent-once-verdict",
				kind: "ai",
				name: "Reviewer's agent",
				role: "agent",
				status: "active",
				teamId: "team-once-verdict",
				createdAt: EARLIER,
			},
			{
				id: "colleague-once-verdict",
				kind: "human",
				name: "Colleague",
				role: "member",
				status: "active",
				teamId: "team-once-verdict",
				createdAt: EARLIER,
			},
		]);
		await db.insert(threads).values({
			id: "thread-once-verdict",
			hostKind: "user",
			hostId: "founder-once-verdict",
			initiatorId: "agent-once-verdict",
			participants: JSON.stringify([
				"founder-once-verdict",
				"agent-once-verdict",
				"colleague-once-verdict",
			]),
			lastActiveAt: EARLIER,
			createdAt: EARLIER,
		});
		await db.insert(messages).values({
			id: "review-once-verdict",
			senderId: "agent-once-verdict",
			threadId: "thread-once-verdict",
			type: "review",
			payload: JSON.stringify({ title: "May I ship?", reasoning: ["It is ready."] }),
			clientKey: "review-once-verdict-key",
			createdAt: EARLIER,
		});

		const seen: ObjectChangeEvent[] = [];
		const off = [
			eventBus.on("thread.message", (e) => {
				seen.push(e);
			}),
			eventBus.on("thread.changed", (e) => {
				seen.push(e);
			}),
		];
		try {
			const sent = await call<{ message: { id: string } }>(app, "send_message", {
				threadId: "thread-once-verdict",
				verdict: { resolvesMessageId: "review-once-verdict", decision: "approve" },
			});
			const verdictMessageId = sent.data?.message.id;
			const verdictEvents = seen.filter(
				(e) =>
					e.change.actor === "founder-once-verdict" &&
					(e.change.kind === "changed" ||
						(e.change.after as { messageId?: string }).messageId === verdictMessageId),
			);
			expect(verdictEvents.map((e) => e.type).sort()).toEqual(["thread.changed", "thread.message"]);
			for (const event of verdictEvents) {
				expect(event.woke).toContain("agent-once-verdict");
			}
		} finally {
			for (const unsubscribe of off) unsubscribe();
		}
		const [thread] = await db.select().from(threads).where(eq(threads.id, "thread-once-verdict"));
		expect(thread?.resolvedAt).not.toBeNull();
	});
});
