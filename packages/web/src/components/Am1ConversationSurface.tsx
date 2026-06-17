/**
 * AM1 — Conversation Experience, v3: the FULL-SCOPE conversation embodied in the
 * REAL app container (round-3 detail refinement).
 *
 * v1/v2 (the thin "calm column" — QuietStream / Quiet Turns / Calm Document) were
 * rejected by the founder as "far from the basics": missing spacing/grouping/
 * structure, no me-vs-them identity, no multi-user, a stub composer.
 *
 * SCOPE = THE OPEN CONVERSATION (the open thread's content). A conversation IS a
 * thread (DB: conversationId === threadId; messages carry one threadId, no
 * sub-thread/parent column — no Slack-style sub-threads). Navigating BETWEEN
 * threads is the app sidebar (SidebarV2, AD9) — app-shell chrome, NOT part of this
 * design. So this surface is just the conversation: header (thread identity) ·
 * message groups · composer.
 *
 * REVIEW / ARTIFACT SCOPE BOUNDARY (round-3): the review experience — artifact
 * review, the verdict flow, and the right slider/diff pane — is owned by a PARALLEL
 * worktrack (AL). It is NOT designed here. An artifact/change-set in this surface
 * renders only as a COMPACT EMBED card that is a HOOK: clicking it "opens the
 * artifact in a right slider" delivered by AL. There is no diff body, no verdict
 * bar, no context pane in this design. A review message stays compact: the agent
 * proposes X with an "Open review" hook into AL's experience.
 *
 * /design embodiment of the LOCKED concept (`plans/AM1/concept.md`): a Conversation
 * = deliberate, threaded messages on ONE host, rendered through the Part model
 * (typed Parts + Embed + Fold), derived never stored. Message types: plain |
 * review | questionnaire | verdict. The model is NOT changed here — the UI makes it
 * legible.
 *
 * Concept honor:
 *  - Session activity is NEVER first-class conversation content. A session is a
 *    one-line Session-reference Embed opening the lower-level dial-in (AM3); never
 *    an inlined work-log.
 *  - Renders WITHIN Thread/Message/verdict — reshapes none of them.
 *
 * Scope: a self-contained, hand-rolled, presentational surface for the viewer.
 * Fixture inline, callbacks noop, visuals hand-rolled with Tailwind + semantic
 * tokens for guaranteed rendering. Production reuse mapping (which catalogued DS
 * components replace each hand-rolled slot) lives in
 * `plans/AM1/design/full-surface/spec.md`.
 *
 * @lore AM1-v3: the conversation chrome (header, message groups, composer) is
 * hand-rolled rather than importing the real DS components so the story renders
 * stand-alone in the viewer without AppShell's router/context. The builder maps
 * each region back to the real components per spec.md §Composition.
 *
 * @lore AM1-v3 round-3: the composer's INSERT-BLOCK capability is the conversation
 * composer's unique power — composing a message can insert a knowledge Block
 * (heading/list/code/table/quote) with the SAME rich block editing as Knowledge
 * blocks (DS `Block` + `BodyEditor`). The story renders BOTH the open Insert menu
 * AND a draft that already contains an inserted, rich-edited code block above the
 * text line, so the mechanic is unmistakable.
 *
 * @lore AM1-v3 round-3: the diff/change-set CONTEXT PANE was removed. Artifact
 * review (the right slider + verdict flow) is owned by track AL; here a change-set
 * is only a compact "opens →" Embed hook. Do not re-add a diff body or verdict bar.
 */

import type { JSX } from "react";

// ── Fixture identities (3 participants: 2 humans + 1 agent) ─────────
const FOUNDER = { id: "u-founder", name: "A. Founder", initials: "AF", isAgent: false, isMe: true };
const MARA = { id: "u-mara", name: "Mara", initials: "MK", isAgent: false, isMe: false };
const ATLAS = { id: "a-atlas", name: "Atlas", initials: "AT", isAgent: true, isMe: false };
type Identity = typeof FOUNDER;

