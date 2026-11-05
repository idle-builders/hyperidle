import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type { UserRow, UserView } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import { type CoreDoor, DoorError } from "./core-door.js";
import { actOnInboxRow, postFailureNotice } from "./inbox-work.js";

const logger = createLogger({ pkg: "agent-orchestration.runner" });

/** The statuses an agent is started from. */
const RUNNABLE_STATUSES: ReadonlySet<string> = new Set(["active", "idle"]);

/** Rows read per pass; a fuller inbox takes more passes. */
const INBOX_PAGE = 50;

export interface AgentRunnerDeps {
	readonly db: HyperIdleDb;
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
	/** Take every agent this computer may hold and answer what waited for them. */
	start(): Promise<void>;
	/** Stops taking work and waits for the passes under way. */
	stop(): Promise<void>;
}

/** Tries a failing row gets before the runner gives up on it and tells the people in its thread. */
const ROW_FAILURE_LIMIT = 3;

/**
 * The agents' runner on this computer. It gets a fresh key for every agent the person here may
 * hold — the newest key wins, so the agent lives here now — then works through each agent's inbox
 * as that agent: once at start (what waited while it was off), on every nudge, and on a slow sweep.
 */
export function createAgentRunner(deps: AgentRunnerDeps): AgentRunner {
	const keys = new Map<string, string>();
	const unsubscribers = new Map<string, () => void>();
	const draining = new Map<string, Promise<void>>();
	const again = new Set<string>();
	/** Failed tries per row still being retried. */
	const rowFailures = new Map<string, number>();
	let timer: ReturnType<typeof setInterval> | undefined;
	let stopped = false;

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
			if (stopped || keys.has(agent.id) || !mayHold(agent, personId)) continue;
			const given = await deps.door.call<UserView>(personKey, "edit_user", {
				id: agent.id,
				key: "new",
			});
			if (!(given.ok && given.data.key)) continue;
			keys.set(agent.id, given.data.key);
			unsubscribers.set(
				agent.id,
				deps.subscribeInbox(agent.id, () => void drain(agent.id)),
			);
			// What waited for it while no runner held it.
			void drain(agent.id);
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
				let rowActed = false;
				try {
					await actOnInboxRow(deps, { key, self: self.data }, row);
					rowActed = true;
				} catch (error) {
					// A 401 means the key expired — drop the agent so a fresh key can be fetched.
					if (error instanceof DoorError && error.status === 401) throw error;
					const count = (rowFailures.get(row.id) ?? 0) + 1;
					if (count >= ROW_FAILURE_LIMIT) {
						rowFailures.delete(row.id);
						logger.error("inbox row given up after repeated failures, marked read", {
							agentId,
							rowId: row.id,
							reason: row.reason,
							error: error instanceof Error ? error.message : String(error),
						});
						rowActed = true;
						void postFailureNotice(deps, { key, self: self.data }, row).catch((e) => {
							logger.error("failure notice could not be posted", {
								agentId,
								rowId: row.id,
								error: e instanceof Error ? e.message : String(e),
							});
						});
					} else {
						rowFailures.set(row.id, count);
						logger.error("inbox row failed; will retry", {
							agentId,
							rowId: row.id,
							reason: row.reason,
							attempt: count,
							error: error instanceof Error ? error.message : String(error),
						});
					}
				}
				if (rowActed) {
					await deps.door.call(key, "edit_user", { id: agentId, inbox: { read: [row.id] } });
					acted++;
				}
			}
			// Stop paging when no progress: all remaining rows are retrying failures.
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
						// Stale key — drop the agent so the next sweep can fetch a fresh one.
						dropAgent(agentId);
						return;
					}
					logger.error("inbox pass failed; the rows wait for the next one", {
						agentId,
						error: error instanceof Error ? error.message : String(error),
					});
					return;
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
		async start() {
			// A new or changed agent may be one this computer now holds.
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
		async stop() {
			stopped = true;
			if (timer) clearInterval(timer);
			for (const unsubscribe of unsubscribers.values()) unsubscribe();
			unsubscribers.clear();
			await Promise.all([...draining.values(), ...(taking ? [taking] : [])]);
		},
	};
}
