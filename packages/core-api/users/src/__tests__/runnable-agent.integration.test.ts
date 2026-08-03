/**
 * AU21 Increment 3, Wave 0 (RED) — the shared ast-<userId> runnability
 * invariant (architecture.md §6 Decision B's placement ruling: "the one
 * truly cross-cutting piece — `requireRunnableActor`
 * (`session-requests/src/service.ts:700-705`; identical in every branch,
 * reads only `users`) — moves to ONE exported helper in
 * `packages/core-api/users/src/` (alongside `user-store.ts`)").
 *
 * Every family resolver (built in later Increment-3 waves) imports this ONE
 * helper via ordinary same-layer core-api DI instead of re-implementing the
 * `kind==="ai"` + `active`/`idle` check inline. This is Wave 0's job to
 * build; `session-requests`'s own `requireRunnableActor` is untouched for now
 * (the drain still needs it for the not-yet-migrated `routine_run` case).
 *
 * Currently RED: no such export exists anywhere under
 * `packages/core-api/users/src/` (nor from its barrel, `@hyperidle/users`) —
 * this import will fail to resolve at runtime.
 *
 * @lore naming: the architecture doc does not pin an exact export name for
 * this NEW shared copy (only `session-requests`'s existing internal
 * `requireRunnableActor` is named). `requireRunnableAgent` is this test's
 * best-guess interpretation, flagged for reviewer confirmation — if the
 * implementer picks a different name, only this import line changes.
 */

import { users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";

describe("requireRunnableAgent — shared ast-<userId> runnability invariant", () => {
	test("resolves the real user row for an active AI agent", async ({ db }) => {
		const { requireRunnableAgent } = await import("../index.js");
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "wave0-runnable-agent",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		});

		const agent = await requireRunnableAgent(db, "wave0-runnable-agent");
		expect(agent).toMatchObject({ id: "wave0-runnable-agent", kind: "ai", status: "active" });
	});

	test("resolves an idle AI agent as runnable", async ({ db }) => {
		const { requireRunnableAgent } = await import("../index.js");
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "wave0-idle-agent",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "idle",
			createdAt: now,
		});

		await expect(requireRunnableAgent(db, "wave0-idle-agent")).resolves.toMatchObject({
			id: "wave0-idle-agent",
		});
	});

	test("rejects a human user id (never trusts the human sender as the agent)", async ({ db }) => {
		const { requireRunnableAgent } = await import("../index.js");
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "wave0-human-sender",
			kind: "human",
			name: "Human",
			role: "founder",
			status: "active",
			createdAt: now,
		});

		await expect(requireRunnableAgent(db, "wave0-human-sender")).rejects.toThrow();
	});

	test("rejects a deactivated (non active/idle) AI agent", async ({ db }) => {
		const { requireRunnableAgent } = await import("../index.js");
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "wave0-retired-agent",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "retired",
			createdAt: now,
		});

		await expect(requireRunnableAgent(db, "wave0-retired-agent")).rejects.toThrow();
	});

	test("rejects an id that does not correspond to any user row", async ({ db }) => {
		const { requireRunnableAgent } = await import("../index.js");
		await expect(requireRunnableAgent(db, "wave0-does-not-exist")).rejects.toThrow();
	});
});