// ───────────────────────────────────────────────────────────────────
// Inline icon set — currentColor, no emoji-as-icon (AQ-105). 16-box.
// Round-3: every composer-toolbar glyph is a legible, single-purpose icon.
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
// Format glyph — a clean serif "A" mark (text-formatting). Replaces the broken bold path.
const ICON_FORMAT_AA =
	"M5.6 3h1.6l3.1 8H8.6l-.62-1.7H4.84L4.22 11H2.5l3.1-8zm.18 2.1L4.36 7.9h2.84L5.78 5.1zM12 6.4h1.5V11H12v-.5a1.7 1.7 0 01-1.2.6c-1 0-1.7-.7-1.7-1.6 0-.95.8-1.5 2-1.5h.9v-.15c0-.5-.3-.75-.85-.75-.42 0-.78.16-1.1.42l-.58-.95A3 3 0 0111.2 6.3c.3 0 .55.04.8.1zm-.2 2.85h-.7c-.5 0-.78.2-.78.55 0 .3.24.5.62.5.45 0 .82-.3.86-.75v-.3z";
const ICON_AT =
	"M8 1a7 7 0 100 14c1.4 0 2.7-.4 3.8-1.1l-.8-1.2A5.5 5.5 0 118 2.5 5.5 5.5 0 0113.5 8c0 1-.6 1.5-1.2 1.5S11 9 11 8V5.2H9.5V6A2.8 2.8 0 108 11a2.7 2.7 0 002-.9 2.3 2.3 0 002.3 1.4C14 11.5 15 10.1 15 8A7 7 0 008 1zm0 8.5A1.5 1.5 0 118 6.5a1.5 1.5 0 010 3z";
// Emoji / face glyph (insert emoji into the body — distinct from reacting).
const ICON_EMOJI =
	"M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM5.6 6.2a.95.95 0 110 1.9.95.95 0 010-1.9zm4.8 0a.95.95 0 110 1.9.95.95 0 010-1.9zM4.9 9.4h6.2a3.2 3.2 0 01-6.2 0z";
// Insert-block / blocks glyph — stacked rows (a small document/block stack).
const ICON_BLOCKS =
	"M2.5 2.5h11v2.2h-11V2.5zm0 3.6h11v2.2h-11V6.1zm0 3.6h7v2.2h-7V9.7z";
// Block kinds for the Insert menu.
const ICON_K_HEADING = "M3 2.5h1.6v3.4h4V2.5H10.2v9H8.6V7.5h-4v4H3v-9zM12 5.5h1.5V11.5H12V7.2l-1 .5-.4-1.2L12 5.5z";
const ICON_K_LIST =
	"M3 3.2a1 1 0 110 2 1 1 0 010-2zm0 4.8a1 1 0 110 2 1 1 0 010-2zM6 3.6h8v1.4H6V3.6zm0 4.7h8v1.4H6V8.3zM3 12.8a1 1 0 110 2 1 1 0 010-2zm3 .3h8v1.4H6v-1.4z";
const ICON_K_CODE =
	"M5.2 3.4L1 8l4.2 4.6 1.1-1L3.2 8l3.1-3.6-1.1-1zm5.6 0l-1.1 1L13.8 8l-3.1 3.6 1.1 1L16 8l-4.2-4.6z";
const ICON_K_TABLE =
	"M2 3h12v10H2V3zm1.4 1.4v2h3.5v-2H3.4zm4.9 0v2h4.3v-2H8.3zM3.4 7.7v1.9h3.5V7.7H3.4zm4.9 0v1.9h4.3V7.7H8.3zM3.4 11v1.6h3.5V11H3.4zm4.9 0v1.6h4.3V11H8.3z";
