/**
 * AM1 — Variant A "Quiet prose" (REDO v2).
 *
 * The most minimal embodiment of the Conversation + Part model
 * (concept: plans/AM1/concept.md). The conversation reads as flowing PROSE in a
 * narrow centered column with generous margins and vertical rhythm. There is
 * almost no per-message chrome: NO avatar, NO role badge, NO per-line timestamp.
 *
 * Restraint copied from the t3code reference (plans/AM1/Screenshot …22.15.49):
 *  - Identity appears at most ONCE per turn, quietly (a small --text-secondary
 *    name, never repeated per line).
 *  - An agent work-turn is marked by a quiet uppercase letter-spaced label
 *    (`RESPONSE · WORKED FOR 1M 12S`, --text-tertiary + tracking-caps) sitting
 *    on a faint hairline rule. This label IS the Fold (label + optional Show).
 *  - Embeds are understated muted lines aligned to the column's single left
 *    edge — a monospace diff line, a one-line block reference, a one-line
 *    session reference. NO borders, NO shadows, NO tinted cards.
 *  - Structure is purely typographic: bold inline lead-ins, comfortable
 *    line-height, whitespace. No accent rails, no per-message containers.
 *  - The review verdict actions render calmly as text buttons, not a heavy bar.
 *  - One clean rounded elevated composer pinned at the bottom; no model/effort
 *    pills (those are the AM3 dial-in).
 *
 * Story-only /design artifact. Hand-rolls visuals with Tailwind + Hearth
 * semantic tokens for guaranteed render; fixture inline. Production reuse
 * mapping lives in plans/AM1/design/quiet-stream/spec.md, not in imports.
 *
 * Concept guardrails honored: deliberate messages only; session activity is
 * never a first-class Part (session = a one-line reference Embed); renders
 * within Thread / Message / verdict; nothing named "Block"; no token changes.
 */

import type React from "react";
import { useId, useState } from "react";

// ── Quiet section label (also the Fold's collapsed face) ────────────────────

/**
 * A calm uppercase letter-spaced separator that opens an agent work-turn. When
 * `foldable`, it doubles as the Fold control: clicking "Show" reveals children.
 */
function TurnLabel({
	label,
	children,
}: {
	label: string;
	children?: React.ReactNode;
}): React.JSX.Element {
	const [open, setOpen] = useState(false);
	const bodyId = useId();
	return (
		<div className="mt-[36px]">
			<div className="flex items-baseline gap-[9px]">
				<span className="text-[12px] font-medium uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)] whitespace-nowrap">
					{label}
				</span>
				<span className="h-px flex-1 bg-[var(--border-subtle)]" />
				{children ? (
					<button
						type="button"
						onClick={() => setOpen((p) => !p)}
						aria-expanded={open}
						aria-controls={bodyId}
						className="text-[12px] font-medium uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)]"
					>
						{open ? "Hide" : "Show"}
					</button>
				) : null}
			</div>
			{children && open ? (
				<div
					id={bodyId}
					className="mt-[18px] text-[15px] leading-[var(--leading-relaxed)] text-[var(--text-secondary)]"
				>
					{children}
				</div>
			) : null}
		</div>
	);
}

// ── Prose paragraph ──────────────────────────────────────────────────────────

function Prose({ children }: { children: React.ReactNode }): React.JSX.Element {
	return (
		<p className="text-[15px] leading-[var(--leading-relaxed)] text-[var(--text-primary)]">
			{children}
		</p>
	);
}

// ── Understated embeds — ONE treatment: a quiet muted line, no box ──────────
//
// Every embed is a single left-aligned interactive line that opens fuller
// detail off-column. No border, no shadow, no fill — the muted "→" + a hover
// color shift is the only affordance.

