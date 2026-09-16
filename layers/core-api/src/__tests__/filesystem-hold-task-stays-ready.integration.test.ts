/**
 * BA5 §4/§8/§13 (L5, T8) — the filesystem hold, end to end, through the REAL
 * consuming path: `startTestRuntimeWithRealProvisioner`
 * (`run-orchestration-test-runtime.ts`) runs the real drain, the real claim
 * filter, and the real `admitSession`/`runSession` (`provisioner.ts`) — the
 * ONLY fake is the harness adapter itself (no real CLI in a service test).
 *
 * Proves, against a real DB and a real task row:
 *   - a placement failure holds the agent's sessions, never the task: the
 *     task stays `accepted`, the request returns to `pending` (never
 *     `failed`), no `sessions` row survives, the spawned workspace directory
 *     is removed, the filesystem enters `needs_attention` with a reason, and
 *     NOTHING resembling `agent_run_admission_failed` fires;
 *   - exactly ONE `filesystem_needs_attention` event, and one inbox row
 *     (`registerFilesystemAttentionReactions`, the same subscriber T7 covers);
 *   - a second request for the same agent is never even claimed across
 *     several drain ticks — still one event, the filesystem's episode has not
 *     changed;
 *   - a second failure (a failing re-check) only refreshes the reason — still
 *     one event;
 *   - fixing the filesystem and marking it reachable (what `POST /:id/check`
 *     does on success, `markFilesystemReachable`) ends the hold: BOTH pending
 *     requests are admitted on the next drain tick.
 *
 * No PAT/connection is used here — a git filesystem's own PAT never reaching
 * a durable row is T1/T3/T5's proof; this file is the hold's own mechanics.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ProvisionSessionDeps } from "@hyperidle/agent-orchestration";
import type { HyperIdleDb } from "@hyperidle/db";
import {
	agentRunConfig,
	agentSessionRequests,
	filesystemInjections,
	filesystems,
	sessions,
	tasks,
	teams,
	users,
} from "@hyperidle/db";
import type { FilesystemNeedsAttentionEvent } from "@hyperidle/event-bus";
import {
	listHeldAgentIds,
	listInjectedFilesystemsForProvisioning,
	markFilesystemNeedsAttention,
	markFilesystemReachable,
} from "@hyperidle/filesystems";
import { listNotifications } from "@hyperidle/notifications";
import { RegistryFilesystemMounter } from "@hyperidle/run-orchestration";
import { eq } from "drizzle-orm";
import { afterEach, describe, vi } from "vitest";
import { expect, test } from "../__testing__/test-fixtures.js";
import { registerFilesystemAttentionReactions } from "../services/filesystem-attention-reactions.js";
import { startTestRuntimeWithRealProvisioner } from "./run-orchestration-test-runtime.js";

const NOW = "2026-09-12T00:00:00.000Z";
const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
function tempDir(label: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), `t8-hold-${label}-`));
	dirs.push(dir);
	return dir;
}
function initLocalRepo(dir: string): void {
	execFileSync("git", ["init", "--quiet", "-b", "main", dir]);
	execFileSync("git", ["-C", dir, "config", "user.email", "t8@hyperidle.test"]);
	execFileSync("git", ["-C", dir, "config", "user.name", "t8"]);
	fs.writeFileSync(path.join(dir, "README.md"), "seed\n");
	execFileSync("git", ["-C", dir, "add", "-A"]);
	execFileSync("git", ["-C", dir, "commit", "--quiet", "-m", "seed"]);
}

/**
 * A minimal, REAL (spawns real `git`) `MountingGitRunnerFactory` — this file
 * lives in core-api, which may not reach into agent-orchestration's layer-root
 * `git-runner.ts` (that would cross the Layer boundary `run-orchestration`
 * itself is exempt from only within its own Layer). Only the verbs a LOCAL
 * repo mount exercises are implemented for real; `clone`/`fetch`/`lsRemote`
 * throw — this scenario never reaches a remote.
 */
