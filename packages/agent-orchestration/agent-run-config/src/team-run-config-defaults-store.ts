/**
 * AU26 G1 — the sole reader/writer of `team_run_config_defaults` (architecture §D-L).
 *
 * @lore AU26 G1: `teams.default_harness_type` / `default_model_id` /
 * `default_model_provider` (AV1, migration 0042) are the run config a newly
 * scaffolded agent inherits — agent-execution configuration parked on the team
 * identity row. Written at team creation, read in exactly one place to stamp a
 * new agent. Same "administers but never works with it" shape as the six
 * `users` columns, so they relocate together into this Service.
 *
 * @lore AU26 G1: **absent row ≡ all-null row**, same rule as
 * `agent-run-config-store.ts`. All-null means "no team default" and the
 * builtin/sonnet-4-6/anthropic fallback in `persistScaffoldedAgents` applies —
 * that single fallback source did not move and is not duplicated here.
 */

import { type HyperIdleDb, teamRunConfigDefaults, type WriteExecutor } from "@hyperidle/db";
import { eq } from "drizzle-orm";

/** A team's default run config for newly scaffolded agents. */
export interface TeamRunConfigDefaults {
	readonly defaultHarnessType: string | null;
	readonly defaultModelId: string | null;
	readonly defaultModelProvider: string | null;
}

/** The effective defaults of a team with no `team_run_config_defaults` row. */
export const EMPTY_TEAM_RUN_CONFIG_DEFAULTS: TeamRunConfigDefaults = {
	defaultHarnessType: null,
	defaultModelId: null,
	defaultModelProvider: null,
};

const DEFAULTS_COLUMNS = {
	defaultHarnessType: teamRunConfigDefaults.defaultHarnessType,
	defaultModelId: teamRunConfigDefaults.defaultModelId,
	defaultModelProvider: teamRunConfigDefaults.defaultModelProvider,
} as const;

/** Read a team's default run config. Never `undefined` — see this module's `@lore`. */
export async function readTeamRunConfigDefaults(
	exec: HyperIdleDb,
	teamId: string,
): Promise<TeamRunConfigDefaults> {
	const [row] = await exec
		.select(DEFAULTS_COLUMNS)
		.from(teamRunConfigDefaults)
		.where(eq(teamRunConfigDefaults.teamId, teamId))
		.limit(1);
	return row ?? EMPTY_TEAM_RUN_CONFIG_DEFAULTS;
}

/** Upsert a team's default run config. All three fields are written together — they are one setting. */
export async function writeTeamRunConfigDefaults(
	exec: WriteExecutor,
	teamId: string,
	defaults: TeamRunConfigDefaults,
): Promise<void> {
	await exec
		.insert(teamRunConfigDefaults)
		.values({ teamId, ...defaults })
		.onConflictDoUpdate({ target: teamRunConfigDefaults.teamId, set: { ...defaults } });
}
