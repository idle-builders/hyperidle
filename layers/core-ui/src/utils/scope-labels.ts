// @lore: scopeKindToLabel in domain-model — shared between core-api and core-ui; re-exported here so existing import sites don't need updating
// @lore: SCOPE_KINDS is exactly factory/team/user — no Filesystem or Role option

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
 * @lore: no Filesystem option — filesystems are agent execution environments, not a knowledge location
 * @lore: no Role/practice option — role-scoped patterns are tree children under Practices, reached by nesting
 */
export const SCOPE_CREATE_OPTIONS: ScopeCreateOption[] = [
	{ label: "Shared", id: "shared", scopeKind: "factory" },
	{ label: "Team", id: "team", scopeKind: "team" },
	{ label: "Private", id: "private", scopeKind: "user" },
];
