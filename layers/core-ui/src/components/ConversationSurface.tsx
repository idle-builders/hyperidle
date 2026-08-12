/**
 * Conversation Surface — the FULL-SCOPE conversation embodied in the REAL app
 * container, INTERACTIVE. (The approved AM1 conversation design; story title
 * "Conversation Surface".)
 *
 * SCOPE = THE OPEN CONVERSATION (the open thread's content). Header ·
 * author-grouped messages · composer. Navigating BETWEEN threads is the app
 * sidebar (app-shell chrome, NOT part of this design).
 *
 * ── PROP-DRIVEN, ONE SURFACE FOR STORY + PAGE (AM1 task 11) ─────────────────
 * `ConversationSurface` is prop-driven. The STORY passes its fixture (PARTS +
 * fixture header/participants + a console-`onOpen` noop + a noop `onSend`); the
 * PAGE (`Conversations.tsx`) passes real data (`derivePartsFromMessages(...)`,
 * `createOpenHandler(navigate)`, real header/participants, a functional
 * `onSend`). The approved design and the production page are therefore the SAME
 * component — they cannot drift (extends the round-10 no-drift guarantee from
 * the message column to the whole surface).
 *
 * ── COMPOSES THE PRODUCTION RENDERER (AM1 task 10) ──────────────────────────
 * The message column is rendered by the SAME source-agnostic `<PartList>` the
 * production page uses, over the passed-in `Part[]`. The composer + header
 * chrome (not owned by PartList) stay hand-rolled here so the surface renders
 * stand-alone in the viewer without AppShell's router/context. Reference chips +
 * the Fold come from the design system (promoted in AM1).
 *
 * ── THE CONVERSATION OWNS NO VIEWING SURFACE (round-8, founder) ──────────────
 * Reference chips are NAVIGATION HOOKS into the existing OWNED surfaces via the
 * `OpenTarget` seam (block → host surface, artifact → Artifact view, review →
 * Review page). Nothing renders inline. In the isolated story (no router) the
 * `onOpen` hook is a clearly-labeled console noop naming its target route.
 *
 * @lore AM1-r8: the conversation owns NO viewing surface. The single `onOpen`
 * OpenHandler replaces the old per-target callback props; production binds it to
 * navigate(), the story to console.info.
 *
 * @lore AM1 task 11: the fixture (`PARTS`/`FOUNDER`/`MARA`/`ATLAS`) moved OUT of
 * this component and INTO `ConversationSurface.stories.tsx` — it is now passed in
 * as props. The story render stays byte-identical (it passes what was previously
 * module-internal). Composer "+" menu items are visible affordances that do NOT
 * yet mutate the draft (AM1 §12.6 — honest minimum: send works, rich-compose
 * affordances are visible but inert).
 */

import type { OpenHandler, OpenTarget, Part } from "@hyperidle/conversation-parts";
import { Button, ReferenceChip } from "@hyperidle/design-system";
import { type JSX, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PartList } from "./PartList.js";

const INSERTED_CODE_TITLE = "auth/passkey.ts";

export interface ConversationSurfaceParticipant {
	readonly id: string;
	readonly name: string;
	readonly isAgent: boolean;
}

export interface ConversationSurfaceHeader {
	readonly title: string;
	readonly hostKind: string;
	readonly hostTitle: string;
	readonly hostRoute: string | null;
}

