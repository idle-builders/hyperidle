/**
 * BA5 §8/§13 (L5) — the filesystem-hold's inbox producer.
 *
 * Covers `registerFilesystemAttentionReactions`
 * (layers/core-api/src/services/filesystem-attention-reactions.ts), the ONLY
 * subscriber of orchestration's `filesystem_needs_attention` event
 * (architecture.md §4.6/§8: orchestration reads zero core-api state, its one
 * outward act is this event).
 *
 * Behavior under test:
 *   - one event naming two agents enqueues one `notification_queue` row that
 *     names the filesystem label, the reason, and both agents by name;
 *   - an event with NO agents (a failing check at registration, before any
 *     agent has the filesystem) drops the agents sentence from the body;
 *   - the reaction is never registered twice for the same `EventBus`.
 */

import { teams, users } from "@hyperidle/db";
import type { FilesystemNeedsAttentionEvent } from "@hyperidle/event-bus";
import { listNotifications } from "@hyperidle/notifications";
import { describe, expect, test, vi } from "../../__testing__/test-fixtures.js";
import { registerFilesystemAttentionReactions } from "../filesystem-attention-reactions.js";

const NOW = new Date().toISOString();

async function seedAgents(
	db: import("@hyperidle/db").HyperIdleDb,
	id: string,
): Promise<{ readonly agentAId: string; readonly agentBId: string }> {
	const teamId = `${id}-team`;
	const agentAId = `${id}-agent-a`;
	const agentBId = `${id}-agent-b`;
	await db.insert(teams).values({ id: teamId, name: id, phase: "build", createdAt: NOW });
	await db.insert(users).values([
		{
			id: agentAId,
			kind: "ai",
			name: "Agent A",
			role: "builder",
			status: "active",
			teamId,
			createdAt: NOW,
		},
		{
			id: agentBId,
			kind: "ai",
			name: "Agent B",
			role: "builder",
			status: "active",
			teamId,
			createdAt: NOW,
		},
	]);
	return { agentAId, agentBId };
}

function needsAttentionEvent(
	overrides: Partial<FilesystemNeedsAttentionEvent> = {},
): FilesystemNeedsAttentionEvent {
	return {
		type: "filesystem_needs_attention",
		streamId: "filesystem:fs-1",
		filesystemId: "fs-1",
		filesystemLabel: "https://github.com/acme/repo",
		agentIds: [],
		reason: "the GitHub token was rejected",
		timestamp: Date.now(),
		...overrides,
	};
}

describe("registerFilesystemAttentionReactions — orchestration's one outward act, turned into the inbox row", () => {
	test("one event naming two agents enqueues one row naming the filesystem, the reason and both agents", async ({
		db,
		eventBus,
	}) => {
		const { agentAId, agentBId } = await seedAgents(db, "fsattn-two");
		registerFilesystemAttentionReactions(db, eventBus);

		eventBus.emit(
			needsAttentionEvent({
				filesystemId: "fs-two",
				agentIds: [agentAId, agentBId],
			}),
		);

		await vi.waitFor(async () => {
			const rows = await listNotifications(db, {
				kind: "by-event-since",
				eventType: "filesystem_needs_attention",
				subjectId: "fs-two",
				since: "1970-01-01T00:00:00.000Z",
			});
			expect(rows).toHaveLength(1);
		});

		const [row] = await listNotifications(db, {
			kind: "by-event-since",
			eventType: "filesystem_needs_attention",
			subjectId: "fs-two",
			since: "1970-01-01T00:00:00.000Z",
		});
		expect(row?.status).toBe("pending");
		expect(row?.severity).toBe("blocking");
		expect(row?.sourceLink).toBe("/settings");
		expect(row?.title).toContain("https://github.com/acme/repo");
		expect(row?.body).toContain("the GitHub token was rejected");
		expect(row?.body).toContain("Agent A");
		expect(row?.body).toContain("Agent B");
	});

	test("an event with no agents drops the agents sentence — a failing check at registration, before any agent has it", async ({
		db,
		eventBus,
	}) => {
		registerFilesystemAttentionReactions(db, eventBus);

		eventBus.emit(
			needsAttentionEvent({
				filesystemId: "fs-no-agents",
				agentIds: [],
				reason: "Install git",
			}),
		);

		await vi.waitFor(async () => {
			const rows = await listNotifications(db, {
				kind: "by-event-since",
				eventType: "filesystem_needs_attention",
				subjectId: "fs-no-agents",
				since: "1970-01-01T00:00:00.000Z",
			});
			expect(rows).toHaveLength(1);
		});

		const [row] = await listNotifications(db, {
			kind: "by-event-since",
			eventType: "filesystem_needs_attention",
			subjectId: "fs-no-agents",
			since: "1970-01-01T00:00:00.000Z",
		});
		expect(row?.body).toContain("Install git");
		expect(row?.body).not.toContain("won't start work");
	});

	test("registering twice on the same EventBus does not double-enqueue", async ({
		db,
		eventBus,
	}) => {
		const { agentAId } = await seedAgents(db, "fsattn-dupe");
		registerFilesystemAttentionReactions(db, eventBus);
		registerFilesystemAttentionReactions(db, eventBus);

		eventBus.emit(needsAttentionEvent({ filesystemId: "fs-dupe-reg", agentIds: [agentAId] }));

		await vi.waitFor(async () => {
			const rows = await listNotifications(db, {
				kind: "by-event-since",
				eventType: "filesystem_needs_attention",
				subjectId: "fs-dupe-reg",
				since: "1970-01-01T00:00:00.000Z",
			});
			expect(rows.length).toBeGreaterThan(0);
		});

		const rows = await listNotifications(db, {
			kind: "by-event-since",
			eventType: "filesystem_needs_attention",
			subjectId: "fs-dupe-reg",
			since: "1970-01-01T00:00:00.000Z",
		});
		expect(rows).toHaveLength(1);
	});
});
