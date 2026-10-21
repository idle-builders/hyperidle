/**
 * A fresh install is empty underneath the welcome screen.
 *
 * Boot writes only the hidden system actor — the row system writes are
 * attributed to — and no list of users shows it. The welcome screen then
 * makes two `edit_user` calls: the person with their team, and their
 * assistant, owned by them, on the picked harness, with no identity text and
 * one subscription per object event, none with a prompt. After that the
 * install holds the person, their team and one agent: no second agent, no
 * documents of any kind.
 *
 * Driven through the real app on a freshly migrated database: the boot face
 * the desktop app calls on every launch, then the same two request bodies the
 * welcome screen sends, then `search_users`/`open_user` read it back.
 */
import { documents, subscriptions, teams, users } from "@hyperidle/db";
import { OBJECT_EVENTS, type UserRow, type UserView } from "@hyperidle/domain-model";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { applyFactoryCoreState } from "../bootstrap/factory-state.js";

interface ActionEnvelope<T> {
	readonly ok: boolean;
	readonly data: T;
	readonly problems?: unknown;
}

async function call<T>(
	app: { request: (path: string, init: RequestInit) => Response | Promise<Response> },
	name: string,
	body: Record<string, unknown>,
): Promise<T> {
	const res = await app.request(`/api/actions/${name}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	const envelope = (await res.json()) as ActionEnvelope<T>;
	if (res.status !== 200 || !envelope.ok) {
		throw new Error(`${name} failed (${res.status}): ${JSON.stringify(envelope)}`);
	}
	return envelope.data;
}

const PICKED_HARNESS = { harnessType: "claude-code" };

describe("a fresh install", () => {
	test("boot writes only the hidden system actor, again and again", async ({ db, app }) => {
		await applyFactoryCoreState(db);
		await applyFactoryCoreState(db);

		const rows = await db.select({ id: users.id, role: users.role }).from(users);
		expect(rows).toEqual([{ id: "system:propagation", role: "system" }]);

		expect(await call<UserRow[]>(app, "search_users", {})).toEqual([]);
		expect(await call<UserRow[]>(app, "search_users", { kind: "ai" })).toEqual([]);
		const named = await call<UserRow[]>(app, "search_users", { ids: ["system:propagation"] });
		expect(named.map((u) => u.id)).toEqual(["system:propagation"]);

		expect(await db.select().from(documents)).toEqual([]);
	});

	test("after the welcome screen's two calls: the person, their team and one assistant with nine empty subscriptions", async ({
		db,
		app,
	}) => {
		await applyFactoryCoreState(db);

		const person = await call<UserView>(app, "edit_user", {
			kind: "human",
			name: "Ada",
			teams: ["My Team"],
		});
		const personId = person.user?.id;
		expect(personId).toBeDefined();

		await call<UserView>(app, "edit_user", {
			kind: "ai",
			name: "Ada's Assistant",
			role: "assistant",
			agentCategory: "individual",
			ownerUserId: personId,
			teams: ["My Team"],
			runConfig: PICKED_HARNESS,
			subscriptions: { add: OBJECT_EVENTS.map((event) => ({ event })) },
		});

		const agents = await call<UserRow[]>(app, "search_users", { kind: "ai" });
		expect(agents).toHaveLength(1);
		const [assistant] = agents;
		expect(assistant?.ownerUserId).toBe(personId);
		expect(assistant?.name).toBe("Ada's Assistant");

		const everyone = await call<UserRow[]>(app, "search_users", {});
		expect(everyone.map((u) => u.id).sort()).toEqual([personId, assistant?.id].sort());

		const opened = await call<UserView>(app, "open_user", { id: assistant?.id });
		expect(opened.runConfig?.harnessType).toBe("claude-code");
		expect(opened.subscriptions.map((s) => s.event).sort()).toEqual([...OBJECT_EVENTS].sort());
		expect(opened.subscriptions.every((s) => s.documentId === null && !s.paused)).toBe(true);
		expect(opened.documentIds).toEqual([]);

		const rows = await db.select().from(subscriptions);
		expect(rows).toHaveLength(OBJECT_EVENTS.length);
		expect(rows.every((r) => r.userId === assistant?.id)).toBe(true);

		expect(await db.select().from(documents)).toEqual([]);
		expect(await db.select().from(teams)).toHaveLength(1);
	});
});
