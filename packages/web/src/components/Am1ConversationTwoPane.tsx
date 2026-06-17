/**
 * AM1 — Conversation Experience, Variant B: "Quiet turns".
 *
 * REDO v2 (founder rejected the v1 two-pane as busy/misaligned). This is now a
 * SINGLE calm reading column — the side panel is dropped: a second region reads
 * as "busy"; the reference (t3code) is single-column. The v1 dense two-pane,
 * per-message avatars/badges/timestamps, and reference chips are all gone.
 *
 * /design Phase-1 embodiment of the LOCKED concept (`plans/AM1/concept.md`):
 * a Conversation = deliberate, threaded messages rendered calmly through the
 * Part model (typed Parts + Embed + Fold), derived never stored.
 *
 * THESIS (vs siblings): structure comes from soft, generously-padded BORDERLESS
 * turn blocks (at most a faint --surface-container tint) + whitespace — NOT from
 * borders, shadows, accent rails, or badge soup. Sender named ONCE per turn,
 * quietly. Cleaner turn boundaries than A (no containers), calmer than C
 * (editorial full-bleed embeds). ONE restrained aligned embed treatment for the
 * diff, the referenced block, and the session reference.
 *
 * Concept honor:
 *  - Session activity is NEVER first-class conversation content. A session is a
 *    one-line Session-reference Embed that OPENS the lower-level dial-in (AM3);
 *    never an inlined work-log.
 *  - Renders WITHIN Thread/Message/verdict — reshapes none of them.
 *  - Nothing named "Block"/"blocked".
 *
 * Scope: self-contained presentational variant for the viewer. Fixture inline,
 * callbacks noop, visuals hand-rolled with Tailwind + semantic tokens for
 * guaranteed rendering. Production reuse mapping lives in `spec.md`.
 *
 * @lore AM1-B: hand-rolled (not the real CommentRow/RichMessageCard/ArtifactEmbed)
 * on purpose — a design embodiment, not production wiring. The builder maps each
 * hand-rolled slot back to the catalogued component per spec.md §Composition.
 */

import type {
	ArtifactRef,
	Message,
	PlainPayload,
	ReviewPayload,
	Thread,
	VerdictPayload,
} from "@hyperidle/shared";
import { type JSX, useState } from "react";

// ── Fixture identities ──────────────────────────────────────────
const FOUNDER = { id: "u-founder", name: "A. Founder", isAgent: false };
const ATLAS = { id: "u-atlas", name: "Atlas", isAgent: true };
type Identity = typeof FOUNDER;

// ── Fixture Thread (host = a bet/task: "Passkey login") ─────────
const THREAD: Thread = {
	id: "t-passkey",
	hostKind: "task",
	hostId: "task-passkey",
	initiatorId: FOUNDER.id,
	participants: [FOUNDER.id, ATLAS.id],
	pinned: false,
	resolvedAt: null,
	lastActiveAt: "2026-06-17T09:14:00.000Z",
	createdAt: "2026-06-17T09:02:00.000Z",
};

// ── Canonical fixture Messages (per brief §Canonical fixture) ───
const M_FOUNDER_ASK: Message = {
	id: "m1",
	threadId: THREAD.id,
	senderId: FOUNDER.id,
	clientKey: "k1",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-06-17T09:02:00.000Z",
	type: "plain",
	payload: { text: "Can you wire passkey login and show me the diff before we deploy?" },
};

const M_ATLAS_WORK: Message = {
	id: "m2",
	threadId: THREAD.id,
	senderId: ATLAS.id,
	clientKey: "k2",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-06-17T09:11:00.000Z",
	type: "plain",
	payload: {
		text: "Added WebAuthn registration and the dual-auth window. Existing sessions stay valid through phase 2.",
	},
};

const DIFF_REF: ArtifactRef = { id: "art-passkey-diff", kind: "text_diff" };

const M_ATLAS_REVIEW: Message = {
	id: "m6",
	threadId: THREAD.id,
	senderId: ATLAS.id,
	clientKey: "k6",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-06-17T09:13:30.000Z",
	type: "review",
	payload: {
		title: "Approve deploy of passkey login to staging",
		reasoning: [
			"WebAuthn registration and the dual-auth window land behind a flag.",
			"All 38 auth contract tests pass; integration suite green.",
			"Existing password sessions stay valid through phase 2.",
		],
		artifactRef: DIFF_REF,
	} satisfies ReviewPayload,
};

