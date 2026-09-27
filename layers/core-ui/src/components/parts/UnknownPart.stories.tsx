/**
 * Stories for UnknownPart — quiet fallback for unrecognised / redacted shapes.
 */

import type { JSX } from "react";
import type { Part, PartAuthor } from ".";
import { UnknownPart } from "./UnknownPart.js";

export default { title: "UnknownPart", group: "Conversations" as const };

const AGENT: PartAuthor = { id: "a-atlas", name: "Atlas", isAgent: true, isMe: false };

export function Unsupported(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<UnknownPart
				part={
					{
						id: "u1",
						kind: "unknown",
						author: AGENT,
						createdAt: "2026-06-22T14:00:00.000Z",
						embeds: [],
						reason: "wire-unrecognised-type",
					} satisfies Extract<Part, { kind: "unknown" }>
				}
			/>
		</div>
	);
}

export function Redacted(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<UnknownPart
				part={
					{
						id: "u2",
						kind: "unknown",
						author: AGENT,
						createdAt: "2026-06-22T14:00:00.000Z",
						embeds: [],
						reason: "redacted",
					} satisfies Extract<Part, { kind: "unknown" }>
				}
			/>
		</div>
	);
}
