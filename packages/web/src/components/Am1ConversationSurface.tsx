/**
 * AM1 — Conversation Experience, v3: the FULL-SCOPE conversation embodied in the
 * REAL app container, now INTERACTIVE (round-5 — founder asked to SEE it work).
 *
 * v1/v2 (the thin "calm column") were rejected as "far from the basics". v3 is
 * the conversation embodied in the real app pane: header · author-grouped
 * messages · composer.
 *
 * SCOPE = THE OPEN CONVERSATION (the open thread's content). A conversation IS a
 * thread (DB: conversationId === threadId; one threadId per message, no
 * sub-thread/parent column). Navigating BETWEEN threads is the app sidebar
 * (SidebarV2, AD9) — app-shell chrome, NOT part of this design.
 *
 * REVIEW / ARTIFACT REVIEW SCOPE BOUNDARY: the verdict flow + the AL review
 * slider is owned by track AL. A change-set/artifact here renders only as a
 * COMPACT EMBED card via the real ArtifactEmbed; "Open review" is a hook into AL.
 *
 * ── INTERACTIVITY (round-5, founder: "I want to see this interactive and open
 *    the right page and display the full block in the proper block viewer
 *    component that we already have") ──────────────────────────────────────────
 * The story is live React. Two pieces of real state drive it:
 *   1. insertMenuOpen — the composer "+" affordance toggles the unified Insert
 *      menu (a grounded popover anchored to the button). Click "+" to open,
 *      click "+" again or anywhere outside to close. No dead buttons.
 *   2. openBlock — clicking any block embed's "Open →" opens a RIGHT-PAGE PANEL
 *      that slides in and renders the FULL block through the REAL `<Block>`
 *      viewer component (packages/design-system/src/Block.tsx). Closing returns
 *      to the conversation. This is the "open in the right page" founder asked
 *      to SEE working — the same component Knowledge uses, no facsimile.
 *
 * The INLINE block embed shows the block's TITLE only (e.g. "Code ·
 * auth/passkey.ts", "Auth migration plan · §2") — never the first line of code.
 * The full Block render lives in the right page, not inline.
 *
 * @lore AM1-r5: the conversation chrome (header, groups, composer) is still
 * hand-rolled so the story renders stand-alone in the viewer without AppShell's
 * router/context. The builder maps each region to the real DS components per
 * spec.md §Composition. The embeds (ArtifactEmbed, Block) ARE the real DS
 * components — not facsimiles.
 *
 * @lore AM1-r5: the right-page panel here is a LOCAL demonstration of "open the
 * block in the right page" using the real `<Block>` viewer. The production
 * destination (the app-shell right page / AL slider) is owned elsewhere; this
 * surface only needs to PROVE the hook opens the real Block viewer.
 *
 * @lore AM1-r5: composer tool affordances UNIFIED into ONE "+" menu (founder:
 * "what's the difference between insert and those other icons. and why is the
 * insert there and not where the other icons are"). The old duplicate bottom
 * icon strip is gone; every compose action lives in the single menu the "+"
 * opens, each labeled + single-purpose.
 *
 * @lore AM1-r5b (round-5 composer pass): the composer's bottom footer (format
 * strip + "Enter to send" hint) was REMOVED — it served no value and ate height
 * (founder). All tools already live in the "+" menu; the reclaimed space made
 * the textarea taller (rows=3). Draft attachments — inserted code block AND
 * image — now share ONE compact chip style laid out in a HORIZONTAL wrapping
 * row (~one chip tall), and each chip's BODY opens the item while its trailing
 * ✕ removes it (founder: "click… open, the x removes it"). The reply banner is
 * CONDITIONAL — shown only when replying (the active Insert-Block state); the
 * resting composer has no banner.
 */

import { ArtifactEmbed, Block } from "@hyperidle/design-system";
import type { Artifact, BlockPayload } from "@hyperidle/shared";
import { blockId } from "@hyperidle/shared";
import { type JSX, useEffect, useRef, useState } from "react";

// ── Real-component fixtures ─────────────────────────────────────────
// CHANGE-SET embed = a code-kind Artifact rendered through the real ArtifactEmbed.
const CHANGE_SET_ARTIFACT: Artifact = {
	id: "art_passkey",
	producingTaskId: "task_passkey",
	producingTaskTitle: "Wire passkey login",
	kind: "code",
	label: "change set",
	preview: {
		kind: "code",
		file: "auth/passkey.ts",
		hunks: [
			{
				header: "@@ -12,7 +12,9 @@ async function register()",
				lines: [
					{ kind: "ctx", text: "  const opts = await beginRegistration(user);" },
					{ kind: "del", text: "  return legacyPasswordFlow(user);" },
					{ kind: "add", text: "  const cred = await navigator.credentials.create(webauthnOpts);" },
					{ kind: "add", text: "  return finishRegistration(user, cred);" },
				],
			},
		],
	},
	cost: {
		money: { minor: 42, currency: "USD" },
		tokens: { byTier: { fast: { prompt: 8000, completion: 4400 } } },
	},
	threadCount: 0,
	createdAt: new Date(Date.now() - 6 * 60_000).toISOString(),
};

// Inserted-block draft = a real code Block. Title shown inline; full Block in panel.
const INSERTED_CODE_PAYLOAD: BlockPayload = {
	kind: "code",
	lang: "ts",
	text: "const cred = await navigator.credentials.create(webauthnOpts);\nawait finishRegistration(user, cred);\nreturn { ok: true };",
};
const INSERTED_CODE_TITLE = "auth/passkey.ts";
const INSERTED_CODE_ID = blockId({
	kind: "code",
	outlinePath: "composer-draft",
	normalisedPayload: INSERTED_CODE_PAYLOAD.text,
});

