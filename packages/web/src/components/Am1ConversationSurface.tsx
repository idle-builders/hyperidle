/**
 * AM1 — Conversation Experience, v3: the FULL-SCOPE conversation embodied in the
 * REAL app container.
 *
 * v1/v2 (the thin "calm column" — QuietStream / Quiet Turns / Calm Document) were
 * rejected by the founder as "far from the basics": missing spacing/grouping/
 * structure, no me-vs-them identity, no multi-user, a stub composer, and shown in
 * a floating container instead of the real app. This v3 answers every Round-1
 * annotation (`.annotations/annotations.md`) across TWO regions: the conversation
 * pane (primary) · right contextual pane.
 *
 * The left app-shell sidebar (conversation list + Conversations/Work/Knowledge nav)
 * is INTENTIONALLY out of this design — it is app-shell chrome that lives elsewhere,
 * not part of the conversation. Excluded so the conversation gets the viewer width;
 * the design scopes to the conversation pane + its contextual right pane.
 *
 * /design embodiment of the LOCKED concept (`plans/AM1/concept.md`): a Conversation
 * = deliberate, threaded messages on ONE host, rendered through the Part model
 * (typed Parts + Embed + Fold), derived never stored. SETTLED: a conversation is a
 * Thread attached to one host (Bet "Passkey login"), flat, no Slack sub-threads.
 * The UI makes that model LEGIBLE; it does not add branching.
 *
 * Concept honor:
 *  - Session activity is NEVER first-class conversation content. A session is a
 *    one-line Session-reference Embed opening the lower-level dial-in (AM3); never
 *    an inlined work-log.
 *  - Renders WITHIN Thread/Message/verdict — reshapes none of them.
 *  - Nothing named "Block"/"blocked".
 *
 * Scope: a self-contained, hand-rolled, presentational surface for the viewer.
 * Fixture inline, callbacks noop, visuals hand-rolled with Tailwind + semantic
 * tokens for guaranteed rendering at ~1440px desktop width. Production reuse
 * mapping (which catalogued DS components replace each hand-rolled slot) lives in
 * `plans/AM1/design/full-surface/spec.md`.
 *
 * @lore AM1-v3: the conversation + contextual chrome (header, message groups,
 * composer, right pane) is hand-rolled rather than importing the real DS components
 * so the story renders stand-alone in the viewer without AppShell's router/context.
 * The builder maps each region back to the real components per spec.md §Composition.
 * The app-shell sidebar is deliberately absent — it is not part of this design.
 */

import type { JSX } from "react";
import { useState } from "react";

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
const ICON_DOC =
	"M4 1h5l3 3v10a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1zm5 1.5V4h1.5L9 2.5z";
const ICON_FOLD = "M8 10.5L3.5 6l1-1L8 8.5 11.5 5l1 1L8 10.5z";
const ICON_REACT =
	"M8 1a7 7 0 100 14A7 7 0 008 1zM5.5 6a1 1 0 110 2 1 1 0 010-2zm5 0a1 1 0 110 2 1 1 0 010-2zM5 9.5h6a3 3 0 01-6 0z";
