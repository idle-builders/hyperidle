/**
 * AM1 — Conversation Experience, Variant C: "Editorial".
 *
 * A self-contained, presentational embodiment of the AM1 design brief's
 * canonical fixture conversation, rendered through Variant C's REDO thesis
 * (brief §"REDO v2 — FOUNDER FEEDBACK"): the conversation reads like a
 * beautifully typeset long-form article. A generous centered reading column
 * (~720px), slightly larger body type (15px / --leading-relaxed), and almost
 * NO per-message chrome.
 *
 * The restraint taken from the t3code reference
 * (`plans/AM1/Screenshot 2026-06-16 at 22.15.49.png`):
 *  - NO avatar / NO role badge / NO timestamp on every message. The founder's
 *    turn is pure prose. An agent work-turn is marked at most ONCE by a quiet
 *    uppercase section label `RESPONSE · WORKED FOR 1M 12S` — that label IS
 *    the Fold.
 *  - ONE alignment grid: every element — prose, label, embed — shares the
 *    column's single left edge. No insets, no ragged avatars.
 *  - ONE consistent calm embed treatment: a hairline-framed full-bleed block,
 *    column-edge aligned, surrounded by generous whitespace. The artifact diff
 *    renders its real +/− lines in place (foldable); the referenced block
 *    renders its real content inline; the session reference is a single quiet
 *    inline line that opens the dial-in (never a work-log).
 *  - Structure from typography + whitespace, not boxes/borders/badges/rails.
 *
 * This is a /design Phase-1 embodiment artifact, NOT production code. The
 * production component-reuse mapping (the Part model + Embed + Fold
 * primitives, CommentRow, RichMessageCard, Composer, ArtifactEmbed,
 * BlockRefEmbed, the new SessionReferenceEmbed) lives in
 * `plans/AM1/design/calm-document/spec.md`. Here every visual is hand-rolled
 * with Tailwind + Hearth semantic-token classes so the story renders reliably
 * in the :8098 viewer without depending on component APIs.
 *
 * Honors the locked concept (`plans/AM1/concept.md`): deliberate messages
 * only; the session is a REFERENCE Embed (a quiet line that opens the
 * lower-level dial-in), NEVER an inlined work-log; renders within
 * Thread/Message/verdict; names nothing "Block"/"blocked".
 */

import type React from "react";
import { useState } from "react";

// ── Quiet section label: the only turn chrome (also IS the Fold) ─────────
// Uppercase, letter-spaced, tertiary. Marks an agent work-turn calmly — no
// avatar, no badge, no timestamp.

function SectionLabel({
	children,
	trailing,
}: {
	children: React.ReactNode;
	trailing?: React.ReactNode;
}): React.JSX.Element {
	return (
		<div className="flex items-baseline gap-[9px]">
			<span
				className="text-[11px] font-[var(--fw-semibold)] uppercase text-[var(--text-tertiary)]"
				style={{ letterSpacing: "var(--tracking-caps)" }}
			>
				{children}
			</span>
			{trailing}
		</div>
	);
}

/**
 * Document body text — the editorial typographic core. 15px, relaxed leading,
 * primary text on the page surface (no card chrome). Bold inline lead-ins are
 * passed as children.
 */
function BodyText({ children }: { children: React.ReactNode }): React.JSX.Element {
	return (
		<p className="text-[15px] text-[var(--text-primary)]" style={{ lineHeight: "var(--leading-relaxed)" }}>
			{children}
		</p>
	);
}

// ── The Fold: a quiet "RESPONSE · WORKED FOR 1M 12S" label that expands ──
// This is the first-class calm device — a section label with an optional
// "Show", not a heavy bordered fold card.

