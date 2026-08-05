/**
 * AV1 — Primary harness resolver.
 *
 * Reads the team's persisted default harness and returns it when no explicit
 * harness is supplied. The single fallback source (builtin/sonnet-4-6/anthropic)
 * stays in persistScaffoldedAgents — this resolver never duplicates those literals.
 *
 * @lore AV1: Three-step fallback: explicit → team default → undefined (defers to
 * persistScaffoldedAgents for builtin). The resolver returns undefined when both
 * explicit + team default are unset so the scaffold writer's baked-in fallback applies.
 *
 * @lore AU19 Increment 1c: moved unchanged from `packages/server/src/services/
 * team-default-harness.ts` — pure function, zero cross-Service imports, only
 * its package home changed.
 */

import type { PrimaryHarnessConfig } from "@hyperidle/shared";

type TeamDefaultCols = {
	defaultHarnessType: string | null;
	defaultModelId: string | null;
	defaultModelProvider: string | null;
};

/**
 * Resolve the harness config for a new agent creation.
 *
 * Priority:
 * 1. `explicit` — caller-supplied (e.g. onboarding form choice). Returns as-is.
 * 2. `team.defaultHarnessType` — persisted team default from migration 0042.
 *    Returns a PrimaryHarnessConfig with fallback model/provider when those are null.
 * 3. Returns `undefined` — lets `persistScaffoldedAgents` apply the builtin/sonnet-4-6
 *    fallback (single source, not duplicated here).
 */
export function resolveTeamAgentHarness(
	explicit: PrimaryHarnessConfig | undefined,
	team: TeamDefaultCols,
): PrimaryHarnessConfig | undefined {
	if (explicit !== undefined) {
		return explicit;
	}
	if (team.defaultHarnessType != null) {
		return {
			harnessType: team.defaultHarnessType,
			modelId: team.defaultModelId ?? "claude-sonnet-4-6",
			modelProvider: team.defaultModelProvider ?? "anthropic",
		};
	}
	return undefined;
}
