/**
 * Brownfield migration test for 0085 (the thread module).
 *
 * Every task must end up with a real thread hosted by
 * its team, a double-hosted task takes the oldest of its threads, a fresh
 * seed's membership carries BOTH the owner agent and the first human when
 * both exist, no thread stays hosted by a task, `items` and
 * `messages.legacy_item_id` are dropped, and `assistant_turn` becomes
 * `thread_turn`.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { agentSessionRequestInputSchema } from "@hyperidle/domain-model";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, describe, expect, it } from "vitest";

const DIRNAME = fileURLToPath(new URL(".", import.meta.url));
const DRIZZLE_FOLDER = resolve(DIRNAME, "../../drizzle");
const PRE_MIGRATION_IDX = 83;
const MIGRATION_IDX = 85;

function makeTempMigrationsFolder(upToIdx: number): string {
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-0085-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= upToIdx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

const NOW = "2026-01-01T00:00:00.000Z";
const OLDER = "2025-06-01T00:00:00.000Z";
const NEWER = "2025-12-01T00:00:00.000Z";

describe("migration 0085: thread as a module — brownfield", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];

	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
	});

	async function seedAndMigrate(): Promise<ReturnType<typeof drizzle>> {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);

		const folderBefore = makeTempMigrationsFolder(PRE_MIGRATION_IDX);
		tempDirs.push(folderBefore);
		await migrate(db, { migrationsFolder: folderBefore });

		await db.execute(sql`
			INSERT INTO teams (id, name, phase, created_at) VALUES ('team-1', 'Team One', 'build', ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO users (id, name, kind, role, status, team_id, created_at) VALUES
				('owner-agent-1', 'Owner', 'ai', 'builder', 'active', 'team-1', ${NOW}),
				('human-older', 'Older Human', 'human', 'member', 'active', 'team-1', ${OLDER}),
				('human-newer', 'Newer Human', 'human', 'member', 'active', 'team-1', ${NEWER})
		`);

		// task-a: ONE existing task-hosted thread — step 3 backfills thread_id to it.
		await db.execute(sql`
			INSERT INTO threads (id, host_kind, host_id, initiator_id, participants, pinned, last_active_at, created_at)
			VALUES ('thr-task-a-only', 'task', 'task-a', 'human-older', '[]', false, ${NOW}, ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO tasks (id, parent_task_id, team_id, title, state, created_at, updated_at)
			VALUES ('task-a', NULL, 'team-1', 'Task A', 'in_progress', ${NOW}, ${NOW})
		`);

		// task-b: TWO task-hosted threads, created at different times — the
		// OLDER one must win.
		await db.execute(sql`
			INSERT INTO threads (id, host_kind, host_id, initiator_id, participants, pinned, last_active_at, created_at)
			VALUES
				('thr-task-b-older', 'task', 'task-b', 'human-older', '[]', false, ${OLDER}, ${OLDER}),
				('thr-task-b-newer', 'task', 'task-b', 'human-older', '[]', false, ${NEWER}, ${NEWER})
		`);
		await db.execute(sql`
			INSERT INTO tasks (id, parent_task_id, team_id, title, state, created_at, updated_at)
			VALUES ('task-b', NULL, 'team-1', 'Task B', 'in_progress', ${NOW}, ${NOW})
		`);

		// task-c: no existing thread at all, HAS an owner agent, and the team
		// has two humans — step 4 must seed a thread with BOTH the owner agent
		// and the FIRST human by (created_at, id), never both humans.
		await db.execute(sql`
			INSERT INTO tasks (id, parent_task_id, team_id, owner_agent_id, title, state, created_at, updated_at)
			VALUES ('task-c', NULL, 'team-1', 'owner-agent-1', 'Task C', 'in_progress', ${NOW}, ${NOW})
		`);

		// a legacy item and a message pointing at it — step 6 drops both the
		// table and the pointer column.
		await db.execute(sql`
			INSERT INTO threads (id, host_kind, host_id, initiator_id, participants, pinned, last_active_at, created_at)
			VALUES ('thr-legacy-item-host', 'user', 'human-older', 'human-older', '["human-older"]', false, ${NOW}, ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO items (id, title, thread_id, created_at)
			VALUES ('item-1', 'Legacy item', 'thr-legacy-item-host', ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO messages (id, thread_id, sender_id, type, payload, client_key, legacy_item_id, created_at)
			VALUES ('msg-legacy-1', 'thr-legacy-item-host', 'human-older', 'plain', '{"text":"x"}', 'ck-legacy-1', 'item-1', ${NOW})
		`);

		// an existing assistant_turn intent — must be renamed to thread_turn.
		await db.execute(sql`
			INSERT INTO agent_work_intents
				(id, kind, source_kind, source_id, idempotency_key, created_at, updated_at)
			VALUES ('intent-assistant-1', 'assistant_turn', 'thread_message', 'msg-legacy-1', 'assistant:msg-legacy-1', ${NOW}, ${NOW})
		`);

		// a pre-rename intent whose baked request still nests the old
		// `sourceCorrelation.assistantAgentId` key — the migration must rename it
		// to `agentId` in place, alongside the `kind` respelling above.
		await db.execute(sql`
			INSERT INTO agent_work_intents
				(id, kind, source_kind, source_id, idempotency_key, baked_request_json, created_at, updated_at)
			VALUES (
				'intent-assistant-corr-1', 'assistant_turn', 'thread_message', 'msg-legacy-1',
				'assistant:msg-legacy-1:corr',
				'{"sourceKind":"assistant","sourceCorrelation":{"threadId":"thr-legacy-item-host","messageId":"msg-legacy-1","userId":"human-older","assistantAgentId":"owner-agent-1"}}',
				${NOW}, ${NOW}
			)
		`);

		// a pre-rename session request whose `source_correlation_json` IS the
		// correlation object, still carrying the old top-level key.
		await db.execute(sql`
			INSERT INTO agent_session_requests
				(id, source_kind, source_id, stream_id, agent_id, user_id, prompt_mode,
				 source_correlation_json, idempotency_key, status, created_at, updated_at)
			VALUES (
				'asr-corr-1', 'assistant', 'msg-legacy-1', 'thread:thr-legacy-item-host',
				'owner-agent-1', 'human-older', 'conversation',
				'{"threadId":"thr-legacy-item-host","messageId":"msg-legacy-1","userId":"human-older","assistantAgentId":"owner-agent-1"}',
				'assistant:msg-legacy-1:corr', 'pending', ${NOW}, ${NOW}
			)
		`);

		// step 10 fixture: a user U and their own assistant agent `ast-U`
		// (owner_user_id = U), in the pre-migration user-hosted shape
		// (`thr-ast-<userId>`, host_kind='user') with two messages.
		await db.execute(sql`
			INSERT INTO users (id, name, kind, role, status, team_id, owner_user_id, created_at) VALUES
				('user-solo', 'Solo User', 'human', 'member', 'active', 'team-1', NULL, ${NOW}),
				('ast-user-solo', 'Solo Assistant', 'ai', 'assistant', 'active', NULL, 'user-solo', ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO threads (id, host_kind, host_id, initiator_id, participants, pinned, last_active_at, created_at)
			VALUES ('thr-ast-user-solo', 'user', 'user-solo', 'user-solo', '["user-solo","ast-user-solo"]', false, ${NOW}, ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO messages (id, thread_id, sender_id, type, payload, client_key, created_at)
			VALUES
				('msg-ast-1', 'thr-ast-user-solo', 'user-solo', 'plain', '{"text":"hi"}', 'ck-ast-1', ${NOW}),
				('msg-ast-2', 'thr-ast-user-solo', 'ast-user-solo', 'plain', '{"text":"hello"}', 'ck-ast-2', ${NOW})
		`);

		// control: a user-hosted thread that is NOT an assistant thread (two
		// humans) — step 10 must leave it alone.
		await db.execute(sql`
			INSERT INTO threads (id, host_kind, host_id, initiator_id, participants, pinned, last_active_at, created_at)
			VALUES ('thr-two-humans', 'user', 'human-older', 'human-older', '["human-older","human-newer"]', false, ${NOW}, ${NOW})
		`);

		// duplicate-pair fixture: two pre-migration user-hosted threads for the SAME
		// (user, agent) pair, at different last_active_at — the partial unique
		// index on direct_key can only keep one keyed row per pair.
		await db.execute(sql`
			INSERT INTO users (id, name, kind, role, status, team_id, owner_user_id, created_at) VALUES
				('user-dup', 'Dup User', 'human', 'member', 'active', 'team-1', NULL, ${NOW}),
				('ast-user-dup', 'Dup Assistant', 'ai', 'assistant', 'active', NULL, 'user-dup', ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO threads (id, host_kind, host_id, initiator_id, participants, pinned, last_active_at, created_at)
			VALUES
				('thr-dup-older', 'user', 'user-dup', 'user-dup', '["user-dup","ast-user-dup"]', false, ${OLDER}, ${OLDER}),
				('thr-dup-newer', 'user', 'user-dup', 'user-dup', '["user-dup","ast-user-dup"]', false, ${NEWER}, ${NEWER})
		`);

		// conflict fixture: a pre-migration user-hosted candidate for (user, agent)
		// sits alongside an UNRELATED row already hosted by that same agent and
		// already carrying the exact key the candidate would compute — the old
		// `findOrCreateDirectThread` wrote agent-hosted direct threads this way
		// before this migration existed. The non-candidate row is never touched
		// by the WHERE clause (host_kind is already 'agent'), so step 10 must not
		// try to hand the candidate a key that row already holds.
		await db.execute(sql`
			INSERT INTO users (id, name, kind, role, status, team_id, owner_user_id, created_at) VALUES
				('user-conflict', 'Conflict User', 'human', 'member', 'active', 'team-1', NULL, ${NOW}),
				('ast-user-conflict', 'Conflict Assistant', 'ai', 'assistant', 'active', NULL, 'user-conflict', ${NOW})
		`);
		const conflictKey = `${["user-conflict", "ast-user-conflict"].sort().join(":")}:agent`;
		await db.execute(sql`
			INSERT INTO threads (id, host_kind, host_id, initiator_id, participants, pinned, last_active_at, created_at, direct_key)
			VALUES ('thr-conflict-existing', 'agent', 'ast-user-conflict', 'user-conflict', '["user-conflict","ast-user-conflict"]', false, ${NOW}, ${NOW}, ${conflictKey})
		`);
		await db.execute(sql`
			INSERT INTO threads (id, host_kind, host_id, initiator_id, participants, pinned, last_active_at, created_at)
			VALUES ('thr-conflict-candidate', 'user', 'user-conflict', 'user-conflict', '["user-conflict","ast-user-conflict"]', false, ${NOW}, ${NOW})
		`);

		const folderAfter = makeTempMigrationsFolder(MIGRATION_IDX);
		tempDirs.push(folderAfter);
		await migrate(db, { migrationsFolder: folderAfter });

		return db;
	}

	it("gives every task a real, team-hosted thread; the double-hosted task keeps the oldest", async () => {
		const db = await seedAndMigrate();

		const rows = await db.execute(sql`
			SELECT id, thread_id FROM tasks WHERE id IN ('task-a', 'task-b', 'task-c') ORDER BY id
		`);
		const byId = new Map(
			(rows.rows as Array<{ id: string; thread_id: string | null }>).map((r) => [
				r.id,
				r.thread_id,
			]),
		);
		expect(byId.get("task-a")).toBe("thr-task-a-only");
		expect(byId.get("task-b")).toBe("thr-task-b-older");
		expect(byId.get("task-c")).toBeTruthy();
		for (const [, threadId] of byId) expect(threadId).not.toBeNull();

		const threadRows = await db.execute(sql`
			SELECT id, host_kind, host_id FROM threads
			WHERE id IN ('thr-task-a-only', 'thr-task-b-older', 'thr-task-b-newer', ${byId.get("task-c")})
		`);
		const threadById = new Map(
			(threadRows.rows as Array<{ id: string; host_kind: string; host_id: string }>).map((r) => [
				r.id,
				r,
			]),
		);
		expect(threadById.get("thr-task-a-only")).toMatchObject({
			host_kind: "team",
			host_id: "team-1",
		});
		expect(threadById.get("thr-task-b-older")).toMatchObject({
			host_kind: "team",
			host_id: "team-1",
		});
		// the loser is untouched by step 7 — it is not any task's thread_id, so
		// it re-hosts to its initiator (step 7's second UPDATE), never left "task".
		expect(threadById.get("thr-task-b-newer")?.host_kind).not.toBe("task");
		expect(threadById.get(byId.get("task-c") as string)).toMatchObject({
			host_kind: "team",
			host_id: "team-1",
		});

		const anyTaskHosted = await db.execute(sql`SELECT 1 FROM threads WHERE host_kind = 'task'`);
		expect(anyTaskHosted.rows).toHaveLength(0);
	});

	it("step 4's seed carries BOTH the owner agent and the first human, with a real initiator_id", async () => {
		const db = await seedAndMigrate();

		const [task] = (await db.execute(sql`SELECT thread_id FROM tasks WHERE id = 'task-c'`))
			.rows as Array<{ thread_id: string }>;
		if (!task) throw new Error("task-c not found after migration");
		const [thread] = (
			await db.execute(
				sql`SELECT participants, initiator_id FROM threads WHERE id = ${task.thread_id}`,
			)
		).rows as Array<{ participants: string; initiator_id: string }>;
		if (!thread) throw new Error("task-c's thread not found after migration");

		const members = JSON.parse(thread.participants) as string[];
		expect(new Set(members)).toEqual(new Set(["owner-agent-1", "human-older"]));
		expect(members).not.toContain("human-newer");

		const [identity] = (
			await db.execute(sql`SELECT id FROM users WHERE id = ${thread.initiator_id}`)
		).rows as Array<{ id: string }>;
		expect(identity?.id).toBe(thread.initiator_id);
	});

	it("drops items and messages.legacy_item_id, and renames assistant_turn to thread_turn", async () => {
		const db = await seedAndMigrate();

		await expect(db.execute(sql`SELECT 1 FROM items`)).rejects.toThrow();
		await expect(db.execute(sql`SELECT legacy_item_id FROM messages LIMIT 1`)).rejects.toThrow();

		const [intent] = (
			await db.execute(sql`SELECT kind FROM agent_work_intents WHERE id = 'intent-assistant-1'`)
		).rows as Array<{ kind: string }>;
		expect(intent?.kind).toBe("thread_turn");

		await expect(
			db.execute(sql`
				INSERT INTO agent_work_intents
					(id, kind, source_kind, source_id, idempotency_key, created_at, updated_at)
				VALUES ('intent-bad-1', 'assistant_turn', 'thread_message', 'msg-legacy-1', 'x', ${NOW}, ${NOW})
			`),
			"the old kind name must be refused by the respelled check constraint",
		).rejects.toThrow();
	});

	it("renames sourceCorrelation.assistantAgentId to agentId in-flight, in both persisted JSON columns", async () => {
		const db = await seedAndMigrate();

		const [intentRow] = (
			await db.execute(
				sql`SELECT baked_request_json FROM agent_work_intents WHERE id = 'intent-assistant-corr-1'`,
			)
		).rows as Array<{ baked_request_json: string }>;
		if (!intentRow) throw new Error("intent-assistant-corr-1 not found after migration");
		const bakedRequest = JSON.parse(intentRow.baked_request_json) as {
			sourceCorrelation: Record<string, unknown>;
		};
		expect(bakedRequest.sourceCorrelation.agentId).toBe("owner-agent-1");
		expect(bakedRequest.sourceCorrelation).not.toHaveProperty("assistantAgentId");

		const [requestRow] = (
			await db.execute(sql`
				SELECT source_id, stream_id, agent_id, user_id, source_correlation_json, idempotency_key
				FROM agent_session_requests WHERE id = 'asr-corr-1'
			`)
		).rows as Array<{
			source_id: string;
			stream_id: string;
			agent_id: string;
			user_id: string;
			source_correlation_json: string;
			idempotency_key: string;
		}>;
		if (!requestRow) throw new Error("asr-corr-1 not found after migration");
		const sourceCorrelation = JSON.parse(requestRow.source_correlation_json) as Record<
			string,
			unknown
		>;
		expect(sourceCorrelation.agentId).toBe("owner-agent-1");
		expect(sourceCorrelation).not.toHaveProperty("assistantAgentId");

		const parsed = agentSessionRequestInputSchema.parse({
			sourceKind: "assistant",
			promptMode: "conversation",
			sourceId: requestRow.source_id,
			streamId: requestRow.stream_id,
			agentId: requestRow.agent_id,
			userId: requestRow.user_id,
			idempotencyKey: requestRow.idempotency_key,
			sourceCorrelation,
		});
		expect(parsed.sourceCorrelation).toEqual({
			threadId: "thr-legacy-item-host",
			messageId: "msg-legacy-1",
			userId: "human-older",
			agentId: "owner-agent-1",
		});
	});

	it("re-hosts a user-hosted assistant thread onto its own agent, keyed for send_message's dedup, same row and messages", async () => {
		const db = await seedAndMigrate();

		const [thread] = (
			await db.execute(
				sql`SELECT host_kind, host_id, direct_key FROM threads WHERE id = 'thr-ast-user-solo'`,
			)
		).rows as Array<{ host_kind: string; host_id: string; direct_key: string | null }>;
		if (!thread) throw new Error("thr-ast-user-solo not found after migration");
		expect(thread.host_kind).toBe("agent");
		expect(thread.host_id).toBe("ast-user-solo");
		// Literal copy of thread-actions.ts:558's directKey construction for the
		// single-recipient path: `${[actor, recipient].sort().join(":")}:${hostKind}`
		// — no helper is exported from @hyperidle/thread to import here.
		const expectedKey = `${["user-solo", "ast-user-solo"].sort().join(":")}:agent`;
		expect(thread.direct_key).toBe(expectedKey);

		const messages = (
			await db.execute(
				sql`SELECT id FROM messages WHERE thread_id = 'thr-ast-user-solo' ORDER BY id`,
			)
		).rows as Array<{ id: string }>;
		expect(messages.map((m) => m.id)).toEqual(["msg-ast-1", "msg-ast-2"]);
	});

	it("leaves a user-hosted thread between two humans untouched", async () => {
		const db = await seedAndMigrate();

		const [thread] = (
			await db.execute(
				sql`SELECT host_kind, host_id, direct_key FROM threads WHERE id = 'thr-two-humans'`,
			)
		).rows as Array<{ host_kind: string; host_id: string; direct_key: string | null }>;
		if (!thread) throw new Error("thr-two-humans not found after migration");
		expect(thread.host_kind).toBe("user");
		expect(thread.host_id).toBe("human-older");
		expect(thread.direct_key).toBeNull();
	});

	it("when two pre-migration threads exist for the same (user, agent) pair, keys only the most recently active one and leaves the other without a key", async () => {
		const db = await seedAndMigrate();

		const rows = (
			await db.execute(sql`
				SELECT id, host_kind, host_id, direct_key FROM threads
				WHERE id IN ('thr-dup-older', 'thr-dup-newer') ORDER BY id
			`)
		).rows as Array<{ id: string; host_kind: string; host_id: string; direct_key: string | null }>;
		const byId = new Map(rows.map((r) => [r.id, r]));
		const expectedKey = `${["user-dup", "ast-user-dup"].sort().join(":")}:agent`;

		// both re-host onto the agent — no merge, no delete.
		expect(byId.get("thr-dup-older")?.host_kind).toBe("agent");
		expect(byId.get("thr-dup-older")?.host_id).toBe("ast-user-dup");
		expect(byId.get("thr-dup-newer")?.host_kind).toBe("agent");
		expect(byId.get("thr-dup-newer")?.host_id).toBe("ast-user-dup");

		// only the more recently active one (thr-dup-newer, NEWER) is keyed.
		expect(byId.get("thr-dup-newer")?.direct_key).toBe(expectedKey);
		expect(byId.get("thr-dup-older")?.direct_key).toBeNull();
	});

	it("re-hosts a candidate whose computed key is already held by an unrelated agent-hosted row, without touching that row's key", async () => {
		const db = await seedAndMigrate();

		const rows = (
			await db.execute(sql`
				SELECT id, host_kind, host_id, direct_key FROM threads
				WHERE id IN ('thr-conflict-existing', 'thr-conflict-candidate') ORDER BY id
			`)
		).rows as Array<{ id: string; host_kind: string; host_id: string; direct_key: string | null }>;
		const byId = new Map(rows.map((r) => [r.id, r]));
		const expectedKey = `${["user-conflict", "ast-user-conflict"].sort().join(":")}:agent`;

		// the migration completes at all — no unique-constraint rollback.
		expect(byId.size).toBe(2);

		// both end up agent-hosted.
		expect(byId.get("thr-conflict-existing")).toMatchObject({
			host_kind: "agent",
			host_id: "ast-user-conflict",
		});
		expect(byId.get("thr-conflict-candidate")).toMatchObject({
			host_kind: "agent",
			host_id: "ast-user-conflict",
		});

		// the pre-existing row keeps the key it already had.
		expect(byId.get("thr-conflict-existing")?.direct_key).toBe(expectedKey);
		// the re-hosted candidate loses the race and is left unkeyed, not blanked
		// onto the other row's key.
		expect(byId.get("thr-conflict-candidate")?.direct_key).toBeNull();
	});
});