const ICON_K_QUOTE =
	"M3.5 4h3.6v3.6c0 2-1.2 3.3-3.2 3.9l-.5-1.1c1.1-.4 1.7-1 1.8-1.9H3.5V4zm5.4 0h3.6v3.6c0 2-1.2 3.3-3.2 3.9l-.5-1.1c1.1-.4 1.7-1 1.8-1.9H8.9V4z";

// ───────────────────────────────────────────────────────────────────
// Avatar — hand-rolled mirror of DS Avatar. Human vs agent tint, and a
// stronger agent ring so the distinction reads at a glance.
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

// ───────────────────────────────────────────────────────────────────
// CONVERSATION HEADER — host context + participants + actions.
// Round-3: clean overlapping AvatarGroup (consistent ring + negative
// margin) — no broken overlap. z-ordering so each avatar reads cleanly.
// ───────────────────────────────────────────────────────────────────
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
						{/* Host kind chip + host title — "what's this attached to" */}
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
				{/* Participants (3) — tidy overlapping group */}
				<div className="flex items-center gap-[9px]">
					<ParticipantGroup people={[FOUNDER, MARA, ATLAS]} />
					<span className="text-[12px] tabular-nums text-[var(--text-tertiary)]">3</span>
				</div>
				{/* Quiet actions affordance */}
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
// MESSAGE GROUP — author-GROUPING is the structural unit. Single column,
// NO bubbles. Round-3: agent groups carry a faint tint + a left accent
// rule so AGENT vs HUMAN reads instantly without reading the name. Humans
// plain; own ("You") groups keep a subtle warm cue.
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
	/** When true, render the hover-action toolbar on the first row (demo state). */
	hovered?: boolean;
}): JSX.Element {
	const tint = who.isAgent
		? // Agent: faint accent tint + a left accent rule — the at-a-glance marker.
			"border-l-[2.5px] border-[var(--accent-primary)] bg-[color-mix(in_oklab,var(--accent-primary)_4%,transparent)] pl-[15px]"
		: who.isMe
			? // Own message: subtle warm cue (paired with the "You" label).
				"bg-[color-mix(in_oklab,var(--text-secondary)_3%,transparent)] pl-[18px]"
			: // Other human: plain.
				"pl-[18px]";
	return (
		<div
			data-ds-component="Am1MessageGroup"
			data-ds-sender={who.isAgent ? "agent" : "human"}
			className={`group/msg relative flex gap-[12px] rounded-[var(--r-default)] py-[12px] pr-[18px] ${tint}`}
		>
			{/* Avatar column — identity at the group head */}
			<Avatar who={who} size={32} />
			<div className="min-w-0 flex-1">
				{/* Group head: name + agent marker + time */}
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
				{/* Stacked message bodies under the single group head */}
				<div className="flex flex-col gap-[12px]">{children}</div>
			</div>

			{/* Hover toolbar — React · Reply · ⋯ (founder liked these; kept compact) */}
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

// @-mention chip rendered inline in prose.
function Mention({ name }: { name: string }): JSX.Element {
	return (
		<span className="rounded-[var(--r-subtle)] bg-[var(--accent-primary-dim)] px-[3px] font-[500] text-[var(--accent-primary)]">
			@{name}
		</span>
	);
}

// ── Reply reference: a Slack-style quoted snippet of the PARENT message
//    shown ABOVE a reply body, so a reader can see what the reply refers to.
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

// A reaction pill stack under a message.
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

// ── Fold device: a quiet work-summary line that re-expands. ─────────
// Static-open in the story (the viewer renders one frame; no client JS).
function Fold({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
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

// ── Embed: ONE restrained card treatment; a HOOK that opens a destination.
//    Round-3: the change-set embed is JUST a hook into AL's review slider —
//    no diff body here. The "opens →" affordance carries the relationship.
function Embed({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}): JSX.Element {
	return (
		<button
			type="button"
			aria-label={label}
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
		<div className="mb-[3px] text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
			{label}
		</div>
	);
}

function ChangeSetEmbedBody(): JSX.Element {
	return (
		<div>
			<EmbedKindLabel label="Change set · opens in review" />
			<div className="flex items-baseline gap-[12px]">
				<span className="min-w-0 flex-1 truncate font-mono text-[13px] text-[var(--text-primary)]">
					auth/passkey.ts
				</span>
				<span className="shrink-0 font-mono text-[13px] tabular-nums">
					<span className="text-[var(--status-success)]">+124</span>{" "}
					<span className="text-[var(--status-error)]">−18</span>
				</span>
			</div>
		</div>
	);
}

function BlockRefEmbedBody(): JSX.Element {
	return (
		<div>
			<EmbedKindLabel label="Referenced item" />
			<div className="text-[13px] font-[500] text-[var(--text-primary)]">
				Auth migration plan · §2 Dual-auth window
			</div>
			<div className="mt-[1px] truncate text-[13px] leading-[1.4] text-[var(--text-secondary)]">
				Password and passkey credentials both authenticate during phase 2.
			</div>
		</div>
	);
}

function SessionRefEmbedBody(): JSX.Element {
	return (
		<div>
			<EmbedKindLabel label="Session" />
			<div className="truncate text-[13px] text-[var(--text-secondary)]">
				<span className="font-[500] text-[var(--text-primary)]">Atlas</span> · Opus 4.8 ·{" "}
				<span className="tabular-nums">1m 12s</span> ·{" "}
				<span className="tabular-nums">14 tool calls</span> · Dial in
			</div>
		</div>
	);
}

// Citation/source chips.
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

// Attachment chip (file/image).
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
// QUESTIONNAIRE message — agent "quick ask": a scoped question with a few
// constrained answer options rendered as inline answer CHIPS the human
// picks. Calm + teammate-style (NOT a heavy form). The AM1-relevant agent
// message type (review = AL).
// ───────────────────────────────────────────────────────────────────
function QuestionnairePart(): JSX.Element {
	const options = [
		{ label: "Keep through phase 2", recommended: true },
		{ label: "Drop now", recommended: false },
		{ label: "Decide later", recommended: false },
	];
	return (
		<div data-ds-component="Am1QuestionnairePart">
			<div className="mb-[6px] text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
				Quick ask
			</div>
			<Prose>How long should the password fallback stay enabled?</Prose>
			<div className="mt-[9px] flex flex-wrap items-center gap-[6px]">
				{options.map((o) => (
					<button
						key={o.label}
						type="button"
						className={`inline-flex items-center gap-[6px] rounded-[var(--r-pill)] border px-[12px] py-[6px] text-[13px] font-[500] transition-colors duration-[var(--motion-fast)] ${
							o.recommended
								? "border-[var(--accent-primary)] bg-[var(--accent-primary-dim)] text-[var(--accent-primary)]"
								: "border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
						}`}
					>
						{o.recommended && <Glyph d={ICON_CHECK} size={11} />}
						{o.label}
					</button>
				))}
			</div>
		</div>
	);
}

// ───────────────────────────────────────────────────────────────────
// REVIEW message — COMPACT. The agent proposes X; an "Open review" HOOK
// opens AL's review experience (verdict flow + slider). NO verdict bar,
// NO diff body here (owned by track AL).
// ───────────────────────────────────────────────────────────────────
function ReviewPart(): JSX.Element {
	return (
		<div
			data-ds-component="Am1ReviewPart"
			className="rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-[15px] shadow-[var(--shadow-subtle)]"
		>
			<div className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
				Review · needs your decision
			</div>
			<p className="mt-[6px] mb-0 text-[15px] font-[600] leading-[1.4] text-[var(--text-primary)]">
				Approve deploy of passkey login to staging
			</p>
			<div className="mt-[9px]">
				<Embed label="Open the change set in review">
					<ChangeSetEmbedBody />
				</Embed>
			</div>
			{/* The verdict flow itself lives in track AL's review experience. */}
			<div className="mt-[12px]">
				<button
					type="button"
					className="inline-flex items-center gap-[6px] rounded-[var(--r-subtle)] bg-[var(--accent-primary)] px-[12px] py-[7px] text-[13px] font-[500] text-[var(--text-on-accent)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--accent-primary-hover)]"
				>
					Open review
					<Glyph d={ICON_ARROW} size={12} />
				</button>
			</div>
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
// COMPOSER — full anatomy + the INSERT-BLOCK power.
// Bottom-pinned card. Anatomy (top→bottom):
//   reply banner (quoted snippet of the replied-to message)
//   → inserted-block draft area (a rich code Block sitting in the draft)
//   → input row [ + Insert | Aa | textarea | Send ]
//   → "Enter to send · Shift+Enter newline"
// The "+" Insert menu is shown OPEN so the Insert-block capability is
// unmistakable. Labeled, single-purpose, non-broken tool icons.
// ───────────────────────────────────────────────────────────────────
function ComposerToolButton({
	d,
	label,
	size = 16,
}: {
	d: string;
	label: string;
	size?: number;
}): JSX.Element {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			className="flex h-[28px] w-[28px] items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-container)] hover:text-[var(--text-secondary)]"
		>
			<Glyph d={d} size={size} />
		</button>
	);
}

// The OPEN "+" insert menu — Insert block (the key, labeled affordance)
// + the other composer inserts, each labeled. Slash (/) reserved.
function InsertMenu(): JSX.Element {
	const items = [
		{ d: ICON_BLOCKS, label: "Insert block", hint: "heading · list · code · table · quote", key: true },
		{ d: ICON_PAPERCLIP, label: "Attach file", hint: "image, document", key: false },
		{ d: ICON_AT, label: "Mention", hint: "@person, @agent, @item", key: false },
		{ d: ICON_DOC, label: "Reference item", hint: "knowledge, artifact, session", key: false },
	];
	return (
		<div
			data-ds-component="Am1InsertMenu"
			role="menu"
			aria-label="Insert"
			// Rendered as the OPEN "+" menu, attached just above the input row so it
			// reads unambiguously and never clips/collides with the draft. Opaque
			// overlay surface + elevated shadow so it reads as a floating popover.
			className="w-[300px] rounded-[var(--r-default)] border border-[var(--border-default)] bg-[var(--surface-overlay)] p-[6px] shadow-[var(--shadow-elevated)]"
		>
			<div className="px-[9px] pb-[3px] pt-[3px] text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
				Insert
			</div>
			{items.map((it) => (
				<button
					key={it.label}
					type="button"
					role="menuitem"
					className={`flex w-full items-center gap-[9px] rounded-[var(--r-subtle)] px-[9px] py-[6px] text-left transition-colors duration-[var(--motion-fast)] ${
						it.key
							? "bg-[var(--accent-primary-dim)] text-[var(--accent-primary)]"
							: "text-[var(--text-secondary)] hover:bg-[var(--surface-container)] hover:text-[var(--text-primary)]"
					}`}
				>
					<span
						className={`flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] ${
							it.key ? "bg-[var(--accent-primary)] text-[var(--text-on-accent)]" : "bg-[var(--surface-container)] text-[var(--text-tertiary)]"
						}`}
					>
						<Glyph d={it.d} size={15} />
					</span>
					<span className="min-w-0">
						<span className={`block text-[13px] font-[600] ${it.key ? "text-[var(--accent-primary)]" : "text-[var(--text-primary)]"}`}>
							{it.label}
						</span>
						<span className="block truncate text-[11px] text-[var(--text-tertiary)]">{it.hint}</span>
					</span>
				</button>
			))}
		</div>
	);
}

// The inserted-block draft chip — a rich-edited Block sitting in the draft
// ABOVE the text line, with a block handle + kind controls + remove. Shows
// the Insert-Block mechanic concretely: this code block was inserted and
// edits exactly like a Knowledge block (DS Block + BodyEditor).
function InsertedBlockDraft(): JSX.Element {
	const lines = [
		"const cred = await navigator.credentials.create(webauthnOpts);",
		"if (!cred) throw new PasskeyError('cancelled');",
		"return persistCredential(userId, cred);",
	];
	return (
		<div
			data-ds-component="Am1InsertedBlock"
			className="group/blk relative grid grid-cols-[24px_1fr] gap-[6px] rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-container)] py-[9px] pl-[6px] pr-[9px]"
		>
			{/* Block handle gutter — drag/reorder + open block actions (mirrors DS BlockHandle) */}
			<div className="flex items-start justify-center pt-[3px] text-[var(--text-tertiary)]">
				<button
					type="button"
					aria-label="Block actions"
					title="Drag to reorder · open block actions"
					className="flex h-[20px] w-[18px] items-center justify-center rounded-[var(--r-subtle)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-secondary)]"
				>
					<Glyph d={ICON_MORE} size={13} />
				</button>
			</div>
			<div className="min-w-0">
				{/* Kind row: this block is a Code block; kind is changeable inline. */}
				<div className="mb-[3px] flex items-center gap-[6px]">
					<span className="inline-flex items-center gap-[3px] rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] px-[6px] py-[1px] text-[10px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--accent-primary)]">
						<Glyph d={ICON_K_CODE} size={10} />
						Code · ts
					</span>
					<span className="text-[11px] text-[var(--text-tertiary)]">inserted block — edits like a knowledge block</span>
					<button
						type="button"
						aria-label="Remove block"
						title="Remove block"
						className="ml-auto flex h-[20px] w-[20px] items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-secondary)]"
					>
						✕
					</button>
				</div>
				{/* Rich block body — the SAME render as a Knowledge code block. */}
				<pre className="m-0 overflow-x-auto rounded-[var(--r-subtle)] bg-[var(--surface-page)] p-[9px] font-mono text-[12px] leading-[1.5] text-[var(--text-primary)]">
					<code>{lines.join("\n")}</code>
				</pre>
			</div>
		</div>
	);
}

// Slim reply banner — a thin reference to the replied-to message. Shown in
// BOTH composer states (resting keeps it slim; active pairs it with the draft).
function ComposerReplyBanner(): JSX.Element {
	return (
		<div className="flex items-start gap-[6px] border-b border-[var(--border-subtle)] px-[12px] py-[6px]">
			<span className="mt-[2px] text-[var(--text-tertiary)]">
				<Glyph d={ICON_REPLY} size={12} />
			</span>
			<div className="min-w-0 flex-1 text-[12px] leading-[1.4]">
				<span className="text-[var(--text-secondary)]">
					Replying to <span className="font-[500] text-[var(--text-primary)]">Atlas</span>
				</span>
				<div className="mt-[1px] flex items-start gap-[6px] border-l-[2px] border-[var(--border-default)] pl-[9px]">
					<span className="truncate text-[var(--text-tertiary)]">
						“Added WebAuthn registration and the dual-auth window. Existing password sessions stay
						valid…”
					</span>
				</div>
			</div>
			<button
				type="button"
				aria-label="Cancel reply"
				title="Cancel reply"
				className="rounded-[var(--r-subtle)] px-[6px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
			>
				✕
			</button>
		</div>
	);
}

// The Insert-Block draft body — inserted rich code block + attachment chip.
// Active-state only.
function ComposerDraftBody(): JSX.Element {
	return (
		<div className="flex flex-col gap-[9px] px-[12px] pt-[9px]">
			<InsertedBlockDraft />
			<div className="flex flex-wrap items-center gap-[6px]">
				<div className="inline-flex items-center gap-[6px] rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-container)] px-[9px] py-[3px] text-[12px] text-[var(--text-secondary)]">
					<Glyph d={ICON_DOC} size={12} />
					<span>auth-flow.png</span>
					<span className="tabular-nums text-[var(--text-tertiary)]">82 KB</span>
					<button
						type="button"
						aria-label="Remove attachment"
						title="Remove attachment"
						className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
					>
						✕
					</button>
				</div>
			</div>
		</div>
	);
}

// The composer input row + tool strip. `insertOpen` controls whether the "+"
// Insert button reads active (accented, paired with the open InsertMenu).
function ComposerInputRow({ insertOpen }: { insertOpen: boolean }): JSX.Element {
	return (
		<>
			{/* Input row: [ + Insert (labeled) | textarea | Send ] */}
			<div className="relative flex items-end gap-[9px] px-[12px] py-[9px]">
				<button
					type="button"
					aria-label="Insert"
					title="Insert block, attach, mention, reference"
					className={
						insertOpen
							? "flex h-[28px] shrink-0 items-center gap-[3px] rounded-[var(--r-subtle)] border border-[var(--accent-primary)] bg-[var(--accent-primary-dim)] px-[9px] text-[12px] font-[600] text-[var(--accent-primary)]"
							: "flex h-[28px] shrink-0 items-center gap-[3px] rounded-[var(--r-subtle)] border border-[var(--border-default)] px-[9px] text-[12px] font-[500] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
					}
				>
					<Glyph d={ICON_PLUS} size={13} />
					Insert
				</button>
				<textarea
					rows={1}
					placeholder="Message Atlas, Mara…"
					className="min-h-[24px] flex-1 resize-none border-none bg-transparent py-[3px] text-[15px] leading-[1.5] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-placeholder)]"
					defaultValue={
						insertOpen ? "Here's the corrected registration flow — one nit on the error copy: " : ""
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

			{/* Formatting + affordance strip — legible, single-purpose, labeled */}
			<div className="flex items-center gap-[3px] border-t border-[var(--border-subtle)] px-[12px] py-[3px]">
				<ComposerToolButton d={ICON_PAPERCLIP} label="Attach" size={14} />
				<ComposerToolButton d={ICON_BLOCKS} label="Insert block" size={14} />
				<ComposerToolButton d={ICON_AT} label="Mention" size={14} />
				<ComposerToolButton d={ICON_FORMAT_AA} label="Format (bold, italic, code)" size={15} />
				<ComposerToolButton d={ICON_EMOJI} label="Emoji" size={15} />
				<span className="ml-auto text-[11px] text-[var(--text-tertiary)]">
					Enter to send · Shift+Enter for newline
				</span>
			</div>
		</>
	);
}

// COMPOSER — two embodiments controlled by `active`:
//   resting (default)  = slim reply banner + input row + tool strip.
//   active (Insert-Block) = reply banner + inserted-block draft + open Insert
//                           menu + input row + tool strip — the killer feature.
function Composer({ active = false }: { active?: boolean }): JSX.Element {
	return (
		<div className="shrink-0 bg-[var(--surface-page)] px-[18px] pb-[18px] pt-[9px]">
			<div className="mx-auto w-full max-w-[760px]">
				<div className="relative rounded-[var(--r-default)] border border-[var(--border-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)] transition-shadow duration-[var(--motion-fast)] focus-within:shadow-[var(--shadow-default)]">
					<ComposerReplyBanner />
					{active && <ComposerDraftBody />}
					{active && (
						<div className="px-[12px] pt-[9px]">
							<InsertMenu />
						</div>
					)}
					<ComposerInputRow insertOpen={active} />
				</div>
			</div>
		</div>
	);
}

// ───────────────────────────────────────────────────────────────────
// The conversation surface — the open thread's content.
// One flex column: header · scrolling message list · pinned composer.
// NO inbox, NO diff/context pane (artifact review = track AL).
// ───────────────────────────────────────────────────────────────────
// The conversation message list (the 8 author-grouped messages). Extracted so
// the surface and the composer-detail story can both render it. `scroll`
// controls the embodiment: true = the real app's fixed-height internal scroll;
// false = natural height (the whole conversation renders top-to-bottom, used
// for the design-review story so nothing is clipped).
function ConversationBody({ scroll }: { scroll: boolean }): JSX.Element {
	return (
		<div
			className="px-[18px] py-[12px]"
			style={scroll ? { flex: 1, minHeight: 0, overflowY: "auto" } : undefined}
		>
			<div className="mx-auto flex w-full max-w-[760px] flex-col gap-[18px]">
						{/* 1 · Founder ask (own-message cue) */}
						<MessageGroup who={FOUNDER} time="9:02">
							<Prose>Can you wire passkey login and show me the diff before we deploy?</Prose>
						</MessageGroup>

						{/* 2 · Mara teammate — @mention + reaction (multi-user, me-vs-them) */}
						<MessageGroup who={MARA} time="9:05">
							<div>
								<Prose>
									<Mention name="Atlas" /> please keep the password fallback for phase 2 — some of our
									enterprise tenants can't enroll passkeys yet.
								</Prose>
								<Reactions />
							</div>
						</MessageGroup>

						{/* 3 · Atlas agent summary — work-Fold + change-set embed (hook) + citations */}
						<MessageGroup who={ATLAS} time="9:11">
							<div>
								<Prose>
									Added WebAuthn registration and the dual-auth window. Existing password sessions stay
									valid through phase 2, <Mention name="Mara" /> — fallback preserved.
								</Prose>
								<div className="mt-[6px]">
									<Fold label="Worked for 1m 12s">noop</Fold>
								</div>
								<Embed label="Open the change set in review">
									<ChangeSetEmbedBody />
								</Embed>
								<CitationChips />
							</div>
						</MessageGroup>

						{/* 4 · Atlas (consecutive — collapses under the same head): refs + attachment + session */}
						<MessageGroup who={ATLAS} time="9:12">
							<div className="flex flex-col gap-[12px]">
								<div>
									<Prose>Context for the dual-auth window and the flow diagram:</Prose>
									<Embed label="Open referenced plan">
										<BlockRefEmbedBody />
									</Embed>
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

						{/* 5 · Atlas QUESTIONNAIRE — quick ask with inline answer chips */}
						<MessageGroup who={ATLAS} time="9:13">
							<QuestionnairePart />
						</MessageGroup>

						{/* 6 · Founder reply — references the SPECIFIC parent message (quoted) */}
						<MessageGroup who={FOUNDER} time="9:14">
							<div>
								<ReplyReference author="Atlas" snippet="How long should the password fallback stay enabled?" />
								<Prose>Keep it through phase 2 — that covers the enterprise tenants Mara flagged.</Prose>
							</div>
						</MessageGroup>

						{/* 7 · Atlas review message → COMPACT hook into AL's review experience */}
						<MessageGroup who={ATLAS} time="9:15" hovered>
							<ReviewPart />
						</MessageGroup>

						{/* 8 · Founder verdict echo — resolved (own-message cue) */}
						<MessageGroup who={FOUNDER} time="9:16">
							<VerdictEcho />
						</MessageGroup>
			</div>
		</div>
	);
}

// The conversation surface — the open thread's content.
// One flex column: header · message list · composer.
// NO inbox, NO diff/context pane (artifact review = track AL).
//
// `scroll`         — true = real-app fixed-height internal scroll; false = the
//                    whole conversation renders at natural height (review story,
//                    so the full thread is captured in one frame).
// `composerActive` — false = resting composer (default); true = Insert-Block.
export default function Am1ConversationSurface({
	scroll = false,
	composerActive = false,
}: {
	scroll?: boolean;
	composerActive?: boolean;
} = {}): JSX.Element {
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
				<ConversationBody scroll={scroll} />
				<Composer active={composerActive} />
			</main>
		</div>
	);
}
