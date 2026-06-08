/**
 * scope-labels — AD6: Knowledge Cleanup & Scope Simplification.
 *
 * Provides the static scope options for the knowledge list filter pills
 * and the create flow scope picker.
 *
 * @lore AD6: Scope vocabulary was collapsed from 7 SCOPE_KINDS to 3 user-facing
 * choices. "Shared" maps to factory+product+practice (all org-wide scopes).
 * "Team" maps to the team scope (disabled when user has no teamId).
 * "Private" maps to user scope (only visible to the creator).
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
 * All → Shared (factory/product/practice) → Team → Private (user).
 */
export const SCOPE_PILL_OPTIONS: ScopePillOption[] = [
	{ label: "All", id: "all", filterKinds: null },
	{ label: "Shared", id: "shared", filterKinds: ["factory", "product", "practice"] },
	{ label: "Team", id: "team", filterKinds: ["team"] },
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
 * factory/product/practice → "Shared"
 * team → "Team"
 * user → "Private"
 * Anything else → "Shared" (safe fallback).
 */
export function scopeKindToLabel(scopeKind: string): string {
	if (scopeKind === "user") return "Private";
	if (scopeKind === "team") return "Team";
	// factory, product, practice, bet, task → Shared
	return "Shared";
}