function EmbedLine({
	children,
	"aria-label": ariaLabel,
}: {
	children: React.ReactNode;
	"aria-label": string;
}): React.JSX.Element {
	return (
		<button
			type="button"
			aria-label={ariaLabel}
			className="group flex items-baseline gap-[9px] w-full text-left mt-[9px] text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-[var(--motion-fast)]"
		>
			{children}
			<span
				aria-hidden="true"
				className="ml-auto text-[var(--text-tertiary)] group-hover:text-[var(--accent-primary)] transition-colors duration-[var(--motion-fast)]"
			>
				→
			</span>
		</button>
	);
}

function DiffEmbed({
	path,
	added,
	removed,
}: {
	path: string;
	added: number;
	removed: number;
}): React.JSX.Element {
	return (
		<EmbedLine aria-label={`Open diff for ${path}, ${added} added, ${removed} removed`}>
			<span className="font-mono text-[13px] text-[var(--text-primary)] truncate">{path}</span>
			<span className="font-mono text-[12px] tabular-nums text-[var(--accent-primary)]">
				+{added}
			</span>
			<span className="font-mono text-[12px] tabular-nums text-[var(--status-error)]">
				−{removed}
			</span>
		</EmbedLine>
	);
}

function BlockRefEmbed({
	title,
	section,
}: {
	title: string;
	section: string;
}): React.JSX.Element {
	return (
		<EmbedLine aria-label={`Open referenced item ${title} ${section}`}>
			<span className="text-[13px] text-[var(--text-secondary)]">
				<span className="font-medium text-[var(--text-primary)]">{title}</span>
				<span className="text-[var(--text-tertiary)]"> · {section}</span>
			</span>
		</EmbedLine>
	);
}

function SessionRefEmbed({
	agent,
	model,
	cost,
	toolCalls,
}: {
	agent: string;
	model: string;
	cost: string;
	toolCalls: number;
}): React.JSX.Element {
	return (
		<EmbedLine
			aria-label={`Open session for ${agent} on ${model}, ${cost}, ${toolCalls} tool calls`}
		>
			<span className="text-[13px] text-[var(--text-secondary)]">
				<span className="uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
					Session
				</span>
				{" · "}
				{agent} · {model} ·{" "}
				<span className="font-mono tabular-nums">{cost}</span> · {toolCalls} tool calls
			</span>
		</EmbedLine>
	);
}

// ── Review → verdict (rendered calmly: title + foldable reasoning + text
//    verdict actions; no heavy bar, no card chrome) ──────────────────────────

function Review({ resolved }: { resolved: boolean }): React.JSX.Element {
	const [open, setOpen] = useState(false);
	const reasoning = [
		"WebAuthn registration + the dual-auth window are wired and green.",
		"All 18 auth contract tests pass; existing sessions unaffected.",
		"Staging cost cap unchanged; rollback is a single flag flip.",
	];
	const reasoningId = useId();
	return (
		<div className="mt-[36px]">
			<div className="flex items-baseline gap-[9px]">
				<span className="text-[12px] font-medium uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)] whitespace-nowrap">
					Review
				</span>
				<span className="h-px flex-1 bg-[var(--border-subtle)]" />
			</div>

			<p className="mt-[18px] text-[17px] font-semibold leading-[var(--leading-normal)] text-[var(--text-primary)]">
				Approve deploy of passkey login to staging
			</p>

			<button
				type="button"
				onClick={() => setOpen((p) => !p)}
				aria-expanded={open}
				aria-controls={reasoningId}
				className="mt-[9px] text-[13px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)]"
			>
				{open ? "Hide reasoning" : `Show reasoning · ${reasoning.length} lines`}
			</button>
			{open ? (
				<ul id={reasoningId} className="mt-[9px] flex flex-col gap-[6px]">
					{reasoning.map((r) => (
						<li
							key={r}
							className="relative pl-[18px] text-[15px] leading-[var(--leading-relaxed)] text-[var(--text-secondary)]"
						>
							<span className="absolute left-[3px] top-[11px] size-[3px] rounded-full bg-[var(--text-tertiary)]" />
							{r}
						</li>
					))}
				</ul>
			) : null}

			<DiffEmbed path="auth/passkey.ts" added={124} removed={18} />

			{resolved ? (
				<p className="mt-[18px] text-[13px] text-[var(--text-secondary)]">
					<span className="font-medium text-[var(--accent-primary)]">Approved</span> by A. Founder
				</p>
			) : (
				<div className="mt-[18px] flex items-center gap-[18px]">
					<button
						type="button"
						className="text-[13px] font-semibold text-[var(--accent-primary)] hover:text-[var(--accent-primary-hover)] transition-colors duration-[var(--motion-fast)]"
					>
						Approve
					</button>
					<button
						type="button"
						className="text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-[var(--motion-fast)]"
					>
						Request changes
					</button>
					<button
						type="button"
						className="text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--status-error)] transition-colors duration-[var(--motion-fast)]"
					>
						Reject
					</button>
				</div>
			)}
		</div>
	);
}