function WorkFold(): React.JSX.Element {
	const [open, setOpen] = useState(false);
	return (
		<div data-ds-part="fold" className="flex flex-col gap-[12px]">
			<SectionLabel
				trailing={
					<button
						type="button"
						aria-expanded={open}
						onClick={() => setOpen((v) => !v)}
						className="text-[11px] font-[var(--fw-medium)] uppercase text-[var(--text-tertiary)] transition-colors"
						style={{
							letterSpacing: "var(--tracking-caps)",
							transitionDuration: "var(--motion-fast)",
						}}
					>
						{open ? "Hide" : "Show"}
					</button>
				}
			>
				Response · Worked for 1m 12s · 14 steps
			</SectionLabel>
			{open ? (
				<BodyText>
					Added WebAuthn registration and the dual-auth window. Existing sessions stay
					valid through phase 2.
				</BodyText>
			) : null}
		</div>
	);
}

// ── The one calm embed frame: hairline-bordered, column-edge aligned ─────
// Every embed shares this single treatment — no shadows, no accent rails, no
// tinted variants. Whitespace around it (the Turn's gap) does the separating.

function EmbedFrame({
	children,
	"data-ds-part": part,
}: {
	children: React.ReactNode;
	"data-ds-part": string;
}): React.JSX.Element {
	return (
		<div
			data-ds-part={part}
			className="overflow-hidden rounded-[var(--r-subtle)]"
			style={{ border: "1px solid var(--border-subtle)" }}
		>
			{children}
		</div>
	);
}

/** The quiet caption line atop an embed — kind + name, tertiary, aligned. */
function EmbedCaption({
	kind,
	name,
	detail,
	trailing,
}: {
	kind: string;
	name: React.ReactNode;
	detail?: string;
	trailing?: React.ReactNode;
}): React.JSX.Element {
	return (
		<div className="flex items-center gap-[9px] px-[18px] py-[12px]">
			<span
				className="text-[11px] font-[var(--fw-semibold)] uppercase text-[var(--text-tertiary)]"
				style={{ letterSpacing: "var(--tracking-caps)" }}
			>
				{kind}
			</span>
			<span className="font-[var(--fw-medium)] text-[13px] text-[var(--text-primary)]">{name}</span>
			{detail ? <span className="text-[13px] text-[var(--text-tertiary)]">{detail}</span> : null}
			{trailing ? <span className="ml-auto">{trailing}</span> : null}
		</div>
	);
}

// ── Embed 1: full-bleed inline artifact diff (real +/− lines, foldable) ──

interface DiffLine {
	readonly sign: "+" | "-" | " ";
	readonly text: string;
}

const DIFF_LINES: ReadonlyArray<DiffLine> = [
	{ sign: " ", text: "import { startRegistration } from '@simplewebauthn/browser';" },
	{ sign: "-", text: "export async function login(email: string, password: string) {" },
	{ sign: "+", text: "export async function login(email: string) {" },
	{ sign: "+", text: "  const options = await fetchRegistrationOptions(email);" },
	{ sign: "+", text: "  return startRegistration(options);" },
	{ sign: " ", text: "}" },
];

