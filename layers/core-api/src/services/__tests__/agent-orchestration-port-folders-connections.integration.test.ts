/**
 * Folders and connections
 * cross `AgentOrchestrationPort` the way `runConfig` already does: the
 * logic is extracted from `agent-orchestration`'s own `connections.ts` and
 * `filesystems.ts` routes, so this test drives the same behaviour through
 * the composed app's real in-process transport, never a stub.
 */

import { teams, users } from "@hyperidle/db";
import { describe, expect, test, vi } from "../../__testing__/test-fixtures.js";
import {
	buildAgentOrchestrationPort,
	createInProcessAgentOrchestrationTransport,
} from "../agent-orchestration-port-composition.js";

const NOW = "2026-09-23T00:00:00.000Z";

describe("AgentOrchestrationPort — folders and connections", () => {
	test("folders: add, list, give, take, remove", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-folders-key");
		await db.insert(teams).values({ id: "aop-fold-team", name: "aop-fold", createdAt: NOW });
		await db.insert(users).values({
			id: "aop-fold-agent",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "idle",
			createdAt: NOW,
		});
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		const added = await port.folders.add("aop-fold-team", {
			kind: "doc_set",
			resourceRef: { kind: "doc_set", folder: "docs" },
			writeback: "none",
		});
		expect(added.ok).toBe(true);
		if (!added.ok) throw new Error("unreachable");
		const folderId = added.folder.id;
		expect(added.folder.teamId).toBe("aop-fold-team");

		const listedByTeam = await port.folders.list({ teamId: "aop-fold-team" });
		expect(listedByTeam.map((f) => f.id)).toContain(folderId);

		const given = await port.folders.give(folderId, "aop-fold-agent");
		expect(given.ok).toBe(true);

		const listedByAgent = await port.folders.list({ agentUserId: "aop-fold-agent" });
		expect(listedByAgent.map((f) => f.id)).toEqual([folderId]);

		const taken = await port.folders.take(folderId, "aop-fold-agent");
		expect(taken.ok).toBe(true);

		expect(await port.folders.list({ agentUserId: "aop-fold-agent" })).toEqual([]);

		const removed = await port.folders.remove(folderId);
		expect(removed.ok).toBe(true);

		const listedAfterRemove = await port.folders.list({ teamId: "aop-fold-team" });
		expect(listedAfterRemove.map((f) => f.id)).not.toContain(folderId);
	});

	test("folders.add reports failure for an unknown team", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-folders-key-404");
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		const result = await port.folders.add("aop-fold-does-not-exist", {
			kind: "doc_set",
			resourceRef: { kind: "doc_set", folder: "docs" },
			writeback: "none",
		});
		expect(result.ok).toBe(false);
	});

	test("folders.remove and folders.take report NOT_FOUND for an unknown id", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-folders-key-nf");
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		const removed = await port.folders.remove("aop-fold-does-not-exist");
		expect(removed).toEqual({ ok: false, code: "NOT_FOUND" });

		const taken = await port.folders.take("aop-fold-does-not-exist", "aop-fold-agent");
		expect(taken).toEqual({ ok: false, code: "NOT_FOUND" });
	});

	test("connections: add, list, remove", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-conn-key");
		await db.insert(users).values({
			id: "aop-conn-user",
			kind: "human",
			name: "Human",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		const added = await port.connections.add("aop-conn-user", {
			service: "GitHub",
			authSource: "token",
			token: "secret-token-value",
		});
		expect(added.ok).toBe(true);
		if (!added.ok) throw new Error("unreachable");
		expect(added.connection.service).toBe("GitHub");
		expect(added.connection.authSource).toBe("token");
		expect((added.connection as unknown as Record<string, unknown>).encryptedToken).toBeUndefined();
		expect((added.connection as unknown as Record<string, unknown>).token).toBeUndefined();

		const listed = await port.connections.list("aop-conn-user");
		expect(listed.connections.map((c) => c.id)).toContain(added.connection.id);
		expect(listed.inherited).toEqual([]);

		const removed = await port.connections.remove("aop-conn-user", added.connection.id);
		expect(removed.ok).toBe(true);

		const listedAfterRemove = await port.connections.list("aop-conn-user");
		expect(listedAfterRemove.connections.map((c) => c.id)).not.toContain(added.connection.id);
	});

	test("connections.remove reports NOT_FOUND for an unknown id", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-conn-key-nf");
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		const removed = await port.connections.remove("aop-conn-user-nf", "sc-does-not-exist");
		expect(removed).toEqual({ ok: false, code: "NOT_FOUND" });
	});
});
