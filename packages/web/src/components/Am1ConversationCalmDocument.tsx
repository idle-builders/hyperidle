/**
 * AM1 — Conversation Experience, Variant C: "Calm document".
 *
 * A self-contained, presentational embodiment of the AM1 design brief's
 * canonical fixture conversation, rendered through Variant C's thesis:
 * the conversation reads like a living DOCUMENT, not chat bubbles. A
 * generous single reading column (~760px), strong typographic rhythm,
 * quiet rules between sender turns, and embeds rendered FULL-BLEED INLINE
 * (artifact diff with real +/− lines, referenced-block card with content,
 * a calm session-reference card, the prominent "Worked for 1m 12s" Fold,
 * and the review → verdict).
 *
 * This is a /design Phase-1 embodiment artifact, NOT production code. The
 * production component-reuse mapping (the Part model + Embed + Fold
 * primitives, CommentRow, RichMessageCard, Composer, ArtifactEmbed,
 * BlockRefEmbed, the new SessionReferenceEmbed) lives in
 * `plans/AM1/design/calm-document/spec.md`. Here every visual is
 * hand-rolled with Tailwind + Hearth semantic-token classes so the story
 * renders reliably in the :8098 viewer without depending on component
 * APIs.
 *
 * Honors the locked concept (`plans/AM1/concept.md`): deliberate messages
 * only; the session is a REFERENCE Embed (a card that opens the lower-level
 * dial-in), NEVER an inlined work-log; renders within Thread/Message/verdict;
 * names nothing "Block"/"blocked".
 */

import type React from "react";
import { useState } from "react";

// ── Fixture: the canonical AM1 conversation (brief §"Canonical fixture") ──
// Shapes mirror `packages/shared/src/thread.ts` (Message / PlainPayload /
// ReviewPayload / VerdictPayload / ArtifactRef) but are inlined here so the
// story is fully self-contained.

interface Participant {
	readonly id: string;
	readonly name: string;
	readonly role: string;
	readonly isAgent: boolean;
	readonly initials: string;
}

const FOUNDER: Participant = {
	id: "u-founder",
	name: "A. Founder",
	role: "founder",
	isAgent: false,
	initials: "AF",
};

const ATLAS: Participant = {
	id: "agent-atlas",
	name: "Atlas",
	role: "Builder",
	isAgent: true,
	initials: "AT",
};

// ── Shared primitives (hand-rolled, token-only) ──────────────────────────

function Avatar({ p }: { p: Participant }): React.JSX.Element {
	return (
		<span
			aria-hidden
			className="inline-flex h-[28px] w-[28px] shrink-0 select-none items-center justify-center rounded-[var(--r-pill)] text-[11px] font-[var(--fw-semibold)]"
			style={{
				background: p.isAgent ? "var(--accent-primary-dim)" : "var(--surface-container)",
				color: p.isAgent ? "var(--accent-primary)" : "var(--text-secondary)",
				border: p.isAgent
					? "1px solid var(--accent-primary)"
					: "1px solid var(--border-default)",
			}}
		>
			{p.initials}
		</span>
	);
}

/** The document-grade sender lead-in: avatar + name + role + timestamp. */
function SenderLine({
	p,
	timestamp,
}: {
	p: Participant;
	timestamp: string;
}): React.JSX.Element {
	return (
		<div className="flex items-center gap-[9px]">
			<Avatar p={p} />
			<span className="text-[15px] font-[var(--fw-semibold)] text-[var(--text-primary)]">
				{p.name}
			</span>
			{p.isAgent ? (
				<span
					className="rounded-[var(--r-pill)] px-[6px] py-[1px] text-[10px] font-[var(--fw-semibold)] uppercase"
					style={{
						background: "var(--accent-primary-dim)",
						color: "var(--accent-primary)",
						letterSpacing: "var(--tracking-caps-sm)",
					}}
				>
					{p.role}
				</span>
			) : (
				<span className="text-[13px] text-[var(--text-tertiary)]">{p.role}</span>
			)}
			<span className="ml-auto text-[12px] tabular-nums text-[var(--text-tertiary)]">
				{timestamp}
			</span>
		</div>
	);
}

/**
 * Document body text — the calm-document typographic core. Generous size +
 * relaxed leading, primary text on the page surface (no card chrome).
 */
function BodyText({ children }: { children: React.ReactNode }): React.JSX.Element {
	return (
		<p className="text-[15px] leading-[1.7] text-[var(--text-primary)]">{children}</p>
	);
}

// ── Embed 1: the "Worked for 1m 12s" Fold (first-class device) ───────────