// Referenced knowledge item = a real heading Block + a real paragraph Block.
const REF_HEADING_PAYLOAD: BlockPayload = {
	kind: "heading",
	level: 3,
	text: "Dual-auth window",
	inline: [{ type: "text", value: "Dual-auth window" }],
};
const REF_PARA_PAYLOAD: BlockPayload = {
	kind: "paragraph",
	inline: [
		{
			type: "text",
			value:
				"Password and passkey credentials both authenticate during phase 2, so enterprise tenants that cannot enroll passkeys keep a working login.",
		},
	],
};
const REF_HEADING_ID = blockId({
	kind: "heading",
	outlinePath: "auth-migration-plan/2",
	normalisedPayload: REF_HEADING_PAYLOAD.text,
});
const REF_PARA_ID = blockId({
	kind: "paragraph",
	outlinePath: "auth-migration-plan/2",
	normalisedPayload: "dual-auth-window-body",
});

// ── Right-page panel content descriptor ─────────────────────────────
// Each block embed opens a panel rendering the FULL block(s) via real <Block>.
type PanelKey = "inserted-code" | "ref-plan";
interface PanelSpec {
	title: string;
	kindLabel: string;
	blocks: { id: ReturnType<typeof blockId>; payload: BlockPayload }[];
}
const PANELS: Record<PanelKey, PanelSpec> = {
	"inserted-code": {
		title: "auth/passkey.ts",
		kindLabel: "Code block",
		blocks: [{ id: INSERTED_CODE_ID, payload: INSERTED_CODE_PAYLOAD }],
	},
	"ref-plan": {
		title: "Auth migration plan · §2",
		kindLabel: "Knowledge",
		blocks: [
			{ id: REF_HEADING_ID, payload: REF_HEADING_PAYLOAD },
			{ id: REF_PARA_ID, payload: REF_PARA_PAYLOAD },
		],
	},
};

// ── Fixture identities (3 participants: 2 humans + 1 agent) ─────────
const FOUNDER = { id: "u-founder", name: "A. Founder", initials: "AF", isAgent: false, isMe: true };
const MARA = { id: "u-mara", name: "Mara", initials: "MK", isAgent: false, isMe: false };
const ATLAS = { id: "a-atlas", name: "Atlas", initials: "AT", isAgent: true, isMe: false };
type Identity = typeof FOUNDER;

// ───────────────────────────────────────────────────────────────────
// Inline icon set — currentColor, no emoji-as-icon (AQ-105). 16-box.
// ───────────────────────────────────────────────────────────────────
function Glyph({ d, size = 14 }: { d: string; size?: number }): JSX.Element {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="currentColor"
			className="shrink-0"
			style={{ width: size, height: size }}
			aria-hidden="true"
		>
			<path d={d} />
		</svg>
	);
}
const ICON_ARROW = "M3 8h8.2L8 4.8 9.2 3.6 14.4 8l-5.2 4.4L8 11.2 11.2 8H3V8z";
const ICON_CHECK = "M6.5 11.5L3 8l1.2-1.2 2.3 2.3L11.8 4 13 5.2l-6.5 6.3z";
const ICON_PLUS = "M7.25 2h1.5v5.25H14v1.5H8.75V14h-1.5V8.75H2v-1.5h5.25V2z";
const ICON_SEND = "M2 8l12-6-5.2 12-1.8-4.8L2 8z";
const ICON_PAPERCLIP =
	"M11.5 3.5a2.5 2.5 0 013.5 3.5l-7 7a4 4 0 11-5.6-5.6l6.3-6.3 1 1L3.4 9.4a2.6 2.6 0 003.6 3.6l7-7a1 1 0 00-1.4-1.4L6 11.2a.5.5 0 00.7.7l5-5 1 1-5 5A2 2 0 014 10.2l6.5-6.5z";
const ICON_DOC = "M4 1h5l3 3v10a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1zm5 1.5V4h1.5L9 2.5z";
const ICON_FOLD = "M8 10.5L3.5 6l1-1L8 8.5 11.5 5l1 1L8 10.5z";
const ICON_REACT =
	"M8 1a7 7 0 100 14A7 7 0 008 1zM5.5 6a1 1 0 110 2 1 1 0 010-2zm5 0a1 1 0 110 2 1 1 0 010-2zM5 9.5h6a3 3 0 01-6 0z";
const ICON_REPLY = "M6.5 3L2 7l4.5 4V8.4c3.2 0 5.2 1 6.5 3.6.4-4.3-1.8-7.4-6.5-8V3z";
const ICON_MORE =
	"M3 6.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm5 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm5 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3z";
const ICON_REMOVE = "M4.3 3.2L8 6.9l3.7-3.7 1.1 1.1L9.1 8l3.7 3.7-1.1 1.1L8 9.1l-3.7 3.7-1.1-1.1L6.9 8 3.2 4.3l1.1-1.1z";
const ICON_QUESTION =
	"M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 4a2.4 2.4 0 012.4 2.4c0 1-.6 1.5-1.3 2-.5.35-.6.55-.6 1.1H6.9c0-1 .3-1.5 1-2 .5-.36.8-.6.8-1.1a.9.9 0 00-1.8 0H5.6A2.4 2.4 0 018 4zm-.05 7.4a.95.95 0 110-1.9.95.95 0 010 1.9z";
const ICON_FORMAT_AA =
	"M5.6 3h1.6l3.1 8H8.6l-.62-1.7H4.84L4.22 11H2.5l3.1-8zm.18 2.1L4.36 7.9h2.84L5.78 5.1zM12 6.4h1.5V11H12v-.5a1.7 1.7 0 01-1.2.6c-1 0-1.7-.7-1.7-1.6 0-.95.8-1.5 2-1.5h.9v-.15c0-.5-.3-.75-.85-.75-.42 0-.78.16-1.1.42l-.58-.95A3 3 0 0111.2 6.3c.3 0 .55.04.8.1zm-.2 2.85h-.7c-.5 0-.78.2-.78.55 0 .3.24.5.62.5.45 0 .82-.3.86-.75v-.3z";
const ICON_AT =
	"M8 1a7 7 0 100 14c1.4 0 2.7-.4 3.8-1.1l-.8-1.2A5.5 5.5 0 118 2.5 5.5 5.5 0 0113.5 8c0 1-.6 1.5-1.2 1.5S11 9 11 8V5.2H9.5V6A2.8 2.8 0 108 11a2.7 2.7 0 002-.9 2.3 2.3 0 002.3 1.4C14 11.5 15 10.1 15 8A7 7 0 008 1zm0 8.5A1.5 1.5 0 118 6.5a1.5 1.5 0 010 3z";