const ICON_REPLY = "M7 3L2 7.5 7 12V9c3.5 0 5.5 1.2 7 4 .2-4.5-2-8-7-8.5V3z";
const ICON_MORE = "M3 6.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm5 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm5 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3z";
const ICON_BOLD = "M4 2h4.2a2.9 2.9 0 012 5 3 3 0 01-1.7 5.5H4V2zm2 1.6v2.5h2a1.25 1.25 0 000-2.5H6zm0 4.1v3H8.3a1.5 1.5 0 000-3H6z";
const ICON_ITALIC = "M6 2h6v1.6H9.8l-2 8.8H10V14H4v-1.6h2.2l2-8.8H6V2z";
const ICON_CODE = "M5.2 3.4L1 8l4.2 4.6 1.1-1L3.2 8l3.1-3.6-1.1-1zm5.6 0l-1.1 1L13.8 8l-3.1 3.6 1.1 1L16 8l-4.2-4.6z";
const ICON_LINK = "M6.5 9.5l3-3M5 11a2.5 2.5 0 010-3.5l1.5-1.5 1 1L7 8.5a1 1 0 001.5 1.5M11 5a2.5 2.5 0 010 3.5L9.5 10l-1-1L10 7.5A1 1 0 008.5 6";
const ICON_AT = "M8 1a7 7 0 100 14c1.4 0 2.7-.4 3.8-1.1l-.8-1.2A5.5 5.5 0 118 2.5 5.5 5.5 0 0113.5 8c0 1-.6 1.5-1.2 1.5S11 9 11 8V5.2H9.5V6A2.8 2.8 0 108 11a2.7 2.7 0 002-.9 2.3 2.3 0 002.3 1.4C14 11.5 15 10.1 15 8A7 7 0 008 1zm0 8.5A1.5 1.5 0 118 6.5a1.5 1.5 0 010 3z";

// ───────────────────────────────────────────────────────────────────
// Tiny avatar (hand-rolled mirror of DS Avatar — human vs agent tint).
// ───────────────────────────────────────────────────────────────────
function Avatar({ who, size = 32 }: { who: Identity; size?: number }): JSX.Element {
	const color = who.isAgent
		? "bg-[var(--accent-primary-dim)] border-[var(--accent-primary)] text-[var(--accent-primary)]"
		: "bg-[var(--surface-page)] border-[var(--border-default)] text-[var(--text-secondary)]";
	return (
		<div
			className={`inline-flex items-center justify-center rounded-full border-[1.5px] font-semibold shrink-0 ${color}`}
			style={{ width: size, height: size, fontSize: size <= 22 ? 10 : 12 }}
			aria-hidden="true"
		>
			{who.initials}
		</div>
	);
}

// ───────────────────────────────────────────────────────────────────
// CONVERSATION HEADER — host context + participants + actions.
// Makes "what is this conversation / what's it attached to" obvious.
// ───────────────────────────────────────────────────────────────────
function ConversationHeader(): JSX.Element {
	return (
		<header className="flex shrink-0 items-center gap-[12px] border-b border-[var(--border-subtle)] bg-[var(--surface-page)] px-[24px] py-[12px]">
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
			{/* Participants (3) */}
			<div className="flex items-center gap-[9px]">
				<div className="flex flex-row">
					{[FOUNDER, MARA, ATLAS].map((p, i) => (
						<div
							key={p.id}
							className={`${i > 0 ? "-ml-[8px]" : ""} rounded-full ring-[2px] ring-[var(--surface-page)]`}
						>
							<Avatar who={p} size={28} />
						</div>
					))}
				</div>
				<span className="text-[12px] text-[var(--text-tertiary)]">3</span>
			</div>
			{/* Quiet actions affordance */}
			<button
				type="button"
				aria-label="Conversation actions"
				className="flex h-[32px] w-[32px] items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] hover:bg-[var(--surface-container)] hover:text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)]"
			>
				<Glyph d={ICON_MORE} size={16} />
			</button>
		</header>
	);
}