function WorkFold(): React.JSX.Element {
	const [open, setOpen] = useState(false);
	return (
		<div
			data-ds-part="fold"
			className="overflow-hidden rounded-[var(--r-subtle)]"
			style={{
				background: "var(--surface-container)",
				border: "1px solid var(--border-subtle)",
			}}
		>
			<button
				type="button"
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
				className="flex w-full items-center gap-[9px] px-[12px] py-[9px] text-left"
			>
				<span
					aria-hidden
					className="inline-block transition-transform"
					style={{
						transitionDuration: "var(--motion-default)",
						transitionTimingFunction: "var(--motion-ease)",
						transform: open ? "rotate(90deg)" : "rotate(0deg)",
						color: "var(--text-tertiary)",
					}}
				>
					▸
				</span>
				<span className="text-[13px] font-[var(--fw-medium)] text-[var(--text-secondary)]">
					Worked for 1m 12s
				</span>
				<span className="text-[12px] tabular-nums text-[var(--text-tertiary)]">
					· 14 steps
				</span>
				<span className="ml-auto text-[12px] text-[var(--text-tertiary)]">
					{open ? "Hide" : "Show"}
				</span>
			</button>
			{open ? (
				<div
					className="px-[12px] pb-[12px] pt-[3px]"
					style={{ borderTop: "1px solid var(--border-subtle)" }}
				>
					<p className="pt-[9px] text-[15px] leading-[1.7] text-[var(--text-primary)]">
						Added WebAuthn registration + the dual-auth window. Existing sessions stay
						valid through phase 2.
					</p>
				</div>
			) : null}
		</div>
	);
}

// ── Embed 2: full-bleed inline artifact diff (real +/− lines, foldable) ──

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
		<div
			data-ds-part="embed-artifact"
			className="overflow-hidden rounded-[var(--r-default)]"
			style={{
				background: "var(--surface-elevated)",
				boxShadow: "var(--shadow-default)",
			}}
		>
			<button
				type="button"
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
				className="flex w-full items-center gap-[9px] px-[12px] py-[9px] text-left"
			>
				<span
					aria-hidden
					className="inline-block transition-transform"
					style={{
						transitionDuration: "var(--motion-default)",
						transitionTimingFunction: "var(--motion-ease)",
						transform: open ? "rotate(90deg)" : "rotate(0deg)",
						color: "var(--text-tertiary)",
					}}
				>
					▸
				</span>
				<span className="font-[var(--font-mono)] text-[13px] text-[var(--text-primary)]">
					auth/passkey.ts
				</span>
				<span
					className="rounded-[var(--r-pill)] px-[6px] py-[1px] text-[10px] font-[var(--fw-semibold)] uppercase"
					style={{
						background: "var(--surface-container)",
						color: "var(--text-tertiary)",
						letterSpacing: "var(--tracking-caps-sm)",
					}}
				>
					text_diff
				</span>
				<span className="ml-auto flex items-center gap-[9px] text-[13px] tabular-nums">
					<span style={{ color: "var(--status-success)" }}>+124</span>
					<span style={{ color: "var(--status-error)" }}>−18</span>
				</span>
			</button>
			{open ? (
				<div
					className="font-[var(--font-mono)] text-[12px] leading-[1.55]"
					style={{ borderTop: "1px solid var(--border-subtle)" }}
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
									className="w-[24px] shrink-0 select-none px-[9px] text-right"
									style={{ color: "var(--text-tertiary)" }}
								>
									{i + 1}
								</span>
								<span
									className="w-[18px] shrink-0 select-none text-center"
									style={{ color: signColor }}
								>
									{line.sign === " " ? "" : line.sign}
								</span>
								<span
									className="whitespace-pre pr-[12px]"
									style={{ color: "var(--text-primary)" }}
								>
									{line.text}
								</span>
							</div>
						);
					})}
				</div>
			) : null}
		</div>
	);
}

// ── Embed 3: full-bleed inline referenced-block card (real content) ──────

function ReferencedBlockEmbed(): React.JSX.Element {
	return (
		<div
			data-ds-part="embed-block"
			className="rounded-[var(--r-default)] px-[18px] py-[12px]"
			style={{
				background: "var(--surface-elevated)",
				boxShadow: "var(--shadow-default)",
			}}
		>
			<div className="flex items-center gap-[6px]">
				<span
					className="rounded-[var(--r-pill)] px-[6px] py-[1px] text-[10px] font-[var(--fw-semibold)] uppercase"
					style={{
						background: "var(--accent-secondary-dim)",
						color: "var(--accent-secondary)",
						letterSpacing: "var(--tracking-caps-sm)",
					}}
				>
					Knowledge
				</span>
				<span className="text-[13px] font-[var(--fw-semibold)] text-[var(--text-primary)]">
					Auth migration plan
				</span>
				<span className="text-[12px] text-[var(--text-tertiary)]">· §2 Dual-auth window</span>
			</div>
			<div
				className="mt-[9px] pl-[12px]"
				style={{ borderLeft: "2.5px solid var(--border-default)" }}
			>
				<h4 className="text-[15px] font-[var(--fw-semibold)] text-[var(--text-primary)]">
					Dual-auth window
				</h4>
				<p className="mt-[3px] text-[15px] leading-[1.55] text-[var(--text-secondary)]">
					For a two-week window both passkeys and passwords are accepted. New logins
					prefer WebAuthn; legacy clients fall back to password. We deprecate the
					password path only after enrollment crosses 80%.
				</p>
			</div>
		</div>
	);
}

