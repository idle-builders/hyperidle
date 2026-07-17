/**
 * LG1 Phase 5 — ProsePart stories: plain-text body with inline mentions and embeds.
 */

import type { OpenTarget, Part, PartAuthor } from "@hyperidle/shared";
import type { JSX } from "react";
import { ProsePart } from "./ProsePart.js";

export default { title: "ProsePart", group: "Conversations" as const };

const AGENT: PartAuthor = { id: "a-atlas", name: "Atlas", isAgent: true, isMe: false };
const USER: PartAuthor = { id: "u-founder", name: "Founder", isAgent: false, isMe: true };

function makeProsePart(
	overrides: Partial<Extract<Part, { kind: "prose" }>> & { author?: PartAuthor },
): Extract<Part, { kind: "prose" }> {
	return {
		id: "pp1",
		kind: "prose",
		author: AGENT,
		createdAt: "2026-06-22T14:00:00.000Z",
		embeds: [],
		text: "The streaming regression in the AI SDK upgrade is isolated to the parts[] shape change. Updating the server emit path and client consumption in a single pass should restore the chat surface.",
		...overrides,
	};
}

const noop = (_target: OpenTarget): void => {};

/** Plain prose — no embeds, no mentions. */
export function ProsePartPlain(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<ProsePart part={makeProsePart({})} onOpen={noop} />
		</div>
	);
}

/** Prose from a human sender. */
export function ProsePartHuman(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<ProsePart
				part={makeProsePart({
					author: USER,
					text: "Can you look at the streaming issue in the chat surface? It started after the SDK upgrade.",
				})}
				onOpen={noop}
			/>
		</div>
	);
}

/** Prose with inline @mention highlight. */
export function ProsePartWithMention(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<ProsePart
				part={makeProsePart({
					text: "@Atlas please review the chat streaming fix before we ship.",
					embeds: [{ kind: "mention", identityId: "a-atlas", displayName: "Atlas" }],
				})}
				onOpen={noop}
			/>
		</div>
	);
}

/** Prose with a reference chip embed. */
export function ProsePartWithEmbed(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<ProsePart
				part={makeProsePart({
					text: "Here is the diff for the streaming fix:",
					embeds: [
						{
							kind: "diff",
							label: "server/chat/stream.ts",
							meta: "+9/−2",
							target: { route: "artifact", artifactId: "art-stream-fix" },
						},
					],
				})}
				onOpen={noop}
			/>
		</div>
	);
}
