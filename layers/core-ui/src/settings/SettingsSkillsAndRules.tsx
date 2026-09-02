/**
 * SettingsSkillsAndRules — skills and rules, on the shared knowledge list.
 *
 * A thin instantiation of `KnowledgeRoleList` for role in {skill, rule} — see
 * that component for the shared list/create/delete/navigate behavior. This
 * file only supplies what varies: which roles, and the copy.
 */

import type { KnowledgeRole } from "@hyperidle/domain-model";
import type { JSX } from "react";
import { KnowledgeRoleList } from "./KnowledgeRoleList.js";

/** The two roles this surface creates. `KNOWLEDGE_ROLES` carries three more
 * (ordinary, agent_file, prompt) that never appear in this list — each has
 * its own home (the knowledge view, an agent's identity, a routine's prompt). */
const SKILL_AND_RULE_ROLES: readonly KnowledgeRole[] = ["skill", "rule"];

export function SettingsSkillsAndRules(): JSX.Element {
	return (
		<KnowledgeRoleList
			roles={SKILL_AND_RULE_ROLES}
			description="Skills and rules an agent's session picks up — a skill lands in the harness's own skills directory; a rule is always present. Create one here, then write its body in the knowledge view."
			sectionLabel="Registered skills and rules"
			emptyMessage="No skills or rules registered yet."
			createLabel="Create a skill or rule"
		/>
	);
}
