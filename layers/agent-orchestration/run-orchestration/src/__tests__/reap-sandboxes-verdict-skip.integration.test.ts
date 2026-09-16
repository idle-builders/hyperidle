/**
 * N8 (BA5 no-teardown §1/§7) — the workspace reaper skips a terminal
 * session's directory when a human still owes it a verdict. Nothing else
 * deletes a session's directory any more (`transition-run.ts`'s own delete
 * is gone), so this is the ONLY remaining way to break the ruling's promise
 * that a resume finds its files: a verdict answered after the reaper's TTL
 * must not resume into a directory that is gone.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, sessions, teams, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { afterEach } from "vitest";
import { createRuntimeReapers } from "../runtime-reapers.js";
import { recordReviewSession } from "../review-sessions.js";

const NOW_MS = Date.parse("2026-09-16T00:00:00.000Z");
const ENDED_LONG_AGO = new Date(NOW_MS - 48 * 60 * 60 * 1000).toISOString(); // 2 days ago

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
function tempDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "n8-reaper-"));
	dirs.push(dir);
	return dir;
}

async function seedTerminalSession(
	db: HyperIdleDb,
	id: string,
	sandboxSnapshot: string,
): Promise<void> {
	const teamId = `${id}-team`;
	const agentId = `${id}-agent`;
	await db.insert(teams).values({ id: teamId, name: "T", phase: "build", createdAt: ENDED_LONG_AGO });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		teamId,
		createdAt: ENDED_LONG_AGO,
	});
	await db.insert(sessions).values({
		id,
		agentId,
		modelTier: "workhorse",
		startedAt: ENDED_LONG_AGO,
		endedAt: ENDED_LONG_AGO,
		state: "done",
		outcome: "completed",
		sandboxSnapshot,
	});
}

describe("reapSandboxesOnce skips a session that awaits a review verdict (N8)", () => {
	test("a terminal session past the TTL that awaits a verdict keeps its directory; one that does not is reclaimed", async ({
		db,
	}) => {
		const sandboxBasePath = tempDir();
		const askedDir = fs.mkdtempSync(path.join(sandboxBasePath, "asked-"));
		const quietDir = fs.mkdtempSync(path.join(sandboxBasePath, "quiet-"));

		await seedTerminalSession(db as HyperIdleDb, "sess-n8-asked", askedDir);
		await seedTerminalSession(db as HyperIdleDb, "sess-n8-quiet", quietDir);
		await recordReviewSession(
			db as HyperIdleDb,
			{ reviewMessageId: "review-n8-asked", sessionId: "sess-n8-asked" },
			ENDED_LONG_AGO,
		);

		const reapers = createRuntimeReapers(
			db as HyperIdleDb,
			new EventBus(),
			{} as Parameters<typeof createRuntimeReapers>[2],
		);
		await reapers.reapSandboxes({ sandboxBasePath, ttlMs: 60 * 60 * 1000 });

		expect(
			fs.existsSync(askedDir),
			"a verdict answered on day two must still find a directory to resume into",
		).toBe(true);
		expect(fs.existsSync(quietDir)).toBe(false);
	});
});
