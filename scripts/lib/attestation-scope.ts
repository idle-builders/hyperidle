/**
 * AT1 — attestation scope: resolveLegs + assertScope (pure, unit-tested).
 *
 * These functions determine which test commands are run (affected vs full)
 * and whether an attestation's scope satisfies a caller's requirement.
 *
 * @lore AT1: VERIFY_SCOPE env threads through the unchanged verify chain. "full" →
 *   run the whole suite + stamp scope:"full"; else → changed-file selection +
 *   scope:"affected". The env variable is the only mechanism — a CLI flag would
 *   force a parallel chain (rejected D1). verify:release = VERIFY_SCOPE=full npm run verify.
 */

export type VerifyScope = "affected" | "full";

export interface LegCommands {
	/** Shell command for the unit/component leg. */
	unit: string;
	/** Shell command for the integration leg (without the JSON reporter suffix — verify-attest adds those). */
	integration: string;
	/** Shell command for the e2e leg. */
	e2e: string;
}

const AFFECTED_UNIT =
	"npx vitest run --changed=origin/main --passWithNoTests";

const FULL_UNIT = "npx vitest run";

const AFFECTED_INTEGRATION =
	"npx vitest run --config vitest.integration.config.ts --changed=origin/main --passWithNoTests";

const FULL_INTEGRATION =
	"npx vitest run --config vitest.integration.config.ts";

/**
 * @lore AT1: Playwright --only-changed=origin/main is documented to exit
 * early/0 when no test files changed. Confirm empirically (AC9) — the web
 * script adds --pass-with-no-tests if needed. The e2e leg here uses the
 * npm run -w @hyperidle/web delegation; verify-attest runs the per-workspace script.
 */
const AFFECTED_E2E = "npm run -w @hyperidle/web test:e2e";

const FULL_E2E = "npm run -w @hyperidle/web test:e2e:full";

const VALID_SCOPES: ReadonlySet<string> = new Set<VerifyScope>(["affected", "full"]);

/**
 * Resolve the per-leg shell commands and recorded scope from the VERIFY_SCOPE env.
 *
 * - VERIFY_SCOPE === "full" → full (unfiltered) commands + scope:"full"
 * - anything else (undefined, "affected", "") → affected commands + scope:"affected"
 *
 * @param verifyScopeEnv process.env.VERIFY_SCOPE (or undefined)
 */
export function resolveLegs(
	verifyScopeEnv: string | undefined,
): { legs: LegCommands; scope: VerifyScope } {
	if (verifyScopeEnv === "full") {
		return {
			scope: "full",
			legs: {
				unit: FULL_UNIT,
				integration: FULL_INTEGRATION,
				e2e: FULL_E2E,
			},
		};
	}
	return {
		scope: "affected",
		legs: {
			unit: AFFECTED_UNIT,
			integration: AFFECTED_INTEGRATION,
			e2e: AFFECTED_E2E,
		},
	};
}

/**
 * Gate: return an error string if the attestation scope fails the requirement, else null.
 *
 * - required === undefined → null (scope-agnostic; any scope passes)
 * - scope is absent or invalid → error string (always wrong — scope is required, no back-compat)
 * - scope === required → null
 * - scope !== required → error string
 *
 * @param scope  The scope value from an attestation (may be undefined for malformed payloads)
 * @param required  The minimum required scope (undefined = scope-agnostic)
 */
export function assertScope(
	scope: string | undefined,
	required: VerifyScope | undefined,
): string | null {
	// Validate scope regardless of requirement — an invalid scope is always an error.
	if (scope !== undefined && !VALID_SCOPES.has(scope)) {
		return (
			`attestation scope "${scope}" is not a valid VerifyScope. ` +
			`Expected one of: ${[...VALID_SCOPES].join(", ")}.`
		);
	}

	// Scope-agnostic: any valid (or absent) scope is fine.
	if (required === undefined) return null;

	// Required scope but scope is absent/invalid.
	if (scope === undefined) {
		return (
			`attestation is missing the required "scope" field (expected "${required}"). ` +
			`Re-run \`npm run verify\` with the AT1 release to mint a scoped attestation.`
		);
	}

	// Scope present but doesn't match requirement.
	if (scope !== required) {
		return (
			`attestation scope is "${scope}" but "${required}" is required. ` +
			`Run \`npm run verify:release\` (VERIFY_SCOPE=full) to mint a full-scope attestation.`
		);
	}

	return null;
}
