/**
 * The practice an agent belongs to is its role.
 *
 * @lore BA9g: this re-exported `communityForRole`, which mapped 16 hardcoded
 * roles onto four communities. Nothing ever scoped knowledge to a community
 * name — the demo world scopes practice knowledge by ROLE (`builder`,
 * `qa_engineer`, `growth`) — so the exact-community branch never fired and the
 * fuzzy role-substring branch did all the work. With roles as data there is no
 * mapping to hold: a new role is its own practice, automatically.
 */
export function practiceForRole(role: string): string {
	return role;
}