const ICON_EMOJI =
	"M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM5.6 6.2a.95.95 0 110 1.9.95.95 0 010-1.9zm4.8 0a.95.95 0 110 1.9.95.95 0 010-1.9zM4.9 9.4h6.2a3.2 3.2 0 01-6.2 0z";
const ICON_BLOCKS = "M2.5 2.5h11v2.2h-11V2.5zm0 3.6h11v2.2h-11V6.1zm0 3.6h7v2.2h-7V9.7z";
const ICON_K_CODE =
	"M5.2 3.4L1 8l4.2 4.6 1.1-1L3.2 8l3.1-3.6-1.1-1zm5.6 0l-1.1 1L13.8 8l-3.1 3.6 1.1 1L16 8l-4.2-4.6z";

// ───────────────────────────────────────────────────────────────────
// Avatar — human vs agent tint + a stronger agent ring.
// ───────────────────────────────────────────────────────────────────
function Avatar({ who, size = 32 }: { who: Identity; size?: number }): JSX.Element {
	const color = who.isAgent
		? "bg-[var(--accent-primary-dim)] border-[var(--accent-primary)] text-[var(--accent-primary)]"
		: "bg-[var(--surface-container)] border-[var(--border-default)] text-[var(--text-secondary)]";
	return (
		<div
			className={`inline-flex items-center justify-center rounded-full border-[1.5px] font-[600] shrink-0 ${color}`}
			style={{ width: size, height: size, fontSize: size <= 22 ? 10 : 12 }}
			aria-hidden="true"
		>
			{who.initials}
		</div>
	);
}

function ParticipantGroup({ people }: { people: Identity[] }): JSX.Element {
	return (
		<div data-ds-component="Am1AvatarGroup" className="flex items-center pl-[3px]">
			{people.map((p, i) => (
				<div
					key={p.id}
					className="rounded-full ring-2 ring-[var(--surface-page)]"
					style={{ marginLeft: i === 0 ? 0 : -9, zIndex: people.length - i }}
				>
					<Avatar who={p} size={26} />
				</div>
			))}
		</div>
	);
}

function ConversationHeader(): JSX.Element {
	return (
		<header className="shrink-0 border-b border-[var(--border-subtle)] bg-[var(--surface-page)] px-[18px] py-[12px]">
			<div className="mx-auto flex w-full max-w-[760px] items-center gap-[12px]">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-[6px] text-[12px] text-[var(--text-secondary)]">
						<span className="inline-flex items-center rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] px-[9px] py-[1px] text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--accent-primary)]">
							Bet
						</span>
						<span className="text-[var(--text-tertiary)]">·</span>
						<span className="truncate font-[500] text-[var(--text-primary)]">Passkey login</span>
					</div>
					<h1 className="mt-[3px] mb-0 text-[17px] font-[600] leading-[1.25] text-[var(--text-primary)]">
						Passkey login
					</h1>
				</div>
				<div className="flex items-center gap-[9px]">
					<ParticipantGroup people={[FOUNDER, MARA, ATLAS]} />
					<span className="text-[12px] tabular-nums text-[var(--text-tertiary)]">3</span>
				</div>
				<button
					type="button"
					aria-label="Conversation actions"
					className="flex h-[32px] w-[32px] items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-container)] hover:text-[var(--text-secondary)]"
				>
					<Glyph d={ICON_MORE} size={16} />
				</button>
			</div>
		</header>
	);
}

// ───────────────────────────────────────────────────────────────────
// MESSAGE GROUP — author-GROUPING is the structural unit.
// ───────────────────────────────────────────────────────────────────
function MessageGroup({
	who,
	time,
	children,
	hovered,
}: {
	who: Identity;
	time: string;
	children: React.ReactNode;
	hovered?: boolean;
}): JSX.Element {
	const tint = who.isAgent
		? "border-l-[2.5px] border-[var(--accent-primary)] bg-[color-mix(in_oklab,var(--accent-primary)_4%,transparent)] pl-[15px]"
		: who.isMe
			? "bg-[color-mix(in_oklab,var(--text-secondary)_3%,transparent)] pl-[18px]"
			: "pl-[18px]";
	return (
		<div
			data-ds-component="Am1MessageGroup"
			data-ds-sender={who.isAgent ? "agent" : "human"}
			className={`group/msg relative flex gap-[12px] rounded-[var(--r-default)] py-[12px] pr-[18px] ${tint}`}
		>
			<Avatar who={who} size={32} />
			<div className="min-w-0 flex-1">
				<div className="mb-[6px] flex items-baseline gap-[9px]">
					<span className="text-[13px] font-[600] text-[var(--text-primary)]">{who.name}</span>
					{who.isAgent && (
						<span className="inline-flex items-center gap-[3px] rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] px-[6px] py-[1px] text-[10px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--accent-primary)]">
							<Glyph d={ICON_CHECK} size={9} />
							Agent
						</span>
					)}
					{who.isMe && <span className="text-[11px] font-[500] text-[var(--text-tertiary)]">You</span>}
					<span className="text-[11px] tabular-nums text-[var(--text-tertiary)]">{time}</span>
				</div>
				<div className="flex flex-col gap-[12px]">{children}</div>
			</div>

			<div
				className={`absolute right-[12px] top-[6px] flex items-center gap-[3px] rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-[3px] shadow-[var(--shadow-subtle)] ${
					hovered ? "flex" : "hidden group-hover/msg:flex"
				}`}
			>
				<MsgAction d={ICON_REACT} label="React" />
				<MsgAction d={ICON_REPLY} label="Reply" />
				<MsgAction d={ICON_MORE} label="More" />
			</div>
		</div>
	);
}

function MsgAction({ d, label }: { d: string; label: string }): JSX.Element {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			className="flex h-[26px] w-[26px] items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-container)] hover:text-[var(--text-secondary)]"
		>
			<Glyph d={d} size={14} />
		</button>
	);
}

