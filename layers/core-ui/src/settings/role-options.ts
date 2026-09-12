/**
 * The roles a role-picker offers: the ones agents actually have.
 *
 * @lore BA9g: this was `AGENT_ROLE_CATALOG.map(...)` — 17 roles the product had
 * opinions about, offered whether or not any agent had them, while a role a
 * plugin or a person introduced was never offered back. A role is data now, so
 * the options are whatever is in use, and typing a new one (via the shared
 * `Combobox`'s `allowCustomValue`) introduces it.
 *
 * @lore BA6: extracted out of `AgentEditor.tsx` so `AgentAddDialog`'s role
 * field can share the exact same catalog instead of re-deriving it.
 */

import { roleLabel } from "@hyperidle/domain-model";

export function roleOptions(rolesInUse: readonly string[]): ReadonlyArray<{
	id: string;
	label: string;
}> {
	return [...new Set(rolesInUse)]
		.filter((role) => role.length > 0)
		.sort()
		.map((role) => ({ id: role, label: roleLabel(role) }));
}