// ── Composer (one clean rounded elevated input; no pills) ───────────────────

function Composer(): React.JSX.Element {
	return (
		<div className="sticky bottom-0 mt-[36px] pt-[18px] pb-[24px] bg-[var(--surface-page)]">
			<div className="rounded-[var(--r-default)] border border-[var(--border-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-default)] px-[18px] py-[12px] focus-within:border-[var(--accent-primary)] transition-colors duration-[var(--motion-fast)]">
				<textarea
					rows={1}
					placeholder="Message the thread…"
					className="w-full resize-none bg-transparent text-[15px] leading-[var(--leading-normal)] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] outline-none"
				/>
			</div>
		</div>
	);
}

// ── The column ──────────────────────────────────────────────────────────────

export interface Am1ConversationQuietStreamProps {
	/** When true, the review Part renders resolved (verdict applied). Default true. */
	readonly resolved?: boolean;
}

export default function Am1ConversationQuietStream({
	resolved = true,
}: Am1ConversationQuietStreamProps): React.JSX.Element {
	return (
		<div
			data-ds-component="Am1ConversationQuietStream"
			className="min-h-full w-full bg-[var(--surface-page)] flex justify-center"
		>
			<div className="w-full max-w-[680px] px-[24px] flex flex-col">
				{/* Quiet host line — names the thread once, then recedes. */}
				<div className="pt-[36px]">
					<span className="text-[12px] font-medium uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
						Passkey login
					</span>
				</div>

				{/* 1 — Founder opens. Identity quiet, once. */}
				<div className="mt-[24px]">
					<span className="text-[13px] text-[var(--text-secondary)]">A. Founder</span>
					<div className="mt-[6px]">
						<Prose>Can you wire passkey login and show me the diff before we deploy?</Prose>
					</div>
				</div>

				{/* 2 — Atlas work-turn. The Fold IS the quiet section label. */}
				<TurnLabel label="Response · Worked for 1m 12s">
					Added WebAuthn registration and the dual-auth window. Existing sessions stay valid through
					phase 2.
				</TurnLabel>

				{/* 3 — prose lead-in + the diff embed (quiet line). */}
				<div className="mt-[18px]">
					<Prose>
						<span className="font-semibold">The change.</span> Passkey login now wires through the
						auth entrypoint — registration, the dual-auth window, and the fallback path all live
						here:
					</Prose>
					<DiffEmbed path="auth/passkey.ts" added={124} removed={18} />
				</div>

				{/* 4 — prose + the referenced block (quiet line). */}
				<div className="mt-[18px]">
					<Prose>
						It follows the migration plan we agreed on — specifically the dual-auth window, so
						existing sessions are never forced to re-auth:
					</Prose>
					<BlockRefEmbed title="Auth migration plan" section="§2 Dual-auth window" />
				</div>

				{/* 5 — prose + the session reference (quiet line; opens the dial-in). */}
				<div className="mt-[18px]">
					<Prose>The full run is here if you want to dig into how I got there:</Prose>
					<SessionRefEmbed agent="Atlas" model="Opus 4.8" cost="$0.42" toolCalls={14} />
				</div>

				{/* 6 — the review and 7 — the founder's verdict, resolved inline. */}
				<Review resolved={resolved} />

				<Composer />
			</div>
		</div>
	);
}