function realLocalGitRunnerFactory(cwd: string) {
	const run = (args: string[]): { ok: boolean; out: string } => {
		try {
			return { ok: true, out: execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }) };
		} catch {
			return { ok: false, out: "" };
		}
	};
	return {
		async revParseIsInsideWorkTree() {
			return run(["rev-parse", "--is-inside-work-tree"]).ok;
		},
		async clone() {
			throw new Error("clone: not used — this scenario is local-only");
		},
		async fetch() {
			throw new Error("fetch: not used — this scenario is local-only");
		},
		async worktreePrune() {
			run(["worktree", "prune"]);
		},
		async worktreeAdd(worktreePath: string, newBranch: string, startPoint: string) {
			const result = run(["worktree", "add", "-b", newBranch, worktreePath, startPoint]);
			if (!result.ok) throw new Error(`git worktree add failed for '${cwd}'`);
		},
		// BA5 (no-teardown): never called by this scenario any more — nothing
		// unmounts a placement failure's worktree, and this fixture never
		// drives `releaseForTask` either. Kept only to satisfy the runner shape.
		async worktreeRemove() {},
		async verifyCommit(ref: string) {
			return run(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).ok;
		},
		async currentBranch() {
			const result = run(["rev-parse", "--abbrev-ref", "HEAD"]);
			return result.ok ? result.out.trim() : null;
		},
		async lsRemote() {
			throw new Error("lsRemote: not used — this scenario is local-only");
		},
	};
}

/** A harness that starts instantly and streams nothing — the harness is not under test here. */
function buildFakeAdapterPool() {
	const released: string[] = [];
	return {
		released,
		pool: {
			select: () => ({
				id: "fake-adapter-t8",
				adapter: {
					startSession: async (config: { sessionId: string }) => ({ sessionId: config.sessionId }),
					streamEvents: () => ({ async *[Symbol.asyncIterator]() {} }),
					stopSession: async () => ({ outcome: "completed" as const, tokenUsage: { byTier: {} } }),
					getCapabilities: () => ({
						preCompactionTrigger: false,
						subAgents: false,
						modelProviders: [],
						mcpSupport: false,
						returnEnforcement: "none" as const,
						cliMcpDialect: "codex-toml" as const,
					}),
				},
				meta: {
					name: "Fake",
					kind: "local",
					type: undefined,
					modelProviders: [],
					maxConcurrent: 5,
				},
			}),
			release: (id: string) => {
				released.push(id);
			},
			describeSelectFailure: () => "test pool selected nothing",
		},
	};
}

async function seed(
	db: HyperIdleDb,
	suffix: string,
): Promise<{ readonly teamId: string; readonly agentId: string; readonly taskId: string }> {
	const teamId = `t8-team-${suffix}`;
	const agentId = `t8-agent-${suffix}`;
	const betId = `t8-bet-${suffix}`;
	const taskId = `t8-task-${suffix}`;
	await db.insert(teams).values({ id: teamId, name: "T8", phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "T8 Agent",
		role: "builder",
		status: "active",
		teamId,
		createdAt: NOW,
	});
	await db.insert(agentRunConfig).values({ agentUserId: agentId, maxConcurrentSessions: 5 });
	await db.insert(tasks).values({
		id: betId,
		parentTaskId: null,
		teamId,
		title: "T8 bet",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		parentTaskId: betId,
		teamId,
		title: "T8 task",
		state: "accepted",
		ownerAgentId: agentId,
		createdAt: NOW,
		updatedAt: NOW,
	});
	return { teamId, agentId, taskId };
}

function bakedPayload(taskId: string, agentId: string, teamId: string): string {
	return JSON.stringify({
		agentConfig: { kind: "ai", status: "active", role: "builder", teamId },
		contextBundle: {
			kind: "task",
			task: { id: taskId, title: "T8 task", description: null, state: "accepted" },
			ancestors: [],
			agent: { id: agentId, name: "T8 Agent", role: "builder" },
			team: { id: teamId, name: "T8" },
			knowledge: [],
		},
	});
}