export interface ConversationSurfaceProps {
	/** The derived render units (page: derivePartsFromMessages(...); story: PARTS fixture). */
	parts: ReadonlyArray<Part>;
	/** The routing seam. page: createOpenHandler(navigate); story: console.info noop. */
	onOpen: OpenHandler;
	/** Thread identity for the header (title + host tag/context). */
	header: ConversationSurfaceHeader;
	/** Participants for the header AvatarGroup (derived from identities). */
	participants: ReadonlyArray<ConversationSurfaceParticipant>;
	/** The send path. page: posts a plain message via the existing endpoint; story: noop. */
	onSend: (text: string) => Promise<void> | void;
	/** Story-only visual toggles (default false; the page never sets these). */
	scroll?: boolean;
	composerActive?: boolean;
}

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
const ICON_PLUS = "M7.25 2h1.5v5.25H14v1.5H8.75V14h-1.5V8.75H2v-1.5h5.25V2z";
const ICON_SEND = "M2 8l12-6-5.2 12-1.8-4.8L2 8z";
const ICON_PAPERCLIP =
	"M11.5 3.5a2.5 2.5 0 013.5 3.5l-7 7a4 4 0 11-5.6-5.6l6.3-6.3 1 1L3.4 9.4a2.6 2.6 0 003.6 3.6l7-7a1 1 0 00-1.4-1.4L6 11.2a.5.5 0 00.7.7l5-5 1 1-5 5A2 2 0 014 10.2l6.5-6.5z";
const ICON_DOC = "M4 1h5l3 3v10a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1zm5 1.5V4h1.5L9 2.5z";
const ICON_REPLY = "M6.5 3L2 7l4.5 4V8.4c3.2 0 5.2 1 6.5 3.6.4-4.3-1.8-7.4-6.5-8V3z";
const ICON_MORE =
	"M3 6.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm5 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm5 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3z";
const ICON_REMOVE =
	"M4.3 3.2L8 6.9l3.7-3.7 1.1 1.1L9.1 8l3.7 3.7-1.1 1.1L8 9.1l-3.7 3.7-1.1-1.1L6.9 8 3.2 4.3l1.1-1.1z";
const ICON_FORMAT_AA =
	"M5.6 3h1.6l3.1 8H8.6l-.62-1.7H4.84L4.22 11H2.5l3.1-8zm.18 2.1L4.36 7.9h2.84L5.78 5.1zM12 6.4h1.5V11H12v-.5a1.7 1.7 0 01-1.2.6c-1 0-1.7-.7-1.7-1.6 0-.95.8-1.5 2-1.5h.9v-.15c0-.5-.3-.75-.85-.75-.42 0-.78.16-1.1.42l-.58-.95A3 3 0 0111.2 6.3c.3 0 .55.04.8.1zm-.2 2.85h-.7c-.5 0-.78.2-.78.55 0 .3.24.5.62.5.45 0 .82-.3.86-.75v-.3z";
const ICON_AT =
	"M8 1a7 7 0 100 14c1.4 0 2.7-.4 3.8-1.1l-.8-1.2A5.5 5.5 0 118 2.5 5.5 5.5 0 0113.5 8c0 1-.6 1.5-1.2 1.5S11 9 11 8V5.2H9.5V6A2.8 2.8 0 108 11a2.7 2.7 0 002-.9 2.3 2.3 0 002.3 1.4C14 11.5 15 10.1 15 8A7 7 0 008 1zm0 8.5A1.5 1.5 0 118 6.5a1.5 1.5 0 010 3z";
const ICON_EMOJI =
	"M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM5.6 6.2a.95.95 0 110 1.9.95.95 0 010-1.9zm4.8 0a.95.95 0 110 1.9.95.95 0 010-1.9zM4.9 9.4h6.2a3.2 3.2 0 01-6.2 0z";
const ICON_BLOCKS = "M2.5 2.5h11v2.2h-11V2.5zm0 3.6h11v2.2h-11V6.1zm0 3.6h7v2.2h-7V9.7z";

// ───────────────────────────────────────────────────────────────────
// Avatar — human vs agent tint + a stronger agent ring.
// ───────────────────────────────────────────────────────────────────
function initialsOf(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
	return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
}

function Avatar({
	who,
	size = 26,
}: {
	who: ConversationSurfaceParticipant;
	size?: number;
}): JSX.Element {
	const color = who.isAgent
		? "bg-[var(--accent-primary-dim)] border-[var(--accent-deep)] text-[var(--accent-deep)]"
		: "bg-[var(--surface-container)] border-[var(--border-default)] text-[var(--text-secondary)]";
	return (
		<div
			className={`inline-flex items-center justify-center rounded-[var(--r-pill)] border-[1.5px] font-[600] shrink-0 ${color}`}
			style={{ width: size, height: size, fontSize: size <= 22 ? 10 : 12 }}
			aria-hidden="true"
		>
			{initialsOf(who.name)}
		</div>
	);
}