function Prose({ children }: { children: React.ReactNode }): JSX.Element {
	return <p className="m-0 text-[15px] leading-[1.55] text-[var(--text-primary)]">{children}</p>;
}

function Mention({ name }: { name: string }): JSX.Element {
	return (
		<span className="rounded-[var(--r-subtle)] bg-[var(--accent-primary-dim)] px-[3px] font-[500] text-[var(--accent-primary)]">
			@{name}
		</span>
	);
}

function ReplyReference({ author, snippet }: { author: string; snippet: string }): JSX.Element {
	return (
		<div className="mb-[6px] flex items-start gap-[6px] border-l-[2px] border-[var(--border-default)] pl-[9px]">
			<span className="mt-[2px] text-[var(--text-tertiary)]">
				<Glyph d={ICON_REPLY} size={11} />
			</span>
			<div className="min-w-0 text-[12px] leading-[1.4]">
				<span className="font-[500] text-[var(--text-secondary)]">{author}</span>{" "}
				<span className="truncate text-[var(--text-tertiary)]">{snippet}</span>
			</div>
		</div>
	);
}

function Reactions(): JSX.Element {
	return (
		<div className="mt-[3px] flex items-center gap-[6px]">
			<button
				type="button"
				className="inline-flex items-center gap-[3px] rounded-[var(--r-pill)] border border-[var(--accent-primary)] bg-[var(--accent-primary-dim)] px-[9px] py-[1px] text-[12px] text-[var(--accent-primary)]"
				aria-label="2 reactions, you reacted"
			>
				<Glyph d={ICON_CHECK} size={11} />
				<span className="tabular-nums">2</span>
			</button>
			<button
				type="button"
				aria-label="Add reaction"
				className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-[var(--r-pill)] border border-[var(--border-subtle)] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-default)] hover:text-[var(--text-secondary)]"
			>
				<Glyph d={ICON_REACT} size={12} />
			</button>
		</div>
	);
}

function Fold({ label }: { label: string }): JSX.Element {
	return (
		<div>
			<span className="inline-flex items-center gap-[6px] text-[12px] font-[500] text-[var(--text-tertiary)]">
				<span style={{ transform: "rotate(-90deg)", display: "inline-flex" }}>
					<Glyph d={ICON_FOLD} size={12} />
				</span>
				<span>{label}</span>
				<span className="text-[var(--text-tertiary)]">·</span>
				<span className="text-[var(--accent-primary)]">Show</span>
			</span>
		</div>
	);
}

// ── Generic Embed hook (session ref) ────────────────────────────────
function Embed({
	label,
	onOpen,
	children,
}: {
	label: string;
	onOpen?: () => void;
	children: React.ReactNode;
}): JSX.Element {
	return (
		<button
			type="button"
			aria-label={label}
			onClick={onOpen}
			data-ds-component="Am1Embed"
			className="group/embed mt-[3px] block w-full rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-[12px] py-[9px] text-left transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-default)] hover:bg-[var(--surface-container)]"
		>
			<div className="flex items-center gap-[12px]">
				<div className="min-w-0 flex-1">{children}</div>
				<span className="inline-flex shrink-0 items-center gap-[3px] text-[11px] font-[500] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] group-hover/embed:text-[var(--accent-primary)]">
					Open
					<Glyph d={ICON_ARROW} size={12} />
				</span>
			</div>
		</button>
	);
}

function EmbedKindLabel({ label }: { label: string }): JSX.Element {
	return (
		<div className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
			{label}
		</div>
	);
}

// ── Change-set embed = the REAL ArtifactEmbed. The message owns the card chrome.
//    onOpen is the hook into AL's review slider (noop in this surface).
function ChangeSetEmbedCard(): JSX.Element {
	return (
		<div
			data-ds-component="Am1ArtifactEmbedCard"
			className="mt-[3px] rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-[12px] py-[9px] transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-default)]"
		>
			<ArtifactEmbed data={CHANGE_SET_ARTIFACT} onOpen={() => undefined} />
		</div>
	);
}

// ── Block embed = a COMPACT card showing the block's TITLE ONLY (never the first
//    line of code). "Open →" opens the right page rendering the FULL block via
//    the real <Block> viewer. Founder: inline = title; right page = real Block.
function BlockTitleEmbed({
	kindIcon,
	kindLabel,
	title,
	onOpen,
}: {
	kindIcon: string;
	kindLabel: string;
	title: string;
	onOpen: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={onOpen}
			aria-label={`Open ${title}`}
			data-ds-component="Am1BlockTitleEmbed"
			className="group/blk mt-[3px] flex w-full items-center gap-[9px] rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-[12px] py-[9px] text-left transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-default)] hover:bg-[var(--surface-container)]"
		>
			<span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] bg-[var(--surface-container)] text-[var(--text-tertiary)] group-hover/blk:bg-[var(--surface-elevated)]">
				<Glyph d={kindIcon} size={13} />
			</span>
			<span className="min-w-0 flex-1 leading-[1.25]">
				<span className="block text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
					{kindLabel}
				</span>
				<span className="block truncate text-[13px] font-[500] text-[var(--text-primary)]">{title}</span>
			</span>
			<span className="inline-flex shrink-0 items-center gap-[3px] text-[11px] font-[500] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] group-hover/blk:text-[var(--accent-primary)]">
				Open
				<Glyph d={ICON_ARROW} size={12} />
			</span>
		</button>
	);
}

function SessionRefEmbedBody(): JSX.Element {
	return (
		<div>
			<EmbedKindLabel label="Session" />
			<div className="mt-[3px] truncate text-[13px] text-[var(--text-secondary)]">
				<span className="font-[500] text-[var(--text-primary)]">Atlas</span> · Opus 4.8 ·{" "}
				<span className="tabular-nums">1m 12s</span> ·{" "}
				<span className="tabular-nums">14 tool calls</span> · Dial in
			</div>
		</div>
	);
}

