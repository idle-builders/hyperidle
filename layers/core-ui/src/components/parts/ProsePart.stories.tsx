/**
 * Stories for ProsePart — plain text body with optional mention accents.
 */

import type { JSX } from "react";
import type { Part, PartAuthor } from ".";
import { ProsePart } from "./ProsePart.js";

export default { title: "ProsePart", group: "Conversations" as const };

const AGENT: PartAuthor = { id: "a-atlas", name: "Atlas", isAgent: true, isMe: false };

function makeProse(
	overrides: Partial<Extract<Part, { kind: "prose" }>>,
): Extract<Part, { kind: "prose" }> {
	return {
		id: "pp1",
		kind: "prose",
		author: AGENT,
		createdAt: "2026-06-22T14:00:00.000Z",
		embeds: [],
		text: "Ship the pricing overhaul this week.",
		...overrides,
	} as Extract<Part, { kind: "prose" }>;
}

const noop = () => {};

export function Plain(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<ProsePart part={makeProse({})} onOpen={noop} />
		</div>
	);
}

export function WithMention(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<ProsePart
				part={makeProse({
					text: "Ping @Founder when the review is ready.",
					embeds: [{ kind: "mention", identityId: "u-founder", displayName: "Founder" }],
				})}
				onOpen={noop}
			/>
		</div>
	);
}
