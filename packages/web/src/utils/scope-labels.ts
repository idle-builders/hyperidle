/**
 * scope-labels — AD6: Knowledge Cleanup & Scope Simplification.
 *
 * Provides the static scope options for the knowledge list filter pills
 * and the create flow scope picker.
 *
 * @lore AD6: Scope vocabulary was collapsed from 7 SCOPE_KINDS to 3 user-facing
 * choices. "Shared" maps to factory+practice (org-wide scopes).
 * "Team" maps to team+product (U1 renamed Products → Teams; product scope now
 * displays under the Team label). "Private" maps to user scope (only visible to
 * the creator).
 */

import type { ScopeKind } from "@hyperidle/shared";

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

/** One entry in the create flow scope picker. */
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
 * Three options for the knowledge create flow scope picker.
 * Shared → factory | Team → team | Private → user.
 */
export const SCOPE_CREATE_OPTIONS: ScopeCreateOption[] = [
	{ label: "Shared", id: "shared", scopeKind: "factory" },
	{ label: "Team", id: "team", scopeKind: "team" },
	{ label: "Private", id: "private", scopeKind: "user" },
];

/**
 * Maps a raw scopeKind from the API to the user-facing label.
 * factory/practice → "Shared"
 * team/product → "Team"
 * user → "Private"
 * Anything else → "Shared" (safe fallback).
 *
 * @lore AE1: "product" maps to "Team" (not "Shared") because U1 renamed
 * Products → Teams. Items that were product-scoped are now displayed under the
 * Team label to avoid surfacing internal vocabulary to users.
 */
export function scopeKindToLabel(scopeKind: string): string {
	if (scopeKind === "user") return "Private";
	if (scopeKind === "team" || scopeKind === "product") return "Team";
	// factory, practice, bet, task → Shared
	return "Shared";
}