function CitationChips(): JSX.Element {
	return (
		<div className="mt-[3px] flex flex-wrap items-center gap-[6px]">
			<span className="text-[11px] text-[var(--text-tertiary)]">Sources</span>
			{["WebAuthn L3 spec", "RFC 9380", "internal/auth-RFC"].map((c, i) => (
				<button
					key={c}
					type="button"
					className="inline-flex items-center gap-[3px] rounded-[var(--r-pill)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-[9px] py-[1px] text-[12px] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-default)]"
				>
					<span className="tabular-nums text-[var(--text-tertiary)]">{i + 1}</span>
					<span className="max-w-[140px] truncate">{c}</span>
				</button>
			))}
		</div>
	);
}

function AttachmentChip({ name, meta }: { name: string; meta: string }): JSX.Element {
	return (
		<div className="mt-[3px] inline-flex items-center gap-[9px] rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-[9px] py-[6px]">
			<span className="flex h-[28px] w-[28px] items-center justify-center rounded-[var(--r-subtle)] bg-[var(--surface-container)] text-[var(--text-tertiary)]">
				<Glyph d={ICON_DOC} size={15} />
			</span>
			<div className="min-w-0">
				<div className="truncate text-[13px] font-[500] text-[var(--text-primary)]">{name}</div>
				<div className="text-[11px] text-[var(--text-tertiary)]">{meta}</div>
			</div>
		</div>
	);
}

// ───────────────────────────────────────────────────────────────────
// QUESTIONNAIRE — agent "quick ask". A SURVEY: answer options read as
// EVEN / NEUTRAL choices (founder: "this is a survey which shouldn't be so
// overly biased"). No "very very green" filled chip. All options are identical
// quiet outlined chips; the recommendation is hinted by a tiny neutral
// "recommended" tag only. Prominence comes from LAYERING (elevated surface +
// shadow) + the pill — NEVER from an accent-colored structural border, NEVER
// from biasing one answer. Padding on ALL sides from the Hearth grid
// {3,6,9,12,18,24,...} — px-[18px] py-[12px], no off-grid 15px.
// ───────────────────────────────────────────────────────────────────
function QuestionnairePart(): JSX.Element {
	const options = [
		{ label: "Keep through phase 2", recommended: true },
		{ label: "Drop now", recommended: false },
		{ label: "Decide later", recommended: false },
	];
	return (
		<div
			data-ds-component="Am1QuestionnairePart"
			className="rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-[18px] py-[12px] shadow-[var(--shadow-default)]"
		>
			<div className="mb-[9px] inline-flex items-center gap-[6px] rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] px-[9px] py-[1px] text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--accent-primary)]">
				<Glyph d={ICON_QUESTION} size={11} />
				Quick ask · needs your answer
			</div>
			<p className="m-0 text-[15px] font-[600] leading-[1.4] text-[var(--text-primary)]">
				How long should the password fallback stay enabled?
			</p>
			<div className="mt-[12px] flex flex-wrap items-center gap-[6px]">
				{options.map((o) => (
					<button
						key={o.label}
						type="button"
						// Neutral, even survey options — identical quiet outlined chips. No
						// accent fill on any one option (de-biased per founder). The
						// recommendation is hinted by a small neutral tag only.
						className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] border border-[var(--border-default)] bg-[var(--surface-elevated)] px-[12px] py-[6px] text-[13px] font-[500] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-container)] hover:text-[var(--text-primary)]"
					>
						{o.label}
						{o.recommended && (
							<span className="rounded-[var(--r-pill)] bg-[var(--surface-container)] px-[6px] py-[1px] text-[10px] font-[500] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
								Recommended
							</span>
						)}
					</button>
				))}
			</div>
		</div>
	);
}

// ───────────────────────────────────────────────────────────────────
// REVIEW message — COMPACT hook into AL's review experience.
// ───────────────────────────────────────────────────────────────────
function ReviewPart(): JSX.Element {
	return (
		<div
			data-ds-component="Am1ReviewPart"
			className="flex flex-col gap-[12px] rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-[15px] shadow-[var(--shadow-subtle)]"
		>
			<div className="flex flex-col gap-[3px]">
				<div className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
					Review · needs your decision
				</div>
				<p className="m-0 text-[15px] font-[600] leading-[1.4] text-[var(--text-primary)]">
					Approve deploy of passkey login to staging
				</p>
			</div>
			<ChangeSetEmbedCard />
			<button
				type="button"
				className="inline-flex w-fit items-center gap-[6px] rounded-[var(--r-subtle)] bg-[var(--accent-primary)] px-[12px] py-[7px] text-[13px] font-[600] text-[var(--text-on-accent)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--accent-primary-hover)]"
			>
				Open review
				<Glyph d={ICON_ARROW} size={12} />
			</button>
		</div>
	);
}

function VerdictEcho(): JSX.Element {
	return (
		<div className="flex items-baseline gap-[6px] text-[15px] leading-[1.55] text-[var(--text-primary)]">
			<span className="self-center text-[var(--status-success)]">
				<Glyph d={ICON_CHECK} size={14} />
			</span>
			<span>
				<span className="font-[600]">Approved.</span> Ship to staging — re-review before prod.
			</span>
		</div>
	);
}

// ───────────────────────────────────────────────────────────────────
// COMPOSER — UNIFIED tool affordance. ONE "+" button opens ONE menu with
// every compose action (Insert block · Attach · Mention · Reference · Format ·
// Emoji), each labeled + single-purpose. No duplicate icon strip. Founder:
// "what's the difference between insert and those other icons. and why is the
// insert there and not where the other icons are" — resolved: one place.
// ───────────────────────────────────────────────────────────────────