function ArtifactDiffEmbed(): React.JSX.Element {
	const [open, setOpen] = useState(true);
	return (
		<EmbedFrame data-ds-part="embed-artifact">
			<button
				type="button"
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
				className="flex w-full items-center gap-[9px] px-[18px] py-[12px] text-left"
			>
				<span
					className="text-[11px] font-[var(--fw-semibold)] uppercase text-[var(--text-tertiary)]"
					style={{ letterSpacing: "var(--tracking-caps)" }}
				>
					Diff
				</span>
				<span className="font-[var(--font-mono)] text-[13px] text-[var(--text-primary)]">
					auth/passkey.ts
				</span>
				<span className="ml-auto flex items-center gap-[12px] text-[13px] tabular-nums">
					<span style={{ color: "var(--status-success)" }}>+124</span>
					<span style={{ color: "var(--status-error)" }}>−18</span>
					<span
						aria-hidden
						className="inline-block transition-transform text-[var(--text-tertiary)]"
						style={{
							transitionDuration: "var(--motion-default)",
							transitionTimingFunction: "var(--motion-ease)",
							transform: open ? "rotate(90deg)" : "rotate(0deg)",
						}}
					>
						▸
					</span>
				</span>
			</button>
			{open ? (
				<div
					className="font-[var(--font-mono)] text-[12px]"
					style={{
						borderTop: "1px solid var(--border-subtle)",
						lineHeight: "var(--leading-body)",
					}}
				>
					{DIFF_LINES.map((line, i) => {
						const isAdd = line.sign === "+";
						const isDel = line.sign === "-";
						const rowBg = isAdd
							? "var(--accent-primary-dim)"
							: isDel
								? "var(--status-error-dim)"
								: "transparent";
						const signColor = isAdd
							? "var(--status-success)"
							: isDel
								? "var(--status-error)"
								: "var(--text-tertiary)";
						return (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: static fixture, order stable
								key={i}
								className="flex"
								style={{ background: rowBg }}
							>
								<span
									className="w-[36px] shrink-0 select-none px-[9px] text-right text-[var(--text-tertiary)]"
								>
									{i + 1}
								</span>
								<span
									className="w-[18px] shrink-0 select-none text-center"
									style={{ color: signColor }}
								>
									{line.sign === " " ? "" : line.sign}
								</span>
								<span className="whitespace-pre pr-[18px] text-[var(--text-primary)]">
									{line.text}
								</span>
							</div>
						);
					})}
				</div>
			) : null}
		</EmbedFrame>
	);
}

// ── Embed 2: full-bleed inline referenced-block card (real content) ──────

function ReferencedBlockEmbed(): React.JSX.Element {
	return (
		<EmbedFrame data-ds-part="embed-block">
			<EmbedCaption kind="Knowledge" name="Auth migration plan" detail="§2 Dual-auth window" />
			<div className="px-[18px] pb-[18px]" style={{ borderTop: "1px solid var(--border-subtle)" }}>
				<h4 className="pt-[12px] text-[15px] font-[var(--fw-semibold)] text-[var(--text-primary)]">
					Dual-auth window
				</h4>
				<p
					className="mt-[6px] text-[15px] text-[var(--text-secondary)]"
					style={{ lineHeight: "var(--leading-relaxed)" }}
				>
					For a two-week window both passkeys and passwords are accepted. New logins
					prefer WebAuthn; legacy clients fall back to password. We deprecate the
					password path only after enrollment crosses 80%.
				</p>
			</div>
		</EmbedFrame>
	);
}

// ── Embed 3: session reference — a single quiet inline line (NOT a card) ──
// Opens the AM3 dial-in; NEVER expands a work-log. Aligned to the column edge,
// no avatar, no box — just a calm line, per the reference's restraint.

function SessionReferenceEmbed(): React.JSX.Element {
	return (
		<button
			type="button"
			data-ds-part="embed-session-reference"
			className="group flex w-full items-center gap-[9px] text-left text-[13px]"
		>
			<span
				className="font-[var(--fw-semibold)] uppercase text-[var(--text-tertiary)]"
				style={{ letterSpacing: "var(--tracking-caps)", fontSize: "11px" }}
			>
				Session
			</span>
			<span className="font-[var(--fw-medium)] text-[var(--text-primary)]">Atlas</span>
			<span className="tabular-nums text-[var(--text-tertiary)]">
				Opus 4.8 · $0.42 · 14 tool calls
			</span>
			<span
				className="ml-auto font-[var(--fw-medium)] transition-colors"
				style={{ color: "var(--accent-primary)", transitionDuration: "var(--motion-fast)" }}
			>
				Open session →
			</span>
		</button>
	);
}

// ── Review → verdict (renders within the Message/verdict model) ──────────
// Same single embed frame; the review's title is the document heading, the
// reasoning folds via the same quiet device, the diff renders inline.

