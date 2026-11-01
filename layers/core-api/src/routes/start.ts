import type { HyperIdleDb } from "@hyperidle/db";
import {
	type AdjustThreadInput,
	API_ERROR_CODES,
	type ApiErrorResponse,
	type EditUserInput,
	type OpenUserInput,
	type SendMessageInput,
	type SendMessageOutput,
	type ThreadView,
	type UserView,
} from "@hyperidle/domain-model";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import type { EventBus } from "@hyperidle/event-bus";
import { findUser, givePersonKey } from "@hyperidle/user";
import { Hono } from "hono";
import z from "zod";
import type { Action, ActionContext } from "../actions/action.js";
import { runnerFor } from "../actions/compose.js";

/**
 * First start, on a fresh install: no person has a row yet. It looks for the agent programs on
 * this computer, and makes the person, their team, their first agent on a program that is
 * signed in, and the first conversation, where that agent says hello.
 *
 * The hello is a real message the server writes as the agent, so the thread holds what the person
 * sees and the agent reads it back when it answers. It says only what is true at that moment:
 * which program the agent runs on.
 */
const FIRST_AGENT = "Builder";
const FIRST_THREAD = "Getting started";

const START_SCHEMA = z.object({
	name: z.string().trim().min(1).max(80),
	team: z.string().trim().min(1).max(80),
});

function hello(program: string): string {
	return `Hi. I run on ${program} on this computer, so I can already read and change files here. What are you working on?`;
}

function refuse(c: { json: (body: ApiErrorResponse, status: 400 | 409) => Response }) {
	return (status: 400 | 409, error: string, code: ApiErrorResponse["code"]) =>
		c.json({ error, code }, status);
}

export function createStartRoutes(
	db: HyperIdleDb,
	eventBus: EventBus,
	actions: readonly Action[],
	/** Look for the agent programs again: what was installed or signed in since. */
	redetect: () => Promise<void>,
): Hono<HyperIdleEnv> {
	const openUser = runnerFor<OpenUserInput, UserView>(actions, "open_user");
	const editUser = runnerFor<EditUserInput, UserView>(actions, "edit_user");
	const adjustThread = runnerFor<AdjustThreadInput, ThreadView>(actions, "adjust_thread");
	const sendMessage = runnerFor<SendMessageInput, SendMessageOutput>(actions, "send_message");
	const ctx = (actor: string): ActionContext => ({
		actor,
		db,
		eventBus,
		now: new Date().toISOString(),
	});
	const router = new Hono<HyperIdleEnv>();

	router.post("/look", async (c) => {
		await redetect();
		const me = await openUser(ctx(c.get("userId")), {});
		return c.json({ runsOn: me.ok ? me.data.runsOn : [] });
	});

	router.post("/", async (c) => {
		const no = refuse(c);
		const parsed = START_SCHEMA.safeParse(await c.req.json().catch(() => null));
		if (!parsed.success)
			return no(400, "Give your name and your team's name.", API_ERROR_CODES.VALIDATION_ERROR);
		const me = await openUser(ctx(c.get("userId")), {});
		if (!me.ok || (await findUser(db, { kind: "human" })))
			return no(409, "HyperIdle has already started here.", API_ERROR_CODES.CONFLICT);
		const program = me.data.runsOn.find(
			(h) => h.discovery.state === "ready" && h.discovery.disabled !== true,
		);
		if (!program)
			return no(409, "No agent program is signed in on this computer.", API_ERROR_CODES.CONFLICT);

		const { name, team } = parsed.data;
		const person = await editUser(ctx(c.get("userId")), { kind: "human", name, teams: [team] });
		const you = person.ok ? person.data.user?.id : undefined;
		if (!you) throw new Error("first start: the person was not made");
		// The laptop's one person: the key this computer already holds becomes theirs.
		await givePersonKey(db, you, c.req.header("X-API-Key") ?? "");
		const agent = await editUser(ctx(you), {
			kind: "ai",
			name: FIRST_AGENT,
			agentCategory: "individual",
			ownerUserId: you,
			teams: [team],
			runConfig: {
				harnessType: program.type as NonNullable<EditUserInput["runConfig"]>["harnessType"],
			},
		});
		const agentId = agent.ok ? agent.data.user?.id : undefined;
		if (!agentId) throw new Error("first start: the first agent was not made");
		const thread = await adjustThread(ctx(you), { title: FIRST_THREAD, members: [agentId] });
		if (!thread.ok) throw new Error("first start: the first conversation was not made");
		const said = await sendMessage(ctx(agentId), {
			threadId: thread.data.thread.id,
			text: hello(program.name),
		});
		if (!said.ok) throw new Error("first start: the first agent could not say hello");
		return c.json({ threadId: thread.data.thread.id });
	});

	return router;
}