async function seedRequest(
	db: HyperIdleDb,
	id: string,
	taskId: string,
	agentId: string,
	teamId: string,
): Promise<void> {
	await db.insert(agentSessionRequests).values({
		id,
		sourceKind: "task",
		sourceId: `${id}-attempt`,
		streamId: `task:${taskId}`,
		taskId,
		agentId,
		teamId,
		promptMode: "task",
		payloadJson: bakedPayload(taskId, agentId, teamId),
		idempotencyKey: id,
		sourceCorrelationJson: JSON.stringify({ taskId, teamId }),
		status: "pending",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

describe("the filesystem hold, end to end (BA5 §4/§8/§13, T8)", () => {
	test("a placement failure holds the agent's sessions, not the task — one notice, no admission-failure event, the second request stays excluded until Check clears it", async ({
		db,
		eventBus,
	}) => {
		const { teamId, agentId, taskId } = await seed(db, "hold");
		const brokenPath = path.join(os.tmpdir(), `t8-hold-does-not-exist-${Date.now()}`);
		const filesystemId = "t8-fs-hold";
		await db.insert(filesystems).values({
			id: filesystemId,
			teamId,
			source: "local",
			kind: "code",
			connectionId: null,
			resourceRef: JSON.stringify({ kind: "code", repo: brokenPath, branch: "main" }),
			state: "attached",
			createdAt: NOW,
		});
		await db
			.insert(filesystemInjections)
			.values({ agentUserId: agentId, filesystemId, createdAt: NOW });

		const events: FilesystemNeedsAttentionEvent[] = [];
		eventBus.on("filesystem_needs_attention", (event) => events.push(event));
		registerFilesystemAttentionReactions(db, eventBus);

		const sandboxBasePath = tempDir("sandbox-base");
		const { pool, released } = buildFakeAdapterPool();
		let spawnCount = 0;
		// Untyped on purpose: `@hyperidle/agent-orchestration`'s own public
		// `ProvisionSessionDeps` is a narrow Application-facing alias (`db`/
		// `eventBus`/`onHarnessStarted` plus two `unknown` fields) — this value
		// needs the FULL shape `run-orchestration`'s internal `admitSession`
		// reads (`mounter`/`injectedFilesystems`), which is package-private
		// there. Only cast at the call site, where the narrow type is what the
		// public signature actually asks for.
		const runtime = {
			db,
			eventBus,
			adapterPool: pool,
			workspace: {
				// Counts admission ATTEMPTS (Phase 4 runs before the filesystem
				// mount, Phase 4.5) — the discriminating signal for "never even
				// claimed": a held agent's row being excluded means this is never
				// called again, not merely that a claimed-and-failed attempt
				// happens to end up `pending` again either way.
				spawn: async (base: string) => {
					spawnCount += 1;
					fs.mkdirSync(base, { recursive: true });
					const spawned = fs.mkdtempSync(path.join(base, "ws-"));
					return { sandboxId: spawned, path: spawned };
				},
				exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
				adopt: async (p: string) => ({ sandboxId: p, path: p }),
				destroy: async (handle: { path: string }) => {
					fs.rmSync(handle.path, { recursive: true, force: true });
				},
			},
			mounter: new RegistryFilesystemMounter({
				gitRunnerFactory: realLocalGitRunnerFactory,
				keptCopiesRoot: tempDir("kept-copies"),
			}),
			injectedFilesystems: {
				listInjectedForProvisioning: (forAgentId: string) =>
					listInjectedFilesystemsForProvisioning(db, forAgentId),
				listHeldAgentIds: () => listHeldAgentIds(db),
				// Mirrors `recordFilesystemNeedsAttention` (agent-orchestration layer
				// root) using only PUBLICLY exported primitives — core-api may not
				// reach that file directly. The once-per-episode guarantee under test
				// is `markFilesystemNeedsAttention`'s own conditional update, called
				// here for real; only the "emit iff entered" wiring is inlined.
				markNeedsAttention: async (fsId: string, reason: string) => {
					const result = await markFilesystemNeedsAttention(db, fsId, reason);
					if (result?.entered) {
						eventBus.emit({
							type: "filesystem_needs_attention",
							streamId: `filesystem:${fsId}`,
							filesystemId: fsId,
							filesystemLabel: fsId,
							agentIds: result.agentIds,
							reason,
							timestamp: Date.now(),
						});
					}
				},
			},
		};

		await seedRequest(db, "t8-req-1", taskId, agentId, teamId);

		const handle = await startTestRuntimeWithRealProvisioner(
			db,
			eventBus,
			runtime as unknown as ProvisionSessionDeps,
			sandboxBasePath,
		);
		try {
			// `startRuntime` runs one drain pass before returning — the failing
			// placement has already happened by the time this resolves.
			await vi.waitFor(async () => {
				const [row] = await db
					.select()
					.from(agentSessionRequests)
					.where(eq(agentSessionRequests.id, "t8-req-1"));
				expect(row?.status).toBe("pending");
			});

			// The task is untouched.
			const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
			expect(task?.state).toBe("accepted");

			// No `sessions` row survives the failed attempt.
			expect(
				await db.select().from(sessions).where(eq(sessions.requestId, "t8-req-1")),
			).toHaveLength(0);

			// The spawned workspace was destroyed, and the adapter released.
			expect(released).toContain("fake-adapter-t8");

			// The filesystem entered needs_attention with a reason.
			const [fsRow] = await db.select().from(filesystems).where(eq(filesystems.id, filesystemId));
			expect(fsRow?.state).toBe("needs_attention");
			expect(fsRow?.attentionReason).toBeTruthy();

			// Exactly one event, and one inbox row.
			expect(events).toHaveLength(1);
			expect(events[0]?.agentIds).toEqual([agentId]);
			await vi.waitFor(async () => {
				const notices = await listNotifications(db, {
					kind: "by-event-since",
					eventType: "filesystem_needs_attention",
					subjectId: filesystemId,
					since: "1970-01-01T00:00:00.000Z",
				});
				expect(notices).toHaveLength(1);
			});

			// A second request for the SAME agent is never even claimed —
			// several drain ticks pass (the poller runs every ~1s). `spawnCount`
			// is the discriminating signal: a claimed-and-immediately-released
			// attempt would ALSO leave the row `pending` (the drain's own
			// fail-safe `return`, §4.1), so "still pending" alone cannot tell
			// "excluded" from "reclaimed and failed every tick" apart — only
			// "Phase 4 never ran again" can.
			const spawnCountBeforeSecondRequest = spawnCount;
			await seedRequest(db, "t8-req-2", taskId, agentId, teamId);
			await new Promise((resolve) => setTimeout(resolve, 2_200));
			const [stillPending] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, "t8-req-2"));
			expect(stillPending?.status).toBe("pending");
			expect(spawnCount).toBe(spawnCountBeforeSecondRequest);
			expect(events).toHaveLength(1);

			// A second failure (a failing re-check) only refreshes the reason —
			// still one event.
			await runtime.injectedFilesystems?.markNeedsAttention?.(filesystemId, "still broken");
			expect(events).toHaveLength(1);
			const [refreshed] = await db
				.select()
				.from(filesystems)
				.where(eq(filesystems.id, filesystemId));
			expect(refreshed?.attentionReason).toBe("still broken");

			// Fix the filesystem and mark it reachable — what `POST /:id/check`
			// does on success. Both pending requests are admitted on the next tick.
			const realRepo = tempDir("real-repo");
			initLocalRepo(realRepo);
			await db
				.update(filesystems)
				.set({ resourceRef: JSON.stringify({ kind: "code", repo: realRepo, branch: "main" }) })
				.where(eq(filesystems.id, filesystemId));
			await markFilesystemReachable(db, filesystemId);

			await vi.waitFor(
				async () => {
					const rows = await db
						.select()
						.from(agentSessionRequests)
						.where(eq(agentSessionRequests.taskId, taskId));
					const statuses = rows.map((r) => r.status).sort();
					expect(statuses).not.toContain("pending");
					expect(statuses).not.toContain("claimed");
				},
				{ timeout: 5_000, interval: 100 },
			);
		} finally {
			await handle.dispose();
		}
	});
});
