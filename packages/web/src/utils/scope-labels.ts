/**
 * scope-labels — AD6: Knowledge Cleanup & Scope Simplification.
 *
 * Provides the static scope options for the knowledge list filter pills
 * and the create/change flow scope picker.
 *
 * @lore AD6: Scope vocabulary was collapsed from 7 SCOPE_KINDS to 3 user-facing
 * choices. "Shared" maps to factory+practice (org-wide scopes).
 * "Team" maps to team+product (U1 renamed Products → Teams; product scope now
 * displays under the Team label). "Private" maps to user scope (only visible to
 * the creator).
 *
 * @lore AV3: scopeKindToLabel promoted to @hyperidle/shared as SSOT. This file
 * re-exports it so all 4 existing web callers (KnowledgeDetail.tsx,
 * ScopeChangeDialog.tsx, AE1-scope-labels.test.ts, KnowledgeDetail.af13.test.tsx)
 * continue to import from this path with no churn.
 */

import type { ScopeKind } from "@hyperidle/shared";

// AV3: Re-export from shared SSOT — web callers import from here, function lives in shared.
export { scopeKindToLabel } from "@hyperidle/shared";

/** One entry in the knowledge list filter pill row. */
export interface ScopePillOption {
	/** The label shown on the pill button. */
	label: string;
	/** The test id suffix used for data-testid="scope-pill-{id}". */
	id: string;
	/**
	 * The scopeKind values that this pill filters to.
	 * null means "no filter" (show all items).
	 */
	filterKinds: ScopeKind[] | null;
}

/** One entry in the create/change flow scope picker. */
export interface ScopeCreateOption {
	/** The label shown on the pill button. */
	label: string;
	/** The test id suffix used for data-testid="scope-pill-create-{id}". */
	id: string;
	/** The scopeKind value sent to the API when this option is selected. */
	scopeKind: ScopeKind;
}

/**
 * Four static pills for the knowledge list filter row.
 * All → Shared (factory/practice) → Team (team/product) → Private (user).
 *
 * @lore AE1: "product" scope moved from Shared pill to Team pill to match the
 * U1 rename of Products → Teams. scopeKindToLabel("product") also returns "Team"
 * now so no raw internal scope vocabulary leaks to users.
 */
export const SCOPE_PILL_OPTIONS: ScopePillOption[] = [
	{ label: "All", id: "all", filterKinds: null },
	{ label: "Shared", id: "shared", filterKinds: ["factory", "practice"] },
	{ label: "Team", id: "team", filterKinds: ["team", "product"] },
	{ label: "Private", id: "private", filterKinds: ["user"] },
];

/**
 * Options for the knowledge create/change flow scope picker.
 * Shared → factory | Team → team | Private → user | Role → practice |
 * Filesystem → filesystem.
 *
 * @lore AV3 A2: AD6 collapsed routine human authoring to three common buckets,
 * but AV3 made role/filesystem scopes first-class readable names. They must also
 * be selectable by humans/agents, so the picker exposes them while preserving the
 * original three bucket labels.
 */
export const SCOPE_CREATE_OPTIONS: ScopeCreateOption[] = [
	{ label: "Shared", id: "shared", scopeKind: "factory" },
	{ label: "Team", id: "team", scopeKind: "team" },
	{ label: "Private", id: "private", scopeKind: "user" },
	{ label: "Role", id: "role", scopeKind: "practice" },
	{ label: "Filesystem", id: "filesystem", scopeKind: "filesystem" },
];
