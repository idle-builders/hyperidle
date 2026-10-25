/**
 * First start makes the person, their team, their first agent on the program that is signed in,
 * and the first conversation with the agent's hello in it — once, and only with a program ready.
 * The machine's programs are the one stand-in: a reader answering the descriptors given.
 */
import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import { type HyperIdleDb, messages, threads, users } from "@hyperidle/db";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import type { EventBus } from "@hyperidle/event-bus";
import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import { findUser } from "@hyperidle/user";
import { Hono } from "hono";
import { describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";
import { buildCoreActions } from "../../actions/compose.js";
import type { HarnessCapabilityReader } from "../../services/harness-capability-reader.js";
import { createStartRoutes } from "../start.js";

const program = (state: "ready" | "unauthenticated"): HarnessCapabilityDescriptor => ({
	type: "claude-code",
	name: "Claude Code",
	kind: "local",
	authAction: { kind: "native_cli_login", label: "Sign in", command: ["claude", "login"] },
	discovery: { state },
	models: [],
	modelProviders: ["anthropic"],
});

/** The start routes as production mounts them, the actor resolved as the auth layer does. */
function startApp(
	{
		db,
		eventBus,
		agentOrchestration,
	}: { db: HyperIdleDb; eventBus: EventBus; agentOrchestration: AgentOrchestrationPort },
	state: "ready" | "unauthenticated",
) {
	const looked: string[] = [];
	const machine: HarnessCapabilityReader = {
		size: 1,
		describe: () => [program(state)],
		refresh: async () => {
			looked.push("again");
		},
	};
	const actions = buildCoreActions({
		agentOrchestration,
		agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
		reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
		adapterPool: machine,
	});
	const app = new Hono<HyperIdleEnv>();
	app.use("*", async (c, next) => {
		c.set("userId", (await findUser(db, { kind: "human" }))?.id ?? "u-founder");
		await next();
	});
	app.route(
		"/start",
		createStartRoutes(db, eventBus, actions, () => machine.refresh()),
	);
	const start = () =>
		app.request("/start", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "Ada", team: "Product" }),
		});
	return { app, start, looked };
}

describe("first start", () => {
	test("makes the person, their first agent and the first conversation with its hello, once", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { start } = startApp({ db, eventBus, agentOrchestration }, "ready");
		const res = await start();
		expect(res.status).toBe(200);

		const everyone = await db.select().from(users);
		const people = everyone.filter((u) => u.kind === "human");
		const agents = everyone.filter((u) => u.kind === "ai" && u.role !== "system");
		expect(people.map((p) => p.name)).toEqual(["Ada"]);
		expect(agents.map((a) => [a.name, a.ownerUserId])).toEqual([["Builder", people[0]?.id]]);

		const { threadId } = (await res.json()) as { threadId: string };
		const [thread] = await db.select().from(threads);
		expect(thread?.id).toBe(threadId);
		expect(thread?.title).toBe("Getting started");
		const said = await db.select().from(messages);
		expect(said.map((m) => [m.senderId, JSON.parse(m.payload).text])).toEqual([
			[
				agents[0]?.id,
				"Hi. I run on Claude Code on this computer, so I can already read and change files here. What are you working on?",
			],
		]);

		expect((await start()).status).toBe(409);
	});

	test("with no program signed in it makes nothing; Look again looks", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { app, start, looked } = startApp(
			{ db, eventBus, agentOrchestration },
			"unauthenticated",
		);
		const look = await app.request("/start/look", { method: "POST" });
		expect(looked).toEqual(["again"]);
		expect(((await look.json()) as { runsOn: unknown[] }).runsOn).toEqual([
			expect.objectContaining({ discovery: { state: "unauthenticated" } }),
		]);

		expect((await start()).status).toBe(409);
		expect((await db.select().from(users)).filter((u) => u.kind === "human")).toEqual([]);
	});
});
