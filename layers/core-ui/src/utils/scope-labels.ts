/**
 * scope-labels — AD6: Knowledge Cleanup & Scope Simplification.
 *
 * Provides the static scope options for the document list filter pills
 * and the create/change flow scope picker.
 *
 * @lore nested-knowledge-items: SCOPE_KINDS is now exactly the 3 values these
 * pills already exposed (factory/team/user) — the migration deleted
 * product/practice/task. "Shared" is factory alone now (practice is gone —
 * role-scoped patterns live as tree children under the Practices root, not a
 * scope kind). "Team" is team alone (product folded into team). "Private"
 * stays user.
 *
 * @lore AV3: scopeKindToLabel lives in @hyperidle/domain-model beside ScopeKind
 * so the server (core-api) and the web (core-ui) share one source of truth.
 * Re-exported here so existing import sites inside core-ui do not need updating.
 */

import type { ScopeKind } from "@hyperidle/domain-model";

export { scopeKindToLabel } from "@hyperidle/domain-model";

/** One entry in the document list filter pill row. */
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
 * Four static pills for the document list filter row.
 * All → Shared (factory) → Team (team) → Private (user).
 */
export const SCOPE_PILL_OPTIONS: ScopePillOption[] = [
	{ label: "All", id: "all", filterKinds: null },
	{ label: "Shared", id: "shared", filterKinds: ["factory"] },
	{ label: "Team", id: "team", filterKinds: ["team"] },
	{ label: "Private", id: "private", filterKinds: ["user"] },
];

/**
 * Options for the document create/change flow scope picker.
 * Shared → factory | Team → team | Private → user.
 *
 * @lore AU26 F2 (founder ruling): the fourth option, Filesystem, is REMOVED. A
 * filesystem is an agent's execution environment, not a place knowledge lives,
 * and this picker entry was the last thing keeping the `filesystems` record in
 * core-api while its mounting engine sat in agent-orchestration.
 *
 * @lore nested-knowledge-items: the fifth option, Role (scopeKind: "practice"),
 * is REMOVED with the practice scope value. Role-scoped patterns are now tree
 * children under the Practices root, reached by nesting, not a scope pick.
 */
export const SCOPE_CREATE_OPTIONS: ScopeCreateOption[] = [
	{ label: "Shared", id: "shared", scopeKind: "factory" },
	{ label: "Team", id: "team", scopeKind: "team" },
	{ label: "Private", id: "private", scopeKind: "user" },
];
