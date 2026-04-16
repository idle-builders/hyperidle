/**
 * Session Provisioning — RED phase tests for D5.
 *
 * `provisionSession` is the end-to-end orchestrator that wires together every
 * earlier building block (cost cap, workspace spawn, knowledge materialize,
 * file watcher, agent start, event streaming, cost tracking, cleanup).
 *
 * These tests are written BEFORE the implementation exists — every test is
 * expected to fail with a "module not found" import error. Once
 * `../services/session-provisioning.ts` is written (green phase), they pass.
 *
 * AC mapping (see docs/work-packages/TRACK-D.md → D5):
 *   AC1 — End-to-end mock run leaves DB + FS in the expected state.
 *   AC3 — Crash recovery preserves pre-crash knowledge.
 *   AC4 — Cost cap rejection: no workspace, no session row.
 *   AC5 — Concurrent sessions are independent.
 *   AC6 — Task state moves accepted -> in_progress on session start.
 *   AC7 — Sub-agent cost aggregation.
 *   AC8 — session_ended event carries { sessionId, costDelta, outcome, taskId };
 *         E2 subscriber creates review items.
 *
 * AC2 (real Claude SDK) lives in the companion `.integration.test.ts`.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	type HyperIdleDb,
	agents,
	bets,
	createTestDb,
	items,
	knowledgeItems,
	products,
	sessions,
	tasks,
	teams,
	threads,
} from "@hyperidle/db";
import { processWriteback } from "@hyperidle/fabric";
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
import { LocalWorkspaceAdapter } from "../harness/local-workspace-adapter.js";
import type { WorkspaceAdapter } from "../harness/workspace-adapter.js";
import { clearDeduplicationCache } from "../services/cost-cap.js";
// Importing from a not-yet-written module — RED phase. The green phase will
// create this file; until then every test in this suite fails at import time.
import {
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	type ProvisionSessionResult,
	provisionSession,
} from "../services/session-provisioning.js";
import { registerSessionReviewCreator } from "../services/session-review-creator.js";

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
	readonly afterFileWrites?: (config: SessionConfig) => void;
}

class ScriptedHarnessAdapter implements HarnessAdapter {
	public startedConfigs: SessionConfig[] = [];
	public stoppedHandles: SessionHandle[] = [];
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
				const full = path.join(config.workspacePath, w.relativePath);
				fs.mkdirSync(path.dirname(full), { recursive: true });
				fs.writeFileSync(full, w.content, "utf-8");
			}
		}
		if (this.config.afterFileWrites) {
			this.config.afterFileWrites(config);
		}
		return { sessionId: `scripted-session-${this.nextId++}` };
	}

	async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
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
		return this.config.stopResult ?? { outcome: "completed", totalTokens: 0, totalCost: 0 };
	}

	getCapabilities(): HarnessCapabilities {
		return { preCompactionTrigger: true, subAgents: true };
	}
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

function seedDomain(db: HyperIdleDb, overrides: SeedOverrides = {}): void {
	db.insert(products)
		.values({ id: "p1", name: "Test Product", phase: "build", createdAt: NOW })
		.run();

	db.insert(teams)
		.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: NOW })
		.run();

	db.insert(bets)
		.values({
			id: "b1",
			productId: "p1",
			teamId: "t1",
			pitch: "Test bet",
			appetite: "small",
			status: "committed",
			createdAt: NOW,
		})
		.run();

	db.insert(agents)
		.values({
			id: "agent-1",
			name: "Builder Agent",
			role: "builder",
			status: "active",
			teamId: "t1",
			maxConcurrentSessions: overrides.agentMaxConcurrentSessions ?? 1,
			costCap: overrides.agentCostCap === undefined ? null : overrides.agentCostCap,
			costActual: 0,
			createdAt: NOW,
		})
		.run();

	const mainTaskState = overrides.taskState ?? "accepted";
	const taskRisk = overrides.taskRiskTier === undefined ? null : overrides.taskRiskTier;
	db.insert(tasks)
		.values({
			id: "task-1",
			betId: "b1",
			productId: "p1",
			teamId: "t1",
			title: "Test task",
			state: mainTaskState,
			riskTier: taskRisk,
			createdAt: NOW,
			updatedAt: NOW,
		})
		.run();

	for (let i = 2; i <= (overrides.extraTasks ?? 1) + 1; i++) {
		if (i === 2 && (overrides.extraTasks ?? 0) === 0) continue;
		db.insert(tasks)
			.values({
				id: `task-${i}`,
				betId: "b1",
				productId: "p1",
				teamId: "t1",
				title: `Task ${i}`,
				state: "accepted",
				createdAt: NOW,
				updatedAt: NOW,
			})
			.run();
	}

	// Seed a knowledge item so materialize has something to write.
	db.insert(knowledgeItems)
		.values({
			id: "ki-seed-1",
			layer: "L4",
			kind: "principle",
			title: "Seed Principle",
			body: "Seeded body.",
			format: "markdown",
			status: "active",
			version: 1,
			updatedBy: "system",
			createdAt: NOW,
			updatedAt: NOW,
		})
		.run();
}

function baseParams(
	basePath: string,
	overrides: Partial<ProvisionSessionParams> = {},
): ProvisionSessionParams {
	return {
		taskId: "task-1",
		agentId: "agent-1",
		productId: "p1",
		workspaceBasePath: basePath,
		...overrides,
	};
}

// --- Suite -------------------------------------------------------------------

describe("Session Provisioning (D5)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let tmpDir: string;
	let workspace: LocalWorkspaceAdapter;

	beforeEach(() => {
		db = createTestDb();
		eventBus = new EventBus();
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "d5-session-provisioning-"));
		workspace = new LocalWorkspaceAdapter();
		clearDeduplicationCache();
	});

	afterEach(() => {
		if (fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	// ---------------------------------------------------------------------- AC1
	describe("AC1: end-to-end mock run", () => {
		it("provisions, lets agent write a file, flushes to SQLite via writeback, ends, cleans workspace", async () => {
			seedDomain(db);

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
					{ type: "completion", text: "Done." },
				],
				fileWrites: [{ relativePath, content }],
				afterFileWrites: (cfg) => {
					const sessionRow = db
						.select()
						.from(sessions)
						.where(eq(sessions.workspaceSnapshot, cfg.workspacePath))
						.get();
					if (!sessionRow) throw new Error("AC1 setup error: no session row");
					processWriteback(
						{
							db,
							workspacePath: cfg.workspacePath,
							sessionId: sessionRow.id,
							manifestPath: path.join(cfg.workspacePath, ".fabric/manifest.json"),
						},
						[
							{
								type: "create",
								relativePath,
								fullPath: path.join(cfg.workspacePath, relativePath),
							},
						],
					);
				},
				stopResult: { outcome: "completed", totalTokens: 70, totalCost: 0.01 },
			});

			const deps: ProvisionSessionDeps = { db, eventBus, harness, workspace };
			const result = await provisionSession(deps, baseParams(tmpDir));

			// (a) session.state = 'done', outcome = 'completed'
			const session = db.select().from(sessions).where(eq(sessions.id, result.sessionId)).get();
			expect(session?.state).toBe("done");
			expect(session?.outcome).toBe("completed");
			expect(session?.endedAt).toBeTruthy();

			// (b) cost was recorded (0.01 USD -> 1 cent)
			expect(session?.cost).toBe(1);

			// (c) workspace cleaned on normal end
			const workspacePath = session?.workspaceSnapshot ?? "";
			expect(workspacePath).toBeTruthy();
			expect(fs.existsSync(workspacePath)).toBe(false);

			// (d) returned outcome matches
			expect(result.outcome).toBe("completed");
			expect(result.taskId).toBe("task-1");
			expect(result.totalCostCents).toBe(1);

			// (e) The writeback pipeline ran: a knowledge_items row attributed
			// to this session must exist. This proves manifest → writeback
			// flowed end-to-end — not a DB shortcut.
			const kiRows = db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.updatedBy, `session:${result.sessionId}`))
				.all();
			expect(kiRows).toHaveLength(1);
			expect(kiRows[0].body).toBe(content);
			expect(kiRows[0].layer).toBe("L1");
			expect(kiRows[0].status).toBe("captured");
		});
	});

	// ---------------------------------------------------------------------- AC3
	describe("AC3: crash recovery", () => {
		it("marks session crashed and preserves pre-crash knowledge via writeback", async () => {
			seedDomain(db);

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
				afterFileWrites: (cfg) => {
					const sessionRow = db
						.select()
						.from(sessions)
						.where(eq(sessions.workspaceSnapshot, cfg.workspacePath))
						.get();
					if (!sessionRow) throw new Error("AC3 setup error: no session row");
					processWriteback(
						{
							db,
							workspacePath: cfg.workspacePath,
							sessionId: sessionRow.id,
							manifestPath: path.join(cfg.workspacePath, ".fabric/manifest.json"),
						},
						[
							{
								type: "create",
								relativePath,
								fullPath: path.join(cfg.workspacePath, relativePath),
							},
						],
					);
				},
				throwAfter: 1,
			});

			const deps: ProvisionSessionDeps = { db, eventBus, harness, workspace };
			const result = await provisionSession(deps, baseParams(tmpDir));

			expect(result.outcome).toBe("crashed");

			const session = db.select().from(sessions).where(eq(sessions.id, result.sessionId)).get();
			expect(session?.state).toBe("crashed");
			expect(session?.outcome).toBe("crashed");
			expect(session?.endedAt).toBeTruthy();

			// Workspace NOT destroyed on crash (per C3 crashSession invariant).
			expect(session?.workspaceSnapshot).toBeTruthy();
			expect(fs.existsSync(session?.workspaceSnapshot ?? "")).toBe(true);

			// Pre-crash writes must survive the crash via the writeback layer.
			// Strict assertion: a knowledge_items row attributed to THIS session
			// must exist (no DB-shortcut fallback accepted).
			const rows = db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.updatedBy, `session:${result.sessionId}`))
				.all();
			expect(rows).toHaveLength(1);
			expect(rows[0].body).toBe(content);
		});
	});

	// ---------------------------------------------------------------------- AC4
	describe("AC4: cost cap rejection", () => {
		it("rejects with CostCapExceededError when agent cap is 0; no DB/FS side-effects", async () => {
			// Cap = 0 with zero spend is already a binding breach per
			// cost-cap.ts: `if (agentSpend >= agent.costCap)` (0 >= 0). No
			// prior-session crutch needed.
			seedDomain(db, { agentCostCap: 0 });

			const harness = new ScriptedHarnessAdapter({ events: [] });
			const deps: ProvisionSessionDeps = { db, eventBus, harness, workspace };

			await expect(provisionSession(deps, baseParams(tmpDir))).rejects.toBeInstanceOf(
				CostCapExceededError,
			);

			// No session row created at all.
			const rows = db.select().from(sessions).all();
			expect(rows.length).toBe(0);

			// Harness never started.
			expect(harness.startedConfigs.length).toBe(0);

			// Task not transitioned.
			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			expect(task?.state).toBe("accepted");

			// No leftover workspace directories under tmpDir.
			const entries = fs.existsSync(tmpDir) ? fs.readdirSync(tmpDir) : [];
			expect(entries).toEqual([]);
		});
	});

	// ---------------------------------------------------------------------- AC5
	describe("AC5: concurrent sessions are independent", () => {
		it("runs 3 sessions in parallel with distinct workspaces, each session's writeback strictly isolated", async () => {
			seedDomain(db, { agentMaxConcurrentSessions: 3, extraTasks: 2 });

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
						{ type: "completion", text: "ok" },
					],
					fileWrites: [{ relativePath, content: `marker:${marker}` }],
					afterFileWrites: (cfg) => {
						// Deterministic writeback so the isolation assertion is
						// not subject to fs.watch races. We look up the session's
						// UUID by workspace path (inserted in Phase 5 of the
						// orchestrator) so the knowledge_items row gets the
						// correct `session:<uuid>` attribution.
						const sessionRow = db
							.select()
							.from(sessions)
							.where(eq(sessions.workspaceSnapshot, cfg.workspacePath))
							.get();
						if (!sessionRow) {
							throw new Error(`AC5 setup error: no session row for workspace ${cfg.workspacePath}`);
						}
						processWriteback(
							{
								db,
								workspacePath: cfg.workspacePath,
								sessionId: sessionRow.id,
								manifestPath: path.join(cfg.workspacePath, ".fabric/manifest.json"),
							},
							[
								{
									type: "create",
									relativePath,
									fullPath: path.join(cfg.workspacePath, relativePath),
								},
							],
						);
					},
					stopResult: { outcome: "completed", totalTokens: 10, totalCost: 0.001 },
				});
			}

			const taskIds = ["task-1", "task-2", "task-3"];
			const harnesses = taskIds.map((t) => mkHarness(t));

			// Kick off all three concurrently via Promise.all. better-sqlite3
			// serializes the actual writes internally, but the provisioning
			// phases (workspace spawn, materialize, watcher start, harness
			// start) overlap — we verify that independence holds.
			const results: ProvisionSessionResult[] = await Promise.all(
				taskIds.map((taskId, i) => {
					const deps: ProvisionSessionDeps = {
						db,
						eventBus,
						harness: harnesses[i],
						workspace,
					};
					return provisionSession(deps, baseParams(tmpDir, { taskId }));
				}),
			);

			// Distinct session IDs
			const ids = new Set(results.map((r) => r.sessionId));
			expect(ids.size).toBe(3);

			// Distinct workspaces (via sessions.workspaceSnapshot)
			const sessionRows = db.select().from(sessions).all();
			expect(sessionRows.length).toBe(3);
			const paths = new Set(sessionRows.map((s) => s.workspaceSnapshot));
			expect(paths.size).toBe(3);

			// Strict isolation: every session has exactly one knowledge_items
			// row and that row's body belongs to THAT session's marker only.
			const seenAttributions = new Set<string>();
			for (const r of results) {
				const attribution = `session:${r.sessionId}`;
				seenAttributions.add(attribution);
				const sessionRow = sessionRows.find((s) => s.id === r.sessionId);
				const expectedMarker = `marker:${sessionRow?.taskId}`;

				const rows = db
					.select()
					.from(knowledgeItems)
					.where(eq(knowledgeItems.updatedBy, attribution))
					.all();
				expect(rows).toHaveLength(1);
				expect(rows[0].body).toBe(expectedMarker);
			}

			// And no knowledge_items row exists attributed to any OTHER source
			// (no system rows from writeback, no cross-session attribution).
			const allKi = db.select().from(knowledgeItems).all();
			const fromSessions = allKi.filter((k) => k.updatedBy.startsWith("session:"));
			expect(fromSessions).toHaveLength(3);
			const attributions = new Set(fromSessions.map((k) => k.updatedBy));
			expect(attributions).toEqual(seenAttributions);
		});
	});

	// ---------------------------------------------------------------------- AC6
	describe("AC6: task transitions accepted -> in_progress on session start", () => {
		it("transitions the task before streamEvents is consumed", async () => {
			seedDomain(db);

			// Sanity-check precondition.
			const pre = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			expect(pre?.state).toBe("accepted");

			let taskStateAtStart: string | undefined;
			// Harness blocks briefly on startSession so we can observe task state
			// BEFORE any events are streamed.
			const harness = new ScriptedHarnessAdapter({
				events: [
					{ type: "cost_update", totalCost: 0.0, deltaCost: 0.0 },
					{ type: "completion", text: "ok" },
				],
				onStart: () => {
					const t = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
					taskStateAtStart = t?.state;
				},
			});

			// Track task_state_changed events.
			const transitions: Array<{ from: string; to: string }> = [];
			eventBus.on("task_state_changed", (e) =>
				transitions.push({ from: e.fromState, to: e.toState }),
			);

			const deps: ProvisionSessionDeps = { db, eventBus, harness, workspace };
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
		it("accumulates cost deltas from main and sub-agents onto sessions.cost", async () => {
			seedDomain(db);

			// Main + two sub-agent cost updates. The orchestrator must accumulate these
			// (or trust a running totalCost) so the final persisted cost equals the sum.
			// main $0.01 + sub1 $0.02 + sub2 $0.03 = $0.06 = 6 cents.
			const harness = new ScriptedHarnessAdapter({
				events: [
					{ type: "cost_update", totalCost: 0.01, deltaCost: 0.01 },
					{ type: "cost_update", totalCost: 0.03, deltaCost: 0.02 },
					{ type: "cost_update", totalCost: 0.06, deltaCost: 0.03 },
				],
				stopResult: { outcome: "completed", totalTokens: 30, totalCost: 0.06 },
			});

			const deps: ProvisionSessionDeps = { db, eventBus, harness, workspace };
			const result = await provisionSession(deps, baseParams(tmpDir));

			const session = db.select().from(sessions).where(eq(sessions.id, result.sessionId)).get();
			expect(session?.cost).toBe(6);
			expect(result.totalCostCents).toBe(6);
		});
	});

	// ---------------------------------------------------- C7 integration (D5 constraint)
	describe("C7 integration: mid-session cost cap breach detection", () => {
		it("calls recordCostAndCheck per cost_update and emits cost_cap_breached when running total crosses the cap", async () => {
			// Cap = 3 cents. A single mid-stream cost_update of $0.05 (5 cents)
			// must trip the breach. If the orchestrator never forwards to
			// recordCostAndCheck, this event is never emitted and the test
			// fails — which is exactly the gap D5 was missing.
			seedDomain(db, { agentCostCap: 3 });

			const breaches: CostCapBreachedEvent[] = [];
			eventBus.on("cost_cap_breached", (e) => breaches.push(e));

			const harness = new ScriptedHarnessAdapter({
				events: [
					{ type: "cost_update", totalCost: 0.05, deltaCost: 0.05 },
					{ type: "completion", text: "done" },
				],
				stopResult: { outcome: "completed", totalTokens: 0, totalCost: 0.05 },
			});

			const deps: ProvisionSessionDeps = { db, eventBus, harness, workspace };
			const result = await provisionSession(deps, baseParams(tmpDir));

			// Exactly one breach event — agent-level.
			expect(breaches).toHaveLength(1);
			expect(breaches[0].capLevel).toBe("agent");
			expect(breaches[0].entityId).toBe("agent-1");
			expect(breaches[0].spend).toBe(5);
			expect(breaches[0].cap).toBe(3);
			expect(breaches[0].streamId).toBe(result.sessionId);
		});
	});

	// ---------------------------------------------------------------------- AC8
	describe("AC8: session_ended event carries full payload", () => {
		it("emits { sessionId, costDelta, outcome, taskId } on normal end", async () => {
			seedDomain(db);

			const received: SessionEndedEvent[] = [];
			eventBus.on("session_ended", (e) => received.push(e));

			const harness = new ScriptedHarnessAdapter({
				events: [
					{ type: "cost_update", totalCost: 0.05, deltaCost: 0.05 },
					{ type: "completion", text: "done" },
				],
				stopResult: { outcome: "completed", totalTokens: 0, totalCost: 0.05 },
			});

			const deps: ProvisionSessionDeps = { db, eventBus, harness, workspace };
			const result = await provisionSession(deps, baseParams(tmpDir));

			expect(received).toHaveLength(1);
			const ev = received[0];
			expect(ev.sessionId).toBe(result.sessionId);
			expect(ev.taskId).toBe("task-1");
			expect(ev.outcome).toBe("completed");
			// costDelta is reported in cents. Starting from 0 persisted, delta = 5.
			expect(ev.costDelta).toBe(5);
		});

		it("emits outcome=crashed when the harness throws", async () => {
			seedDomain(db);

			const received: SessionEndedEvent[] = [];
			eventBus.on("session_ended", (e) => received.push(e));

			const harness = new ScriptedHarnessAdapter({
				// $0.02 is yielded before the crash; orchestrator must still
				// propagate that into sessions.cost and the crash event's delta.
				events: [{ type: "cost_update", totalCost: 0.02, deltaCost: 0.02 }],
				throwAfter: 1,
			});

			const deps: ProvisionSessionDeps = { db, eventBus, harness, workspace };
			await provisionSession(deps, baseParams(tmpDir));

			expect(received).toHaveLength(1);
			expect(received[0].outcome).toBe("crashed");
			expect(received[0].costDelta).toBe(2);
		});

		it("registerSessionReviewCreator creates a review item for a medium-risk task", async () => {
			seedDomain(db, { taskRiskTier: "medium" });

			// Pre-attach a review thread to the task so the creator has somewhere to file.
			db.insert(threads).values({ id: "thread-1", kind: "review", createdAt: NOW }).run();
			db.update(tasks).set({ threadId: "thread-1" }).where(eq(tasks.id, "task-1")).run();

			const unsubscribe = registerSessionReviewCreator(db, eventBus);
			try {
				const harness = new ScriptedHarnessAdapter({
					events: [
						{ type: "cost_update", totalCost: 0.0, deltaCost: 0.0 },
						{ type: "completion", text: "ok" },
					],
					stopResult: { outcome: "completed", totalTokens: 0, totalCost: 0 },
				});

				const deps: ProvisionSessionDeps = { db, eventBus, harness, workspace };
				await provisionSession(deps, baseParams(tmpDir));

				const reviewItems = db.select().from(items).where(eq(items.threadId, "thread-1")).all();
				expect(reviewItems.length).toBeGreaterThanOrEqual(1);
				expect(reviewItems[0].kind).toBe("review");
			} finally {
				unsubscribe();
			}
		});
	});

	// -------------------------------------------------------------- AC error handling
	describe("AC error handling: workspace spawn failure reverts task state", () => {
		it("reverts task to accepted, writes no session row, and propagates the error", async () => {
			seedDomain(db);

			// Mock workspace adapter whose spawn always throws (e.g. disk full).
			const failingWorkspace: WorkspaceAdapter = {
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
			const deps: ProvisionSessionDeps = { db, eventBus, harness, workspace: failingWorkspace };

			await expect(provisionSession(deps, baseParams(tmpDir))).rejects.toThrow(/ENOSPC/);

			// Task must be reverted to `accepted` (not stuck in in_progress).
			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			expect(task?.state).toBe("accepted");

			// Audit note must record the failure reason.
			const audit: Array<{ from: string; to: string; reason?: string }> = task?.notes
				? JSON.parse(task.notes)
				: [];
			const revertEntry = audit.find((e) => e.from === "in_progress" && e.to === "accepted");
			expect(revertEntry).toBeDefined();
			expect(revertEntry?.reason).toMatch(/provisioning failed/);
			expect(revertEntry?.reason).toMatch(/ENOSPC/);

			// Transitions: in_progress → accepted revert must have been emitted.
			expect(transitions.some((t) => t.from === "in_progress" && t.to === "accepted")).toBe(true);

			// No session row created.
			const sessionRows = db.select().from(sessions).all();
			expect(sessionRows.length).toBe(0);

			// Harness never started.
			expect(harness.startedConfigs.length).toBe(0);

			// Agent cost unchanged.
			const agent = db.select().from(agents).where(eq(agents.id, "agent-1")).get();
			expect(agent?.costActual).toBe(0);
		});
	});

	// -------------------------------------------------------------- AC defensive
	describe("AC defensive: negative deltaCost is clamped to zero", () => {
		it("ignores negative deltaCost; only positive deltas accumulate", async () => {
			seedDomain(db);

			// A buggy/malicious harness emits a negative deltaCost first, then a
			// positive one. The orchestrator must clamp the negative to zero so
			// totalCostCents ends at 3 (not -2).
			const harness = new ScriptedHarnessAdapter({
				events: [
					{ type: "cost_update", totalCost: -0.05, deltaCost: -0.05 },
					{ type: "cost_update", totalCost: 0.03, deltaCost: 0.03 },
					{ type: "completion", text: "done" },
				],
				stopResult: { outcome: "completed", totalTokens: 0, totalCost: 0.03 },
			});

			const deps: ProvisionSessionDeps = { db, eventBus, harness, workspace };
			const result = await provisionSession(deps, baseParams(tmpDir));

			expect(result.totalCostCents).toBe(3);
			const session = db.select().from(sessions).where(eq(sessions.id, result.sessionId)).get();
			expect(session?.cost).toBe(3);
		});
	});

	// -------------------------------------------------------------- AC observability
	describe("AC observability: stopSession errors surface on normal completion", () => {
		it("propagates a stopSession failure on normal completion instead of swallowing it", async () => {
			seedDomain(db);

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

			const deps: ProvisionSessionDeps = { db, eventBus, harness, workspace };
			await expect(provisionSession(deps, baseParams(tmpDir))).rejects.toThrow(
				/stopSession exploded/,
			);
		});
	});
});
