/**
 * AM1 — Variant A "Quiet stream".
 *
 * A reuse-first, presentational embodiment of the Conversation + Part model
 * (concept: plans/AM1/concept.md). Single calm ~720px reading column, sender-
 * grouped messages, chrome receded (meta = --text-tertiary). Embeds render as
 * compact in-flow cards/chips; a session is a single-line REFERENCE chip (it
 * NEVER inlines the work-log). The Fold is a one-line summary row with a
 * chevron.
 *
 * This is the /design artifact — a story-only component. It hand-rolls all
 * visuals with Tailwind + Hearth semantic tokens for guaranteed rendering and
 * defines the canonical fixture inline. Production reuse mapping (CommentRow /
 * RichMessageCard / ArtifactEmbed / BlockRefEmbed / Composer) lives in
 * plans/AM1/design/quiet-stream/spec.md, NOT in these imports.
 *
 * Concept guardrails honored:
 *  - deliberate messages only; session activity is never a first-class Part.
 *  - renders within Thread / Message / verdict; reshapes none of them.
 *  - no name uses "Block"/"blocked"; no color/token changes; warm tokens only.
 */

import type React from "react";
import { useState } from "react";

// ── Inline fixture (the canonical AM1 conversation) ─────────────────────────

interface Sender {
	readonly name: string;
	readonly role: string;
	readonly isAgent: boolean;
}

const FOUNDER: Sender = { name: "A. Founder", role: "Founder", isAgent: false };
const ATLAS: Sender = { name: "Atlas", role: "Builder", isAgent: true };

// ── Atoms (hand-rolled, token-only) ─────────────────────────────────────────

