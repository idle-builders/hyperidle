/**
 * BA5 §2.6/§4.5 — `recordFilesystemNeedsAttention`: the ONE call site that
 * writes a filesystem into `needs_attention` and, only on the transition INTO
 * that state, emits `filesystem_needs_attention` — whatever the cause. A
 * second failure on a row already there updates only the reason and emits
 * nothing (the once-per-episode guarantee this function itself owns, on top
 * of the registry's conditional update).
 */
import { teams, users } from "@hyperidle/db";
import { test } from "@hyperidle/db/test-fixtures";
import type { FilesystemNeedsAttentionEvent } from "@hyperidle/event-bus";
import { EventBus } from "@hyperidle/event-bus";
import { getFilesystem, saveFilesystem, saveInjection } from "@hyperidle/filesystems";
import { describe, expect } from "vitest";
import { recordFilesystemNeedsAttention } from "../filesystem-attention.js";

const NOW = "2026-09-11T00:00:00.000Z";

describe("recordFilesystemNeedsAttention", () => {
	test("first entry writes the row and emits exactly one event naming the picked agents", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const events: FilesystemNeedsAttentionEvent[] = [];
		eventBus.on("filesystem_needs_attention", (e) => events.push(e));

		await db
			.insert(teams)
			.values({ id: "team-fa-1", name: "FA Team", phase: "build", createdAt: NOW });
		await db.insert(users).values({
			id: "agent-fa-1",
			kind: "ai",
			name: "FA Agent",
			role: "builder",
			status: "active",
			createdAt: NOW,
		});
		const filesystemId = "fs-attention-1";
		await saveFilesystem(db, {
			id: filesystemId,
			teamId: "team-fa-1",
			source: "github",
			kind: "code",
			connectionId: null,
			resourceRef: JSON.stringify({
				kind: "code",
				repo: "https://github.com/acme/repo.git",
				branch: "main",
			}),
			state: "attached",
			createdAt: NOW,
		});
		await saveInjection(db, { agentUserId: "agent-fa-1", filesystemId, createdAt: NOW });

		await recordFilesystemNeedsAttention(db, eventBus, filesystemId, "Install git");

		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			type: "filesystem_needs_attention",
			filesystemId,
			filesystemLabel: "https://github.com/acme/repo.git",
			agentIds: ["agent-fa-1"],
			reason: "Install git",
		});
		expect(await getFilesystem(db, filesystemId)).toMatchObject({
			state: "needs_attention",
			attentionReason: "Install git",
		});

		// A SECOND failure on the same, already-attention row: reason updates, no new event.
		await recordFilesystemNeedsAttention(db, eventBus, filesystemId, "branch not found");
		expect(events).toHaveLength(1);
		expect(await getFilesystem(db, filesystemId)).toMatchObject({
			attentionReason: "branch not found",
		});
	});

	test("with no eventBus supplied, the write still lands but nothing is emitted", async ({
		db,
	}) => {
		await db
			.insert(teams)
			.values({ id: "team-fa-2", name: "FA Team 2", phase: "build", createdAt: NOW });
		const filesystemId = "fs-attention-2";
		await saveFilesystem(db, {
			id: filesystemId,
			teamId: "team-fa-2",
			source: "local",
			kind: "doc_set",
			connectionId: null,
			resourceRef: JSON.stringify({ kind: "doc_set", folder: "/tmp/notes" }),
			state: "attached",
			createdAt: NOW,
		});

		await recordFilesystemNeedsAttention(db, undefined, filesystemId, "folder does not exist");
		expect(await getFilesystem(db, filesystemId)).toMatchObject({ state: "needs_attention" });
	});
});
