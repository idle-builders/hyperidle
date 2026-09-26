/**
 * `requireRunnableAgent` — the shared runnability invariant every family
 * resolver imports instead of re-implementing the `kind==="ai"` +
 * `active`/`idle` check inline (architecture.md §6 Decision B).
 */

import { users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { requireRunnableAgent } from "../index.js";

describe("requireRunnableAgent — shared ast-<userId> runnability invariant", () => {
	test("resolves the real user row for an active AI agent", async ({ db }) => {
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
		await expect(requireRunnableAgent(db, "wave0-does-not-exist")).rejects.toThrow();
	});
});
