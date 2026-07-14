/**
 * `cost` Service (agent-orchestration) — outbound composition-boundary
 * (Mechanism C) DI ports, per architecture §10.2's census (as refined during
 * this migration — the census is "a floor, refinable during migration",
 * §14). `cost`'s real outbound edges (`users`, `work`, `settings`) are
 * ordinary downward core-api-reaching edges (agent-orchestration reaching
 * down into core-api, the RIGHT direction — same shape as `agent-selection`'s
 * `users`/`org` edges, Increment 3e), wired by the caller (`packages/server`,
 * the not-yet-split composition root) to the target's real exported
 * functions.
 *
 * @lore AU19 Increment 3g: `cost-cap.ts` also read/wrote `teamMembers`
 * directly (per-team spend read in `getTeamSpend`/`checkCostCap`, atomic
 * `costActual` accumulation in `recordCostAndCheck`, reset writes in
 * `resetCosts`) — `teamMembers` is `org`'s `TABLE_OWNER` (since Increment
 * 1c), so this is a genuinely NEW ownership violation surfaced only now that
 * `cost-cap.ts` becomes its own Service package (no guard boundary existed
 * to catch it while flat in `packages/server`). Converted to `CostTeamAccessor`,
 * wired to `@hyperidle/org`'s real `getTeamMembersById` (pre-existing) plus
 * three new writes added for this closure
 * (`incrementTeamMembersCost`/`resetTeamMembersCost`/`resetAllTeamMembersCost`,
 * see `org`'s `team-lookup.ts`) — a genuinely NEW `cost → org` edge, not in
 * the original census (§10.1/§10.2 updated).
 *
 * Types are declared locally (structural mirrors of the target Service's own
 * types, or typed directly off `@hyperidle/db` row types per §7.3 W4) rather
 * than imported from the target package — a Service NEVER imports another
 * Service, even for a type-only reference.
 */

import type { HyperIdleDb, TeamMember, User } from "@hyperidle/db";

// ---------------------------------------------------------------------------
// users — CostUserAccessor (ordinary downward edge, real target)
// ---------------------------------------------------------------------------

/** The `users` row fields `cost-cap.ts` reads. */
export type CostUserRow = Pick<User, "id" | "costActual" | "costCap" | "costCapMinor">;

/** Port for `users`' read/write surface this Service calls directly today. */
export interface CostUserAccessor {
	getUserById(db: HyperIdleDb, id: string): Promise<CostUserRow | undefined>;
	incrementUserCost(db: HyperIdleDb, id: string, deltaMinor: number): Promise<void>;
	resetAllUserCost(db: HyperIdleDb): Promise<void>;
	sumAllUserCost(db: HyperIdleDb): Promise<number>;
	updateUser(db: HyperIdleDb, id: string, patch: { costActual: number }): Promise<void>;
}

// ---------------------------------------------------------------------------
// org — CostTeamAccessor (ordinary downward edge, NEW edge — census correction)
// ---------------------------------------------------------------------------

/** The `team_members` row fields `cost-cap.ts` reads. */
export type CostTeamRow = Pick<TeamMember, "id" | "costActual" | "costCap" | "costCapMinor">;

/** Port for `org`'s `team_members` cost read/write surface this Service calls directly today. */
export interface CostTeamAccessor {
	getTeamMembersById(db: HyperIdleDb, id: string): Promise<CostTeamRow | undefined>;
	incrementTeamMembersCost(db: HyperIdleDb, id: string, deltaMinor: number): Promise<void>;
	resetTeamMembersCost(db: HyperIdleDb, id: string): Promise<void>;
	resetAllTeamMembersCost(db: HyperIdleDb): Promise<void>;
}

// ---------------------------------------------------------------------------
// work — CostWorkAccessor (ordinary downward edge, real target)
// ---------------------------------------------------------------------------

/** The task field `cost-cap.ts` reads (bet-cost accumulation via task -> bet lookup). */
export interface CostTaskRef {
	readonly betId: string | null;
}

/** The review item `cost-cap.ts` creates on a cost-cap breach (AC8). */
export interface CostReviewItemInput {
	readonly id: string;
	readonly sourceAgentId: string | null;
	readonly kind: string;
	readonly title: string;
	readonly body: string;
	readonly threadId: string;
	readonly riskTier: string;
	readonly blocking: boolean;
	readonly createdAt: string;
}

/** Port for `work`'s read/write surface this Service calls directly today. */
export interface CostWorkAccessor {
	getTaskById(db: HyperIdleDb, id: string): Promise<CostTaskRef | undefined>;
	/**
	 * Atomic `coalesce(costActualMinor, 0) + deltaMinor` bet-cost accumulation
	 * (R5). Owned by `work` (`bets` is its `TABLE_OWNER`) — `cost` supplies the
	 * delta, `work` owns the coalesce SQL, mirroring `CostUserAccessor.incrementUserCost`
	 * / `CostTeamAccessor.incrementTeamMembersCost`.
	 */
	incrementBetCost(
		db: HyperIdleDb,
		id: string,
		deltaMinor: number,
		currency: string,
	): Promise<void>;
	createItem(db: HyperIdleDb, values: CostReviewItemInput): Promise<void>;
}

// ---------------------------------------------------------------------------
// settings — CostSettingsAccessor (ordinary downward edge, real target)
// ---------------------------------------------------------------------------

/** The `server_config` fields `cost-sentinel.ts` reads. */
export interface CostSettingsSnapshot {
	readonly cost: { readonly capMinor: number };
	readonly internal: {
		readonly costSentinelLastLevel: "ok" | "warning" | "breach" | null;
	};
}

/** The `server_config` patch `cost-sentinel.ts` writes (its own dedup level). */
export interface CostSettingsPatch {
	readonly internal?: {
		readonly costSentinelLastLevel?: "ok" | "warning" | "breach";
	};
}

/** Port for `settings`' read/write surface `cost-sentinel.ts` calls directly today. */
export interface CostSettingsAccessor {
	readServerConfig(db: HyperIdleDb): Promise<CostSettingsSnapshot>;
	updateServerConfig(db: HyperIdleDb, patch: CostSettingsPatch): Promise<void>;
}

// ---------------------------------------------------------------------------
// Combined deps
// ---------------------------------------------------------------------------

/** Every real outbound edge this Service has, bundled for `createCostOps`. */
export interface CostDeps {
	readonly users: CostUserAccessor;
	readonly org: CostTeamAccessor;
	readonly work: CostWorkAccessor;
	readonly settings: CostSettingsAccessor;
}
