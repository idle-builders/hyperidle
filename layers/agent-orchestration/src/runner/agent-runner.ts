import { createLogger } from "@hyperidle/diagnostics";
import type { InboxRowView, UserRow, UserView } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import {
	loadHeldAgentRunnerKeys,
	loadMovedAwayAgentIds,
	markAgentRunnerKeyMovedAway,
	persistAgentRunnerKey,
} from "@hyperidle/run-orchestration";
import type { RunnerDb } from "@hyperidle/runner-db";
import { type CoreDoor, DoorError } from "./core-door.js";
import { actOnInboxRow, NotYet, postFailureNotice } from "./inbox-work.js";
import { cleanupFinishedTaskWorktrees } from "./task-cleanup.js";

const logger = createLogger({ pkg: "agent-orchestration.runner" });

/** The statuses an agent is started from. */
const RUNNABLE_STATUSES: ReadonlySet<string> = new Set(["active", "idle"]);

/** Rows read per pass; a fuller inbox takes more passes. */
const INBOX_PAGE = 50;

export interface AgentRunnerDeps {
	readonly db: RunnerDb;
	/** Event bus for in-process nudges when user.created / user.changed fire. */
	readonly eventBus: EventBus;
	readonly door: CoreDoor;
	/** The key of the person this computer belongs to; undefined until there is one. */
	readonly personKey: () => string | undefined;
	/** Hear `user:<agentId>` nudges — each new inbox row. Returns how to stop hearing them. */
	readonly subscribeInbox: (agentId: string, onNudge: () => void) => () => void;
	/** How often the runner looks for new agents and missed rows. Default 30 s. */
	readonly sweepMs?: number;
}

export interface AgentRunner {
	/** The key this runner holds for an agent, for its tools to call the door with. */
	keyFor(agentId: string): string | undefined;
	/** All agent ids currently held by this runner. */
	heldAgentIds(): readonly string[];
	/** Agent ids that were 401'd — moved away; not re-taken until takeAgent() is called. */
	movedAwayAgentIds(): readonly string[];
	/** Take every agent this computer may hold and answer what waited for them. */
	start(): Promise<void>;
	/** Explicitly take a specific agent (clears moved-away). */
	takeAgent(agentId: string): Promise<void>;
	/** Stops taking work and waits for the passes under way. */
	stop(): Promise<void>;
}

/** Tries a failing row gets before the runner gives up on it and tells the people in its thread. */
const ROW_FAILURE_LIMIT = 3;

/**
 * The agents' runner on this computer. Persists taken keys across restarts (agent_runner_keys).
 * On a 401 the agent is marked moved-away and never re-taken on its own — only takeAgent() can
 * re-claim it. This prevents the ping-pong between two runners both trying to claim the same agent.
 */
