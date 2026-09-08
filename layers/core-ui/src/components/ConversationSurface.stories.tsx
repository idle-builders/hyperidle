/**
 * Conversation Surface — stories (the approved AM1 conversation design).
 *
 * The FULL-SCOPE conversation scoped to the conversation pane (the app-shell
 * sidebar — conversation list + nav — is intentionally OUT of this design: it is
 * app-shell chrome that lives elsewhere). Rendered at desktop width on
 * --surface-page. Only the real populated conversation; no empty / loading /
 * error variants ([[memory]]: initial designs render only populated).
 *
 * ── THE FIXTURE LIVES HERE (AM1 task 11) ────────────────────────────────────
 * `ConversationSurface` is now prop-driven (the page passes real data). This
 * story owns the design fixture — the approved conversation as a fixed `Part[]`
 * plus the header/participant strings and a console-`onOpen` / noop `onSend`.
 * The render stays byte-identical to the pre-task-11 embodiment (the viewer at
 * `:8098` does not change) — the fixture simply moved from module-internal into
 * the props it passes in.
 *
 * Two embodiments:
 *  - Populated (default): the WHOLE conversation at natural height (no internal
 *    scroll clip) with a RESTING composer — so the full thread is legible in one
 *    frame for design review.
 *  - ComposerInsertBlock: the conversation tail + the composer in its ACTIVE
 *    Insert-Block state (reply banner · inserted rich code block · attachment ·
 *    open Insert menu · Send) — the composer's killer feature.
 */

import type { JSX } from "react";
import { MemoryRouter } from "react-router-dom";
import { Fold } from "../ds";
import ConversationSurface, {
	type ConversationSurfaceHeader,
	type ConversationSurfaceParticipant,
} from "./ConversationSurface.js";
import type { OpenTarget, Part } from "./parts";

export default {
	title: "Conversation Surface",
	group: "Conversations" as const,
};

// ── Fixture identities (3 participants: 2 humans + 1 agent) ─────────
const FOUNDER = { id: "u-founder", name: "A. Founder", isAgent: false, isMe: true };
const MARA = { id: "u-mara", name: "Mara", isAgent: false, isMe: false };
const ATLAS = { id: "a-atlas", name: "Atlas", isAgent: true, isMe: false };

function author(who: typeof FOUNDER): Part["author"] {
	return { id: who.id, name: who.name, isAgent: who.isAgent, isMe: who.isMe };
}

// ── The approved conversation as a fixed Part[] (rendered by PartList) ──
const PARTS: Part[] = [
	{
		id: "m1",
		kind: "prose",
		author: author(FOUNDER),
		createdAt: "2026-06-17T09:02:00.000Z",
		embeds: [],
		text: "Can you wire passkey login and show me the diff before we deploy?",
	},
	{
		id: "m2",
		kind: "prose",
		author: author(MARA),
		createdAt: "2026-06-17T09:05:00.000Z",
		embeds: [{ kind: "mention", identityId: ATLAS.id, displayName: "Atlas" }],
		text: "@Atlas please keep the password fallback for phase 2 — some of our enterprise tenants can't enroll passkeys yet.",
	},
	{
		id: "m3",
		kind: "prose",
		author: author(ATLAS),
		createdAt: "2026-06-17T09:11:00.000Z",
		embeds: [
			{ kind: "session-reference", sessionId: "s-1", summary: "Worked for 1m 12s" },
			{
				kind: "diff",
				label: "auth/passkey.ts",
				meta: "+2 −1",
			},
			{
				kind: "entity-ref",
				entityKind: "knowledge_item",
				id: "k-webauthn",
				label: "WebAuthn L3 spec",
				target: { route: "host", hostKind: "knowledge_item", hostId: "k-webauthn" },
			},
		],
		text: "Added WebAuthn registration and the dual-auth window. Existing password sessions stay valid through phase 2, @Mara — fallback preserved.",
	},
	{
		id: "m4",
		kind: "prose",
		author: author(ATLAS),
		createdAt: "2026-06-17T09:12:00.000Z",
		embeds: [{ kind: "session-reference", sessionId: "s-2" }],
		text: "Context for the dual-auth window and the flow diagram:",
	},
	{
		id: "m5",
		kind: "questionnaire",
		author: author(ATLAS),
		createdAt: "2026-06-17T09:13:00.000Z",
		embeds: [],
		question: "How long should the password fallback stay enabled?",
		options: ["Keep through phase 2", "Drop now", "Decide later"],
	},
	{
		id: "m6",
		kind: "prose",
		author: author(FOUNDER),
		createdAt: "2026-06-17T09:14:00.000Z",
		embeds: [],
		text: "Keep it through phase 2 — that covers the enterprise tenants Mara flagged.",
	},
	{
		id: "m7",
		kind: "review",
		author: author(ATLAS),
		createdAt: "2026-06-17T09:15:00.000Z",
		embeds: [],
		title: "Approve deploy of passkey login to staging",
		changeSet: {
			kind: "diff",
			label: "auth/passkey.ts",
			meta: "+2 −1",
		},
		reviewTarget: { reviewId: "rv-1" },
	},
	{
		id: "m8",
		kind: "resolved",
		author: author(FOUNDER),
		createdAt: "2026-06-17T09:16:00.000Z",
		embeds: [],
		label: "APPROVED",
		resolvedBy: "A. Founder",
		summary: "approve deploy of passkey login to staging",
		reviewTarget: { reviewId: "rv-1" },
	},
];