function Avatar({ sender }: { sender: Sender }): React.JSX.Element {
	const initials = sender.name
		.split(/[\s.]+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((p) => p[0]?.toUpperCase() ?? "")
		.join("");
	return (
		<span
			className={`inline-flex items-center justify-center rounded-full shrink-0 size-[28px] text-[12px] font-semibold border-[1.5px] ${
				sender.isAgent
					? "border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--accent-primary-dim)]"
					: "border-[var(--border-default)] text-[var(--text-secondary)] bg-[var(--surface-container)]"
			}`}
		>
			{initials}
		</span>
	);
}

function SenderHeader({
	sender,
	time,
}: {
	sender: Sender;
	time: string;
}): React.JSX.Element {
	return (
		<div className="flex items-baseline gap-[6px] mb-[3px]">
			<span className="text-[13px] font-semibold text-[var(--text-primary)]">{sender.name}</span>
			{sender.isAgent ? (
				<span className="text-[10px] font-medium uppercase tracking-[var(--tracking-caps-sm)] text-[var(--accent-primary)]">
					agent
				</span>
			) : null}
			<span className="text-[12px] text-[var(--text-tertiary)]">{time}</span>
		</div>
	);
}

// ── Fold device (one-line summary → expand) ─────────────────────────────────

function Fold({
	summary,
	children,
}: {
	summary: string;
	children: React.ReactNode;
}): React.JSX.Element {
	const [open, setOpen] = useState(false);
	return (
		<div>
			<button
				type="button"
				onClick={() => setOpen((p) => !p)}
				aria-expanded={open}
				className="flex items-center gap-[6px] text-[13px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)]"
			>
				<svg
					viewBox="0 0 12 12"
					className="size-[12px] transition-transform duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
					style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
					aria-hidden="true"
				>
					<path d="M4 2.5 L8 6 L4 9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
				<span className="tabular-nums">{summary}</span>
			</button>
			{open ? (
				<div className="mt-[9px] text-[15px] leading-[var(--leading-body)] text-[var(--text-primary)]">
					{children}
				</div>
			) : null}
		</div>
	);
}

// ── Embeds (compact in-flow) ────────────────────────────────────────────────

function ArtifactDiffEmbed({
	path,
	added,
	removed,
}: {
	path: string;
	added: number;
	removed: number;
}): React.JSX.Element {
	return (
		<button
			type="button"
			className="group flex items-center gap-[9px] w-full text-left mt-[9px] px-[12px] py-[9px] rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)] hover:border-[var(--border-default)] transition-colors duration-[var(--motion-fast)]"
		>
			<span className="inline-flex items-center justify-center size-[24px] rounded-[var(--r-subtle)] bg-[var(--surface-container)] text-[var(--text-tertiary)] shrink-0">
				<svg viewBox="0 0 14 14" className="size-[13px]" aria-hidden="true">
					<path d="M3 1.5h5l3 3v8a0.5 0.5 0 0 1-.5.5h-7a0.5 0.5 0 0 1-.5-.5v-11a0.5 0.5 0 0 1 .5-.5z" fill="none" stroke="currentColor" strokeWidth="1" />
				</svg>
			</span>
			<span className="flex-1 min-w-0 font-mono text-[13px] text-[var(--text-primary)] truncate">{path}</span>
			<span className="text-[12px] font-mono tabular-nums text-[var(--accent-primary)]">+{added}</span>
			<span className="text-[12px] font-mono tabular-nums text-[var(--status-error)]">−{removed}</span>
			<span className="text-[12px] text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]">→</span>
		</button>
	);
}

function ReferencedItemEmbed({
	title,
	section,
}: {
	title: string;
	section: string;
}): React.JSX.Element {
	return (
		<button
			type="button"
			className="group flex flex-col w-full text-left mt-[9px] px-[12px] py-[9px] rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)] hover:border-[var(--border-default)] transition-colors duration-[var(--motion-fast)]"
		>
			<span className="flex items-center gap-[6px]">
				<span className="text-[10px] font-medium uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
					Knowledge item
				</span>
			</span>
			<span className="text-[15px] font-medium text-[var(--text-primary)] mt-[3px]">{title}</span>
			<span className="text-[13px] text-[var(--text-secondary)] mt-[3px]">{section}</span>
		</button>
	);
}

function SessionReferenceEmbed({
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
		<button
			type="button"
			className="group flex items-center gap-[9px] mt-[9px] px-[12px] py-[6px] rounded-[var(--r-pill)] border border-[var(--border-subtle)] bg-[var(--surface-container)] hover:border-[var(--border-default)] transition-colors duration-[var(--motion-fast)]"
		>
			<span className="inline-flex items-center justify-center rounded-full size-[20px] text-[10px] font-semibold border-[1.5px] border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--accent-primary-dim)] shrink-0">
				AT
			</span>
			<span className="text-[12px] font-medium uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
				Session
			</span>
			<span className="text-[13px] text-[var(--text-secondary)]">{agent}</span>
			<span className="text-[var(--border-default)]">·</span>
			<span className="text-[13px] text-[var(--text-secondary)]">{model}</span>
			<span className="text-[var(--border-default)]">·</span>
			<span className="text-[13px] font-mono tabular-nums text-[var(--text-secondary)]">{cost}</span>
			<span className="text-[var(--border-default)]">·</span>
			<span className="text-[13px] tabular-nums text-[var(--text-tertiary)]">{toolCalls} tool calls</span>
			<span className="text-[13px] text-[var(--text-tertiary)] group-hover:text-[var(--accent-primary)]">→</span>
		</button>
	);
}

// ── Review → verdict ────────────────────────────────────────────────────────

function ReviewPart({
	resolved,
}: {
	resolved: boolean;
}): React.JSX.Element {
	const [open, setOpen] = useState(!resolved);
	const reasoning = [
		"WebAuthn registration + the dual-auth window are wired and green.",
		"All 18 auth contract tests pass; existing sessions unaffected.",
		"Staging cost cap unchanged; rollback is a single flag flip.",
	];
	return (
		<div
			className="mt-[9px] rounded-[var(--r-default)] border border-[var(--border-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-default)] overflow-hidden"
			data-ds-component="Am1ReviewPart"
		>
			<div className="px-[18px] pt-[12px] pb-[9px]">
				<div className="flex items-center gap-[6px]">
					<span className="text-[10px] font-medium uppercase tracking-[var(--tracking-caps-sm)] text-[var(--accent-primary)]">
						Review
					</span>
					{resolved ? (
						<span className="text-[10px] font-semibold uppercase tracking-[var(--tracking-caps-sm)] text-[var(--accent-primary)]">
							· Approved
						</span>
					) : null}
				</div>
				<h3 className="text-[17px] font-semibold text-[var(--text-primary)] mt-[3px]">
					Approve deploy of passkey login to staging
				</h3>
			</div>

			<div className="px-[18px] pb-[12px]">
				<button
					type="button"
					onClick={() => setOpen((p) => !p)}
					aria-expanded={open}
					className="flex items-center gap-[6px] text-[13px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)]"
				>
					<svg
						viewBox="0 0 12 12"
						className="size-[12px] transition-transform duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
						style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
						aria-hidden="true"
					>
						<path d="M4 2.5 L8 6 L4 9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
					</svg>
					<span>{reasoning.length} lines of reasoning</span>
				</button>
				{open ? (
					<ul className="mt-[9px] flex flex-col gap-[3px]">
						{reasoning.map((r) => (
							<li key={r} className="text-[15px] leading-[var(--leading-body)] text-[var(--text-secondary)] pl-[18px] relative">
								<span className="absolute left-[3px] top-[10px] size-[3px] rounded-full bg-[var(--text-tertiary)]" />
								{r}
							</li>
						))}
					</ul>
				) : null}

				<ArtifactDiffEmbed path="auth/passkey.ts" added={124} removed={18} />
			</div>

			<div className="flex items-center gap-[9px] px-[18px] py-[12px] border-t border-[var(--border-subtle)] bg-[var(--surface-container)]">
				{resolved ? (
					<span className="text-[13px] text-[var(--text-secondary)]">
						<span className="font-medium text-[var(--accent-primary)]">Approved</span> by A. Founder · 14 min ago
					</span>
				) : (
					<>
						<button
							type="button"
							className="px-[12px] py-[7px] rounded-[var(--r-subtle)] text-[13px] font-medium text-[var(--text-on-accent)] bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] transition-colors duration-[var(--motion-fast)]"
						>
							Approve
						</button>
						<button
							type="button"
							className="px-[12px] py-[7px] rounded-[var(--r-subtle)] text-[13px] font-medium text-[var(--text-secondary)] border border-[var(--border-default)] bg-[var(--surface-elevated)] hover:border-[var(--border-strong)] transition-colors duration-[var(--motion-fast)]"
						>
							Request changes
						</button>
						<button
							type="button"
							className="px-[12px] py-[7px] rounded-[var(--r-subtle)] text-[13px] font-medium text-[var(--status-error)] border border-[var(--border-default)] bg-[var(--surface-elevated)] hover:border-[var(--status-error)] transition-colors duration-[var(--motion-fast)]"
						>
							Reject
						</button>
					</>
				)}
			</div>
		</div>
	);
}

// ── Message group (sender-grouped column row) ───────────────────────────────

function MessageGroup({
	sender,
	time,
	children,
}: {
	sender: Sender;
	time: string;
	children: React.ReactNode;
}): React.JSX.Element {
	return (
		<div className="flex gap-[12px]">
			<Avatar sender={sender} />
			<div className="flex-1 min-w-0">
				<SenderHeader sender={sender} time={time} />
				<div className="flex flex-col gap-[9px]">{children}</div>
			</div>
		</div>
	);
}

function PlainText({ children }: { children: React.ReactNode }): React.JSX.Element {
	return (
		<p className="text-[15px] leading-[var(--leading-body)] text-[var(--text-primary)] whitespace-pre-wrap">
			{children}
		</p>
	);
}

// ── Composer (deliberate message; NO model/effort pills) ────────────────────

function Composer(): React.JSX.Element {
	return (
		<div className="sticky bottom-0 pt-[12px] bg-[var(--surface-page)]">
			<div className="rounded-[var(--r-default)] border border-[var(--border-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-default)] focus-within:border-[var(--accent-primary)] transition-colors duration-[var(--motion-fast)]">
				<textarea
					rows={2}
					placeholder="Message the thread…"
					className="w-full resize-none bg-transparent px-[12px] pt-[12px] text-[15px] leading-[var(--leading-body)] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] outline-none"
				/>
				<div className="flex items-center justify-between px-[12px] pb-[9px]">
					<span className="text-[12px] text-[var(--text-tertiary)]">⌘↵ to send</span>
					<button
						type="button"
						className="px-[12px] py-[7px] rounded-[var(--r-subtle)] text-[13px] font-medium text-[var(--text-on-accent)] bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] transition-colors duration-[var(--motion-fast)]"
					>
						Send
					</button>
				</div>
			</div>
		</div>
	);
}

// ── The column ──────────────────────────────────────────────────────────────

export interface Am1ConversationQuietStreamProps {
	/** When true, the review Part renders resolved (verdict applied). Default true (full fixture). */
	readonly resolved?: boolean;
}

export default function Am1ConversationQuietStream({
	resolved = true,
}: Am1ConversationQuietStreamProps): React.JSX.Element {
	return (
		<div
			data-ds-component="Am1ConversationQuietStream"
			className="min-h-full w-full bg-[var(--surface-page)] flex flex-col items-center"
		>
			<div className="w-full max-w-[720px] px-[24px] py-[24px] flex flex-col gap-[24px]">
				{/* Host banner — the thread this conversation reads */}
				<div className="flex items-center gap-[9px] pb-[12px] border-b border-[var(--border-subtle)]">
					<span className="text-[10px] font-medium uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
						Task
					</span>
					<span className="text-[15px] font-semibold text-[var(--text-primary)]">Passkey login</span>
				</div>

				{/* 1 — Founder plain */}
				<MessageGroup sender={FOUNDER} time="9:02 AM">
					<PlainText>Can you wire passkey login and show me the diff before we deploy?</PlainText>
				</MessageGroup>

				{/* 2-5 — Atlas group (Fold, then three embeds) */}
				<MessageGroup sender={ATLAS} time="9:14 AM">
					<Fold summary="Worked for 1m 12s · 14 steps">
						Added WebAuthn registration + the dual-auth window. Existing sessions stay valid through
						phase 2.
					</Fold>

					<div>
						<PlainText>Here is the change to the auth entrypoint:</PlainText>
						<ArtifactDiffEmbed path="auth/passkey.ts" added={124} removed={18} />
					</div>

					<div>
						<PlainText>It follows the dual-auth window we agreed on:</PlainText>
						<ReferencedItemEmbed
							title="Auth migration plan"
							section="§2 Dual-auth window"
						/>
					</div>

					<div>
						<PlainText>The full run is here if you want to dig in:</PlainText>
						<SessionReferenceEmbed agent="Atlas" model="Opus 4.8" cost="$0.42" toolCalls={14} />
					</div>
				</MessageGroup>

				{/* 6 — Atlas review */}
				<MessageGroup sender={ATLAS} time="9:15 AM">
					<ReviewPart resolved={resolved} />
				</MessageGroup>

				<Composer />
			</div>
		</div>
	);
}