export function createAgentRunner(deps: AgentRunnerDeps): AgentRunner {
	const keys = new Map<string, string>();
	const movedAway = new Set<string>();
	const unsubscribers = new Map<string, () => void>();
	const draining = new Map<string, Promise<void>>();
	const again = new Set<string>();
	/** Failed tries per row still being retried. */
	const rowFailures = new Map<string, number>();
	let timer: ReturnType<typeof setInterval> | undefined;
	let stopped = false;

	/** Persist a newly taken key. Best-effort — a failure only means no reuse after restart. */
	async function persistKey(agentId: string, key: string): Promise<void> {
		try {
			await persistAgentRunnerKey(deps.db, agentId, key);
		} catch (err) {
			logger.warn("could not persist agent key; it will not survive restart", {
				agentId,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	/** Mark an agent as moved-away in the db. */
	async function markMovedAway(agentId: string): Promise<void> {
		movedAway.add(agentId);
		try {
			await markAgentRunnerKeyMovedAway(deps.db, agentId);
		} catch (err) {
			logger.warn("could not mark agent moved-away in db", {
				agentId,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	function activateAgent(agentId: string, key: string): void {
		keys.set(agentId, key);
		movedAway.delete(agentId);
		unsubscribers.set(
			agentId,
			deps.subscribeInbox(agentId, () => void drain(agentId)),
		);
		void drain(agentId);
	}

	function dropAgent(agentId: string): void {
		keys.delete(agentId);
		const off = unsubscribers.get(agentId);
		if (off) {
			off();
			unsubscribers.delete(agentId);
		}
	}

	function mayHold(agent: UserRow, personId: string): boolean {
		return (
			agent.kind === "ai" &&
			agent.role !== "system" &&
			RUNNABLE_STATUSES.has(agent.status) &&
			(agent.ownerUserId === null || agent.ownerUserId === personId)
		);
	}

	let taking: Promise<void> | null = null;
	/** One look at a time; a look asked for during one waits for it. */
	function takeAgents(): Promise<void> {
		if (!taking) taking = lookForAgents().finally(() => (taking = null));
		return taking;
	}

	async function lookForAgents(): Promise<void> {
		const personKey = deps.personKey();
		if (!personKey) return;
		const me = await deps.door.call<UserView>(personKey, "open_user", {});
		const personId = me.ok ? me.data.user?.id : undefined;
		if (!personId) return;
		const agents = await deps.door.call<UserRow[]>(personKey, "search_users", { kind: "ai" });
		if (!agents.ok) return;
		for (const agent of agents.data) {
			if (stopped) return;
			// Already held by this runner.
			if (keys.has(agent.id)) continue;
			// Not eligible to hold.
			if (!mayHold(agent, personId)) continue;
			// Was 401'd — moved away; takeAgent() must be called explicitly to reclaim.
			if (movedAway.has(agent.id)) continue;
			// Another runner holds it; don't fight for it.
			if (agent.hasKey === true) continue;
			const given = await deps.door.call<UserView>(personKey, "edit_user", {
				id: agent.id,
				key: "new",
			});
			if (!(given.ok && given.data.key)) continue;
			await persistKey(agent.id, given.data.key);
			activateAgent(agent.id, given.data.key);
		}
	}

	/** Act on one row. True when it is done with — acted on, or given up on after repeated failures. */
	async function tryRow(
		agentId: string,
		key: string,
		self: UserView,
		row: InboxRowView,
	): Promise<boolean> {
		try {
			await actOnInboxRow(deps, { key, self }, row);
			rowFailures.delete(row.id);
			return true;
		} catch (error) {
			if (error instanceof NotYet) return false;
			// The key was replaced elsewhere: the pass ends and the agent is taken again with a new one.
			if (error instanceof DoorError && error.status === 401) throw error;
			const count = (rowFailures.get(row.id) ?? 0) + 1;
			const detail = {
				agentId,
				rowId: row.id,
				reason: row.reason,
				attempt: count,
				error: error instanceof Error ? error.message : String(error),
			};
			if (count < ROW_FAILURE_LIMIT) {
				rowFailures.set(row.id, count);
				logger.error("inbox row failed; it is tried again on the next pass", detail);
				return false;
			}
			rowFailures.delete(row.id);
			logger.error("inbox row given up after repeated failures", detail);
			await postFailureNotice(deps, { key, self }, row).catch((e: unknown) => {
				logger.error("failure notice could not be posted", {
					agentId,
					rowId: row.id,
					error: e instanceof Error ? e.message : String(e),
				});
			});
			return true;
		}
	}

	async function workInbox(agentId: string): Promise<void> {
		for (;;) {
			const key = keys.get(agentId);
			if (!key || stopped) return;
			const self = await deps.door.call<UserView>(key, "open_user", { unread: true });
			if (!self.ok) return;
			const rows = self.data.inbox ?? [];
			let acted = 0;
			for (const row of rows) {
				if (stopped) return;
				if (await tryRow(agentId, key, self.data, row)) {
					await deps.door.call(key, "edit_user", { id: agentId, inbox: { read: [row.id] } });
					acted++;
				}
			}
			// A page with nothing done is rows still failing or waiting: the next pass looks again.
			if (rows.length < INBOX_PAGE || acted === 0) return;
		}
	}

	/** One pass at a time per agent; a nudge during a pass asks for one more. */
	function drain(agentId: string): Promise<void> {
		const running = draining.get(agentId);
		if (running) {
			again.add(agentId);
			return running;
		}
		const pass = (async () => {
			do {
				again.delete(agentId);
				try {
					await workInbox(agentId);
				} catch (error) {
					if (error instanceof DoorError && error.status === 401) {
						// The key was replaced elsewhere: mark moved-away and drop.
						// Never re-take on the sweep — only an explicit takeAgent() can reclaim it.
						await markMovedAway(agentId);
						dropAgent(agentId);
						return;
					}
					logger.error("inbox pass failed; the rows wait for the next one", {
						agentId,
						error: error instanceof Error ? error.message : String(error),
					});
					return;
				}
				// Best-effort cleanup: remove worktrees for tasks core says are finished.
				const key = keys.get(agentId);
				if (key) {
					cleanupFinishedTaskWorktrees(deps.db, agentId, deps.door, key).catch((err: unknown) => {
						logger.warn("cleanupFinishedTaskWorktrees failed", {
							agentId,
							error: err instanceof Error ? err.message : String(err),
						});
					});
				}
			} while (again.has(agentId) && !stopped);
		})().finally(() => draining.delete(agentId));
		draining.set(agentId, pass);
		return pass;
	}

	async function sweep(): Promise<void> {
		await takeAgents();
		await Promise.all([...keys.keys()].map((agentId) => drain(agentId)));
	}

	return {
		keyFor: (agentId) => keys.get(agentId),
		heldAgentIds: () => [...keys.keys()],
		movedAwayAgentIds: () => [...movedAway],

		async start() {
			// Load persisted keys from previous run; reuse them without calling edit_user again.
			const stored = await loadHeldAgentRunnerKeys(deps.db);
			for (const row of stored) {
				if (!keys.has(row.agentId)) {
					activateAgent(row.agentId, row.agentKey);
				}
			}
			// Also load moved-away set so we don't re-take them on the first sweep.
			const away = await loadMovedAwayAgentIds(deps.db);
			for (const agentId of away) {
				movedAway.add(agentId);
			}
			// In-process bus: a new or changed agent may be one this computer now holds.
			for (const event of ["user.created", "user.changed"] as const) {
				const off = deps.eventBus.on(event, () => {
					void takeAgents().catch((error) => {
						logger.error("looking for agents failed", {
							error: error instanceof Error ? error.message : String(error),
						});
					});
				});
				unsubscribers.set(event, off);
			}
			await sweep();
			timer = setInterval(() => {
				void sweep().catch((error) => {
					logger.error("runner sweep failed", {
						error: error instanceof Error ? error.message : String(error),
					});
				});
			}, deps.sweepMs ?? 30_000);
			timer.unref();
		},

		async takeAgent(agentId: string) {
			const personKey = deps.personKey();
			if (!personKey) throw new Error("no person key to take agent with");
			const given = await deps.door.call<UserView>(personKey, "edit_user", {
				id: agentId,
				key: "new",
			});
			if (!(given.ok && given.data.key)) {
				throw new Error(`takeAgent ${agentId}: server refused — ${JSON.stringify(given)}`);
			}
			await persistKey(agentId, given.data.key);
			movedAway.delete(agentId);
			if (!keys.has(agentId)) {
				activateAgent(agentId, given.data.key);
			} else {
				keys.set(agentId, given.data.key);
			}
		},

		async stop() {
			stopped = true;
			if (timer) clearInterval(timer);
			for (const unsubscribe of unsubscribers.values()) unsubscribe();
			unsubscribers.clear();
			await Promise.all([...draining.values(), ...(taking ? [taking] : [])]);
		},
	};
}
