/**
 * The disciplines a discipline picker offers: the ones agents actually have.
 *
 * @lore: options — a discipline is data, not a fixed catalog; typing a new one via `Combobox`'s `allowCustomValue` introduces it.
 * @lore: label — a discipline is its own display name, never a title-cased slug.
 * @lore: shared by AgentEditor and AgentAddDialog — one catalog, not two derivations.
 */

export function disciplineOptions(disciplinesInUse: readonly string[]): ReadonlyArray<{
	id: string;
	label: string;
}> {
	return [...new Set(disciplinesInUse)]
		.filter((discipline) => discipline.length > 0)
		.sort()
		.map((discipline) => ({ id: discipline, label: discipline }));
}