// ───────────────────────────────────────────────────────────────────
// MESSAGE LIST — author-GROUPING is the structural unit. Single column,
// NO bubbles. Identity (avatar + name + time) at each group head;
// consecutive same-author messages collapse beneath it. Human vs agent
// legibly distinct; subtle own-message cue for A. Founder.
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
	return (
		<div
			data-ds-component="Am1MessageGroup"
			data-ds-sender={who.isAgent ? "agent" : "human"}
			className={[
				"group/msg relative flex gap-[12px] rounded-[var(--r-default)] px-[12px] py-[9px]",
				// Subtle own-message cue: a faint warm tint behind my own groups.
				who.isMe ? "bg-[color-mix(in_oklab,var(--accent-primary)_3%,transparent)]" : "",
			].join(" ")}
		>
			{/* Avatar column — identity at the group head */}
			<Avatar who={who} size={32} />
			<div className="min-w-0 flex-1">
				{/* Group head: name + agent marker + time */}
				<div className="mb-[6px] flex items-baseline gap-[9px]">
					<span className="text-[13px] font-[600] text-[var(--text-primary)]">{who.name}</span>
					{who.isAgent && (
						<span className="inline-flex items-center rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] px-[6px] py-[1px] text-[10px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--accent-primary)]">
							Agent
						</span>
					)}
					{who.isMe && (
						<span className="text-[11px] font-[500] text-[var(--text-tertiary)]">You</span>
					)}
					<span className="text-[11px] tabular-nums text-[var(--text-tertiary)]">{time}</span>
				</div>
				{/* Stacked message bodies under the single group head */}
				<div className="flex flex-col gap-[9px]">{children}</div>
			</div>

			{/* Hover toolbar — React · Reply · ⋯ (shown on demo row) */}
			<div
				className={[
					"absolute right-[12px] top-[3px] flex items-center gap-[3px] rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-[3px] shadow-[var(--shadow-subtle)]",
					hovered ? "flex" : "hidden group-hover/msg:flex",
				].join(" ")}
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
			className="flex h-[26px] w-[26px] items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] hover:bg-[var(--surface-container)] hover:text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)]"
		>
			<Glyph d={d} size={14} />
		</button>
	);
}

function Prose({ children }: { children: React.ReactNode }): JSX.Element {
	return (
		<p className="m-0 text-[15px] leading-[1.55] text-[var(--text-primary)]">{children}</p>
	);
}

// @-mention chip rendered inline in prose.
function Mention({ name }: { name: string }): JSX.Element {
	return (
		<span className="rounded-[var(--r-subtle)] bg-[var(--accent-primary-dim)] px-[3px] font-[500] text-[var(--accent-primary)]">
			@{name}
		</span>
	);
}

// A reaction pill stack under a message.
function Reactions(): JSX.Element {
	return (
		<div className="mt-[3px] flex items-center gap-[6px]">
			<button
				type="button"
				className="inline-flex items-center gap-[3px] rounded-[var(--r-pill)] border border-[var(--accent-primary)] bg-[var(--accent-primary-dim)] px-[9px] py-[1px] text-[12px] text-[var(--accent-primary)]"
				aria-label="2 thumbs-up reactions, you reacted"
			>
				<Glyph d={ICON_CHECK} size={11} />
				<span className="tabular-nums">2</span>
			</button>
			<button
				type="button"
				aria-label="Add reaction"
				className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-[var(--r-pill)] border border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:border-[var(--border-default)] hover:text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)]"
			>
				<Glyph d={ICON_REACT} size={12} />
			</button>
		</div>
	);
}

