import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import {
	documents,
	messages,
	sessions,
	subscriptions,
	tasks,
	teams,
	threads,
	users,
} from "../schema.js";

describe("database schema", () => {
	describe("CRUD operations", () => {
		test("inserts and reads teams", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({
				id: "prod-1",
				name: "Acme",
				createdAt: now,
			});

			const result = await db.select().from(teams).where(eq(teams.id, "prod-1"));

			expect(result[0]).toMatchObject({
				id: "prod-1",
				name: "Acme",
				createdAt: now,
			});
		});

		test("inserts and reads users (AI kind)", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(users).values({
				id: "agent-1",
				kind: "ai",
				name: "Builder",
				role: "builder",
				status: "active",
				createdAt: now,
			});

			const result = await db.select().from(users).where(eq(users.id, "agent-1"));

			expect(result[0]).toMatchObject({
				id: "agent-1",
				kind: "ai",
				name: "Builder",
				role: "builder",
				status: "active",
			});
		});

		test("inserts and reads root tasks (formerly bets)", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({ id: "prod-1", name: "Acme", createdAt: now });
			// Every task has a real thread (`tasks.thread_id` is NOT NULL).
			await db.insert(threads).values({
				id: "thr-root-1",
				hostKind: "team",
				hostId: "prod-1",
				initiatorId: "u1",
				participants: "[]",
				lastActiveAt: now,
				createdAt: now,
			});
			await db.insert(tasks).values({
				id: "root-1",
				parentTaskId: null,
				teamId: "prod-1",
				title: "Build file upload",
				description: "Add chunked upload support",
				doneWhen: JSON.stringify([
					{
						id: "dw-root-1",
						what: "Upload works for files > 100 MB",
						by: "check",
						state: "open",
						how: null,
					},
				]),
				state: "in_progress",
				threadId: "thr-root-1",
				createdAt: now,
				updatedAt: now,
			});

			const result = await db.select().from(tasks).where(eq(tasks.id, "root-1"));

			expect(result[0]).toMatchObject({
				id: "root-1",
				parentTaskId: null,
				title: "Build file upload",
				state: "in_progress",
			});
		});

		test("inserts and reads tasks", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({ id: "prod-1", name: "Acme", createdAt: now });
			// Every task has a real thread (`tasks.thread_id` is NOT NULL).
			await db.insert(threads).values([
				{
					id: "thr-root-1",
					hostKind: "team",
					hostId: "prod-1",
					initiatorId: "u1",
					participants: "[]",
					lastActiveAt: now,
					createdAt: now,
				},
				{
					id: "thr-task-1",
					hostKind: "team",
					hostId: "prod-1",
					initiatorId: "u1",
					participants: "[]",
					lastActiveAt: now,
					createdAt: now,
				},
			]);
			await db.insert(tasks).values({
				id: "root-1",
				parentTaskId: null,
				teamId: "prod-1",
				title: "Root",
				state: "in_progress",
				threadId: "thr-root-1",
				createdAt: now,
				updatedAt: now,
			});
			await db.insert(tasks).values({
				id: "task-1",
				parentTaskId: "root-1",
				teamId: "prod-1",
				title: "Implement upload",
				state: "proposed",
				threadId: "thr-task-1",
				createdAt: now,
				updatedAt: now,
			});

			const result = await db.select().from(tasks).where(eq(tasks.id, "task-1"));

			expect(result[0]).toMatchObject({
				id: "task-1",
				parentTaskId: "root-1",
				title: "Implement upload",
				state: "proposed",
			});
		});

		test("updates tasks correctly", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({ id: "prod-1", name: "Acme", createdAt: now });
			// Every task has a real thread (`tasks.thread_id` is NOT NULL).
			await db.insert(threads).values({
				id: "thr-task-1",
				hostKind: "team",
				hostId: "prod-1",
				initiatorId: "u1",
				participants: "[]",
				lastActiveAt: now,
				createdAt: now,
			});
			await db.insert(tasks).values({
				id: "task-1",
				parentTaskId: null,
				teamId: "prod-1",
				title: "Original",
				state: "proposed",
				threadId: "thr-task-1",
				createdAt: now,
				updatedAt: now,
			});

			await db
				.update(tasks)
				.set({ state: "in_progress", updatedAt: new Date().toISOString() })
				.where(eq(tasks.id, "task-1"));

			const result = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			expect(result[0]?.state).toBe("in_progress");
		});

		test("inserts and reads sessions", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({ id: "prod-1", name: "Acme", createdAt: now });
			await db.insert(users).values({
				id: "agent-1",
				kind: "ai",
				name: "Builder",
				role: "builder",
				status: "active",
				createdAt: now,
			});
			// Every task has a real thread (`tasks.thread_id` is NOT NULL).
			await db.insert(threads).values({
				id: "thr-task-1",
				hostKind: "team",
				hostId: "prod-1",
				initiatorId: "agent-1",
				participants: "[]",
				lastActiveAt: now,
				createdAt: now,
			});
			await db.insert(tasks).values({
				id: "task-1",
				parentTaskId: null,
				teamId: "prod-1",
				title: "T",
				state: "proposed",
				threadId: "thr-task-1",
				createdAt: now,
				updatedAt: now,
			});
			await db.insert(sessions).values({
				id: "sess-1",
				taskId: "task-1",
				agentId: "agent-1",
				modelTier: "workhorse",
				startedAt: now,
				state: "active",
			});

			const result = await db.select().from(sessions).where(eq(sessions.id, "sess-1"));
			expect(result[0]).toMatchObject({
				id: "sess-1",
				taskId: "task-1",
				agentId: "agent-1",
				modelTier: "workhorse",
				state: "active",
			});
		});

		test("inserts and reads subscriptions", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({ id: "prod-1", name: "Acme", createdAt: now });
			await db.insert(users).values({
				id: "agent-1",
				kind: "ai",
				name: "Test Agent",
				role: "assistant",
				status: "active",
				createdAt: now,
			});
			await db.insert(subscriptions).values({
				id: "subscription-1",
				userId: "agent-1",
				schedule: "0 8 * * *",
				paused: false,
				createdAt: now,
				updatedAt: now,
			});

			const result = await db
				.select()
				.from(subscriptions)
				.where(eq(subscriptions.id, "subscription-1"));
			expect(result[0]).toMatchObject({
				id: "subscription-1",
				userId: "agent-1",
				schedule: "0 8 * * *",
				paused: false,
			});
		});

		test("inserts and reads threads and messages", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(users).values([
				{
					id: "agent-1",
					kind: "ai",
					name: "A",
					role: "builder",
					status: "active",
					createdAt: now,
				},
				{
					id: "agent-2",
					kind: "ai",
					name: "B",
					role: "builder",
					status: "active",
					createdAt: now,
				},
			]);
			await db.insert(threads).values({
				id: "thread-1",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: now,
				createdAt: now,
			});
			await db.insert(messages).values({
				id: "msg-1",
				senderId: "agent-1",
				threadId: "thread-1",
				type: "plain",
				payload: JSON.stringify({ text: "Hello" }),
				clientKey: "msg-1",
				createdAt: now,
			});

			const result = await db.select().from(messages).where(eq(messages.id, "msg-1"));
			expect(result[0]).toMatchObject({
				id: "msg-1",
				senderId: "agent-1",
				type: "plain",
			});
			const payload = JSON.parse(result[0]?.payload ?? "{}") as { text?: string };
			expect(payload.text).toBe("Hello");
		});

		test("inserts and reads verdict messages", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(users).values([
				{
					id: "agent-1",
					kind: "ai",
					name: "A",
					role: "builder",
					status: "active",
					createdAt: now,
				},
				{
					id: "human-1",
					kind: "human",
					name: "Human",
					role: "founder",
					status: "active",
					createdAt: now,
				},
			]);
			await db.insert(threads).values({
				id: "thread-1",
				hostKind: "team",
				hostId: "team-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: now,
				createdAt: now,
			});
			await db.insert(messages).values({
				id: "review-1",
				senderId: "agent-1",
				threadId: "thread-1",
				type: "review",
				payload: JSON.stringify({ title: "Review upload", reasoning: ["Please review"] }),
				clientKey: "review-1",
				createdAt: now,
			});

			await db.insert(messages).values({
				id: "resp-1",
				senderId: "human-1",
				threadId: "thread-1",
				type: "verdict",
				payload: JSON.stringify({ decision: "approve", resolvesMessageId: "review-1" }),
				clientKey: "resp-1",
				createdAt: now,
			});

			const resp = await db.select().from(messages).where(eq(messages.id, "resp-1"));
			expect(resp[0]).toMatchObject({ id: "resp-1", type: "verdict" });
			const verdict = JSON.parse(resp[0]?.payload ?? "{}") as { decision: string };
			expect(verdict.decision).toBe("approve");
		});

		test("inserts and reads documents", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(documents).values({
				id: "doc-1",
				title: "Chunked uploads",
				body: "Use chunked uploads for files >10MB",
				format: "markdown",
				status: "draft",
				version: 1,
				updatedBy: "agent-1",
				createdAt: now,
				updatedAt: now,
			});

			const result = await db.select().from(documents).where(eq(documents.id, "doc-1"));
			expect(result[0]).toMatchObject({
				id: "doc-1",
				title: "Chunked uploads",
				version: 1,
				readCount: 0,
				sessionUseCount: 0,
			});
		});

		test("updates documents version", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(documents).values({
				id: "doc-1",
				title: "Original",
				body: "Body",
				format: "markdown",
				status: "draft",
				version: 1,
				updatedBy: "agent-1",
				createdAt: now,
				updatedAt: now,
			});

			await db
				.update(documents)
				.set({ title: "Updated", version: 2, updatedAt: new Date().toISOString() })
				.where(eq(documents.id, "doc-1"));

			const result = await db.select().from(documents).where(eq(documents.id, "doc-1"));
			expect(result[0]?.title).toBe("Updated");
			expect(result[0]?.version).toBe(2);
		});
	});

	describe("documents indexes", () => {
		test("has indexes on scope, status, slot, and the usage decay column", async ({ db }) => {
			const result = await db.execute(
				`SELECT indexname FROM pg_indexes WHERE tablename = 'documents' AND schemaname = 'public'` as Parameters<
					typeof db.execute
				>[0],
			);
			const indexes = (result as { rows: Array<{ indexname: string }> }).rows.map(
				(r) => r.indexname,
			);

			expect(indexes).toContain("doc_scope_idx");
			expect(indexes).toContain("doc_status_idx");
			expect(indexes).toContain("doc_slot_idx");
			// The decay search: `unusedSince` + `sort:"least_used"` both lead with this.
			expect(indexes).toContain("doc_last_used_idx");
		});

		test("scope_kind is NOT NULL with a 'factory' default; scope_id is nullable", async ({
			db,
		}) => {
			const result = await db.execute(
				`SELECT column_name, is_nullable, column_default
				 FROM information_schema.columns
				 WHERE table_name = 'documents'` as Parameters<typeof db.execute>[0],
			);
			const columns = (result as { rows: Array<Record<string, unknown>> }).rows;

			const scopeKindCol = columns.find((c) => c.column_name === "scope_kind");
			expect(scopeKindCol?.is_nullable).toBe("NO");
			expect(scopeKindCol?.column_default).toBe("'factory'::text");

			const scopeIdCol = columns.find((c) => c.column_name === "scope_id");
			expect(scopeIdCol?.is_nullable).toBe("YES");
		});
	});

	describe("foreign key constraints", () => {
		test("rejects task with invalid parent_task_id", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({ id: "prod-1", name: "P", createdAt: now });
			// Every task has a real thread (`tasks.thread_id` is NOT NULL).
			await db.insert(threads).values({
				id: "thr-task-1",
				hostKind: "team",
				hostId: "prod-1",
				initiatorId: "u1",
				participants: "[]",
				lastActiveAt: now,
				createdAt: now,
			});

			await expect(
				db.insert(tasks).values({
					id: "task-1",
					parentTaskId: "nonexistent-parent",
					teamId: "prod-1",
					title: "T",
					state: "proposed",
					threadId: "thr-task-1",
					createdAt: now,
					updatedAt: now,
				}),
			).rejects.toThrow();
		});

		test("rejects session with invalid agent_id", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({ id: "prod-1", name: "P", createdAt: now });
			// Every task has a real thread (`tasks.thread_id` is NOT NULL).
			await db.insert(threads).values({
				id: "thr-task-1",
				hostKind: "team",
				hostId: "prod-1",
				initiatorId: "u1",
				participants: "[]",
				lastActiveAt: now,
				createdAt: now,
			});
			await db.insert(tasks).values({
				id: "task-1",
				parentTaskId: null,
				teamId: "prod-1",
				title: "T",
				state: "proposed",
				threadId: "thr-task-1",
				createdAt: now,
				updatedAt: now,
			});

			await expect(
				db.insert(sessions).values({
					id: "sess-1",
					taskId: "task-1",
					agentId: "nonexistent-agent",
					modelTier: "workhorse",
					startedAt: now,
					state: "active",
				}),
			).rejects.toThrow();
		});

		test("rejects verdict message with an unknown sender_id", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(threads).values({
				id: "thread-fk",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify([]),
				lastActiveAt: now,
				createdAt: now,
			});
			await expect(
				db.insert(messages).values({
					id: "verdict-fk",
					senderId: "nonexistent-agent",
					threadId: "thread-fk",
					type: "verdict",
					payload: JSON.stringify({ decision: "approve" }),
					clientKey: "verdict-fk",
					createdAt: now,
				}),
			).rejects.toThrow();
		});
	});
});
