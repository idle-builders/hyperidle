/** Composition root for the single bound cost policy instance. */

import { type CostDeps, type CostOps, createCostOps } from "@hyperidle/cost";
import type { NewItem, WriteExecutor } from "@hyperidle/db";
import { applyTeamCost, getTeamMembers } from "@hyperidle/org";
import { readServerConfig, updateServerConfig } from "@hyperidle/settings";
import type { EventBus } from "@hyperidle/shared";
import {
	findUser,
	incrementUserCost,
	resetAllUserCost,
	sumAllUserCost,
	updateUser,
} from "@hyperidle/users";
import * as work from "@hyperidle/work";

const costDeps: CostDeps = {
	users: {
		getUserById: (db, id) => findUser(db, { id }),
		incrementUserCost,
		resetAllUserCost,
		sumAllUserCost,
		updateUser,
	},
	// @lore AU20 Am7: per-verb cost functions replaced by applyTeamCost + getTeamMembers;
	// adapters satisfy CostTeamAccessor without changing cost package internals.
	org: {
		getTeamMembersById: (db, id) => getTeamMembers(db, { id }),
		incrementTeamMembersCost: (db, id, deltaMinor) => applyTeamCost(db, { id }, { deltaMinor }),
		resetTeamMembersCost: (db, id) => applyTeamCost(db, { id }, "reset"),
		resetAllTeamMembersCost: (db) => applyTeamCost(db, "all", "reset"),
	},
	work: {
		getTaskById: (exec: WriteExecutor, id: string) => work.get(exec, "task", id),
		incrementBetCost: (exec: WriteExecutor, id: string, deltaMinor: number, currency: string) =>
			work.update(exec, "bet", id, {
				costActualMinor: { increment: deltaMinor },
				costActualCurrency: currency,
			}),
		createItem: (exec: WriteExecutor, values: NewItem) => work.create(exec, "item", values),
	},
	settings: {
		readServerConfig,
		// The port discards the merged config returned by the settings service.
		async updateServerConfig(db, patch) {
			await updateServerConfig(db, patch);
		},
	},
};

// @lore AU20 Am3: `createCostOps` returns `CostOps & { _testHooks: CostTestHooks }`.
// Capture as `const` (not `CostOps`) so TypeScript sees the wider return type
// and `._ testHooks` is accessible without a cast.
export const costOps: CostOps & {
	readonly _testHooks: {
		getDedupSize(): number;
		releaseDedup(sessionId: string): void;
		clearDedup(): void;
		resetSentinelState(): void;
		installDedupReleaser(eventBus: EventBus): () => void;
	};
} = createCostOps(costDeps);
