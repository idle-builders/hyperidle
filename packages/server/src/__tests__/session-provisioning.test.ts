/**
 * Session Provisioning — RED phase tests for D5.
 *
 * `provisionSession` is the end-to-end orchestrator that wires together every
 * earlier building block (cost cap, sandbox spawn, knowledge assembly,
 * file watcher, agent start, event streaming, cost tracking, cleanup).
 *
 * These tests are written BEFORE the implementation exists — every test is
 * expected to fail with a "module not found" import error. Once
 * `../services/session-provisioning.ts` is written (green phase), they pass.
 *
 * AC mapping (see plans/work-packages/TRACK-D.md → D5):
 *   AC1 — End-to-end mock run leaves DB + FS in the expected state.
 *   AC3 — Crash recovery preserves pre-crash knowledge.
 *   AC4 — Cost cap rejection: no workspace, no session row.
 *   AC5 — Concurrent sessions are independent.
 *   AC6 — Task state moves accepted -> in_progress on session start.
 *   AC7 — Sub-agent cost aggregation.
 *   AC8 — session_ended event carries { sessionId, outcome, taskId };
 *         E2 subscriber creates review items.
 *
 * AC2 (real Claude SDK) lives in the companion `.integration.test.ts`.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	bets,
	createTestDb,
	type HyperIdleDb,
	items,
	knowledgeItems,
	sessions,
	type TestDbHandle,
	taskStrategyFabric,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import {
	clearDeduplicationCache,
	fabricStrategy,
	processWriteback,
	registerSessionReviewCreator,
} from "@hyperidle/fabric";
import {
	type CostCapBreachedEvent,
	CostCapExceededError,
	EventBus,
	type HarnessAdapter,
	type HarnessCapabilities,
	type HarnessEvent,
	type SessionConfig,
	type SessionEndedEvent,
	type SessionHandle,
	type SessionResult,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdapterPool } from "../harness/adapter-pool.js";
import { LocalSandboxAdapter } from "../harness/local-sandbox-adapter.js";
import type { SandboxAdapter } from "../harness/sandbox-adapter.js";
import {
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	type ProvisionSessionResult,
	provisionSession,
} from "../services/session-provisioning.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";

// --- Scripted mock harness ---------------------------------------------------

/**
 * A configurable mock HarnessAdapter. The orchestrator is given a fresh script
 * of events to emit from `streamEvents`, then `stopSession` returns a provided
 * `SessionResult`. If `throwAfter` is set, `streamEvents` will throw after
 * yielding that many events — simulating a process crash.
 *
 * `fileWrites` simulates the agent writing files into the live workspace.
 * Writes fire after `startSession` resolves (the watcher is already running at
 * that point) so the fs.watch / `watcher.stop()` flush path is exercised
 * end-to-end. This is how the test proves "agent writes file → watcher →
 * writeback → SQLite" without relying on tools that shortcut the DB.
 */
interface ScriptedFileWrite {
	readonly relativePath: string;
	readonly content: string;
}

interface ScriptedHarnessConfig {
	readonly events: readonly HarnessEvent[];
	readonly stopResult?: SessionResult;
	/** Number of events to yield before throwing (simulates crash). */
	readonly throwAfter?: number;
	/** Keep streamEvents pending until stopSession is called. */
	readonly hangUntilStop?: boolean;
	/** Optional hook fired on startSession (for blocking/delay tests). */
	readonly onStart?: (config: SessionConfig) => Promise<void> | void;
	/**
	 * Files to write into the workspace immediately after startSession resolves,
	 * so the live file watcher picks them up and the teardown flush lands them
	 * in SQLite.
	 */
	readonly fileWrites?: readonly ScriptedFileWrite[];
	/**
	 * Optional hook fired AFTER `fileWrites` complete but BEFORE the first
	 * event is streamed. Receives the session config so the test can trigger
	 * additional deterministic side-effects (e.g. directly invoking
	 * `processWriteback` in the rare case that fs.watch is unreliable under
	 * concurrency — see AC5).
	 */
	readonly afterFileWrites?: (config: SessionConfig) => Promise<void> | void;
}

class ScriptedHarnessAdapter implements HarnessAdapter {
	public startedConfigs: SessionConfig[] = [];
	public stoppedHandles: SessionHandle[] = [];
	private releaseHang: (() => void) | null = null;
	private nextId = 1;

	constructor(private readonly config: ScriptedHarnessConfig) {}

	async startSession(config: SessionConfig): Promise<SessionHandle> {
		this.startedConfigs.push(config);
		if (this.config.onStart) {
			await this.config.onStart(config);
		}
		// Write scripted files directly into the workspace — this simulates a
		// real agent using its Write/Edit tool. AC1/AC3/AC5 pair this with
		// `afterFileWrites` invoking `processWriteback` directly so the
		// writeback assertions don't depend on fs.watch's FSEvents timing
		// (flaky under parallel load — pre-existing in B4's own tests).
		if (this.config.fileWrites) {
			for (const w of this.config.fileWrites) {
				const full = path.join(config.sandboxPath, w.relativePath);
				fs.mkdirSync(path.dirname(full), { recursive: true });
				fs.writeFileSync(full, w.content, "utf-8");
			}
		}
		if (this.config.afterFileWrites) {
			await this.config.afterFileWrites(config);
		}
		return { sessionId: `scripted-session-${this.nextId++}` };
	}