function ReviewEmbed(): React.JSX.Element {
	const [reasoningOpen, setReasoningOpen] = useState(false);
	const reasoning = [
		"Schema migration adds two columns; backfill verified.",
		"All 142 contract tests pass; integration suite green.",
		"Dual-auth window keeps existing sessions valid through phase 2.",
	];
	return (
		<EmbedFrame data-ds-part="review">
			<div className="px-[18px] pt-[18px]">
				<SectionLabel>Review · Awaiting your verdict</SectionLabel>
				<h3 className="mt-[9px] text-[17px] font-[var(--fw-semibold)] text-[var(--text-primary)]">
					Approve deploy of passkey login to staging
				</h3>

				<button
					type="button"
					aria-expanded={reasoningOpen}
					onClick={() => setReasoningOpen((v) => !v)}
					className="mt-[12px] flex items-center gap-[6px] text-left"
				>
					<span
						aria-hidden
						className="inline-block transition-transform text-[var(--text-tertiary)]"
						style={{
							transitionDuration: "var(--motion-default)",
							transitionTimingFunction: "var(--motion-ease)",
							transform: reasoningOpen ? "rotate(90deg)" : "rotate(0deg)",
						}}
					>
						▸
					</span>
					<span className="text-[13px] font-[var(--fw-medium)] text-[var(--text-secondary)]">
						{reasoningOpen ? "Reasoning" : `Reasoning · ${reasoning.length} points`}
					</span>
				</button>
				{reasoningOpen ? (
					<ul className="mt-[9px] flex flex-col gap-[6px] pl-[24px]">
						{reasoning.map((r) => (
							<li
								key={r}
								className="list-disc text-[15px] text-[var(--text-secondary)]"
								style={{ lineHeight: "var(--leading-body)" }}
							>
								{r}
							</li>
						))}
					</ul>
				) : null}
			</div>

			<div className="mt-[12px] px-[18px]">
				{/* The review's inline diff — same one calm treatment, nested. */}
				<ArtifactDiffEmbed />
			</div>

			<div
				className="mt-[18px] flex items-center gap-[9px] px-[18px] py-[12px]"
				style={{ borderTop: "1px solid var(--border-subtle)" }}
			>
				<button
					type="button"
					className="rounded-[var(--r-subtle)] px-[12px] py-[7px] text-[13px] font-[var(--fw-semibold)]"
					style={{ background: "var(--accent-primary)", color: "var(--text-on-accent)" }}
				>
					Approve
				</button>
				<button
					type="button"
					className="rounded-[var(--r-subtle)] px-[12px] py-[7px] text-[13px] font-[var(--fw-medium)]"
					style={{
						background: "transparent",
						color: "var(--text-secondary)",
						border: "1px solid var(--border-default)",
					}}
				>
					Request changes
				</button>
				<button
					type="button"
					className="rounded-[var(--r-subtle)] px-[12px] py-[7px] text-[13px] font-[var(--fw-medium)]"
					style={{
						background: "transparent",
						color: "var(--status-error)",
						border: "1px solid var(--border-default)",
					}}
				>
					Reject
				</button>
			</div>
		</EmbedFrame>
	);
}

/** The resolving verdict — the founder's approve, rendered as a quiet label. */
function VerdictLine(): React.JSX.Element {
	return (
		<div data-ds-part="verdict" className="flex items-baseline gap-[9px]">
			<span
				className="text-[11px] font-[var(--fw-semibold)] uppercase text-[var(--accent-primary)]"
				style={{ letterSpacing: "var(--tracking-caps)" }}
			>
				Approved
			</span>
			<span className="text-[13px] text-[var(--text-secondary)]">
				Deploy of passkey login to staging
			</span>
		</div>
	);
}

// ── Turn wrapper: whitespace IS the separator (one alignment edge) ───────
// No rules, no borders between turns — only generous vertical rhythm. Every
// child is flush to the column's single left edge.