// The unified Insert menu — a GROUNDED POPOVER anchored to the "+" button (its
// relative parent), opening UPWARD off the button so it reads as belonging to it
// and never floats detached or grows the composer box. Opaque --surface-overlay
// + --shadow-elevated keep it solid over content (founder: "floating completely
// out of place in transparent. pretty wrong").
function InsertMenu({ onPick }: { onPick: () => void }): JSX.Element {
	const items = [
		{ d: ICON_BLOCKS, label: "Insert block", hint: "heading · list · code · table", key: true },
		{ d: ICON_PAPERCLIP, label: "Attach file", hint: "image, document", key: false },
		{ d: ICON_AT, label: "Mention", hint: "@person, @agent", key: false },
		{ d: ICON_DOC, label: "Reference item", hint: "knowledge, artifact", key: false },
		{ d: ICON_FORMAT_AA, label: "Format", hint: "bold, italic, code", key: false },
		{ d: ICON_EMOJI, label: "Emoji", hint: "react in body", key: false },
	];
	return (
		<div
			data-ds-component="Am1InsertMenu"
			role="menu"
			aria-label="Insert"
			// Grounded popover: anchored to the "+" (relative parent), opening upward.
			// Background + z-index forced via inline style — the arbitrary-value
			// `bg-[var(--surface-overlay)]`/`z-30` Tailwind classes did NOT resolve in
			// the viewer JIT, leaving the menu TRANSPARENT and below content (founder:
			// "floating completely out of place in transparent. pretty wrong"). Inline
			// style guarantees a SOLID surface above conversation content, every render.
			style={{
				bottom: "calc(100% + 6px)",
				left: 0,
				background: "var(--surface-overlay)",
				zIndex: 50,
			}}
			className="absolute w-[238px] rounded-[var(--r-default)] border border-[var(--border-default)] p-[3px] shadow-[var(--shadow-elevated)]"
		>
			{items.map((it) => (
				<button
					key={it.label}
					type="button"
					role="menuitem"
					onClick={onPick}
					className={`flex w-full items-center gap-[9px] rounded-[var(--r-subtle)] px-[9px] py-[6px] text-left transition-colors duration-[var(--motion-fast)] ${
						it.key ? "bg-[var(--accent-primary-dim)]" : "hover:bg-[var(--surface-container)]"
					}`}
				>
					<span
						className={`flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] ${
							it.key
								? "bg-[var(--accent-primary)] text-[var(--text-on-accent)]"
								: "bg-[var(--surface-container)] text-[var(--text-tertiary)]"
						}`}
					>
						<Glyph d={it.d} size={13} />
					</span>
					<span className="min-w-0 leading-[1.2]">
						<span
							className={`block text-[13px] font-[600] ${it.key ? "text-[var(--accent-primary)]" : "text-[var(--text-primary)]"}`}
						>
							{it.label}
						</span>
						<span className="block truncate text-[11px] text-[var(--text-tertiary)]">{it.hint}</span>
					</span>
				</button>
			))}
		</div>
	);
}

// ───────────────────────────────────────────────────────────────────
// DRAFT ATTACHMENT CHIP — ONE compact style for EVERY draft attachment
// (inserted code block, image, document — all the same chip). Founder: "why
// does the code block attachment have a different style than the image? …This
// [image] style looks better, it takes less space." Interaction (founder): the
// chip BODY = open it (right panel / preview); the trailing ✕ = remove it from
// the draft — two distinct hit targets. Chips lay out HORIZONTALLY in a wrapping
// row so the attachments area stays ~one chip tall (founder: "the attachments
// section should be the smaller part… typically just the height of a single
// attachment like the png").
// ───────────────────────────────────────────────────────────────────
function DraftAttachmentChip({
	icon,
	label,
	meta,
	onOpen,
}: {
	icon: string;
	label: string;
	meta: string;
	onOpen?: () => void;
}): JSX.Element {
	return (
		<span
			data-ds-component="Am1DraftAttachmentChip"
			className="group/chip inline-flex max-w-[260px] items-center gap-[6px] rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-container)] py-[3px] pl-[6px] pr-[3px] text-[12px] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-default)]"
		>
			{/* Chip body = OPEN. A button so click/keyboard activate the open action. */}
			<button
				type="button"
				onClick={onOpen}
				aria-label={`Open ${label}`}
				title={`Open ${label}`}
				className="flex min-w-0 items-center gap-[6px] text-left"
			>
				<span className="flex shrink-0 items-center text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] group-hover/chip:text-[var(--text-secondary)]">
					<Glyph d={icon} size={13} />
				</span>
				<span className="truncate font-[500] text-[var(--text-primary)]">{label}</span>
				<span className="shrink-0 tabular-nums text-[var(--text-tertiary)]">{meta}</span>
			</button>
			{/* Trailing ✕ = REMOVE — a separate, distinct hit target. */}
			<button
				type="button"
				aria-label={`Remove ${label}`}
				title="Remove"
				className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-secondary)]"
			>
				<Glyph d={ICON_REMOVE} size={11} />
			</button>
		</span>
	);
}

function ComposerReplyBanner(): JSX.Element {
	return (
		<div className="flex items-center gap-[9px] border-b border-[var(--border-subtle)] px-[12px] py-[6px]">
			<span className="flex shrink-0 items-center text-[var(--accent-primary)]">
				<Glyph d={ICON_REPLY} size={12} />
			</span>
			<div className="flex min-w-0 flex-1 items-baseline gap-[6px] border-l-[2px] border-[var(--accent-primary)] pl-[9px] text-[12px] leading-[1.4]">
				<span className="shrink-0 text-[var(--text-secondary)]">
					Replying to <span className="font-[600] text-[var(--text-primary)]">Atlas</span>
				</span>
				<span className="truncate text-[var(--text-tertiary)]">
					“Added WebAuthn registration and the dual-auth window…”
				</span>
			</div>
			<button
				type="button"
				aria-label="Cancel reply"
				title="Cancel reply"
				className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-container)] hover:text-[var(--text-secondary)]"
			>
				<Glyph d={ICON_REMOVE} size={11} />
			</button>
		</div>
	);
}