// ── Fold device: a quiet work-summary line that re-expands. ─────────
function Fold({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
	const [open, setOpen] = useState(false);
	return (
		<div>
			<button
				type="button"
				onClick={() => setOpen((p) => !p)}
				aria-expanded={open}
				className="inline-flex items-center gap-[6px] rounded-[var(--r-subtle)] text-[12px] font-[500] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] cursor-pointer"
			>
				<span
					className="transition-transform duration-[var(--motion-fast)]"
					style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
				>
					<Glyph d={ICON_FOLD} size={12} />
				</span>
				<span>{label}</span>
				<span className="text-[var(--text-tertiary)]">·</span>
				<span className="text-[var(--accent-primary)]">{open ? "Hide" : "Show"}</span>
			</button>
			{open && (
				<div className="mt-[9px] border-l-[1.5px] border-[var(--border-subtle)] pl-[12px] text-[13px] leading-[1.55] text-[var(--text-secondary)]">
					{children}
				</div>
			)}
		</div>
	);
}

// ── Embed: ONE restrained card treatment; opens a destination. ──────
function Embed({
	onOpen,
	label,
	children,
	active,
}: {
	onOpen?: () => void;
	label: string;
	children: React.ReactNode;
	/** When true, render as the currently-open embed (mirrors the right pane). */
	active?: boolean;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={onOpen}
			aria-label={label}
			data-ds-component="Am1Embed"
			className={[
				"group/embed mt-[3px] block w-full rounded-[var(--r-subtle)] border bg-[var(--surface-elevated)] px-[12px] py-[9px] text-left",
				"transition-colors duration-[var(--motion-fast)] cursor-pointer",
				active
					? "border-[var(--accent-primary)]"
					: "border-[var(--border-subtle)] hover:border-[var(--border-default)] hover:bg-[var(--surface-container)]",
			].join(" ")}
		>
			<div className="flex items-center gap-[12px]">
				<div className="min-w-0 flex-1">{children}</div>
				<span className="shrink-0 text-[var(--text-tertiary)] opacity-60 transition-opacity duration-[var(--motion-fast)] group-hover/embed:opacity-100">
					<Glyph d={ICON_ARROW} size={13} />
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

function DiffEmbedBody(): JSX.Element {
	return (
		<div>
			<EmbedKindLabel label="Change set" />
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
				<span className="tabular-nums">14 tool calls</span> · Dial in →
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
					className="inline-flex items-center gap-[3px] rounded-[var(--r-pill)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-[9px] py-[1px] text-[12px] text-[var(--text-secondary)] hover:border-[var(--border-default)] transition-colors duration-[var(--motion-fast)]"
				>
					<span className="text-[var(--text-tertiary)] tabular-nums">{i + 1}</span>
					<span className="truncate max-w-[140px]">{c}</span>
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

// ── Review Part → verdict actions, and the resolved verdict echo. ───
function ReviewPart({ onOpenDiff }: { onOpenDiff: () => void }): JSX.Element {
	return (
		<div data-ds-component="Am1ReviewPart" className="rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-[18px] shadow-[var(--shadow-subtle)]">
			<div className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
				Review · needs your decision
			</div>
			<p className="mt-[6px] mb-0 text-[15px] font-[600] leading-[1.4] text-[var(--text-primary)]">
				Approve deploy of passkey login to staging
			</p>
			<div className="mt-[9px]">
				<Fold label="Reasoning · 3 lines">
					<ul className="m-0 list-none space-y-[6px] p-0">
						{[
							"WebAuthn registration and the dual-auth window land behind a flag.",
							"All 38 auth contract tests pass; integration suite green.",
							"Existing password sessions stay valid through phase 2.",
						].map((line) => (
							<li key={line} className="flex gap-[9px]">
								<span className="text-[var(--text-tertiary)]">·</span>
								<span>{line}</span>
							</li>
						))}
					</ul>
				</Fold>
			</div>
			<div className="mt-[12px]">
				<Embed onOpen={onOpenDiff} label="Open the change set under review" active>
					<DiffEmbedBody />
				</Embed>
			</div>
			{/* Universal verdict set */}
			<div className="mt-[18px] flex items-center gap-[9px]">
				<VerdictButton tone="approve" label="Approve" />
				<VerdictButton tone="changes" label="Request changes" />
				<VerdictButton tone="reject" label="Reject" />
			</div>
		</div>
	);
}

function VerdictButton({
	tone,
	label,
}: {
	tone: "approve" | "changes" | "reject";
	label: string;
}): JSX.Element {
	const styles =
		tone === "approve"
			? {
					color: "var(--text-on-accent)",
					background: "var(--accent-primary)",
					border: "1px solid var(--accent-primary)",
				}
			: {
					color: "var(--text-secondary)",
					background: "transparent",
					border: "1px solid var(--border-default)",
				};
	return (
		<button
			type="button"
			// hearth-internal-padding: button vertical padding is optically tuned
			className="rounded-[var(--r-subtle)] px-[12px] py-[7px] text-[13px] font-[500] cursor-pointer transition-colors duration-[var(--motion-fast)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]"
			style={styles}
		>
			{label}
		</button>
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
// COMPOSER — full anatomy. Bottom-pinned card centered in the column.
// banner · attachment chips · [ + Aa | textarea | Send ] · formatting +
// @mention + / + emoji + attach affordances. NO model/effort/mode pills.
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
			className="flex h-[28px] w-[28px] items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] hover:bg-[var(--surface-container)] hover:text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)]"
		>
			<Glyph d={d} size={size} />
		</button>
	);
}

function Composer(): JSX.Element {
	return (
		<div className="shrink-0 bg-[var(--surface-page)] px-[24px] pb-[18px] pt-[9px]">
			<div className="mx-auto w-full max-w-[760px]">
				<div className="rounded-[var(--r-default)] border border-[var(--border-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)] focus-within:shadow-[var(--shadow-default)] transition-shadow duration-[var(--motion-fast)]">
					{/* Optional banner (replying / editing / unresolved review) */}
					<div className="flex items-center gap-[6px] border-b border-[var(--border-subtle)] px-[12px] py-[6px] text-[12px] text-[var(--text-secondary)]">
						<span className="text-[var(--text-tertiary)]">
							<Glyph d={ICON_REPLY} size={12} />
						</span>
						<span>
							Replying to <span className="font-[500] text-[var(--text-primary)]">Atlas</span>
						</span>
						<button
							type="button"
							aria-label="Cancel reply"
							className="ml-auto rounded-[var(--r-subtle)] px-[6px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
						>
							✕
						</button>
					</div>

					{/* Attachment-chip row (one chip present) */}
					<div className="flex flex-wrap items-center gap-[6px] px-[12px] pt-[9px]">
						<div className="inline-flex items-center gap-[6px] rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-container)] px-[9px] py-[3px] text-[12px] text-[var(--text-secondary)]">
							<Glyph d={ICON_DOC} size={12} />
							<span>auth-flow.png</span>
							<span className="text-[var(--text-tertiary)] tabular-nums">82 KB</span>
							<button
								type="button"
								aria-label="Remove attachment"
								className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
							>
								✕
							</button>
						</div>
					</div>

					{/* Input row: [ + Aa | textarea | Send ] */}
					<div className="flex items-end gap-[9px] px-[12px] py-[9px]">
						<div className="flex items-center gap-[3px] pb-[3px]">
							<ComposerToolButton d={ICON_PLUS} label="Add (tools menu)" />
						</div>
						<textarea
							rows={1}
							placeholder="Message Atlas, Mara…"
							className="min-h-[24px] flex-1 resize-none border-none bg-transparent py-[3px] text-[15px] leading-[1.5] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-placeholder)]"
							defaultValue="Looks good — one nit on the error copy, can you "
						/>
						<button
							type="button"
							aria-label="Send message"
							// hearth-internal-padding
							className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] bg-[var(--accent-primary)] text-[var(--text-on-accent)] hover:bg-[var(--accent-primary-hover)] transition-colors duration-[var(--motion-fast)]"
						>
							<Glyph d={ICON_SEND} size={15} />
						</button>
					</div>

					{/* Formatting + affordance strip */}
					<div className="flex items-center gap-[3px] border-t border-[var(--border-subtle)] px-[12px] py-[3px]">
						<ComposerToolButton d={ICON_BOLD} label="Bold" size={14} />
						<ComposerToolButton d={ICON_ITALIC} label="Italic" size={14} />
						<ComposerToolButton d={ICON_CODE} label="Code" size={14} />
						<ComposerToolButton d={ICON_LINK} label="Link" size={14} />
						<span className="mx-[3px] h-[16px] w-[1px] bg-[var(--border-subtle)]" aria-hidden="true" />
						<ComposerToolButton d={ICON_AT} label="Mention" size={14} />
						<ComposerToolButton d={ICON_PAPERCLIP} label="Attach" size={14} />
						<span className="ml-auto text-[11px] text-[var(--text-tertiary)]">
							Enter to send · Shift+Enter for newline
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

// ───────────────────────────────────────────────────────────────────
// RIGHT CONTEXTUAL PANE — open on the embedded diff/change-set.
// Header (file + +N/−M) · tab strip (Diff / Files / Session) · diff body.
// Concretizes the embed→destination relationship.
// ───────────────────────────────────────────────────────────────────
const DIFF_LINES: ReadonlyArray<{ sign: "+" | "-" | " "; text: string }> = [
	{ sign: " ", text: "export async function registerPasskey(userId: string) {" },
	{ sign: "-", text: "  const cred = await navigator.credentials.create(legacyOpts);" },
	{ sign: "+", text: "  const cred = await navigator.credentials.create(webauthnOpts);" },
	{ sign: "+", text: "  if (!cred) throw new PasskeyError('cancelled');" },
	{ sign: " ", text: "  await persistCredential(userId, cred);" },
	{ sign: "+", text: "  await openDualAuthWindow(userId, { ttlDays: 30 });" },
	{ sign: " ", text: "  return { ok: true };" },
	{ sign: " ", text: "}" },
];

function ContextPane({ onClose }: { onClose: () => void }): JSX.Element {
	const tabs = ["Diff", "Files", "Session"];
	return (
		<aside
			data-ds-component="Am1ContextPane"
			aria-label="Change set"
			className="flex flex-col border-l border-[var(--border-subtle)] bg-[var(--surface-container)]"
			style={{ width: 420, flexShrink: 0, height: "100%", overflow: "hidden" }}
		>
			{/* Header */}
			<div className="flex shrink-0 items-center gap-[9px] border-b border-[var(--border-subtle)] px-[18px] py-[12px]">
				<div className="min-w-0 flex-1">
					<div className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
						Change set
					</div>
					<div className="flex items-baseline gap-[9px]">
						<span className="truncate font-mono text-[13px] font-[500] text-[var(--text-primary)]">
							auth/passkey.ts
						</span>
						<span className="shrink-0 font-mono text-[12px] tabular-nums">
							<span className="text-[var(--status-success)]">+124</span>{" "}
							<span className="text-[var(--status-error)]">−18</span>
						</span>
					</div>
				</div>
				<button
					type="button"
					aria-label="Close pane"
					onClick={onClose}
					className="flex h-[28px] w-[28px] items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)]"
				>
					✕
				</button>
			</div>

			{/* Tab strip */}
			<div className="flex shrink-0 items-center gap-[3px] border-b border-[var(--border-subtle)] px-[12px]">
				{tabs.map((t, i) => (
					<div
						key={t}
						className={[
							"px-[12px] py-[9px] text-[13px] cursor-pointer",
							i === 0
								? "border-b-[1.5px] border-[var(--accent-primary)] font-[600] text-[var(--text-primary)]"
								: "font-[500] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
						].join(" ")}
					>
						{t}
					</div>
				))}
			</div>

			{/* Diff body */}
			<div
				className="py-[6px] font-mono text-[12px] leading-[1.6]"
				style={{ minHeight: 0, flex: 1, overflowY: "auto" }}
			>
				{DIFF_LINES.map((l, i) => {
					const bg =
						l.sign === "+"
							? "bg-[color-mix(in_oklab,var(--status-success)_10%,transparent)]"
							: l.sign === "-"
								? "bg-[color-mix(in_oklab,var(--status-error)_10%,transparent)]"
								: "";
					const gutter =
						l.sign === "+"
							? "text-[var(--status-success)]"
							: l.sign === "-"
								? "text-[var(--status-error)]"
								: "text-[var(--text-tertiary)]";
					return (
						<div key={`${i}-${l.text}`} className={`flex gap-[12px] px-[18px] ${bg}`}>
							<span className={`w-[12px] shrink-0 select-none ${gutter}`}>{l.sign === " " ? "" : l.sign}</span>
							<span className="whitespace-pre text-[var(--text-primary)]">{l.text}</span>
						</div>
					);
				})}
			</div>
		</aside>
	);
}

// ───────────────────────────────────────────────────────────────────
// The full surface.
// ───────────────────────────────────────────────────────────────────
export default function Am1ConversationSurface(): JSX.Element {
	const [paneOpen, setPaneOpen] = useState(true);
	const openDiff = (): void => setPaneOpen(true);

	return (
		<div
			data-ds-component="Am1ConversationSurface"
			data-ds-thread-id="c-passkey"
			className="w-full overflow-hidden bg-[var(--surface-page)] text-[var(--text-primary)]"
			style={{ display: "flex", height: "100%", fontFamily: "var(--font-sans)" }}
		>
			{/* 1 · CONVERSATION pane (primary) */}
			<main
				className="flex flex-col bg-[var(--surface-page)]"
				style={{ flex: 1, minWidth: 0, height: "100%" }}
			>
				<ConversationHeader />

				<div
					className="px-[24px] py-[12px]"
					style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
				>
					<div className="mx-auto flex w-full max-w-[760px] flex-col gap-[6px]">
						{/* 1 · Founder ask (own-message cue) */}
						<MessageGroup who={FOUNDER} time="9:02">
							<Prose>Can you wire passkey login and show me the diff before we deploy?</Prose>
						</MessageGroup>

						{/* 2 · Mara teammate — @mention + reaction (multi-user, me-vs-them) */}
						<MessageGroup who={MARA} time="9:05">
							<div>
								<Prose>
									<Mention name="Atlas" /> please keep the password fallback for phase 2 — some of
									our enterprise tenants can't enroll passkeys yet.
								</Prose>
								<Reactions />
							</div>
						</MessageGroup>

						{/* 3 · Atlas agent summary — work-Fold + diff Embed + citations */}
						<MessageGroup who={ATLAS} time="9:11">
							<div>
								<Prose>
									Added WebAuthn registration and the dual-auth window. Existing password sessions
									stay valid through phase 2, <Mention name="Mara" /> — fallback preserved.
								</Prose>
								<div className="mt-[6px]">
									<Fold label="Worked for 1m 12s">
										Ran the auth contract suite, regenerated the credential schema, and verified the
										dual-auth window against the migration plan. Full activity lives in the session.
									</Fold>
								</div>
								<Embed onOpen={openDiff} label="Open the change set" active={paneOpen}>
									<DiffEmbedBody />
								</Embed>
								<CitationChips />
							</div>
						</MessageGroup>

						{/* 4 · Atlas (consecutive — collapses under the same head): refs + attachment + session */}
						<MessageGroup who={ATLAS} time="9:12">
							<div className="flex flex-col gap-[9px]">
								<div>
									<Prose>Context for the dual-auth window and the flow diagram:</Prose>
									<Embed onOpen={() => undefined} label="Open referenced plan">
										<BlockRefEmbedBody />
									</Embed>
									<AttachmentChip name="auth-flow.png" meta="PNG · 82 KB" />
								</div>
								<div>
									<Prose>This all came out of my work session:</Prose>
									<Embed onOpen={() => undefined} label="Open the session dial-in">
										<SessionRefEmbedBody />
									</Embed>
								</div>
							</div>
						</MessageGroup>

						{/* 5 · Atlas review message → verdict actions */}
						<MessageGroup who={ATLAS} time="9:13" hovered>
							<ReviewPart onOpenDiff={openDiff} />
						</MessageGroup>

						{/* 6 · Founder verdict — resolved (own-message cue) */}
						<MessageGroup who={FOUNDER} time="9:14">
							<VerdictEcho />
						</MessageGroup>
					</div>
				</div>

				<Composer />
			</main>

			{/* 2 · RIGHT CONTEXTUAL PANE (open on the diff embed) */}
			{paneOpen && <ContextPane onClose={() => setPaneOpen(false)} />}
		</div>
	);
}