const M_FOUNDER_VERDICT: Message = {
	id: "m7",
	threadId: THREAD.id,
	senderId: FOUNDER.id,
	clientKey: "k7",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: "2026-06-17T09:14:00.000Z",
	createdAt: "2026-06-17T09:14:00.000Z",
	type: "verdict",
	payload: {
		decision: "approve",
		resolvesMessageId: "m6",
		note: "Ship to staging — re-review before prod.",
	} satisfies VerdictPayload,
};

// ── Tiny inline icon set (no emoji; currentColor) ───────────────
function Glyph({ d, size = 12 }: { d: string; size?: number }): JSX.Element {
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

// ── Turn block: one speaker's contribution. Borderless, soft tint. ─
// Structure from padding + a faint --surface-container tint, NEVER from a
// border / shadow / accent rail. The founder's turns sit untinted (plainer)
// so the agent's turns gently group; both share ONE left edge.
function Turn({
	who,
	tint,
	children,
}: {
	who: Identity;
	tint: boolean;
	children: React.ReactNode;
}): JSX.Element {
	return (
		<div
			data-ds-component="Am1Turn"
			data-ds-sender={who.isAgent ? "agent" : "human"}
			className="rounded-[var(--r-default)] px-[18px] py-[18px]"
			style={{ background: tint ? "var(--surface-container)" : "transparent" }}
		>
			{/* Sender named ONCE per turn, quietly. No avatar, no timestamp-per-line. */}
			<div className="mb-[9px] text-[12px] font-medium text-[var(--text-secondary)]">
				{who.name}
			</div>
			{children}
		</div>
	);
}

// Calm body prose — the default reading unit inside a turn.
function Prose({ children }: { children: React.ReactNode }): JSX.Element {
	return (
		<p className="m-0 text-[15px] leading-[1.6] text-[var(--text-primary)]">{children}</p>
	);
}

// ── Fold: a quiet uppercase work-label + optional "Show". ───────
// The agent work-turn marker. Calm section label, not a heavy fold card.
function WorkFold({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}): JSX.Element {
	const [open, setOpen] = useState(false);
	return (
		<div>
			<div className="flex items-baseline gap-[9px]">
				<span className="text-[12px] font-medium uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
					{label}
				</span>
				<button
					type="button"
					onClick={() => setOpen((p) => !p)}
					className="border-none bg-transparent p-0 text-[12px] font-medium text-[var(--text-tertiary)] cursor-pointer hover:text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)] focus-visible:rounded-[var(--r-subtle)]"
					aria-expanded={open}
				>
					{open ? "Hide" : "Show"}
				</button>
			</div>
			{open && <div className="mt-[12px]">{children}</div>}
		</div>
	);
}

// ── Embed: ONE restrained aligned card treatment. ──────────────
// A subtle --surface-elevated block, modest padding, aligned to the turn's
// left edge. Used identically for the diff, the referenced block, and the
// session reference — the difference is only the line of content inside.
function Embed({
	onOpen,
	children,
	label,
}: {
	onOpen?: () => void;
	children: React.ReactNode;
	label: string;
}): JSX.Element {
	const interactive = onOpen !== undefined;
	const cls =
		"group/embed mt-[12px] block w-full rounded-[var(--r-subtle)] bg-[var(--surface-elevated)] px-[12px] py-[12px] text-left transition-colors duration-[var(--motion-fast)]";
	const content = (
		<div className="flex items-center gap-[12px]">
			<div className="min-w-0 flex-1">{children}</div>
			{interactive && (
				<span className="shrink-0 text-[var(--text-tertiary)] opacity-60 transition-opacity duration-[var(--motion-fast)] group-hover/embed:opacity-100">
					<Glyph d={ICON_ARROW} size={13} />
				</span>
			)}
		</div>
	);
	if (interactive) {
		return (
			<button
				type="button"
				onClick={onOpen}
				aria-label={label}
				data-ds-component="Am1Embed"
				className={`${cls} cursor-pointer border-none hover:bg-[var(--surface-container)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]`}
			>
				{content}
			</button>
		);
	}
	return (
		<div data-ds-component="Am1Embed" className={cls}>
			{content}
		</div>
	);
}

// ── The review Part (foldable reasoning + calm verdict bar) ─────
function ReviewPart({
	payload,
	resolved,
}: {
	payload: ReviewPayload;
	resolved: boolean;
}): JSX.Element {
	return (
		<div data-ds-component="Am1ReviewPart">
			<div className="flex items-baseline gap-[9px]">
				<span className="text-[12px] font-medium uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
					{resolved ? "Review · Approved" : "Review"}
				</span>
			</div>
			<p className="mt-[9px] mb-0 text-[15px] font-semibold leading-[1.5] text-[var(--text-primary)]">
				{payload.title}
			</p>
			<div className="mt-[12px]">
				<WorkFold label={`Reasoning · ${payload.reasoning.length} lines`}>
					<ul className="m-0 list-none space-y-[6px] p-0">
						{payload.reasoning.map((line) => (
							<li
								key={line}
								className="flex gap-[9px] text-[15px] leading-[1.6] text-[var(--text-secondary)]"
							>
								<span className="text-[var(--text-tertiary)]">·</span>
								<span>{line}</span>
							</li>
						))}
					</ul>
				</WorkFold>
			</div>
			{/* The diff under review — same single Embed treatment */}
			<Embed onOpen={() => undefined} label="Open diff for auth/passkey.ts">
				<DiffLine />
			</Embed>
			{/* Verdict bar — the universal verdict set, calm */}
			<div className="mt-[18px] flex items-center gap-[9px]">
				{resolved ? (
					<span className="inline-flex items-center gap-[6px] text-[13px] text-[var(--status-success)]">
						<Glyph d={ICON_CHECK} size={13} />
						Approved by A. Founder
					</span>
				) : (
					<>
						<VerdictButton tone="approve" label="Approve" />
						<VerdictButton tone="changes" label="Request changes" />
						<VerdictButton tone="reject" label="Reject" />
					</>
				)}
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
			className="rounded-[var(--r-subtle)] px-[12px] py-[7px] text-[13px] font-medium cursor-pointer transition-colors duration-[var(--motion-fast)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]"
			style={styles}
		>
			{label}
		</button>
	);
}

// ── Embed content lines (one restrained style, three uses) ──────
function DiffLine(): JSX.Element {
	return (
		<div className="flex items-baseline gap-[12px]">
			<span className="min-w-0 flex-1 truncate font-mono text-[13px] text-[var(--text-primary)]">
				auth/passkey.ts
			</span>
			<span className="shrink-0 font-mono text-[13px] tabular-nums">
				<span className="text-[var(--status-success)]">+124</span>{" "}
				<span className="text-[var(--status-error)]">−18</span>
			</span>
		</div>
	);
}

function BlockRefLine(): JSX.Element {
	return (
		<div>
			<div className="text-[13px] font-medium text-[var(--text-primary)]">
				Auth migration plan · §2 Dual-auth window
			</div>
			<div className="mt-[3px] truncate text-[13px] leading-[1.5] text-[var(--text-secondary)]">
				Password and passkey credentials both authenticate during phase 2.
			</div>
		</div>
	);
}

function SessionRefLine(): JSX.Element {
	return (
		<div className="truncate text-[13px] text-[var(--text-secondary)]">
			<span className="font-medium text-[var(--text-primary)]">Session</span> · Atlas · Opus 4.8
			· <span className="tabular-nums">$0.42</span> ·{" "}
			<span className="tabular-nums">14 tool calls</span>
		</div>
	);
}

// ── Verdict Part (the founder's resolution echo) ────────────────
function VerdictEcho({ payload }: { payload: VerdictPayload }): JSX.Element {
	return (
		<div className="flex items-baseline gap-[6px] text-[15px] leading-[1.6] text-[var(--text-primary)]">
			<span className="self-center text-[var(--status-success)]">
				<Glyph d={ICON_CHECK} size={13} />
			</span>
			<span>
				<span className="font-semibold">Approved.</span> {payload.note}
			</span>
		</div>
	);
}

// ── Composer (single clean rounded elevated input; NO pills) ────
function Composer(): JSX.Element {
	return (
		<div className="shrink-0 bg-[var(--surface-page)] px-[24px] pb-[24px] pt-[12px]">
			<div className="mx-auto w-full max-w-[720px]">
				<div className="rounded-[var(--r-default)] bg-[var(--surface-elevated)] px-[18px] py-[12px] shadow-[var(--shadow-subtle)] focus-within:shadow-[var(--shadow-default)] transition-shadow duration-[var(--motion-fast)]">
					<textarea
						rows={1}
						placeholder="Message the thread…"
						className="min-h-[24px] w-full resize-none border-none bg-transparent text-[15px] leading-[1.5] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-placeholder)]"
					/>
				</div>
			</div>
		</div>
	);
}

// ── The variant ─────────────────────────────────────────────────
export interface Am1ConversationTwoPaneProps {
	/** Reserved for future state hooks; the story renders only the populated thread. */
	readonly _placeholder?: never;
}

export default function Am1ConversationTwoPane(): JSX.Element {
	const founderAsk = M_FOUNDER_ASK.payload as PlainPayload;
	const atlasWork = M_ATLAS_WORK.payload as PlainPayload;
	const review = M_ATLAS_REVIEW.payload as ReviewPayload;
	const verdict = M_FOUNDER_VERDICT.payload as VerdictPayload;

	return (
		<div
			data-ds-component="Am1ConversationTwoPane"
			data-ds-thread-id={THREAD.id}
			className="flex h-[760px] flex-col bg-[var(--surface-page)] text-[var(--text-primary)]"
			style={{ fontFamily: "var(--font-sans)" }}
		>
			{/* Quiet thread heading — named once, no chrome */}
			<div className="shrink-0 px-[24px] pt-[24px] pb-[12px]">
				<div className="mx-auto w-full max-w-[720px]">
					<div className="text-[12px] font-medium uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
						Task
					</div>
					<h1 className="mt-[3px] mb-0 text-[20px] font-semibold leading-[1.3] text-[var(--text-primary)]">
						Passkey login
					</h1>
				</div>
			</div>

			{/* Single calm reading column — one left edge, generous rhythm */}
			<div className="min-h-0 flex-1 overflow-y-auto px-[24px]">
				<div className="mx-auto flex w-full max-w-[720px] flex-col gap-[12px] py-[12px]">
					{/* 1 · Founder ask (plain, untinted) */}
					<Turn who={FOUNDER} tint={false}>
						<Prose>{founderAsk.text}</Prose>
					</Turn>

					{/* 2 · Atlas work-turn (quiet work-label fold + prose) */}
					<Turn who={ATLAS} tint={true}>
						<WorkFold label="Response · Worked for 1m 12s">
							<Prose>{atlasWork.text}</Prose>
						</WorkFold>
					</Turn>

					{/* 3 · Atlas — artifact-diff Embed (one restrained card) */}
					<Turn who={ATLAS} tint={true}>
						<Prose>Here is the diff for the auth path.</Prose>
						<Embed onOpen={() => undefined} label="Open diff for auth/passkey.ts">
							<DiffLine />
						</Embed>
					</Turn>

					{/* 4 · Atlas — referenced-block Embed (same card treatment) */}
					<Turn who={ATLAS} tint={true}>
						<Prose>Context for the dual-auth window:</Prose>
						<Embed onOpen={() => undefined} label="Open referenced plan">
							<BlockRefLine />
						</Embed>
					</Turn>

					{/* 5 · Atlas — session-reference Embed (opens dial-in, NEVER a work-log) */}
					<Turn who={ATLAS} tint={true}>
						<Prose>This came out of my work session.</Prose>
						<Embed onOpen={() => undefined} label="Open the session dial-in">
							<SessionRefLine />
						</Embed>
					</Turn>

					{/* 6 · Atlas review (foldable reasoning + verdict bar) */}
					<Turn who={ATLAS} tint={true}>
						<ReviewPart payload={review} resolved={true} />
					</Turn>

					{/* 7 · Founder verdict → review resolved */}
					<Turn who={FOUNDER} tint={false}>
						<VerdictEcho payload={verdict} />
					</Turn>
				</div>
			</div>

			<Composer />
		</div>
	);
}
