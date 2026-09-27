/**
 * Stories for QuestionnairePart — agent quick-ask survey.
 */

import type { JSX } from "react";
import type { Part, PartAuthor } from ".";
import { QuestionnairePart } from "./QuestionnairePart.js";

export default { title: "QuestionnairePart", group: "Conversations" as const };

const AGENT: PartAuthor = { id: "a-atlas", name: "Atlas", isAgent: true, isMe: false };

function makePart(
	overrides: Partial<Extract<Part, { kind: "questionnaire" }>> = {},
): Extract<Part, { kind: "questionnaire" }> {
	return {
		id: "qq1",
		kind: "questionnaire",
		author: AGENT,
		createdAt: "2026-06-22T14:00:00.000Z",
		embeds: [],
		question: "Which pricing tier should we lead with?",
		options: ["Starter", "Growth", "Enterprise"],
		...overrides,
	} as Extract<Part, { kind: "questionnaire" }>;
}

export function StaticOptions(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<QuestionnairePart part={makePart()} />
		</div>
	);
}

export function Interactive(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<QuestionnairePart part={makePart({ id: "qq-interactive" })} onAnswer={() => {}} />
		</div>
	);
}
