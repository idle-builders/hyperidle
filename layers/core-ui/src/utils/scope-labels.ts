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
 * @lore AV3: scopeKindToLabel lives in @hyperidle/domain-model beside ScopeKind
 * so the server (core-api) and the web (core-ui) share one source of truth.
 * Re-exported here so existing import sites inside core-ui do not need updating.
 *
 * @lore AE1: "product" maps to "Team" (not "Shared") because U1 renamed Products → Teams.
 */

import type { ScopeKind } from "@hyperidle/domain-model";

export { scopeKindToLabel } from "@hyperidle/domain-model";

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
 * Shared → factory | Team → team | Private → user | Role → practice.
 *
 * @lore AV3 A2: AD6 collapsed routine human authoring to three common buckets,
 * but AV3 made the role scope a first-class readable name. It must also be
 * selectable by humans/agents, so the picker exposes it while preserving the
 * original three bucket labels.
 *
 * @lore AU26 F2 (founder ruling): the fifth option, Filesystem, is REMOVED. A
 * filesystem is an agent's execution environment, not a place knowledge lives,
 * and this picker entry was the last thing keeping the `filesystems` record in
 * core-api while its mounting engine sat in agent-orchestration.
 */
export const SCOPE_CREATE_OPTIONS: ScopeCreateOption[] = [
	{ label: "Shared", id: "shared", scopeKind: "factory" },
	{ label: "Team", id: "team", scopeKind: "team" },
	{ label: "Private", id: "private", scopeKind: "user" },
	{ label: "Role", id: "role", scopeKind: "practice" },
];
