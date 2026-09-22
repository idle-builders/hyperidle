/**
 * SettingsSkillsAndRules — skills and rules, on the shared document list.
 *
 * A thin instantiation of `DocumentSlotList` for slot in {skill, rule} — see
 * that component for the shared list/create/delete/navigate behavior. This
 * file only supplies what varies: which slots, and the copy.
 */

import type { DocumentSlot } from "@hyperidle/domain-model";
import type { JSX } from "react";
import { DocumentSlotList } from "./DocumentSlotList.js";

/** The two slots this surface creates. `DOCUMENT_SLOTS` carries three more
 * (ordinary, agent_file, prompt) that never appear in this list — each has
 * its own home (the document view, an agent's identity, a routine's prompt). */
const SKILL_AND_RULE_SLOTS: readonly DocumentSlot[] = ["skill", "rule"];

export function SettingsSkillsAndRules(): JSX.Element {
	return (
		<DocumentSlotList
			slots={SKILL_AND_RULE_SLOTS}
			description="Skills and rules an agent's session picks up — a skill lands in the harness's own skills directory; a rule is always present. Create one here, then write its body in the document view."
			sectionLabel="Registered skills and rules"
			emptyMessage="No skills or rules registered yet."
			createLabel="Create a skill or rule"
		/>
	);
}