function Turn({ children }: { children: React.ReactNode }): React.JSX.Element {
	return <div className="flex flex-col gap-[12px]">{children}</div>;
}

// ── The variant: full canonical conversation as an editorial document ─────

export default function Am1ConversationCalmDocument(): React.JSX.Element {
	return (
		<div
			data-ds-component="Am1ConversationCalmDocument"
			className="relative flex min-h-full w-full flex-col"
			style={{ background: "var(--surface-page)" }}
		>
			{/* The scrolling reading column — generous centered, ~720px. */}
			<div className="mx-auto w-full max-w-[720px] flex-1 px-[24px] pt-[48px] pb-[36px]">
				{/* Quiet host line — typographic, no badge soup. */}
				<div className="flex items-baseline gap-[9px] pb-[36px]">
					<span
						className="text-[11px] font-[var(--fw-semibold)] uppercase text-[var(--text-tertiary)]"
						style={{ letterSpacing: "var(--tracking-caps)" }}
					>
						Bet
					</span>
					<h1 className="text-[20px] font-[var(--fw-semibold)] text-[var(--text-primary)]">
						Passkey login
					</h1>
				</div>

				<div className="flex flex-col gap-[36px]">
					{/* 1 — Founder · plain. No chrome at all — pure prose. */}
					<Turn>
						<BodyText>
							Can you wire passkey login and show me the diff before we deploy?
						</BodyText>
					</Turn>

					{/* 2 — Atlas · the Fold (quiet work-label IS the only turn chrome). */}
					<Turn>
						<WorkFold />
					</Turn>

					{/* 3 — Atlas · plain embedding the artifact diff (full-bleed inline). */}
					<Turn>
						<BodyText>
							<strong className="font-[var(--fw-semibold)]">Here&rsquo;s the change.</strong>{" "}
							Passkey registration replaces the password path:
						</BodyText>
						<ArtifactDiffEmbed />
					</Turn>

					{/* 4 — Atlas · plain embedding a referenced block (full content). */}
					<Turn>
						<BodyText>It follows the dual-auth window we agreed on:</BodyText>
						<ReferencedBlockEmbed />
					</Turn>

					{/* 5 — Atlas · plain embedding a session reference (NOT a work-log). */}
					<Turn>
						<BodyText>Full trace of the run, if you want to dial in:</BodyText>
						<SessionReferenceEmbed />
					</Turn>

					{/* 6 — Atlas · review with verdict bar. */}
					<Turn>
						<ReviewEmbed />
					</Turn>

					{/* 7 — Founder · verdict (resolves the review). */}
					<Turn>
						<VerdictLine />
					</Turn>
				</div>
			</div>

			{/* Composer — bottom-pinned, one clean rounded elevated input. */}
			<div
				className="sticky bottom-0"
				style={{
					background: "var(--surface-page)",
					borderTop: "1px solid var(--border-subtle)",
				}}
			>
				<div className="mx-auto w-full max-w-[720px] px-[24px] py-[18px]">
					<div
						className="flex items-end gap-[12px] rounded-[var(--r-default)] px-[18px] py-[12px]"
						style={{
							background: "var(--surface-elevated)",
							border: "1px solid var(--border-default)",
							boxShadow: "var(--shadow-default)",
						}}
					>
						<textarea
							rows={1}
							placeholder="Reply to Atlas…"
							className="min-h-[24px] flex-1 resize-none bg-transparent text-[15px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-placeholder)]"
							style={{ lineHeight: "var(--leading-body)" }}
						/>
						<button
							type="button"
							className="shrink-0 rounded-[var(--r-subtle)] px-[18px] py-[7px] text-[13px] font-[var(--fw-semibold)]"
							style={{ background: "var(--accent-primary)", color: "var(--text-on-accent)" }}
						>
							Send
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
