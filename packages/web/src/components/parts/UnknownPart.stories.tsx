/**
 * LG1 Phase 5 — UnknownPart stories: fallback for unrecognised message shapes.
 */

import type { Part, PartAuthor } from "@hyperidle/shared";
import type { JSX } from "react";
import { UnknownPart } from "./UnknownPart.js";

export default { title: "UnknownPart", group: "Conversations" as const };

const AGENT: PartAuthor = { id: "a-atlas", name: "Atlas", isAgent: true, isMe: false };

function makeUnknownPart(
	overrides: Partial<Extract<Part, { kind: "unknown" }>>,
): Extract<Part, { kind: "unknown" }> {
	return {
		id: "up1",
		kind: "unknown",
		author: AGENT,
		createdAt: "2026-06-22T14:00:00.000Z",
		embeds: [],
		reason: "wire-unrecognised-type",
		...overrides,
	};
}

/** Wire-unrecognised-type: a future message kind the client doesn't know yet. */
export function UnknownPartWireUnrecognised(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<UnknownPart part={makeUnknownPart({ reason: "wire-unrecognised-type" })} />
		</div>
	);
}

/** Redacted: payload hidden from this viewer. */
export function UnknownPartRedacted(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<UnknownPart part={makeUnknownPart({ reason: "redacted" })} />
		</div>
	);
}

/** No part prop — component accepts optional part (renders "Unsupported message"). */
export function UnknownPartNoProps(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<UnknownPart />
		</div>
	);
}