function ParticipantGroup({
	people,
}: {
	people: ReadonlyArray<ConversationSurfaceParticipant>;
}): JSX.Element {
	return (
		<div data-ds-component="AvatarGroup" className="flex items-center pl-[3px]">
			{people.map((p, i) => (
				<div
					key={p.id}
					className="rounded-[var(--r-pill)] ring-2 ring-[var(--surface-page)]"
					style={{ marginLeft: i === 0 ? 0 : -9, zIndex: people.length - i }}
				>
					<Avatar who={p} size={26} />
				</div>
			))}
		</div>
	);
}

function ConversationHeader({
	header,
	participants,
	onActions,
}: {
	header: ConversationSurfaceHeader;
	participants: ReadonlyArray<ConversationSurfaceParticipant>;
	onActions: () => void;
}): JSX.Element {
	return (
		<header className="shrink-0 border-b border-[var(--border-subtle)] bg-[var(--surface-page)] px-[18px] py-[12px]">
			<div className="mx-auto flex w-full max-w-[760px] items-center gap-[12px]">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-[6px] text-[12px] text-[var(--text-secondary)]">
						<span className="inline-flex items-center rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] px-[9px] py-[1px] text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--accent-deep)]">
							{header.hostKind}
						</span>
						<span className="text-[var(--text-tertiary)]">·</span>
						{header.hostRoute ? (
							<Link
								to={header.hostRoute}
								className="truncate font-[500] text-[var(--text-primary)] hover:text-[var(--accent-deep)] hover:underline"
							>
								{header.hostTitle}
							</Link>
						) : (
							<span className="truncate font-[500] text-[var(--text-primary)]">
								{header.hostTitle}
							</span>
						)}
					</div>
					<h1 className="mt-[3px] mb-0 text-[17px] font-[600] leading-[1.25] text-[var(--text-primary)]">
						{header.title}
					</h1>
				</div>
				<div className="flex items-center gap-[9px]">
					<ParticipantGroup people={participants} />
					<span className="text-[12px] tabular-nums text-[var(--text-tertiary)]">
						{participants.length}
					</span>
				</div>
				<button
					type="button"
					onClick={onActions}
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
// COMPOSER — UNIFIED tool affordance. ONE "+" button opens ONE menu with
// every compose action, each labeled + single-purpose. No duplicate icon strip.
// AM1 §12.6: the menu items are VISIBLE AFFORDANCES — picking one closes the
// menu but does NOT yet mutate the draft (rich-compose wiring is deferred).
// @lore AM5 T9 DEFER: InsertMenu open contract wiring (clicking an item → open
// the referenced artifact/block) is OUT OF SCOPE for AM5. This is a draft-mutation/
// rich-compose concern. Affordance stays visible; a later composer WP wires it.
// ───────────────────────────────────────────────────────────────────
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
			data-ds-component="InsertMenu"
			role="menu"
			aria-label="Insert"
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
					// This is a full menu ROW (icon + label + hint), not a Button — a
					// dedicated backlog item already tracks this composer's
					// consolidation onto the DS Composer (which owns its own menu
					// shape); a partial Button swap here would be rework once that
					// lands.
					className={`flex w-full items-center gap-[9px] rounded-[var(--r-subtle)] px-[9px] py-[6px] text-left transition-colors duration-[var(--motion-fast)] ${
						// @lore AZ7 N1: bg-[var(--accent-primary-dim)] is Set 3's row-hover /
						// selected tint — no longer a no-handrolled-control violation
						// (the rule's predicate excludes this exact token).
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
							className={`block text-[13px] font-[600] ${it.key ? "text-[var(--accent-deep)]" : "text-[var(--text-primary)]"}`}
						>
							{it.label}
						</span>
						<span className="block truncate text-[11px] text-[var(--text-tertiary)]">
							{it.hint}
						</span>
					</span>
				</button>
			))}
		</div>
	);
}

function ComposerReplyBanner({ onCancel }: { onCancel: () => void }): JSX.Element {
	return (
		<div className="flex items-center gap-[9px] border-b border-[var(--border-subtle)] px-[12px] py-[6px]">
			<span className="flex shrink-0 items-center text-[var(--accent-deep)]">
				<Glyph d={ICON_REPLY} size={12} />
			</span>
			<div className="flex min-w-0 flex-1 items-baseline gap-[6px] border-l-[2px] border-[var(--accent-deep)] pl-[9px] text-[12px] leading-[1.4]">
				<span className="shrink-0 text-[var(--text-secondary)]">
					Replying to <span className="font-[600] text-[var(--text-primary)]">Atlas</span>
				</span>
				<span className="truncate text-[var(--text-tertiary)]">
					“Added WebAuthn registration and the dual-auth window…”
				</span>
			</div>
			<button
				type="button"
				onClick={onCancel}
				aria-label="Cancel reply"
				title="Cancel reply"
				className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-container)] hover:text-[var(--text-secondary)]"
			>
				<Glyph d={ICON_REMOVE} size={11} />
			</button>
		</div>
	);
}

// Active-state draft body: ALL attachments render through the SAME shared
// design-system ReferenceChip (draft mode) in a single horizontal wrapping row.
function ComposerDraftBody({ onOpen }: { onOpen: (t: OpenTarget) => void }): JSX.Element {
	return (
		<div
			data-ds-component="ComposerDraftBody"
			className="flex flex-wrap items-center gap-[6px] px-[12px] pt-[9px]"
		>
			<ReferenceChip
				kind="artifact"
				label={INSERTED_CODE_TITLE}
				meta="TS · 3 lines"
				mode="draft"
				onOpen={() => onOpen({ route: "artifact", artifactId: "art-1" })}
			/>
			<ReferenceChip kind="image" label="auth-flow.png" meta="82 KB" mode="draft" />
		</div>
	);
}

function ComposerInputRow({
	insertMenuOpen,
	onToggleMenu,
	onPickMenu,
	onSend,
	placeholder,
	value,
	onChange,
	menuButtonRef,
}: {
	insertMenuOpen: boolean;
	onToggleMenu: () => void;
	onPickMenu: () => void;
	onSend: () => void;
	placeholder: string;
	value: string;
	onChange: (next: string) => void;
	menuButtonRef: React.RefObject<HTMLButtonElement | null>;
}): JSX.Element {
	return (
		<div className="flex items-end gap-[9px] px-[12px] py-[9px]">
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
					// A pressed/open TOGGLE state, not a Button variant (Button has no
					// built-in pressed treatment distinct from its 4 action variants).
					// A dedicated backlog item owns this composer's full consolidation.
					// @lore AZ7 N1: bg-[var(--accent-primary-dim)] is Set 3's row-hover /
					// selected tint — not a no-handrolled-control violation.
					className={
						insertMenuOpen
							? "flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] border border-[var(--accent-deep)] bg-[var(--accent-primary-dim)] text-[var(--accent-deep)]"
							: "flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] border border-[var(--border-default)] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-container)] hover:text-[var(--text-primary)]"
					}
				>
					<Glyph d={ICON_PLUS} size={14} />
				</button>
			</div>
			<textarea
				rows={3}
				placeholder={placeholder}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="min-h-[72px] flex-1 resize-none border-none bg-transparent py-[3px] text-[15px] leading-[1.5] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-placeholder)]"
			/>
			<Button variant="primary" size="icon" onClick={onSend} aria-label="Send message">
				<Glyph d={ICON_SEND} size={15} />
			</Button>
		</div>
	);
}

function Composer({
	active,
	insertMenuOpen,
	onToggleMenu,
	onPickMenu,
	onCancelReply,
	onSend,
	onOpen,
	placeholder,
	value,
	onChange,
	menuButtonRef,
}: {
	active: boolean;
	insertMenuOpen: boolean;
	onToggleMenu: () => void;
	onPickMenu: () => void;
	onCancelReply: () => void;
	onSend: () => void;
	onOpen: (t: OpenTarget) => void;
	placeholder: string;
	value: string;
	onChange: (next: string) => void;
	menuButtonRef: React.RefObject<HTMLButtonElement | null>;
}): JSX.Element {
	return (
		<div className="shrink-0 bg-[var(--surface-page)] px-[18px] pb-[18px] pt-[9px]">
			<div className="mx-auto w-full max-w-[760px]">
				<div className="relative rounded-[var(--r-default)] border border-[var(--border-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)] transition-shadow duration-[var(--motion-fast)] focus-within:shadow-[var(--shadow-default)]">
					{active && <ComposerReplyBanner onCancel={onCancelReply} />}
					{active && <ComposerDraftBody onOpen={onOpen} />}
					<ComposerInputRow
						insertMenuOpen={insertMenuOpen}
						onToggleMenu={onToggleMenu}
						onPickMenu={onPickMenu}
						onSend={onSend}
						placeholder={placeholder}
						value={value}
						onChange={onChange}
						menuButtonRef={menuButtonRef}
					/>
				</div>
			</div>
		</div>
	);
}

// ───────────────────────────────────────────────────────────────────
// The conversation surface — INTERACTIVE, prop-driven. The conversation column
// (PartList) + composer ONLY; it owns NO viewing surface. The single `onOpen`
// OpenHandler routes references to their owned surfaces (page: navigate; story:
// console noop). `onSend` posts the typed plain message (page: real endpoint).
// ───────────────────────────────────────────────────────────────────
export default function ConversationSurface({
	parts,
	onOpen,
	header,
	participants,
	onSend,
	scroll = false,
	composerActive = false,
}: ConversationSurfaceProps): JSX.Element {
	const [insertMenuOpen, setInsertMenuOpen] = useState(false);
	const [replyActive, setReplyActive] = useState(composerActive);
	const [draft, setDraft] = useState(
		composerActive ? "Here's the corrected registration flow — one nit on the error copy: " : "",
	);
	const menuButtonRef = useRef<HTMLButtonElement | null>(null);

	const placeholder = `Message ${participants
		.map((p) => p.name)
		.slice(0, 2)
		.join(", ")}…`;

	const handleSend = (): void => {
		const text = draft.trim();
		if (text.length === 0) {
			setReplyActive(false);
			return;
		}
		void onSend(text);
		setDraft("");
		setReplyActive(false);
	};

	// Outside-click / Escape closes the Insert menu (real popover behavior).
	useEffect(() => {
		if (!insertMenuOpen) return;
		const onDown = (e: MouseEvent): void => {
			const menu = document.querySelector("[data-ds-component='InsertMenu']");
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
			data-ds-component="ConversationSurface"
			data-testid="conversation-surface"
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
				<ConversationHeader
					header={header}
					participants={participants}
					onActions={() => setReplyActive((v) => !v)}
				/>
				<div
					className="px-[18px] py-[12px]"
					style={scroll ? { flex: 1, minHeight: 0, overflowY: "auto" } : undefined}
				>
					<div className="mx-auto w-full max-w-[760px]">
						{/* The message column is rendered by the PRODUCTION renderer — the
						    approved design and PartList cannot drift. */}
						<PartList parts={parts} onOpen={onOpen} />
					</div>
				</div>
				<Composer
					active={replyActive}
					insertMenuOpen={insertMenuOpen}
					onToggleMenu={() => setInsertMenuOpen((v) => !v)}
					onPickMenu={() => setInsertMenuOpen(false)}
					onCancelReply={() => setReplyActive(false)}
					onSend={handleSend}
					onOpen={onOpen}
					placeholder={placeholder}
					value={draft}
					onChange={setDraft}
					menuButtonRef={menuButtonRef}
				/>
			</main>
		</div>
	);
}
