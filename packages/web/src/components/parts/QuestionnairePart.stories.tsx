/**
 * LG1 Phase 5 — QuestionnairePart stories: agent quick-ask survey.
 *
 * Options render as static non-interactive chips (AM1 DES-1: answering not wired).
 */

import type { Part, PartAuthor } from "@hyperidle/shared";
import type { JSX } from "react";
import { QuestionnairePart } from "./QuestionnairePart.js";

export default { title: "QuestionnairePart", group: "Conversations" as const };

const AGENT: PartAuthor = { id: "a-atlas", name: "Atlas", isAgent: true, isMe: false };

function makeQuestionnairePart(
	overrides: Partial<Extract<Part, { kind: "questionnaire" }>>,
): Extract<Part, { kind: "questionnaire" }> {
	return {
		id: "qp1",
		kind: "questionnaire",
		author: AGENT,
		createdAt: "2026-06-22T14:00:00.000Z",
		embeds: [],
		question: "Which approach should I use for the streaming fix?",
		options: [
			"Update server emit path only",
			"Update both server and client",
			"Revert the SDK upgrade",
		],
		...overrides,
	};
}

/** Default questionnaire — three options. */
export function QuestionnairePartDefault(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<QuestionnairePart part={makeQuestionnairePart({})} />
		</div>
	);
}

/** Two options — minimal choice. */
export function QuestionnairePartTwoOptions(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<QuestionnairePart
				part={makeQuestionnairePart({
					question: "Should I add integration tests for this path?",
					options: ["Yes", "No — unit tests are sufficient"],
				})}
			/>
		</div>
	);
}

/** Many options — wraps to multiple rows. */
export function QuestionnairePartManyOptions(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<QuestionnairePart
				part={makeQuestionnairePart({
					question: "Which component should own the streaming retry logic?",
					options: [
						"StreamingClient",
						"ChatSurface",
						"HarnessAdapter",
						"SessionView",
						"Dispatcher",
						"Leave in server route",
					],
				})}
			/>
		</div>
	);
}
