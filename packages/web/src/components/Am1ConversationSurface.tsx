/**
 * AM1 — Conversation Experience, v3: the FULL-SCOPE conversation embodied in the
 * REAL app container, INTERACTIVE.
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
 * ── THE CONVERSATION OWNS NO VIEWING SURFACE (round-8, founder) ──────────────
 * The conversation does NOT render a bespoke block/artifact viewer. The earlier
 * right-page panel (a white box around a `<Block>` render) is REMOVED — founder:
 * "why is there a white box around this… do we not have standardized artifact
 * views yet?" / "is this a block? why does this not open the knowledge view?".
 * The reference chips are NAVIGATION HOOKS into the existing, OWNED surfaces:
 *   • a BLOCK chip  → the KNOWLEDGE view (`/knowledge/:knowledgeId`,
 *     pages/KnowledgeDetail.tsx), anchored to the block.
 *   • an ARTIFACT chip → the ARTIFACT view (`/artifacts/:id`,
 *     pages/ArtifactPermalink.tsx → shell/ArtifactView.tsx).
 *   • the REVIEW "Open review" → the REVIEW page
 *     (`/work/bet/:betId/review/:reviewId`, pages/review/ReviewPage.tsx →
 *     ReviewComposition).
 * Nothing renders inline. (Standardizing artifact views across knowledge/work/
 * review is a fragmented cross-cutting concern — OUT of AM1 scope.)
 *
 * The INLINE block reference shows the block's TITLE only (e.g.
 * "Auth migration plan · §2") — never the first line of code. Opening it routes
 * to the Knowledge view.
 *
 * @lore AM1-r5: the conversation chrome (header, groups, composer) is still
 * hand-rolled so the story renders stand-alone in the viewer without AppShell's
 * router/context. The builder maps each region to the real DS components per
 * spec.md §Composition.
 *
 * @lore AM1-r8: the conversation owns NO viewing surface. Reference chips route
 * to the existing owned surfaces (Knowledge view / Artifact view / Review page).
 * In this isolated story the route handlers are clearly-labeled console noops
 * (no router); production wires them to the real navigate() calls.
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

import { type JSX, useEffect, useRef, useState } from "react";

// ── Real destinations the chips route into (production routes) ───────
// The conversation owns NO viewing surface; each chip is a navigation HOOK.
const ROUTE_KNOWLEDGE = "/knowledge/:knowledgeId"; // pages/KnowledgeDetail.tsx (the Knowledge view)
const ROUTE_ARTIFACT = "/artifacts/:id"; // pages/ArtifactPermalink.tsx → shell/ArtifactView.tsx
const ROUTE_REVIEW = "/work/bet/:betId/review/:reviewId"; // pages/review/ReviewPage.tsx → ReviewComposition

const INSERTED_CODE_TITLE = "auth/passkey.ts";

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
const ICON_IMAGE =
	"M2.5 2.5h11a1 1 0 011 1v9a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9a1 1 0 011-1zm0 1.5v6.1l3-3 2.2 2.2L11 5.3l3 3V4H2.5zM5.3 5a1.1 1.1 0 110 2.2 1.1 1.1 0 010-2.2z";
const ICON_KNOWLEDGE =
	"M3 1.5h7l3 3v9.5a.5.5 0 01-.5.5H3a.5.5 0 01-.5-.5v-12a.5.5 0 01.5-.5zm6.5 1.2V4.5h1.8L9.5 2.7zM4.5 6.3h7v1.2h-7V6.3zm0 2.6h7v1.2h-7V8.9zm0 2.6h4.6v1.2H4.5v-1.2z";
// Tiny agent spark — a quiet secondary cue next to an agent's name (the green
// avatar is the primary marker). Four-point sparkle + small dot.
const ICON_AGENT =
	"M8 1.5l1.1 3.4L12.5 6 9.1 7.1 8 10.5 6.9 7.1 3.5 6l3.4-1.1L8 1.5zM12.5 10.5l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5z";

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
	// Identity model (round-7, founder): own messages = subtle light bg; agent =
	// green avatar ONLY (no box/tint/accent-rule — "the green avatar is enough");
	// other humans = plain. Clean and quiet — no accent-colored structural border.
	const tint = who.isMe
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
					{/* Agent is marked by the green avatar alone (round-7, founder: "the
					    green avatar is enough"). A tiny neutral glyph after the name is the
					    only secondary cue — no green pill, no box. */}
					{who.isAgent && (
						<span
							aria-label="Agent"
							title="Agent"
							className="flex items-center text-[var(--text-tertiary)]"
						>
							<Glyph d={ICON_AGENT} size={11} />
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

// Subtle fold dial-in (round-7, founder: the work-fold is "more subtle and the
// better one" — unify session dial-in to this style). A quiet collapsed line:
// rotated chevron · label · "Show <cta>". No card, no border, no heavy chrome.
// Used for both the work-fold ("Worked for 1m 12s · Show") AND the session
// dial-in ("› Show session"). `onShow` makes it live (the session fold opens the
// session dial-in; the work-fold expands the trace).
function Fold({
	label,
	cta = "Show",
	onShow,
}: {
	label?: string;
	cta?: string;
	onShow?: () => void;
}): JSX.Element {
	return (
		<div>
			<button
				type="button"
				onClick={onShow}
				data-ds-component="Am1Fold"
				className="inline-flex items-center gap-[6px] text-[12px] font-[500] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] hover:text-[var(--text-secondary)]"
			>
				<span style={{ transform: "rotate(-90deg)", display: "inline-flex" }}>
					<Glyph d={ICON_FOLD} size={12} />
				</span>
				{label && (
					<>
						<span>{label}</span>
						<span className="text-[var(--text-tertiary)]">·</span>
					</>
				)}
				<span className="text-[var(--accent-primary)]">{cta}</span>
			</button>
		</div>
	);
}

// ───────────────────────────────────────────────────────────────────
// ONE SHARED reference chip — used for EVERY attachment / reference,
// EVERYWHERE: composer draft, in-message image, in-message block, the
// knowledge sources (a source IS a knowledge-doc reference), and the
// change-set (an artifact/code reference that opens the review). Founder:
// "there should be a SHARED attachment/artifact component… same look
// everywhere." Two modes: `draft` (body=open, trailing ✕=remove) and
// `posted` (whole chip=open, no ✕). Compact (image-chip size), on-grid
// padding (pl-[9px], even hit area — fixes "icons too close to the edges").
//
// @lore AM1-r6: this is the design embodiment of ONE component the builder
// should PROMOTE to the design system (`ReferenceChip`) — kinds {artifact,
// image, knowledge, block}, modes {draft, posted}. It replaces the five
// divergent chips/cards (DraftAttachmentChip, AttachmentChip,
// BlockTitleEmbed, CitationChips, ChangeSetEmbedCard) that drifted apart.
// ───────────────────────────────────────────────────────────────────
type RefChipKind = "artifact" | "image" | "knowledge" | "block";
const REF_CHIP_ICON: Record<RefChipKind, string> = {
	artifact: ICON_K_CODE,
	image: ICON_IMAGE,
	knowledge: ICON_KNOWLEDGE,
	block: ICON_BLOCKS,
};

function ReferenceChip({
	kind,
	label,
	meta,
	mode,
	onOpen,
	onRemove,
}: {
	kind: RefChipKind;
	label: string;
	meta?: string;
	mode: "draft" | "posted";
	onOpen?: () => void;
	onRemove?: () => void;
}): JSX.Element {
	const icon = REF_CHIP_ICON[kind];
	// Same outer shell in BOTH modes — identical look. Only the trailing slot
	// differs (✕ in draft, → affordance in posted).
	const shell =
		"group/refchip inline-flex max-w-[260px] items-center gap-[6px] rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-container)] py-[3px] pl-[9px] pr-[3px] text-[12px] transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-default)]";
	const openBody = (
		<>
			<span className="flex shrink-0 items-center text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] group-hover/refchip:text-[var(--text-secondary)]">
				<Glyph d={icon} size={13} />
			</span>
			<span className="truncate font-[500] text-[var(--text-primary)]">{label}</span>
			{meta && <span className="shrink-0 tabular-nums text-[var(--text-tertiary)]">{meta}</span>}
		</>
	);

	if (mode === "posted") {
		// Whole chip = open; no remove. A trailing → reveals on hover.
		return (
			<button
				type="button"
				onClick={onOpen}
				aria-label={`Open ${label}`}
				title={`Open ${label}`}
				data-ds-component="Am1ReferenceChip"
				data-ds-mode="posted"
				data-ds-kind={kind}
				className={`${shell} pr-[9px] text-left`}
			>
				{openBody}
				<span className="flex shrink-0 items-center text-[var(--text-tertiary)] opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover/refchip:opacity-100 group-hover/refchip:text-[var(--accent-primary)]">
					<Glyph d={ICON_ARROW} size={11} />
				</span>
			</button>
		);
	}

	// draft mode — body = open, trailing ✕ = remove (two distinct hit targets).
	return (
		<span
			data-ds-component="Am1ReferenceChip"
			data-ds-mode="draft"
			data-ds-kind={kind}
			className={shell}
		>
			<button
				type="button"
				onClick={onOpen}
				aria-label={`Open ${label}`}
				title={`Open ${label}`}
				className="flex min-w-0 items-center gap-[6px] text-left"
			>
				{openBody}
			</button>
			<button
				type="button"
				onClick={onRemove}
				aria-label={`Remove ${label}`}
				title="Remove"
				className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-secondary)]"
			>
				<Glyph d={ICON_REMOVE} size={11} />
			</button>
		</span>
	);
}

