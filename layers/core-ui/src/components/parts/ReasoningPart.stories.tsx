/**
 * AM3 — ReasoningPart stories: the reasoning span renderer.
 *
 * Collapsed by default to "Thought for Ns". Expand to see quiet prose.
 */

import type { Part, PartAuthor } from "@hyperidle/conversation-parts";
import type { JSX } from "react";
import { ReasoningPart } from "./ReasoningPart.js";

export default { title: "ReasoningPart", group: "Conversations" as const };

const AGENT: PartAuthor = { id: "a-atlas", name: "Atlas", isAgent: true, isMe: false };

function makeReasoningPart(
	overrides: Partial<Extract<Part, { kind: "reasoning" }>>,
): Extract<Part, { kind: "reasoning" }> {
	return {
		id: "rp1",
		kind: "reasoning",
		author: AGENT,
		createdAt: "2026-06-22T14:00:00.000Z",
		embeds: [],
		durationMs: 14_000,
		text: "The symptom — messages vanish on submit — points at the streaming response shape, not the composer. AI SDK 6 renamed parameters. Likely the backend still sends content: string where the v6 client now expects a parts array.",
		...overrides,
	};
}

export function ReasoningPartDefault(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<ReasoningPart part={makeReasoningPart({})} />
		</div>
	);
}

export function ReasoningPartShort(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<ReasoningPart
				part={makeReasoningPart({
					durationMs: 2_500,
					text: "Quick check — the schema already handles this.",
				})}
			/>
		</div>
	);
}

export function ReasoningPartLong(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<ReasoningPart
				part={makeReasoningPart({
					durationMs: 60_000,
					text: "This is a very long chain of thought that spans multiple paragraphs. The agent is working through several potential approaches, weighing the tradeoffs carefully. After considering all the options, the approach that minimizes risk while maintaining performance is to use the normalized parts[] shape throughout, updating both the server emit path and the client consumption path in a single pass.",
				})}
			/>
		</div>
	);
}