// ── Embed 4: session-reference card (opens dial-in; NEVER a work-log) ────

function SessionReferenceEmbed(): React.JSX.Element {
	return (
		<button
			type="button"
			data-ds-part="embed-session-reference"
			className="flex w-full items-center gap-[12px] rounded-[var(--r-default)] px-[12px] py-[9px] text-left transition-colors"
			style={{
				background: "var(--surface-elevated)",
				border: "1px solid var(--border-subtle)",
				transitionDuration: "var(--motion-fast)",
			}}
		>
			<Avatar p={ATLAS} />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-[6px]">
					<span className="text-[13px] font-[var(--fw-semibold)] text-[var(--text-primary)]">
						Session · Atlas
					</span>
					<span className="text-[12px] text-[var(--text-tertiary)]">Opus 4.8</span>
				</div>
				<div className="mt-[1px] flex items-center gap-[12px] text-[12px] tabular-nums text-[var(--text-tertiary)]">
					<span>$0.42</span>
					<span>14 tool calls</span>
				</div>
			</div>
			<span
				className="shrink-0 text-[13px] font-[var(--fw-medium)]"
				style={{ color: "var(--accent-primary)" }}
			>
				Open session →
			</span>
		</button>
	);
}

// ── Review → verdict (renders within the Message/verdict model) ──────────

function ReviewWithVerdict(): React.JSX.Element {
	const [reasoningOpen, setReasoningOpen] = useState(false);
	const reasoning = [
		"Schema migration adds two columns; backfill verified.",
		"All 142 contract tests pass; integration suite green.",
		"Dual-auth window keeps existing sessions valid through phase 2.",
	];
	return (
		<div
			data-ds-part="review"
			className="rounded-[var(--r-default)] px-[18px] py-[18px]"
			style={{
				background: "var(--surface-elevated)",
				boxShadow: "var(--shadow-default)",
				borderLeft: "2.5px solid var(--accent-primary)",
			}}
		>
			<div className="flex items-center gap-[9px]">
				<span
					className="rounded-[var(--r-pill)] px-[6px] py-[1px] text-[10px] font-[var(--fw-semibold)] uppercase"
					style={{
						background: "var(--accent-primary-dim)",
						color: "var(--accent-primary)",
						letterSpacing: "var(--tracking-caps-sm)",
					}}
				>
					Review
				</span>
				<h3 className="text-[17px] font-[var(--fw-semibold)] text-[var(--text-primary)]">
					Approve deploy of passkey login to staging
				</h3>
			</div>

			<button
				type="button"
				aria-expanded={reasoningOpen}
				onClick={() => setReasoningOpen((v) => !v)}
				className="mt-[12px] flex items-center gap-[6px] text-left"
			>
				<span
					aria-hidden
					className="inline-block transition-transform"
					style={{
						transitionDuration: "var(--motion-default)",
						transitionTimingFunction: "var(--motion-ease)",
						transform: reasoningOpen ? "rotate(90deg)" : "rotate(0deg)",
						color: "var(--text-tertiary)",
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
							className="list-disc text-[15px] leading-[1.55] text-[var(--text-secondary)]"
						>
							{r}
						</li>
					))}
				</ul>
			) : null}

			<div className="mt-[12px]">
				<ArtifactDiffEmbed />
			</div>

			<div
				className="mt-[18px] flex items-center gap-[9px] pt-[12px]"
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
		</div>
	);
}

/** The resolving verdict — the founder's approve, rendered as a quiet line. */
function VerdictLine(): React.JSX.Element {
	return (
		<div data-ds-part="verdict" className="flex items-center gap-[9px]">
			<Avatar p={FOUNDER} />
			<span className="text-[15px] font-[var(--fw-semibold)] text-[var(--text-primary)]">
				{FOUNDER.name}
			</span>
			<span
				className="rounded-[var(--r-pill)] px-[9px] py-[2px] text-[11px] font-[var(--fw-semibold)] uppercase"
				style={{
					background: "var(--accent-primary-dim)",
					color: "var(--accent-primary)",
					letterSpacing: "var(--tracking-caps-sm)",
				}}
			>
				Approved
			</span>
			<span className="text-[13px] text-[var(--text-secondary)]">
				deploy of passkey login to staging
			</span>
			<span className="ml-auto text-[12px] tabular-nums text-[var(--text-tertiary)]">
				12:14
			</span>
		</div>
	);
}