const HEADER: ConversationSurfaceHeader = {
	title: "Passkey login",
	hostKind: "Bet",
	hostTitle: "Passkey login",
	hostRoute: "/work/bet/bet-1",
};

const PARTICIPANTS: ReadonlyArray<ConversationSurfaceParticipant> = [
	{ id: FOUNDER.id, name: FOUNDER.name, isAgent: FOUNDER.isAgent },
	{ id: MARA.id, name: MARA.name, isAgent: MARA.isAgent },
	{ id: ATLAS.id, name: ATLAS.name, isAgent: ATLAS.isAgent },
];

// The single navigation hook → the existing OWNED surfaces. No router in the
// story, so it is a clearly-labeled console noop naming its target route.
const onOpen = (target: OpenTarget): void => {
	// biome-ignore lint/suspicious/noConsole: story-only navigation-hook proof
	console.info("[AM1] open", target.route, target);
};

const onSend = (): void => {
	// biome-ignore lint/suspicious/noConsole: story-only send-hook proof
	console.info("[AM1] send (story noop)");
};

// The full conversation, resting composer — natural height (nothing clipped).
export const Populated = (): JSX.Element => (
	<MemoryRouter>
		<div className="w-full bg-[var(--surface-page)] p-[24px]">
			<div className="mx-auto w-full max-w-[1440px] overflow-hidden rounded-[var(--r-default)] border border-[var(--border-subtle)] shadow-[var(--shadow-default)]">
				<ConversationSurface
					parts={PARTS}
					onOpen={onOpen}
					header={HEADER}
					participants={PARTICIPANTS}
					onSend={onSend}
				/>
				{/* Story-only: the calm Fold device shown standalone so the viewer
				    exercises it on its own (the page's session Folds come from
				    PartList's session-reference embeds — AM1 §12.2). */}
				<div className="mx-auto w-full max-w-[760px] px-[18px] pb-[18px]">
					<Fold
						label="Worked for 1m 12s"
						cta="Show"
						onShow={() => onOpen({ route: "session", sessionId: "s-1" })}
					/>
				</div>
			</div>
		</div>
	</MemoryRouter>
);

// The composer's killer feature: active Insert-Block state, anchored under the
// conversation tail (fixed-height scroll so the composer detail dominates).
export const ComposerInsertBlock = (): JSX.Element => (
	<MemoryRouter>
		<div className="w-full bg-[var(--surface-page)] p-[24px]">
			<div
				className="mx-auto w-full max-w-[1440px] overflow-hidden rounded-[var(--r-default)] border border-[var(--border-subtle)] shadow-[var(--shadow-default)]"
				style={{ height: 760 }}
			>
				<ConversationSurface
					parts={PARTS}
					onOpen={onOpen}
					header={HEADER}
					participants={PARTICIPANTS}
					onSend={onSend}
					scroll
				/>
			</div>
		</div>
	</MemoryRouter>
);