// Active-state draft body: ALL attachments — the inserted code block AND the
// image — render as ONE chip style in a single HORIZONTAL wrapping row, so the
// area is ~one chip tall. Each chip: body = open, ✕ = remove.
function ComposerDraftBody({ onOpenBlock }: { onOpenBlock: () => void }): JSX.Element {
	return (
		<div
			data-ds-component="Am1ComposerDraftBody"
			className="flex flex-wrap items-center gap-[6px] px-[12px] pt-[9px]"
		>
			<DraftAttachmentChip
				icon={ICON_K_CODE}
				label={INSERTED_CODE_TITLE}
				meta="TS · 3 lines"
				onOpen={onOpenBlock}
			/>
			<DraftAttachmentChip icon={ICON_DOC} label="auth-flow.png" meta="82 KB" />
		</div>
	);
}

// The composer input row. The SINGLE "+" affordance opens the unified Insert
// menu. No second icon strip — every action lives in the menu. No bottom footer
// (founder: "this bottom footer of the box serves no value it just takes away
// space") — that reclaimed space goes to a TALLER textarea (founder: "gives
// space for this one to become a bit taller").
function ComposerInputRow({
	insertMenuOpen,
	onToggleMenu,
	onPickMenu,
	hasDraft,
	menuButtonRef,
}: {
	insertMenuOpen: boolean;
	onToggleMenu: () => void;
	onPickMenu: () => void;
	hasDraft: boolean;
	menuButtonRef: React.RefObject<HTMLButtonElement | null>;
}): JSX.Element {
	return (
		<div className="flex items-end gap-[9px] px-[12px] py-[9px]">
			{/* The "+" is the popover's relative anchor — the menu opens upward off
			    it and reads as belonging to it, never detached. */}
			<div className="relative shrink-0">
				{insertMenuOpen && <InsertMenu onPick={onPickMenu} />}
				<button
					ref={menuButtonRef}
					type="button"
					aria-label="Insert"
					aria-expanded={insertMenuOpen}
					aria-haspopup="menu"
					title="Insert block, attach, mention, reference, format"
					onClick={onToggleMenu}
					className={
						insertMenuOpen
							? "flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] border border-[var(--accent-primary)] bg-[var(--accent-primary-dim)] text-[var(--accent-primary)]"
							: "flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] border border-[var(--border-default)] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
					}
				>
					<Glyph d={ICON_PLUS} size={14} />
				</button>
			</div>
			{/* Taller input — the reclaimed footer space goes here. */}
			<textarea
				rows={3}
				placeholder="Message Atlas, Mara…"
				className="min-h-[72px] flex-1 resize-none border-none bg-transparent py-[3px] text-[15px] leading-[1.5] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-placeholder)]"
				defaultValue={
					hasDraft ? "Here's the corrected registration flow — one nit on the error copy: " : ""
				}
			/>
			<button
				type="button"
				aria-label="Send message"
				// hearth-internal-padding
				className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] bg-[var(--accent-primary)] text-[var(--text-on-accent)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--accent-primary-hover)]"
			>
				<Glyph d={ICON_SEND} size={15} />
			</button>
		</div>
	);
}

function Composer({
	active,
	insertMenuOpen,
	onToggleMenu,
	onPickMenu,
	onOpenBlock,
	menuButtonRef,
}: {
	active: boolean;
	insertMenuOpen: boolean;
	onToggleMenu: () => void;
	onPickMenu: () => void;
	onOpenBlock: () => void;
	menuButtonRef: React.RefObject<HTMLButtonElement | null>;
}): JSX.Element {
	return (
		<div className="shrink-0 bg-[var(--surface-page)] px-[18px] pb-[18px] pt-[9px]">
			<div className="mx-auto w-full max-w-[760px]">
				<div className="relative rounded-[var(--r-default)] border border-[var(--border-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)] transition-shadow duration-[var(--motion-fast)] focus-within:shadow-[var(--shadow-default)]">
					{/* Reply banner is CONDITIONAL — present ONLY when replying to a
					    message (founder: "I assume this header disappears if you are not
					    replying to something?" — yes). The active Insert-Block state IS the
					    replying state; resting composer has no banner. */}
					{active && <ComposerReplyBanner />}
					{active && <ComposerDraftBody onOpenBlock={onOpenBlock} />}
					<ComposerInputRow
						insertMenuOpen={insertMenuOpen}
						onToggleMenu={onToggleMenu}
						onPickMenu={onPickMenu}
						hasDraft={active}
						menuButtonRef={menuButtonRef}
					/>
				</div>
			</div>
		</div>
	);
}

// ───────────────────────────────────────────────────────────────────
// RIGHT-PAGE PANEL — slides in when a block embed's "Open →" is clicked.
// Renders the FULL block(s) through the REAL <Block> viewer (the same
// component Knowledge uses). Founder: "open the right page and display the full
// block in the proper block viewer component that we already have."
// ───────────────────────────────────────────────────────────────────
function BlockRightPanel({ panel, onClose }: { panel: PanelKey; onClose: () => void }): JSX.Element {
	const spec = PANELS[panel];
	return (
		<aside
			data-ds-component="Am1BlockRightPanel"
			className="flex h-full w-[420px] shrink-0 flex-col border-l border-[var(--border-default)] bg-[var(--surface-container)]"
		>
			<header className="flex shrink-0 items-center gap-[9px] border-b border-[var(--border-subtle)] px-[18px] py-[12px]">
				<div className="min-w-0 flex-1">
					<div className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
						{spec.kindLabel}
					</div>
					<div className="mt-[3px] truncate text-[15px] font-[600] text-[var(--text-primary)]">
						{spec.title}
					</div>
				</div>
				<button
					type="button"
					aria-label="Close block panel"
					title="Close"
					onClick={onClose}
					className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-secondary)]"
				>
					<Glyph d={ICON_REMOVE} size={14} />
				</button>
			</header>
			{/* The FULL block render — the REAL <Block> viewer, nothing clamped. */}
			<div className="flex-1 overflow-y-auto px-[18px] py-[12px]">
				<div className="rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-[12px] py-[6px]">
					{spec.blocks.map((b) => (
						<Block key={b.id} id={b.id} payload={b.payload} />
					))}
				</div>
			</div>
		</aside>
	);
}