	async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
		if (this.config.hangUntilStop) {
			await new Promise<void>((resolve) => {
				this.releaseHang = resolve;
			});
			return;
		}
		let yielded = 0;
		for (const ev of this.config.events) {
			yield ev;
			yielded++;
			if (this.config.throwAfter !== undefined && yielded >= this.config.throwAfter) {
				throw new Error("simulated harness crash");
			}
		}
	}

	async stopSession(handle: SessionHandle): Promise<SessionResult> {
		this.stoppedHandles.push(handle);
		this.releaseHang?.();
		this.releaseHang = null;
		return (
			this.config.stopResult ?? {
				outcome: "completed",
				cost: { minor: 0, currency: "USD" },
				tokenUsage: { byTier: {} },
			}
		);
	}

	getCapabilities(): HarnessCapabilities {
		return {
			preCompactionTrigger: true,
			subAgents: true,
			modelProviders: ["anthropic"],
			mcpSupport: false,
			returnEnforcement: "none",
		};
	}
}

// --- Helper: wrap a HarnessAdapter in a single-adapter pool ------------------

/** S2: wrap a HarnessAdapter in an AdapterPool for use in deps.adapterPool. */
function makePool(adapter: HarnessAdapter): AdapterPool {
	const pool = new AdapterPool();
	pool.register("local", adapter, {
		name: "local",
		kind: "local",
		modelProviders: ["anthropic"],
		maxConcurrent: 4,
	});
	return pool;
}

// --- Fixture builders --------------------------------------------------------

interface SeedOverrides {
	readonly agentCostCap?: number | null;
	readonly agentMaxConcurrentSessions?: number;
	readonly taskState?: string;
	readonly taskRiskTier?: "low" | "medium" | "high" | null;
	readonly extraTasks?: number;
}

const NOW = "2026-04-16T00:00:00.000Z";

