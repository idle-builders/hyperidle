import type { Part } from "@hyperidle/conversation-parts";
import type { JSX } from "react";
import { PartList } from "./PartList.js";

export default {
	title: "PartList",
	group: "Conversations" as const,
	order: ["Populated"],
};

const ME = { id: "u-me", name: "A. Founder", isAgent: false, isMe: true };
const ATLAS = { id: "a-atlas", name: "Atlas", isAgent: true, isMe: false };

// biome-ignore lint/suspicious/noConsole: story-only navigation-hook proof
const onOpen = (t: { route: string }): void => console.info("[AM1] open", t.route, t);

const PARTS: Part[] = [
	{
		id: "m1",
		kind: "prose",
		author: ME,
		createdAt: "2026-06-17T10:00:00.000Z",
		embeds: [],
		text: "Can you wire passkey login and show me the diff before we deploy?",
	},
	{
		id: "m2",
		kind: "prose",
		author: ATLAS,
		createdAt: "2026-06-17T10:01:00.000Z",
		embeds: [
			{
				kind: "block",
				title: "Auth migration plan · §2",
				target: { route: "host", hostKind: "knowledge_item", hostId: "k-1" },
			},
			{ kind: "session-reference", sessionId: "s-1", summary: "Worked for 1m 12s" },
		],
		text: "Added WebAuthn registration and the dual-auth window.",
	},
	{
		id: "m3",
		kind: "review",
		author: ATLAS,
		createdAt: "2026-06-17T10:02:00.000Z",
		embeds: [],
		title: "Approve deploy of passkey login to staging",
		changeSet: {
			kind: "artifact",
			label: "auth/passkey.ts",
			meta: "+2 −1",
			target: { route: "artifact", artifactId: "art-1" },
		},
		reviewTarget: { betId: "bet-1", reviewId: "m3" },
	},
	{
		id: "m4",
		kind: "questionnaire",
		author: ATLAS,
		createdAt: "2026-06-17T10:03:00.000Z",
		embeds: [],
		question: "How long should the password fallback stay enabled?",
		options: ["Keep through phase 2", "Drop now", "Decide later"],
	},
	{
		id: "m5",
		kind: "resolved",
		author: ME,
		createdAt: "2026-06-17T10:04:00.000Z",
		embeds: [],
		label: "APPROVED",
		resolvedBy: "A. Founder",
		summary: "approve deploy of passkey login to staging",
		reviewTarget: { betId: "bet-1", reviewId: "m3" },
	},
];

export const Populated = (): JSX.Element => (
	<div className="max-w-[760px] p-[18px]">
		<PartList parts={PARTS} onOpen={onOpen} />
	</div>
);
