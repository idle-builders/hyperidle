/**
 * Shared test helpers for G1 facilitator tool suites. Each tool test only
 * seeds the rows it needs beyond the common base; the base helpers stay
 * deliberately minimal so assertions remain local to their test file.
 */

import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, agents, products, teams, threads } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { ToolContext } from "../tool-registry.js";

export const NOW = "2026-04-18T00:00:00.000Z";

export interface MakeContextOverrides {
	readonly agentId?: string;
	readonly label?: string;
}

/**
 * Build a ToolContext whose workspacePath points at a unique tmp dir so
 * parallel suites never clash. The watcher is a no-op — none of the G1
 * tools use it.
 */
export function makeContext(db: HyperIdleDb, overrides: MakeContextOverrides = {}): ToolContext {
	const label = overrides.label ?? "g1";
	return {
		db,
		eventBus: new EventBus(),
		agentId: overrides.agentId ?? "agent-fac",
		sessionId: "session-1",
		taskId: "task-1",
		workspacePath: path.join(os.tmpdir(), `hi-${label}-${Date.now()}`),
		watcher: {
			stop: (): void => {
				/* no-op */
			},
		},
	};
}

/**
 * Seed the minimum domain needed by every G1 facilitator tool suite:
 * product, team, an active practice_facilitator agent, and an item thread.
 */
export function seedBase(db: HyperIdleDb): void {
	db.insert(products).values({ id: "p1", name: "Test", phase: "build", createdAt: NOW }).run();
	db.insert(teams)
		.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: NOW })
		.run();
	db.insert(agents)
		.values({
			id: "agent-fac",
			name: "Facilitator",
			role: "practice_facilitator",
			status: "active",
			maxConcurrentSessions: 1,
			createdAt: NOW,
		})
		.run();
	db.insert(threads).values({ id: "th1", kind: "item", createdAt: NOW }).run();
}