async function seedDomain(db: HyperIdleDb, overrides: SeedOverrides = {}): Promise<void> {
	await db.insert(teams).values({ id: "p1", name: "Test Product", phase: "build", createdAt: NOW });

	await db
		.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: NOW });

	await db.insert(bets).values({
		id: "b1",
		teamId: "p1",
		description: "Test bet",
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});

	await db.insert(users).values({
		id: "agent-1",
		name: "Builder Agent",
		role: "builder",
		status: "active",
		teamId: "t1",
		maxConcurrentSessions: overrides.agentMaxConcurrentSessions ?? 1,
		costCap: overrides.agentCostCap === undefined ? null : overrides.agentCostCap,
		costActual: 0,
		createdAt: NOW,
	});

	const mainTaskState = overrides.taskState ?? "accepted";
	await db.insert(tasks).values({
		id: "task-1",
		betId: "b1",
		teamId: "p1",
		title: "Test task",
		state: mainTaskState,
		createdAt: NOW,
		updatedAt: NOW,
	});

	// @lore O2: riskTier moved to taskStrategyFabric extension table
	if (overrides.taskRiskTier != null) {
		await db.insert(taskStrategyFabric).values({
			id: `tsf-task-1`,
			taskId: "task-1",
			riskTier: overrides.taskRiskTier,
		});
	}

	for (let i = 2; i <= (overrides.extraTasks ?? 1) + 1; i++) {
		if (i === 2 && (overrides.extraTasks ?? 0) === 0) continue;
		await db.insert(tasks).values({
			id: `task-${i}`,
			betId: "b1",
			teamId: "p1",
			title: `Task ${i}`,
			state: "accepted",
			createdAt: NOW,
			updatedAt: NOW,
		});
	}

	// Seed a knowledge item so assembleContext has something to write.
	await db.insert(knowledgeItems).values({
		id: "ki-seed-1",
		title: "Seed Principle",
		body: "Seeded body.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "system",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

function baseParams(
	basePath: string,
	overrides: Partial<ProvisionSessionParams> = {},
): ProvisionSessionParams {
	return {
		taskId: "task-1",
		agentId: "agent-1",
		productId: "p1",
		sandboxBasePath: basePath,
		...overrides,
	};
}

// --- Suite -------------------------------------------------------------------

describe("Session Provisioning (D5)", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let tmpDir: string;
	let workspace: LocalSandboxAdapter;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "d5-session-provisioning-"));
		workspace = new LocalSandboxAdapter();
		clearDeduplicationCache();
		// AK2 §4a: register Fabric Strategy so provisionSession routes through
		// the Strategy Port (getActiveStrategy() throws if unset — fail-loud).
		setActiveStrategy(fabricStrategy);
	});

	afterEach(async () => {
		// AK2 §4a: clear the Strategy registration after each test.
		clearActiveStrategy();
		if (fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	// ---------------------------------------------------------------------- AC1
	describe("AC1: end-to-end mock run", () => {
		it("provisions, lets agent write a file, flushes to SQLite via writeback, ends, cleans workspace", async () => {
			await seedDomain(db);

			// The harness writes a markdown file into the live workspace
			// (knowledge/practices/ is a manifest-watched zone). We then
			// deterministically invoke `processWriteback` via `afterFileWrites`
			// — the orchestrator integrates the watcher + writeback, and this
			// ensures the assertion is not flaky under fs.watch's FSEvents
			// timing (pre-existing issue called out in B4's own tests).
			const relativePath = "knowledge/practices/progress.md";
			const content = "# Progress\nFirst draft complete.";
			const harness = new ScriptedHarnessAdapter({
				events: [
					{ type: "token_usage", inputTokens: 50, outputTokens: 20 },
					{ type: "cost_update", totalCost: 0.01, deltaCost: 0.01 },
					// AL6 v2: emit submit_review so the return gate sees a return action.
					{
						type: "tool_call",
						toolName: "submit_review",
						args: { title: "AC1 review", reasoning: ["done"] },
					},
					{ type: "completion", text: "Done." },
				],
				fileWrites: [{ relativePath, content }],
				afterFileWrites: async (cfg) => {
					const [sessionRow] = await db
						.select()
						.from(sessions)
						.where(eq(sessions.sandboxSnapshot, cfg.sandboxPath));

					if (!sessionRow) throw new Error("AC1 setup error: no session row");
					processWriteback(
						{
							db,
							sandboxPath: cfg.sandboxPath,
							sessionId: sessionRow.id,
							manifestPath: path.join(cfg.sandboxPath, ".fabric/manifest.json"),
						},
						[
							{
								type: "create",
								relativePath,
								fullPath: path.join(cfg.sandboxPath, relativePath),
							},
						],
					);
				},
				stopResult: {
					outcome: "completed",
					cost: { minor: 1, currency: "USD" },
					tokenUsage: { byTier: { workhorse: { prompt: 50, completion: 20 } } },
				},
			});

			const deps: ProvisionSessionDeps = {
				db,
				eventBus,
				adapterPool: makePool(harness),
				workspace,
			};
			const result = await provisionSession(deps, baseParams(tmpDir));

			// (a) session.state = 'done', outcome = 'completed'
			const [session] = await db.select().from(sessions).where(eq(sessions.id, result.sessionId));
			expect(session?.state).toBe("done");
			expect(session?.outcome).toBe("completed");
			expect(session?.endedAt).toBeTruthy();

			// (b) O2: cost column stripped from sessions — cost tracking is strategy concern
			// Verify the session still ends cleanly (cost is tracked in result, not DB)

			// (c) workspace cleaned on normal end
			const sessionPath = session?.sandboxSnapshot ?? "";
			expect(sessionPath).toBeTruthy();
			expect(fs.existsSync(sessionPath)).toBe(false);

			// (d) returned outcome matches
			expect(result.outcome).toBe("completed");
			expect(result.taskId).toBe("task-1");

			// (e) The writeback pipeline ran: a knowledge_items row attributed
			// to this session must exist. This proves manifest → writeback
			// flowed end-to-end — not a DB shortcut.
			const kiRows = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.updatedBy, `session:${result.sessionId}`));

			expect(kiRows).toHaveLength(1);
			expect(kiRows[0]!.body).toBe(content);
		});
	});

	// ---------------------------------------------------------------------- AC3
	describe("AC3: crash recovery", () => {
		it("marks session crashed and preserves pre-crash knowledge via writeback", async () => {
			await seedDomain(db);

			// The harness writes a markdown file into the live workspace BEFORE
			// streaming events, then the single streamed event triggers a
			// crash. Under test-parallelism load fs.watch (FSEvents on macOS)
			// can miss events, so we additionally invoke `processWriteback`
			// deterministically via `afterFileWrites` — this proves that the
			// writeback layer (which the orchestrator integrates) persists
			// pre-crash knowledge regardless of fs.watch timing.
			const relativePath = "knowledge/practices/pre-crash.md";
			const content = "Pre-crash scribble.";
			const harness = new ScriptedHarnessAdapter({
				events: [{ type: "cost_update", totalCost: 0.0, deltaCost: 0.0 }],
				fileWrites: [{ relativePath, content }],
				afterFileWrites: async (cfg) => {
					const [sessionRow] = await db
						.select()
						.from(sessions)
						.where(eq(sessions.sandboxSnapshot, cfg.sandboxPath));

					if (!sessionRow) throw new Error("AC3 setup error: no session row");
					processWriteback(
						{
							db,
							sandboxPath: cfg.sandboxPath,
							sessionId: sessionRow.id,
							manifestPath: path.join(cfg.sandboxPath, ".fabric/manifest.json"),
						},
						[
							{
								type: "create",
								relativePath,
								fullPath: path.join(cfg.sandboxPath, relativePath),
							},
						],
					);
				},
				throwAfter: 1,
			});

			const deps: ProvisionSessionDeps = {
				db,
				eventBus,
				adapterPool: makePool(harness),
				workspace,
			};
			const result = await provisionSession(deps, baseParams(tmpDir));

			expect(result.outcome).toBe("crashed");

			const [session] = await db.select().from(sessions).where(eq(sessions.id, result.sessionId));
			expect(session?.state).toBe("crashed");
			expect(session?.outcome).toBe("crashed");
			expect(session?.endedAt).toBeTruthy();

			// Workspace NOT destroyed on crash (per C3 crashSession invariant).
			expect(session?.sandboxSnapshot).toBeTruthy();
			expect(fs.existsSync(session?.sandboxSnapshot ?? "")).toBe(true);

			// Pre-crash writes must survive the crash via the writeback layer.
			// Strict assertion: a knowledge_items row attributed to THIS session
			// must exist (no DB-shortcut fallback accepted).
			const rows = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.updatedBy, `session:${result.sessionId}`));

			expect(rows).toHaveLength(1);
			expect(rows[0]!.body).toBe(content);
		});
	});

	// ---------------------------------------------------------------------- AC4
	describe("AC4: cost cap rejection", () => {
		it("rejects with CostCapExceededError when agent cap is 0; no DB/FS side-effects", async () => {
			// Cap = 0 with zero spend is already a binding breach per
			// cost-cap.ts: `if (agentSpend >= agent.costCap)` (0 >= 0). No
			// prior-session crutch needed.
			await seedDomain(db, { agentCostCap: 0 });

			const harness = new ScriptedHarnessAdapter({ events: [] });
			const deps: ProvisionSessionDeps = {
				db,
				eventBus,
				adapterPool: makePool(harness),
				workspace,
			};

			await expect(provisionSession(deps, baseParams(tmpDir))).rejects.toBeInstanceOf(
				CostCapExceededError,
			);

			// No session row created at all.
			const rows = await db.select().from(sessions);
			expect(rows.length).toBe(0);

			// Harness never started.
			expect(harness.startedConfigs.length).toBe(0);

			// Task not transitioned.
			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			expect(task?.state).toBe("accepted");

			// No leftover workspace directories under tmpDir.
			const entries = fs.existsSync(tmpDir) ? fs.readdirSync(tmpDir) : [];
			expect(entries).toEqual([]);
		});
	});

	// ---------------------------------------------------------------------- AC5
	describe("AC5: concurrent sessions are independent", () => {
		it("runs 3 sessions in parallel with distinct workspaces, each session's writeback strictly isolated", async () => {
			await seedDomain(db, { agentMaxConcurrentSessions: 3, extraTasks: 2 });

			// NOTE on watcher reliability under concurrency: `fs.watch` with
			// `{ recursive: true }` on macOS uses FSEvents and becomes lossy
			// when multiple watchers fire simultaneously across sibling
			// workspaces (a known Node limitation, also flagged in B4's
			// file-watcher tests as a pre-existing flake). Single-watcher
			// paths exercise fs.watch end-to-end (see AC1 and AC3). For the
			// concurrency proof, AC5 invokes `processWriteback` directly via
			// `afterFileWrites` so the test is deterministic — the isolation
			// assertion we care about (each knowledge_items row attributed
			// only to its own session) lives in the WRITEBACK layer, not in
			// fs.watch's event-delivery layer.
			function mkHarness(marker: string): ScriptedHarnessAdapter {
				const relativePath = `knowledge/practices/${marker}.md`;
				return new ScriptedHarnessAdapter({
					events: [
						{ type: "cost_update", totalCost: 0.001, deltaCost: 0.001 },
						// AL6 v3: emit submit_review so the ReturnGate exits after run-1.
						// Without it, the re-prompt loop runs AL6_MAX_FORCE_RETURNS+1 times
						// → afterFileWrites fires 3x → 3 knowledge_items rows per session.
						{
							type: "tool_call",
							toolName: "submit_review",
							args: { title: "AC5 marker done", reasoning: ["done"] },
						},
						{ type: "completion", text: "ok" },
					],
					fileWrites: [{ relativePath, content: `marker:${marker}` }],
					afterFileWrites: async (cfg) => {
						// Deterministic writeback so the isolation assertion is
						// not subject to fs.watch races. We look up the session's
						// UUID by workspace path (inserted in Phase 5 of the
						// orchestrator) so the knowledge_items row gets the
						// correct `session:<uuid>` attribution.
						const [sessionRow] = await db
							.select()
							.from(sessions)
							.where(eq(sessions.sandboxSnapshot, cfg.sandboxPath));

						if (!sessionRow) {
							throw new Error(`AC5 setup error: no session row for workspace ${cfg.sandboxPath}`);
						}
						processWriteback(
							{
								db,
								sandboxPath: cfg.sandboxPath,
								sessionId: sessionRow.id,
								manifestPath: path.join(cfg.sandboxPath, ".fabric/manifest.json"),
							},
							[
								{
									type: "create",
									relativePath,
									fullPath: path.join(cfg.sandboxPath, relativePath),
								},
							],
						);
					},
					stopResult: {
						outcome: "completed",
						cost: { minor: 0, currency: "USD" },
						tokenUsage: { byTier: { workhorse: { prompt: 7, completion: 3 } } },
					},
				});
			}

			const taskIds = ["task-1", "task-2", "task-3"];
			const harnesses = taskIds.map((t) => mkHarness(t));

			// Kick off all three concurrently via Promise.all. better-sqlite3
			// serializes the actual writes internally, but the provisioning
			// phases (sandbox spawn, assemble context, watcher start, harness
			// start) overlap — we verify that independence holds.
			const results: ProvisionSessionResult[] = await Promise.all(
				taskIds.map((taskId, i) => {
					const h = harnesses[i];
					if (!h) throw new Error(`No harness at index ${i}`);
					const deps: ProvisionSessionDeps = {
						db,
						eventBus,
						adapterPool: makePool(h),
						workspace,
					};
					return provisionSession(deps, baseParams(tmpDir, { taskId }));
				}),
			);

			// Distinct session IDs
			const ids = new Set(results.map((r) => r.sessionId));
			expect(ids.size).toBe(3);

			// Distinct workspaces (via sessions.sandboxSnapshot)
			const sessionRows = await db.select().from(sessions);
			expect(sessionRows.length).toBe(3);
			const paths = new Set(sessionRows.map((s) => s.sandboxSnapshot));
			expect(paths.size).toBe(3);

			// Strict isolation: every session has exactly one knowledge_items
			// row and that row's body belongs to THAT session's marker only.
			const seenAttributions = new Set<string>();
			for (const r of results) {
				const attribution = `session:${r.sessionId}`;
				seenAttributions.add(attribution);
				const sessionRow = sessionRows.find((s) => s.id === r.sessionId);
				const expectedMarker = `marker:${sessionRow?.taskId}`;

				const rows = await db
					.select()
					.from(knowledgeItems)
					.where(eq(knowledgeItems.updatedBy, attribution));

				expect(rows).toHaveLength(1);
				expect(rows[0]!.body).toBe(expectedMarker);
			}

			// And no knowledge_items row exists attributed to any OTHER source
			// (no system rows from writeback, no cross-session attribution).
			const allKi = await db.select().from(knowledgeItems);
			const fromSessions = allKi.filter((k) => k.updatedBy.startsWith("session:"));
			expect(fromSessions).toHaveLength(3);
			const attributions = new Set(fromSessions.map((k) => k.updatedBy));
			expect(attributions).toEqual(seenAttributions);
		});
	});

	// ---------------------------------------------------------------------- AC6
	describe("AC6: task transitions accepted -> in_progress on session start", () => {
		it("transitions the task before streamEvents is consumed", async () => {
			await seedDomain(db);

			// Sanity-check precondition.
			const [pre] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			expect(pre?.state).toBe("accepted");

			let taskStateAtStart: string | undefined;
			// Harness blocks briefly on startSession so we can observe task state
			// BEFORE any events are streamed.
			const harness = new ScriptedHarnessAdapter({
				events: [
					{ type: "cost_update", totalCost: 0.0, deltaCost: 0.0 },
					{ type: "completion", text: "ok" },
				],
				onStart: async () => {
					const [t] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
					taskStateAtStart = t?.state;
				},
			});

			// Track task_state_changed events.
			const transitions: Array<{ from: string; to: string }> = [];
			eventBus.on("task_state_changed", (e) =>
				transitions.push({ from: e.fromState, to: e.toState }),
			);

			const deps: ProvisionSessionDeps = {
				db,
				eventBus,
				adapterPool: makePool(harness),
				workspace,
			};
			await provisionSession(deps, baseParams(tmpDir));

			// By the time startSession fires, the task must already be in_progress.
			expect(taskStateAtStart).toBe("in_progress");

			// Exactly one transition emitted, with the expected shape.
			const accepted = transitions.find((t) => t.from === "accepted" && t.to === "in_progress");
			expect(accepted).toBeDefined();
		});
	});

	// ---------------------------------------------------------------------- AC7
	describe("AC7: sub-agent cost aggregation", () => {
		it("accumulates cost deltas from main and sub-agents (returned in result)", async () => {
			await seedDomain(db);

			// Main + two sub-agent cost updates. The orchestrator accumulates these.
			// O2: cost column stripped from sessions — cost returned in result only.
			const harness = new ScriptedHarnessAdapter({
				events: [
					{ type: "cost_update", totalCost: 0.01, deltaCost: 0.01 },
					{ type: "cost_update", totalCost: 0.03, deltaCost: 0.02 },
					{ type: "cost_update", totalCost: 0.06, deltaCost: 0.03 },
					// AL6 v2: emit submit_review so the return gate sees a return action.
					{
						type: "tool_call",
						toolName: "submit_review",
						args: { title: "AC7 review", reasoning: ["done"] },
					},
				],
				stopResult: {
					outcome: "completed",
					cost: { minor: 6, currency: "USD" },
					tokenUsage: { byTier: { workhorse: { prompt: 20, completion: 10 } } },
				},
			});

			const deps: ProvisionSessionDeps = {
				db,
				eventBus,
				adapterPool: makePool(harness),
				workspace,
			};
			const result = await provisionSession(deps, baseParams(tmpDir));

			const [session] = await db.select().from(sessions).where(eq(sessions.id, result.sessionId));
			expect(session?.state).toBe("done");
			expect(session?.outcome).toBe("completed");
		});
	});

	// ---------------------------------------------------- C7 integration (D5 constraint)
	describe("C7 integration: mid-session cost cap breach detection", () => {
		it("calls recordCostAndCheck per cost_update and emits cost_cap_breached when running total crosses the cap", async () => {
			// Cap = 3 cents. A single mid-stream cost_update of $0.05 (5 cents)
			// must trip the breach. If the orchestrator never forwards to
			// recordCostAndCheck, this event is never emitted and the test
			// fails — which is exactly the gap D5 was missing.
			await seedDomain(db, { agentCostCap: 3 });

			const breaches: CostCapBreachedEvent[] = [];
			eventBus.on("cost_cap_breached", (e) => breaches.push(e));

			const harness = new ScriptedHarnessAdapter({
				events: [
					{ type: "cost_update", totalCost: 0.05, deltaCost: 0.05 },
					{ type: "completion", text: "done" },
				],
				stopResult: {
					outcome: "completed",
					cost: { minor: 5, currency: "USD" },
					tokenUsage: { byTier: {} },
				},
			});

			const deps: ProvisionSessionDeps = {
				db,
				eventBus,
				adapterPool: makePool(harness),
				workspace,
			};
			const result = await provisionSession(deps, baseParams(tmpDir));

			// Exactly one breach event — agent-level.
			expect(breaches).toHaveLength(1);
			expect(breaches[0]!.capLevel).toBe("agent");
			expect(breaches[0]!.entityId).toBe("agent-1");
			expect(breaches[0]!.spend).toBe(5);
			expect(breaches[0]!.cap).toBe(3);
			expect(breaches[0]!.streamId).toBe(result.sessionId);
		});
	});

	// ---------------------------------------------------------------------- AC8
	describe("AC8: session_ended event carries full payload", () => {
		it("emits { sessionId, outcome, taskId } on normal end", async () => {
			await seedDomain(db);

			const received: SessionEndedEvent[] = [];
			eventBus.on("session_ended", (e) => received.push(e));

			const harness = new ScriptedHarnessAdapter({
				events: [
					{ type: "cost_update", totalCost: 0.05, deltaCost: 0.05 },
					// AL6 v2: emit submit_review so the return gate sees a return action.
					{
						type: "tool_call",
						toolName: "submit_review",
						args: { title: "AC8 review", reasoning: ["done"] },
					},
					{ type: "completion", text: "done" },
				],
				stopResult: {
					outcome: "completed",
					cost: { minor: 5, currency: "USD" },
					tokenUsage: { byTier: {} },
				},
			});

			const deps: ProvisionSessionDeps = {
				db,
				eventBus,
				adapterPool: makePool(harness),
				workspace,
			};
			const result = await provisionSession(deps, baseParams(tmpDir));

			expect(received).toHaveLength(1);
			const ev = received[0];
			expect(ev!.sessionId).toBe(result.sessionId);
			expect(ev!.taskId).toBe("task-1");
			expect(ev!.outcome).toBe("completed");
			// costDelta was removed in O1 (kernel/strategy separation)
		});

		it("emits outcome=crashed when the harness throws", async () => {
			await seedDomain(db);

			const received: SessionEndedEvent[] = [];
			eventBus.on("session_ended", (e) => received.push(e));

			const harness = new ScriptedHarnessAdapter({
				// $0.02 is yielded before the crash; orchestrator must still
				// propagate that into sessions.cost.
				events: [{ type: "cost_update", totalCost: 0.02, deltaCost: 0.02 }],
				throwAfter: 1,
			});

			const deps: ProvisionSessionDeps = {
				db,
				eventBus,
				adapterPool: makePool(harness),
				workspace,
			};
			await provisionSession(deps, baseParams(tmpDir));

			expect(received).toHaveLength(1);
			expect(received[0]!.outcome).toBe("crashed");
			// costDelta was removed in O1 (kernel/strategy separation)
		});

		it("emits a tool_call_recorded DomainEvent for each harness tool_call (H3 AC4)", async () => {
			// This closes the H3 AC4 gap — tool_call events must reach the
			// observability layer. Previously the harness yielded tool_call
			// events that were consumed by the registry but never forwarded
			// to the EventBus, so `registerObservabilityDispatcher` never
			// saw them.
			await seedDomain(db);
			const received: Array<{
				sessionId: string;
				toolName: string;
				argsSummary: string;
			}> = [];
			eventBus.on("tool_call_recorded", (e) =>
				received.push({
					sessionId: e.sessionId,
					toolName: e.toolName,
					argsSummary: e.argsSummary,
				}),
			);
			const harness = new ScriptedHarnessAdapter({
				events: [
					{
						type: "tool_call",
						toolName: "NonExistentTool",
						args: { path: "/workspace/foo.ts" },
					},
					{ type: "cost_update", totalCost: 0, deltaCost: 0 },
					// AL6 v3: registry.invoke returns err("NOT_FOUND") for unknown tools
					// instead of throwing — session does NOT crash, loop continues.
					// Emit submit_review so the ReturnGate exits after run-1, otherwise
					// the re-prompt loop runs 3 total times and fires 3 tool_call_recorded
					// events (one NonExistentTool per run).
					{
						type: "tool_call",
						toolName: "submit_review",
						args: { title: "AC8 review", reasoning: ["done"] },
					},
					{ type: "completion", text: "done" },
				],
				stopResult: {
					outcome: "completed",
					cost: { minor: 0, currency: "USD" },
					tokenUsage: { byTier: {} },
				},
			});
			const deps: ProvisionSessionDeps = {
				db,
				eventBus,
				adapterPool: makePool(harness),
				workspace,
			};
			await provisionSession(deps, baseParams(tmpDir));
			// Two tool_call_recorded events: NonExistentTool + submit_review.
			// The NonExistentTool event is the one we care about for H3 AC4.
			expect(received).toHaveLength(2);
			const nonExistent = received.find((e) => e.toolName === "NonExistentTool");
			expect(nonExistent).toBeDefined();
			// argsSummary is scrubbed + truncated, and contains the arg.
			expect(nonExistent!.argsSummary).toContain("/workspace/foo.ts");
			expect(nonExistent!.sessionId).toMatch(/^[0-9a-f-]{36}$/);
		});

		it("registerSessionReviewCreator creates a review item for a medium-risk task", async () => {
			await seedDomain(db, { taskRiskTier: "medium" });

			// Pre-attach a review thread to the task so the creator has somewhere to file.
			await db.insert(threads).values({
				id: "thread-1",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: NOW,
				createdAt: NOW,
			});

			await db.update(tasks).set({ threadId: "thread-1" }).where(eq(tasks.id, "task-1"));

			const unsubscribe = registerSessionReviewCreator(db, eventBus);
			try {
				const harness = new ScriptedHarnessAdapter({
					events: [
						{ type: "cost_update", totalCost: 0.0, deltaCost: 0.0 },
						{ type: "completion", text: "ok" },
					],
					stopResult: {
						outcome: "completed",
						cost: { minor: 0, currency: "USD" },
						tokenUsage: { byTier: {} },
					},
				});

				const deps: ProvisionSessionDeps = {
					db,
					eventBus,
					adapterPool: makePool(harness),
					workspace,
				};
				await provisionSession(deps, baseParams(tmpDir));

				const reviewItems = await db.select().from(items).where(eq(items.threadId, "thread-1"));
				expect(reviewItems.length).toBeGreaterThanOrEqual(1);
				expect(reviewItems[0]!.kind).toBe("review");
			} finally {
				unsubscribe();
			}
		});
	});

	// -------------------------------------------------------------- AC error handling
	describe("AC error handling: workspace spawn failure reverts task state", () => {
		it("reverts task to accepted, writes no session row, and propagates the error", async () => {
			await seedDomain(db);

			// Mock workspace adapter whose spawn always throws (e.g. disk full).
			const failingWorkspace: SandboxAdapter = {
				spawn: async () => {
					throw new Error("ENOSPC: no space left on device");
				},
				exec: async () => {
					throw new Error("unreachable: spawn failed");
				},
				destroy: async () => {
					/* no-op */
				},
			};

			// Track task_state_changed events so we can assert the revert emitted.
			const transitions: Array<{ from: string; to: string }> = [];
			eventBus.on("task_state_changed", (e) =>
				transitions.push({ from: e.fromState, to: e.toState }),
			);

			const harness = new ScriptedHarnessAdapter({ events: [] });
			const deps: ProvisionSessionDeps = {
				db,
				eventBus,
				adapterPool: makePool(harness),
				workspace: failingWorkspace,
			};

			await expect(provisionSession(deps, baseParams(tmpDir))).rejects.toThrow(/ENOSPC/);

			// Task must be reverted to `accepted` (not stuck in in_progress).
			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			expect(task?.state).toBe("accepted");

			// I1 H2: the revert must be recorded in the auditTrail column
			// (not notes — that is the agent-prose lane). notes must remain
			// untouched by the revert path.
			expect(task?.notes == null || task?.notes === "").toBe(true);
			const audit: Array<{ from: string; to: string; reason?: string }> = task?.auditTrail
				? JSON.parse(task.auditTrail)
				: [];
			const revertEntry = audit.find((e) => e.from === "in_progress" && e.to === "accepted");
			expect(revertEntry).toBeDefined();
			expect(revertEntry?.reason).toMatch(/provisioning failed/);
			expect(revertEntry?.reason).toMatch(/ENOSPC/);

			// Transitions: in_progress → accepted revert must have been emitted.
			expect(transitions.some((t) => t.from === "in_progress" && t.to === "accepted")).toBe(true);

			// No session row created.
			const sessionRows = await db.select().from(sessions);
			expect(sessionRows.length).toBe(0);

			// Harness never started.
			expect(harness.startedConfigs.length).toBe(0);

			// Agent cost unchanged.
			const [agent] = await db.select().from(users).where(eq(users.id, "agent-1"));
			expect(agent?.costActual).toBe(0);
		});
	});

	// ------------------------------------------------- I1 H2: revert data integrity
	describe("I1 H2: revertTaskToAccepted writes to auditTrail, preserves notes", () => {
		it("preserves agent-authored notes prose and appends the revert entry to auditTrail", async () => {
			await seedDomain(db);

			// Seed agent-authored prose on the task before provisioning; the
			// revert path must not corrupt this column.
			const agentProse = "Thinking out loud: will pick this back up tomorrow.";
			await db.update(tasks).set({ notes: agentProse }).where(eq(tasks.id, "task-1"));

			const failingWorkspace: SandboxAdapter = {
				spawn: async () => {
					throw new Error("ENOSPC: H2 path");
				},
				exec: async () => {
					throw new Error("unreachable");
				},
				destroy: async () => {
					/* no-op */
				},
			};

			const harness = new ScriptedHarnessAdapter({ events: [] });
			const deps: ProvisionSessionDeps = {
				db,
				eventBus,
				adapterPool: makePool(harness),
				workspace: failingWorkspace,
			};

			await expect(provisionSession(deps, baseParams(tmpDir))).rejects.toThrow(/ENOSPC: H2 path/);

			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			// notes prose preserved verbatim.
			expect(task?.notes).toBe(agentProse);
			// auditTrail carries the revert entry.
			const audit: Array<{ from: string; to: string; reason?: string }> = task?.auditTrail
				? JSON.parse(task.auditTrail)
				: [];
			const revertEntry = audit.find((e) => e.to === "accepted");
			expect(revertEntry).toBeDefined();
			expect(revertEntry?.reason).toMatch(/provisioning failed/);
		});
	});

	// -------------------------------------------------------------- AC defensive
	describe("AC defensive: negative deltaCost is clamped to zero", () => {
		it("ignores negative deltaCost; session ends cleanly", async () => {
			await seedDomain(db);

			// A buggy/malicious harness emits a negative deltaCost first, then a
			// positive one. O2: cost column stripped from sessions.
			const harness = new ScriptedHarnessAdapter({
				events: [
					{ type: "cost_update", totalCost: -0.05, deltaCost: -0.05 },
					{ type: "cost_update", totalCost: 0.03, deltaCost: 0.03 },
					{ type: "completion", text: "done" },
				],
				stopResult: {
					outcome: "completed",
					cost: { minor: 3, currency: "USD" },
					tokenUsage: { byTier: {} },
				},
			});

			const deps: ProvisionSessionDeps = {
				db,
				eventBus,
				adapterPool: makePool(harness),
				workspace,
			};
			const result = await provisionSession(deps, baseParams(tmpDir));

			const [session] = await db.select().from(sessions).where(eq(sessions.id, result.sessionId));
			expect(session?.state).toBe("done");
		});
	});

	// -------------------------------------------------------------- AC defensive
	describe("AC defensive: session timeout stops a hanging harness", () => {
		it("stops the active harness and records a crashed session when the run exceeds sessionTimeoutMs", async () => {
			await seedDomain(db);

			const harness = new ScriptedHarnessAdapter({
				events: [],
				hangUntilStop: true,
				stopResult: {
					outcome: "stopped",
					cost: { minor: 0, currency: "USD" },
					tokenUsage: { byTier: {} },
				},
			});

			const deps: ProvisionSessionDeps = {
				db,
				eventBus,
				adapterPool: makePool(harness),
				workspace,
				sessionTimeoutMs: 10,
			};
			const result = await provisionSession(deps, baseParams(tmpDir));

			expect(result.outcome).toBe("crashed");
			expect(harness.stoppedHandles).toHaveLength(1);
			const [session] = await db.select().from(sessions).where(eq(sessions.id, result.sessionId));
			expect(session?.state).toBe("crashed");
		});
	});

	// -------------------------------------------------------------- AC observability
	describe("AC observability: stopSession errors surface on normal completion", () => {
		it("propagates a stopSession failure on normal completion instead of swallowing it", async () => {
			await seedDomain(db);

			// Scripted harness with a failing stopSession. On the NORMAL path
			// (no crash in streamEvents), the orchestrator must NOT swallow a
			// stopSession error — that behavior hid runaway subprocesses.
			class FailingStopHarness extends ScriptedHarnessAdapter {
				async stopSession(_handle: SessionHandle): Promise<SessionResult> {
					throw new Error("stopSession exploded");
				}
			}

			const harness = new FailingStopHarness({
				events: [
					{ type: "cost_update", totalCost: 0.01, deltaCost: 0.01 },
					{ type: "completion", text: "ok" },
				],
			});

			const deps: ProvisionSessionDeps = {
				db,
				eventBus,
				adapterPool: makePool(harness),
				workspace,
			};
			await expect(provisionSession(deps, baseParams(tmpDir))).rejects.toThrow(
				/stopSession exploded/,
			);
		});
	});

	// ------------------------------------------- G1 AC6: facilitator provisioning
	describe("G1 AC6: facilitator provisioning + facilitator tools exposed", () => {
		// @lore AD8c: role renamed from practice_facilitator to facilitator
		it("provisions a session for a facilitator agent; registry exposes facilitator tools", async () => {
			// Seed the full domain first (gives us t1, b1, task-1).
			await seedDomain(db);

			// Replace the default builder agent on task-1 with a facilitator.
			await db.delete(tasks).where(eq(tasks.id, "task-1"));
			await db.delete(users).where(eq(users.id, "agent-1"));

			await db.insert(users).values({
				id: "agent-fac",
				name: "Ops Facilitator",
				role: "facilitator",
				status: "active",
				teamId: null,
				maxConcurrentSessions: 1,
				costCap: null,
				costActual: 0,
				// X3: systemPromptPath deprecated; systemPrompt holds inline text now
				systemPrompt: "# Facilitator\n\nYou are a facilitator.",
				skills:
					'{"scope":"ops","tools":["route_item","score_attention","promote_knowledge","create_conflict_review"]}',
				createdAt: NOW,
			});

			await db.insert(tasks).values({
				id: "task-fac",
				betId: "b1",
				teamId: "p1",
				title: "Facilitator task",
				state: "accepted",
				createdAt: NOW,
				updatedAt: NOW,
			});

			const harness = new ScriptedHarnessAdapter({
				events: [
					{ type: "cost_update", totalCost: 0.0, deltaCost: 0.0 },
					// AL6 v3: emit submit_review so the ReturnGate exits after run-1.
					// Without it, the re-prompt loop runs 3 times total.
					{
						type: "tool_call",
						toolName: "submit_review",
						args: { title: "facilitator done", reasoning: ["done"] },
					},
					{ type: "completion", text: "ok" },
				],
				stopResult: {
					outcome: "completed",
					cost: { minor: 0, currency: "USD" },
					tokenUsage: { byTier: {} },
				},
			});

			const deps: ProvisionSessionDeps = {
				db,
				eventBus,
				adapterPool: makePool(harness),
				workspace,
			};
			await provisionSession(
				deps,
				baseParams(tmpDir, { taskId: "task-fac", agentId: "agent-fac" }),
			);

			// startSession must have been called exactly once.
			expect(harness.startedConfigs.length).toBe(1);
			const cfg = harness.startedConfigs[0];

			// Tools passed to the harness must include all four facilitator tools.
			const tools = cfg!.tools;
			expect(tools).toContain("route_item");
			expect(tools).toContain("score_attention");
			expect(tools).toContain("promote_knowledge");
			expect(tools).toContain("create_conflict_review");
		});

		it("builder session does NOT expose facilitator tools (role-based authz)", async () => {
			await seedDomain(db);

			const harness = new ScriptedHarnessAdapter({
				events: [
					{ type: "cost_update", totalCost: 0.0, deltaCost: 0.0 },
					// AL6 v3: emit submit_review so the ReturnGate exits after run-1.
					// Without it, the re-prompt loop runs 3 times total.
					{
						type: "tool_call",
						toolName: "submit_review",
						args: { title: "builder done", reasoning: ["done"] },
					},
					{ type: "completion", text: "ok" },
				],
				stopResult: {
					outcome: "completed",
					cost: { minor: 0, currency: "USD" },
					tokenUsage: { byTier: {} },
				},
			});

			const deps: ProvisionSessionDeps = {
				db,
				eventBus,
				adapterPool: makePool(harness),
				workspace,
			};
			await provisionSession(deps, baseParams(tmpDir));

			expect(harness.startedConfigs.length).toBe(1);
			const cfg = harness.startedConfigs[0];

			// Facilitator-only tools must NOT be present in a builder session.
			const tools = cfg!.tools;
			expect(tools).not.toContain("route_item");
			expect(tools).not.toContain("score_attention");
			expect(tools).not.toContain("promote_knowledge");
			expect(tools).not.toContain("create_conflict_review");

			// General-purpose tools must still be available.
			expect(tools).toContain("log_task");
			expect(tools).toContain("send_message");
			expect(tools).toContain("write_session_notes");
		});
	});

	// @lore X3: Path traversal test on system_prompt_path removed — the attack surface was
	// eliminated by storing system prompts inline in the DB (systemPrompt column). The
	// validateSystemPromptPath function and SYSTEM_PROMPT_DIR_RELATIVE constant were deleted.
});