// ───────────────────────────────────────────────────────────────────
// CONVERSATION BODY — the 8 author-grouped messages.
// ───────────────────────────────────────────────────────────────────
function ConversationBody({
	scroll,
	onOpenBlock,
}: {
	scroll: boolean;
	onOpenBlock: (panel: PanelKey) => void;
}): JSX.Element {
	return (
		<div
			className="px-[18px] py-[12px]"
			style={scroll ? { flex: 1, minHeight: 0, overflowY: "auto" } : undefined}
		>
			<div className="mx-auto flex w-full max-w-[760px] flex-col gap-[18px]">
				{/* 1 · Founder ask */}
				<MessageGroup who={FOUNDER} time="9:02">
					<Prose>Can you wire passkey login and show me the diff before we deploy?</Prose>
				</MessageGroup>

				{/* 2 · Mara teammate — @mention + reaction */}
				<MessageGroup who={MARA} time="9:05">
					<div>
						<Prose>
							<Mention name="Atlas" /> please keep the password fallback for phase 2 — some of our
							enterprise tenants can't enroll passkeys yet.
						</Prose>
						<Reactions />
					</div>
				</MessageGroup>

				{/* 3 · Atlas agent summary — work-Fold + change-set embed + citations */}
				<MessageGroup who={ATLAS} time="9:11">
					<div>
						<Prose>
							Added WebAuthn registration and the dual-auth window. Existing password sessions stay
							valid through phase 2, <Mention name="Mara" /> — fallback preserved.
						</Prose>
						<div className="mt-[6px]">
							<Fold label="Worked for 1m 12s" />
						</div>
						<ChangeSetEmbedCard />
						<CitationChips />
					</div>
				</MessageGroup>

				{/* 4 · Atlas (consecutive): block ref (title only) + attachment + session */}
				<MessageGroup who={ATLAS} time="9:12">
					<div className="flex flex-col gap-[12px]">
						<div>
							<Prose>Context for the dual-auth window and the flow diagram:</Prose>
							<BlockTitleEmbed
								kindIcon={ICON_BLOCKS}
								kindLabel="Knowledge"
								title="Auth migration plan · §2"
								onOpen={() => onOpenBlock("ref-plan")}
							/>
							<AttachmentChip name="auth-flow.png" meta="PNG · 82 KB" />
						</div>
						<div>
							<Prose>This all came out of my work session:</Prose>
							<Embed label="Open the session dial-in">
								<SessionRefEmbedBody />
							</Embed>
						</div>
					</div>
				</MessageGroup>

				{/* 5 · Atlas QUESTIONNAIRE */}
				<MessageGroup who={ATLAS} time="9:13">
					<QuestionnairePart />
				</MessageGroup>

				{/* 6 · Founder reply — references the specific parent message */}
				<MessageGroup who={FOUNDER} time="9:14">
					<div>
						<ReplyReference
							author="Atlas"
							snippet="How long should the password fallback stay enabled?"
						/>
						<Prose>Keep it through phase 2 — that covers the enterprise tenants Mara flagged.</Prose>
					</div>
				</MessageGroup>

				{/* 7 · Atlas review message → compact hook into AL's review experience */}
				<MessageGroup who={ATLAS} time="9:15" hovered>
					<ReviewPart />
				</MessageGroup>

				{/* 8 · Founder verdict echo */}
				<MessageGroup who={FOUNDER} time="9:16">
					<VerdictEcho />
				</MessageGroup>
			</div>
		</div>
	);
}

// ───────────────────────────────────────────────────────────────────
// The conversation surface — INTERACTIVE.
//   scroll          — fixed-height internal scroll vs natural height.
//   composerActive  — composer in its Insert-Block state (draft present).
// Real state: the Insert "+" menu (open/close, outside-click) + the right-page
// block panel (which block, open/close). Click to drive it in the viewer.
// ───────────────────────────────────────────────────────────────────
export default function Am1ConversationSurface({
	scroll = false,
	composerActive = false,
}: {
	scroll?: boolean;
	composerActive?: boolean;
} = {}): JSX.Element {
	const [insertMenuOpen, setInsertMenuOpen] = useState(false);
	const [openPanel, setOpenPanel] = useState<PanelKey | null>(null);
	const menuButtonRef = useRef<HTMLButtonElement | null>(null);

	// Outside-click / Escape closes the Insert menu (real popover behavior).
	useEffect(() => {
		if (!insertMenuOpen) return;
		const onDown = (e: MouseEvent): void => {
			const menu = document.querySelector("[data-ds-component='Am1InsertMenu']");
			const target = e.target as Node;
			if (menu?.contains(target)) return;
			if (menuButtonRef.current?.contains(target)) return;
			setInsertMenuOpen(false);
		};
		const onKey = (e: KeyboardEvent): void => {
			if (e.key === "Escape") setInsertMenuOpen(false);
		};
		document.addEventListener("mousedown", onDown);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [insertMenuOpen]);

	return (
		<div
			data-ds-component="Am1ConversationSurface"
			data-ds-thread-id="c-passkey"
			className="w-full bg-[var(--surface-page)] text-[var(--text-primary)]"
			style={{
				display: "flex",
				...(scroll ? { height: "100%", overflow: "hidden" } : {}),
				fontFamily: "var(--font-sans)",
			}}
		>
			<main
				className="flex flex-col bg-[var(--surface-page)]"
				style={{ flex: 1, minWidth: 0, ...(scroll ? { height: "100%" } : {}) }}
			>
				<ConversationHeader />
				<ConversationBody scroll={scroll} onOpenBlock={(p) => setOpenPanel(p)} />
				<Composer
					active={composerActive}
					insertMenuOpen={insertMenuOpen}
					onToggleMenu={() => setInsertMenuOpen((v) => !v)}
					onPickMenu={() => {
						// Picking "Insert block" opens the same right-page block viewer the
						// inline embeds open — proving the menu action is live, not dead.
						setInsertMenuOpen(false);
						setOpenPanel("inserted-code");
					}}
					onOpenBlock={() => setOpenPanel("inserted-code")}
					menuButtonRef={menuButtonRef}
				/>
			</main>
			{openPanel && <BlockRightPanel panel={openPanel} onClose={() => setOpenPanel(null)} />}
		</div>
	);
}