// ── Turn wrapper: quiet rule between sender turns (document rhythm) ───────

function Turn({
	first,
	children,
}: {
	first?: boolean;
	children: React.ReactNode;
}): React.JSX.Element {
	return (
		<div
			className="flex flex-col gap-[12px] py-[24px]"
			style={first ? undefined : { borderTop: "1px solid var(--border-subtle)" }}
		>
			{children}
		</div>
	);
}

// ── Host banner ──────────────────────────────────────────────────────────

function HostBanner(): React.JSX.Element {
	return (
		<div className="flex items-center gap-[9px] pb-[18px]">
			<span
				className="rounded-[var(--r-pill)] px-[9px] py-[2px] text-[11px] font-[var(--fw-semibold)] uppercase"
				style={{
					background: "var(--surface-container)",
					color: "var(--text-secondary)",
					letterSpacing: "var(--tracking-caps-sm)",
				}}
			>
				Bet
			</span>
			<h1 className="text-[20px] font-[var(--fw-semibold)] text-[var(--text-primary)]">
				Passkey login
			</h1>
		</div>
	);
}

// ── Composer (deliberate message input; NO model/effort pills) ───────────

function Composer(): React.JSX.Element {
	// @lore: production pins this composer sticky to the column bottom (spec
	// hierarchy item 9 + mobile). In the story it renders STATIC at the true
	// document bottom so the full-page snapshot does not pin it mid-thread —
	// the embodiment proves placement, the builder restores `sticky bottom-0`.
	return (
		<div className="pt-[18px]" style={{ background: "var(--surface-page)" }}>
			<div
				className="rounded-[var(--r-default)] px-[18px] py-[12px]"
				style={{
					background: "var(--surface-elevated)",
					border: "1px solid var(--border-default)",
					boxShadow: "var(--shadow-default)",
				}}
			>
				<textarea
					rows={2}
					placeholder="Reply to Atlas…"
					className="w-full resize-none bg-transparent text-[15px] leading-[1.55] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-placeholder)]"
				/>
				<div className="mt-[9px] flex items-center justify-end">
					<button
						type="button"
						className="rounded-[var(--r-subtle)] px-[18px] py-[7px] text-[13px] font-[var(--fw-semibold)]"
						style={{ background: "var(--accent-primary)", color: "var(--text-on-accent)" }}
					>
						Send
					</button>
				</div>
			</div>
		</div>
	);
}

// ── The variant: full canonical conversation as a calm document ───────────

export default function Am1ConversationCalmDocument(): React.JSX.Element {
	return (
		<div
			data-ds-component="Am1ConversationCalmDocument"
			className="min-h-full w-full"
			style={{ background: "var(--surface-page)" }}
		>
			<div className="mx-auto flex max-w-[760px] flex-col px-[24px] pb-[36px] pt-[36px]">
				<HostBanner />

				{/* 1 — Founder · plain */}
				<Turn first>
					<SenderLine p={FOUNDER} timestamp="12:01" />
					<BodyText>
						Can you wire passkey login and show me the diff before we deploy?
					</BodyText>
				</Turn>

				{/* 2 — Atlas · plain + the prominent Work Fold */}
				<Turn>
					<SenderLine p={ATLAS} timestamp="12:03" />
					<WorkFold />
				</Turn>

				{/* 3 — Atlas · plain embedding the artifact diff (full-bleed inline) */}
				<Turn>
					<SenderLine p={ATLAS} timestamp="12:08" />
					<BodyText>Here's the change — passkey registration replaces the password path:</BodyText>
					<ArtifactDiffEmbed />
				</Turn>

				{/* 4 — Atlas · plain embedding a referenced block (full content) */}
				<Turn>
					<SenderLine p={ATLAS} timestamp="12:09" />
					<BodyText>It follows the dual-auth window we agreed on:</BodyText>
					<ReferencedBlockEmbed />
				</Turn>

				{/* 5 — Atlas · plain embedding a session reference (NOT a work-log) */}
				<Turn>
					<SenderLine p={ATLAS} timestamp="12:10" />
					<BodyText>Full trace of the run, if you want to dial in:</BodyText>
					<SessionReferenceEmbed />
				</Turn>

				{/* 6 — Atlas · review with verdict bar */}
				<Turn>
					<SenderLine p={ATLAS} timestamp="12:11" />
					<ReviewWithVerdict />
				</Turn>

				{/* 7 — Founder · verdict (resolves the review) */}
				<Turn>
					<VerdictLine />
				</Turn>

				<Composer />
			</div>
		</div>
	);
}