// A horizontal wrapping row of reference chips — the standard inline/draft layout.
function ReferenceChipRow({ children }: { children: React.ReactNode }): JSX.Element {
	return <div className="mt-[3px] flex flex-wrap items-center gap-[6px]">{children}</div>;
}

// @lore AM1-r7: the heavy SESSION embed card (Atlas · Opus 4.8 · 14 tool calls ·
// Dial in, on an elevated bordered surface) was REMOVED — founder: "this session
// dial in is too much, the one above [the work-fold] is better." Session dial-in
// is now represented quietly by the SAME subtle <Fold> style as the work-fold
// ("› Show session"). No card, no border, no separate Embed component.

// Knowledge sources = knowledge-kind reference chips (a source IS a knowledge
// document reference, founder comment 5). Each opens the doc. Same shared chip.
function SourceChips({ onOpen }: { onOpen: () => void }): JSX.Element {
	const sources = ["WebAuthn L3 spec", "RFC 9380", "internal/auth-RFC"];
	return (
		<ReferenceChipRow>
			{sources.map((s) => (
				<ReferenceChip key={s} kind="knowledge" label={s} mode="posted" onOpen={onOpen} />
			))}
		</ReferenceChipRow>
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
			{/* Minimal "?" marker instead of the big multi-word colored pill
			    (founder comment 9 — no third font/color, just the question glyph). */}
			<div className="flex items-start gap-[9px]">
				<span
					aria-label="Quick ask"
					title="Quick ask"
					className="mt-[1px] flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] text-[var(--accent-primary)]"
				>
					<Glyph d={ICON_QUESTION} size={13} />
				</span>
				<p className="m-0 text-[15px] font-[600] leading-[1.4] text-[var(--text-primary)]">
					How long should the password fallback stay enabled?
				</p>
			</div>
			<div className="mt-[12px] flex flex-wrap items-center gap-[6px] pl-[29px]">
				{options.map((o) => (
					<button
						key={o.label}
						type="button"
						// Survey options must READ as buttons (founder comment 10). At rest
						// they're quiet + neutral (no green bias); on HOVER the full button
						// form appears — filled --surface-container + stronger border — so
						// it's obviously a clickable choice. Recommended hinted by a small
						// neutral tag only.
						className="inline-flex items-center gap-[6px] rounded-[var(--r-subtle)] border border-[var(--border-default)] bg-[var(--surface-elevated)] px-[12px] py-[6px] text-[13px] font-[500] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-container)] hover:text-[var(--text-primary)]"
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
// REVIEW REQUEST message — a COMPACT REFERENCE into the merged review
// experience (ReviewComposition / ReviewPage). It does NOT take a decision
// inline (founder comment 7: "you cannot actually take a decision here — you
// can only show the decision once taken") and shows NO code/diff. The decision
// is made on the review page; here we only point to it. The change-set is an
// ARTIFACT reference chip (founder comment 6 — it is an artifact attachment,
// not inline code) that routes to the Artifact view.
//
// @lore AM1-r6: aligned to the merged review surface
// (packages/web/src/pages/review/ReviewComposition.tsx). The verdict buttons
// (Approve / Request changes / …) live in ReviewComposition's FrameHeader, NOT
// in the conversation. The conversation emits the request + echoes the verdict
// once ReviewVerdictState is resolved.
//
// @lore AM1-r8: TWO DISTINCT navigation targets here — NEITHER renders inline
// (the conversation owns no viewing surface):
//   the ARTIFACT chip -> the ARTIFACT view (/artifacts/:id,
//     pages/ArtifactPermalink.tsx -> shell/ArtifactView.tsx);
//   "Open review" -> the REVIEW page (/work/bet/:betId/review/:reviewId,
//     pages/review/ReviewPage.tsx -> ReviewComposition).
// In production onOpenArtifact/onOpenReview navigate those routes.
// ───────────────────────────────────────────────────────────────────
function ReviewRequestPart({
	onOpenArtifact,
	onOpenReview,
}: {
	onOpenArtifact: () => void;
	onOpenReview: () => void;
}): JSX.Element {
	return (
		<div
			data-ds-component="Am1ReviewRequestPart"
			className="flex flex-col gap-[12px] rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-[18px] shadow-[var(--shadow-default)]"
		>
			<div className="flex items-start gap-[9px]">
				<span
					aria-label="Review request"
					title="Review request"
					className="mt-[1px] flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] text-[var(--accent-primary)]"
				>
					<Glyph d={ICON_CHECK} size={12} />
				</span>
				<div className="min-w-0">
					<div className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
						Review requested
					</div>
					<p className="m-0 mt-[3px] text-[15px] font-[600] leading-[1.4] text-[var(--text-primary)]">
						Approve deploy of passkey login to staging
					</p>
				</div>
			</div>
			{/* The change set = an ARTIFACT reference chip (NOT inline code). Routes to
			    the Artifact view (/artifacts/:id) — no inline viewer. */}
			<div className="pl-[29px]">
				<ReferenceChip
					kind="artifact"
					label="auth/passkey.ts"
					meta="+2 −1"
					mode="posted"
					onOpen={onOpenArtifact}
				/>
			</div>
			{/* The ONLY action here is to OPEN THE REVIEW PAGE — the decision is made
			    there (NOT the artifact viewer; founder comment 2). Routes to the
			    review experience (ReviewPage → ReviewComposition). */}
			<div className="pl-[29px]">
				<button
					type="button"
					onClick={onOpenReview}
					className="inline-flex w-fit items-center gap-[6px] rounded-[var(--r-subtle)] bg-[var(--accent-primary)] px-[12px] py-[7px] text-[13px] font-[600] text-[var(--text-on-accent)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--accent-primary-hover)]"
				>
					Open review
					<Glyph d={ICON_ARROW} size={12} />
				</button>
			</div>
		</div>
	);
}

// Resolved review — the verdict ONCE TAKEN, echoed into the conversation
// (founder comment 7). The decision text comes from the merged
// verdictDecisionLabel vocabulary; no buttons, no code. Compact reference back
// to the review.
function ReviewResolvedPart({ onOpenReview }: { onOpenReview: () => void }): JSX.Element {
	return (
		<div
			data-ds-component="Am1ReviewResolvedPart"
			className="flex items-center gap-[9px] rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-[18px] py-[12px] shadow-[var(--shadow-subtle)]"
		>
			<span className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[var(--r-pill)] text-[var(--status-success)]">
				<Glyph d={ICON_CHECK} size={14} />
			</span>
			<div className="min-w-0 flex-1 leading-[1.4]">
				<span className="text-[13px] text-[var(--text-secondary)]">
					<span className="font-[600] text-[var(--text-primary)]">Approved</span> by A. Founder ·
					approve deploy of passkey login to staging
				</span>
			</div>
			<button
				type="button"
				onClick={onOpenReview}
				className="inline-flex shrink-0 items-center gap-[3px] text-[12px] font-[500] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] hover:text-[var(--accent-primary)]"
			>
				View review
				<Glyph d={ICON_ARROW} size={11} />
			</button>
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
// image — render through the SAME shared ReferenceChip (draft mode: body = open,
// ✕ = remove) in a single HORIZONTAL wrapping row, ~one chip tall. The IDENTICAL
// chip is used inside messages (posted mode) — one component everywhere.
function ComposerDraftBody({ onOpenArtifact }: { onOpenArtifact: () => void }): JSX.Element {
	return (
		<div
			data-ds-component="Am1ComposerDraftBody"
			className="flex flex-wrap items-center gap-[6px] px-[12px] pt-[9px]"
		>
			<ReferenceChip
				kind="artifact"
				label={INSERTED_CODE_TITLE}
				meta="TS · 3 lines"
				mode="draft"
				onOpen={onOpenArtifact}
			/>
			<ReferenceChip kind="image" label="auth-flow.png" meta="82 KB" mode="draft" />
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
							: // Resting: subtle outline; on HOVER the whole button fills with
								// --surface-container so it reads clearly as a BUTTON, not just a
								// glyph color change (founder comment 1).
								"flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] border border-[var(--border-default)] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-container)] hover:text-[var(--text-primary)]"
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
	onOpenArtifact,
	menuButtonRef,
}: {
	active: boolean;
	insertMenuOpen: boolean;
	onToggleMenu: () => void;
	onPickMenu: () => void;
	// The draft's code chip is an artifact → routes to the Artifact view.
	onOpenArtifact: () => void;
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
					{active && <ComposerDraftBody onOpenArtifact={onOpenArtifact} />}
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
// CONVERSATION BODY — the 8 author-grouped messages.
// ───────────────────────────────────────────────────────────────────
function ConversationBody({
	scroll,
	onOpenBlock,
	onOpenArtifact,
	onOpenReview,
}: {
	scroll: boolean;
	// Navigation hooks into the existing OWNED surfaces (no inline viewer):
	onOpenBlock: () => void; // → the Knowledge view (/knowledge/:knowledgeId), anchored to the block
	onOpenArtifact: () => void; // → the Artifact view (/artifacts/:id)
	onOpenReview: () => void; // → the review page (/work/bet/:betId/review/:reviewId)
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
							<Fold label="Worked for 1m 12s" onShow={onOpenBlock} />
						</div>
						{/* Change set = an artifact reference chip → the Artifact view
						    (/artifacts/:id); NOT a big inline-code card (founder comment 6). */}
						<ReferenceChipRow>
							<ReferenceChip
								kind="artifact"
								label="auth/passkey.ts"
								meta="+2 −1"
								mode="posted"
								onOpen={onOpenArtifact}
							/>
						</ReferenceChipRow>
						{/* Sources = knowledge reference chips → the Knowledge view
						    (/knowledge/:knowledgeId) — same shared chip (comment 5). */}
						<SourceChips onOpen={onOpenBlock} />
					</div>
				</MessageGroup>

				{/* 4 · Atlas (consecutive): block ref (title only) + attachment + session */}
				<MessageGroup who={ATLAS} time="9:12">
					<div className="flex flex-col gap-[12px]">
						<div>
							<Prose>Context for the dual-auth window and the flow diagram:</Prose>
							{/* In-message block + image — the SAME shared chip as the composer
							    draft, posted mode (no ✕, opens). The BLOCK chip routes to the
							    Knowledge view (founder comment 2 — "why does this not open the
							    knowledge view?"). */}
							<ReferenceChipRow>
								<ReferenceChip
									kind="block"
									label="Auth migration plan · §2"
									mode="posted"
									onOpen={onOpenBlock}
								/>
								<ReferenceChip
									kind="image"
									label="auth-flow.png"
									meta="82 KB"
									mode="posted"
									onOpen={onOpenArtifact}
								/>
							</ReferenceChipRow>
						</div>
						<div>
							<Prose>This all came out of my work session:</Prose>
							{/* Session dial-in = the SAME subtle fold style as the work-fold
							    (round-7, founder: the work-fold is the better, subtler one — no
							    heavy session card). Quiet "› Show session" line. */}
							<div className="mt-[6px]">
								<Fold cta="Show session" onShow={onOpenBlock} />
							</div>
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

				{/* 7 · Atlas review REQUEST → the artifact chip routes to the Artifact
				    view; "Open review" routes to the REVIEW PAGE (not the artifact). */}
				<MessageGroup who={ATLAS} time="9:15">
					<ReviewRequestPart onOpenArtifact={onOpenArtifact} onOpenReview={onOpenReview} />
				</MessageGroup>

				{/* 8 · Resolved verdict echo — the decision ONCE TAKEN, shown in the
				    conversation (no buttons here; the decision was made on the review
				    page). "View review" routes to the review page. */}
				<MessageGroup who={FOUNDER} time="9:16" hovered>
					<ReviewResolvedPart onOpenReview={onOpenReview} />
				</MessageGroup>
			</div>
		</div>
	);
}

// ───────────────────────────────────────────────────────────────────
// The conversation surface — INTERACTIVE. The conversation column + composer
// ONLY — it owns NO viewing surface (the bespoke right-page block panel was
// removed, round-8). Reference chips are navigation HOOKS into the existing,
// owned surfaces (Knowledge view / Artifact view / Review page); nothing renders
// inline. In this isolated story (no router) those hooks are clearly-labeled
// console noops naming their real destination route.
//   scroll          — fixed-height internal scroll vs natural height.
//   composerActive  — composer in its Insert-Block state (draft present).
// Real state: just the Insert "+" menu (open/close, outside-click).
// ───────────────────────────────────────────────────────────────────
export default function Am1ConversationSurface({
	scroll = false,
	composerActive = false,
}: {
	scroll?: boolean;
	composerActive?: boolean;
} = {}): JSX.Element {
	const [insertMenuOpen, setInsertMenuOpen] = useState(false);
	const menuButtonRef = useRef<HTMLButtonElement | null>(null);

	// Navigation hooks → the existing OWNED surfaces. Story has no router, so each
	// is a clearly-labeled console noop naming its real destination route. NO
	// inline viewer renders for any of them.
	const openKnowledgeView = (): void => {
		// biome-ignore lint/suspicious/noConsole: story-only navigation-hook proof
		console.info(`[AM1] navigate to Knowledge view → ${ROUTE_KNOWLEDGE} (KnowledgeDetail, anchored to the block)`);
	};
	const openArtifactView = (): void => {
		// biome-ignore lint/suspicious/noConsole: story-only navigation-hook proof
		console.info(`[AM1] navigate to Artifact view → ${ROUTE_ARTIFACT} (ArtifactPermalink → ArtifactView)`);
	};
	const openReviewPage = (): void => {
		// biome-ignore lint/suspicious/noConsole: story-only navigation-hook proof
		console.info(`[AM1] navigate to review page → ${ROUTE_REVIEW} (ReviewPage → ReviewComposition)`);
	};

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
				<ConversationBody
					scroll={scroll}
					onOpenBlock={openKnowledgeView}
					onOpenArtifact={openArtifactView}
					onOpenReview={openReviewPage}
				/>
				<Composer
					active={composerActive}
					insertMenuOpen={insertMenuOpen}
					onToggleMenu={() => setInsertMenuOpen((v) => !v)}
					onPickMenu={() => {
						// Picking "Insert block" inserts a block into the draft — it does NOT
						// open a viewer (the conversation owns no viewing surface). Closes the
						// menu so the action reads as live, not dead.
						setInsertMenuOpen(false);
					}}
					onOpenArtifact={openArtifactView}
					menuButtonRef={menuButtonRef}
				/>
			</main>
		</div>
	);
}
