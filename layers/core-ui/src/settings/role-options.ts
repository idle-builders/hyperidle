// @lore: roles — data-driven, not a fixed catalog; options are roles agents actually have; custom values extend the set

import { roleLabel } from "../utils/role-label.js";

export function roleOptions(rolesInUse: readonly string[]): ReadonlyArray<{
	id: string;
	label: string;
}> {
	return [...new Set(rolesInUse)]
		.filter((role) => role.length > 0)
		.sort()
		.map((role) => ({ id: role, label: roleLabel(role) }));
}
