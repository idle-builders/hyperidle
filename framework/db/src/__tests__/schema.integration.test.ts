import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import {
	documents,
	messages,
	serverConfig,
	sessions,
	subscriptions,
	tasks,
	// @lore U1: `teams` is the domain entity (formerly `products`).
	teams,
	threads,
	users,
} from "../schema.js";

describe("A2: Database Schema", () => {
	// --- AC1: Migrations apply to fresh PGlite without errors ---
	describe("AC1: migrations apply correctly", () => {
		test("creates all current tables", async ({ db }) => {
			// L1a: `responses` table dropped (plan §5.2). Verdicts now project
			// as `verdict`-typed messages.
			const result = await db.execute(
				`SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '_l1_snapshot_%' ORDER BY tablename` as Parameters<
					typeof db.execute
				>[0],
			);
			const tableNames = (result as { rows: Array<{ name: string }> }).rows.map((r) => r.name);

			expect(tableNames).toEqual(
				expect.arrayContaining([
					// @lore P2: agents → users
					// @lore U1: `products` → `teams`; old `teams` → `team_members`
					"users",
					// @lore AU18: `factory_settings` retired — `server_config` is its
					// typed singleton-row successor.
					"server_config",
					"documents",
					"messages",
					"subscriptions",
					"sessions",
					"tasks",
					"teams",
					"threads",
				]),
			);
			expect(tableNames).not.toContain("responses");
			// @lore BC3 migration 0085 step 6: `items` dropped — the policy engine's
			// table, destructive, no compat column. Must not reappear.
			expect(tableNames).not.toContain("items");
			// @lore U1: `products` table was renamed to `teams`
			expect(tableNames).not.toContain("products");
			// @lore BB1: `bets` table dropped — must not reappear.
			expect(tableNames).not.toContain("bets");
			// @lore AU18: factory_settings dropped — must not reappear.
			expect(tableNames).not.toContain("factory_settings");
			// @lore AU30: `user_skills` dropped. Exact-absence, because the expected
			// list above is `arrayContaining` and tolerates extras — see the longer
			// note in migration.integration.test.ts.
			expect(tableNames).not.toContain("user_skills");
			// @lore BC5 T7b migration 0089: routines/routine_runs/notification_queue
			// dropped — a routine is a subscription now, a notification an inbox row.
			expect(tableNames).not.toContain("routines");
			expect(tableNames).not.toContain("routine_runs");
			expect(tableNames).not.toContain("notification_queue");
			// @lore BC4 migration 0086: `knowledge_items` renamed to `documents`;
			// the three extension tables dropped, nothing carried over. Must not
			// reappear.
			expect(tableNames).not.toContain("knowledge_items");
			expect(tableNames).not.toContain("knowledge_app_projection");
			expect(tableNames).not.toContain("knowledge_edit_log");
			expect(tableNames).not.toContain("knowledge_access_log");
			expect(tableNames).not.toContain("knowledge_conflicts");
			expect(tableNames.length).toBeGreaterThanOrEqual(15);
		});
	});

	// --- AC2: All tables insert/read/update correctly with full type safety ---
	describe("AC2: CRUD operations", () => {
		// @lore U1: `products` renamed to `teams`.
		// @lore BB1: `activeBets` column dropped — WIP is counted live.
		test("inserts and reads teams (formerly products)", async ({ db }) => {
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

		// @lore BB1: `bets` dropped — root tasks replace bets. A task with
		// parentTaskId: null is the top-level unit of work.
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
				doneCondition: "Upload works for files > 100 MB",
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

		// @lore U1: tasks.productId dropped; teamId refs `teams` (formerly products).
		// @lore BB1: task now has parentTaskId instead of betId.
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

		// @lore U1: tasks.productId dropped; teamId refs `teams` (formerly products).
		// @lore BB1: task now has parentTaskId instead of betId.
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

		// @lore U1: tasks.productId dropped; teamId refs `teams` (formerly products).
		// @lore BB1: task now has parentTaskId instead of betId.
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
			// L1a: messages now carry type/payload/clientKey instead of
			// recipientId/subject/body (plan §5.3).
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
			// L1a: legacy `responses` table was dropped; verdict messages
			// (type='verdict') replace it. There is no `items` table and no
			// `messages.legacyItemId` — a review is a message already, resolved
			// by a verdict message in the same thread.
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
			// @lore BC4: `confidence`/`meta` fold onto the row itself — no
			// companion extension table any more.
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

		// @lore AU18: factory_settings (generic KV bucket) is retired. server_config
		// is its typed singleton-row successor — still exercises a real insert+read.
		test("inserts and reads server_config", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(serverConfig).values({ id: "default", config: "{}", updatedAt: now });

			const result = await db.select().from(serverConfig).where(eq(serverConfig.id, "default"));

			expect(result[0]).toMatchObject({ id: "default", config: "{}" });
		});
	});

	// --- AC3: documents indexes exist, including the usage decay index ---
	describe("AC3: documents indexes", () => {
		test("has indexes on scope, status, slot, and the usage decay column", async ({ db }) => {
			// @lore BC4: `confidence`/`meta`/usage columns live on the row itself
			// now — no more extension table to carry a second set of indexes.
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

		// @lore document-module B20: carried over from the deleted
		// `knowledge.q2.integration.test.ts` — the column shape `scope_needs_id`
		// (framework/domain-model) and the document actions' scope defaulting
		// both assume.
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

	// --- AC6: Foreign key constraints enforced ---
	describe("AC6: foreign key constraints", () => {
		// @lore BB1: tasks.betId dropped; parentTaskId is a nullable self-FK.
		// An invalid parentTaskId must be rejected by the FK constraint.
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

		// @lore U1: tasks.productId dropped; teamId refs `teams` (formerly products).
		// @lore BB1: task now has parentTaskId instead of betId.
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

		test("rejects verdict message with invalid sender_id (replaces legacy responses FK contract)", async ({
			db,
		}) => {
			// L1a: legacy `responses.item_id` FK no longer exists — `responses`
			// table dropped (plan §5.2). Replacement contract: verdict-typed
			// messages set sender_id=approver; messages.sender_id FK to
			// users.id rejects unknown senders. P2: agents → users.
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
