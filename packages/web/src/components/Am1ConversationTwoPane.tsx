/**
 * AM1 — Conversation Experience, Variant B: "Two-pane / embeds open to the side".
 *
 * /design Phase-1 embodiment of the LOCKED concept (`plans/AM1/concept.md`):
 * a Conversation = deliberate, threaded messages rendered calmly through the
 * Part model (typed Parts + Embed + Fold), derived never stored. This variant's
 * THESIS (power-density): a TERSE, scannable left column of Parts whose embeds
 * are COMPACT REFERENCE CHIPS; selecting a chip opens its FULL preview in a
 * RIGHT CONTEXTUAL PANEL (t3code 3-pane idea) — the column never bloats.
 *
 * Concept honor:
 *  - Session activity is NEVER first-class conversation content. A session is a
 *    Session-reference Embed (a chip) that OPENS the lower-level dial-in (AM3);
 *    it is never inlined as a work-log. (Panel "Session" tab shows the chip's
 *    reference card + an "Open dial-in" affordance, NOT an activity stream.)
 *  - Renders WITHIN Thread/Message/verdict — reshapes none of them.
 *  - Nothing named "Block"/"blocked".
 *
 * Scope: self-contained presentational variant for the viewer. Fixture inline,
 * callbacks noop, all visuals hand-rolled with Tailwind + semantic tokens for
 * guaranteed rendering. Production reuse mapping lives in `spec.md`.
 *
 * @lore AM1-B: hand-rolled (not the real CommentRow/RichMessageCard/ArtifactEmbed)
 * on purpose — this is a design embodiment, not production wiring. The builder
 * maps each hand-rolled slot back to the catalogued component per spec.md §Composition.
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
const FOUNDER = { id: "u-founder", name: "A. Founder", initials: "AF", isAgent: false };
const ATLAS = { id: "u-atlas", name: "Atlas", initials: "AT", isAgent: true };
type Identity = typeof FOUNDER;
const IDENTITIES: Record<string, Identity> = { [FOUNDER.id]: FOUNDER, [ATLAS.id]: ATLAS };

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
		text: "Added WebAuthn registration + the dual-auth window. Existing sessions stay valid through phase 2.",
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
			"WebAuthn registration + dual-auth window land behind a flag.",
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

// ── Embed descriptors (the closed embed vocabulary) ─────────────
type EmbedKind = "diff" | "referenced-block" | "session-reference";
interface ChipDescriptor {
	readonly key: EmbedKind;
	readonly icon: JSX.Element;
	readonly label: string;
	readonly stat: string;
}

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
const ICON_DIFF = "M5 1v6H3l3 4 3-4H7V1H5zm6 14V9h2L10 5 7 9h2v6h2z";
const ICON_BLOCK = "M2 3a1 1 0 011-1h10a1 1 0 011 1v2H2V3zm0 4h14v6a1 1 0 01-1 1H3a1 1 0 01-1-1V7z";
const ICON_SESSION =
	"M8 1a7 7 0 100 14A7 7 0 008 1zM7 4h2v4.6l3 1.8-1 1.7-4-2.4V4z";
const ICON_CHEVRON = "M6 4l4 4-4 4V4z";
const ICON_FOLD = "M3 6l5 5 5-5H3z";
const ICON_SEND = "M1 8l14-6-6 14-2-5-6-3z";
const ICON_CHECK = "M6.5 11.5L3 8l1.2-1.2 2.3 2.3L11.8 4 13 5.2l-6.5 6.3z";

// ── Avatar (hand-rolled; agent = forest tint) ───────────────────
function Avatar({ who, size = 22 }: { who: Identity; size?: number }): JSX.Element {
	return (
		<span
			className="inline-flex shrink-0 items-center justify-center rounded-[var(--r-pill)] font-medium select-none"
			style={{
				width: size,
				height: size,
				fontSize: 10,
				color: who.isAgent ? "var(--accent-primary)" : "var(--text-secondary)",
				background: who.isAgent
					? "var(--accent-primary-dim)"
					: "var(--surface-container)",
				border: "1px solid var(--border-subtle)",
			}}
		>
			{who.initials}
		</span>
	);
}

// ── A sender header line (terse, metadata hover-revealed) ───────
function SenderLine({ who, time }: { who: Identity; time: string }): JSX.Element {
	return (
		<div className="group/meta flex items-baseline gap-[6px]">
			<span className="text-[13px] font-semibold text-[var(--text-primary)] leading-[1.2]">
				{who.name}
			</span>
			{who.isAgent && (
				<span className="text-[10px] font-medium uppercase tracking-[var(--tracking-caps-sm)] text-[var(--accent-primary)]">
					agent
				</span>
			)}
			<span className="ml-auto text-[11px] tabular-nums text-[var(--text-tertiary)] opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover/meta:opacity-100">
				{time}
			</span>
		</div>
	);
}

// ── A Part row: avatar gutter + tight body. The calm reading unit. ─
function PartRow({
	who,
	time,
	children,
}: {
	who: Identity;
	time: string;
	children: React.ReactNode;
}): JSX.Element {
	return (
		<div
			data-ds-component="Am1Part"
			className="flex gap-[9px] px-[12px] py-[6px] hover:bg-[var(--surface-container)] transition-colors duration-[var(--motion-fast)]"
		>
			<div className="pt-[1px]">
				<Avatar who={who} />
			</div>
			<div className="min-w-0 flex-1">
				<SenderLine who={who} time={time} />
				<div className="mt-[3px]">{children}</div>
			</div>
		</div>
	);
}

// ── Fold device: a completed/long unit collapses to ONE line. ───
function Fold({
	summary,
	children,
}: {
	summary: string;
	children: React.ReactNode;
}): JSX.Element {
	const [open, setOpen] = useState(false);
	return (
		<div>
			<button
				type="button"
				onClick={() => setOpen((p) => !p)}
				className="inline-flex items-center gap-[6px] rounded-[var(--r-subtle)] border-none bg-transparent px-0 py-0 text-[12px] text-[var(--text-tertiary)] cursor-pointer hover:text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)]"
			>
				<span
					className="text-[var(--text-tertiary)] transition-transform duration-[var(--motion-fast)]"
					style={{ transform: open ? "rotate(90deg)" : "none" }}
				>
					<Glyph d={ICON_CHEVRON} size={10} />
				</span>
				{summary}
			</button>
			{open && (
				<div className="mt-[6px] text-[13px] leading-[1.5] text-[var(--text-secondary)]">
					{children}
				</div>
			)}
		</div>
	);
}

// ── Compact reference chip — the variant's signature embed shape. ─
function ReferenceChip({
	chip,
	active,
	onOpen,
}: {
	chip: ChipDescriptor;
	active: boolean;
	onOpen: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={onOpen}
			aria-pressed={active}
			data-ds-component="Am1ReferenceChip"
			className="group/chip mt-[6px] flex w-full items-center gap-[8px] rounded-[var(--r-subtle)] border px-[10px] py-[6px] text-left cursor-pointer transition-colors duration-[var(--motion-fast)]"
			style={{
				borderColor: active ? "var(--accent-primary)" : "var(--border-subtle)",
				background: active ? "var(--accent-primary-dim)" : "var(--surface-elevated)",
			}}
		>
			<span
				className="inline-flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[var(--r-subtle)]"
				style={{
					color: active ? "var(--accent-primary)" : "var(--text-tertiary)",
					background: "var(--surface-container)",
				}}
			>
				{chip.icon}
			</span>
			<span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--text-primary)] font-mono">
				{chip.label}
			</span>
			<span className="shrink-0 text-[11px] tabular-nums text-[var(--text-secondary)]">
				{chip.stat}
			</span>
			<span className="shrink-0 text-[var(--text-tertiary)] opacity-60 transition-opacity duration-[var(--motion-fast)] group-hover/chip:opacity-100">
				<Glyph d={ICON_CHEVRON} size={11} />
			</span>
		</button>
	);
}

// ── The review Part (folded reasoning + verdict bar) ────────────
function ReviewPart({
	payload,
	resolved,
	onOpenDiff,
	diffActive,
}: {
	payload: ReviewPayload;
	resolved: boolean;
	onOpenDiff: () => void;
	diffActive: boolean;
}): JSX.Element {
	return (
		<div
			data-ds-component="Am1ReviewPart"
			className="rounded-[var(--r-default)] border bg-[var(--surface-elevated)] shadow-[var(--shadow-default)]"
			style={{ borderColor: "var(--border-default)" }}
		>
			<div className="flex items-center gap-[8px] px-[12px] py-[9px] border-b border-[var(--border-subtle)]">
				<span
					className="inline-flex h-[16px] items-center rounded-[var(--r-pill)] px-[7px] text-[10px] font-medium uppercase tracking-[var(--tracking-caps-sm)]"
					style={{
						color: resolved ? "var(--text-on-accent)" : "var(--accent-secondary)",
						background: resolved ? "var(--status-success)" : "var(--accent-secondary-dim)",
					}}
				>
					{resolved ? "Approved" : "Review"}
				</span>
				<span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text-primary)]">
					{payload.title}
				</span>
			</div>
			<div className="px-[12px] py-[9px]">
				<Fold summary={`${payload.reasoning.length} lines of reasoning`}>
					<ul className="m-0 list-none space-y-[3px] p-0">
						{payload.reasoning.map((line) => (
							<li key={line} className="flex gap-[6px]">
								<span className="text-[var(--text-tertiary)]">·</span>
								<span>{line}</span>
							</li>
						))}
					</ul>
				</Fold>
				{/* Artifact diff = compact chip → opens in the right panel, never inline */}
				<ReferenceChip
					chip={{
						key: "diff",
						icon: <Glyph d={ICON_DIFF} />,
						label: "auth/passkey.ts",
						stat: "+124 −18",
					}}
					active={diffActive}
					onOpen={onOpenDiff}
				/>
			</div>
			{/* Verdict bar — the universal verdict set, scoped to review */}
			<div className="flex items-center gap-[6px] border-t border-[var(--border-subtle)] px-[12px] py-[8px]">
				{resolved ? (
					<span className="inline-flex items-center gap-[6px] text-[12px] text-[var(--status-success)]">
						<Glyph d={ICON_CHECK} size={12} />
						Approved by A. Founder · 0 min ago
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
			? { color: "var(--text-on-accent)", background: "var(--accent-primary)", border: "1px solid var(--accent-primary)" }
			: tone === "changes"
				? { color: "var(--accent-secondary)", background: "transparent", border: "1px solid var(--border-default)" }
				: { color: "var(--status-error)", background: "transparent", border: "1px solid var(--border-default)" };
	return (
		<button
			type="button"
			className="rounded-[var(--r-subtle)] px-[10px] py-[6px] text-[12px] font-medium cursor-pointer transition-colors duration-[var(--motion-fast)]"
			style={styles}
		>
			{label}
		</button>
	);
}

// ── Verdict Part (resolution echo in the column) ────────────────
function VerdictPart({ payload }: { payload: VerdictPayload }): JSX.Element {
	return (
		<div className="flex items-center gap-[8px] text-[12px] text-[var(--text-secondary)]">
			<span className="text-[var(--status-success)]">
				<Glyph d={ICON_CHECK} size={12} />
			</span>
			<span>
				<span className="font-medium text-[var(--text-primary)]">Approved</span> ·{" "}
				{payload.note}
			</span>
		</div>
	);
}

// ── RIGHT CONTEXTUAL PANEL — holds the substance ────────────────
type PanelTab = "diff" | "block" | "session";

function ContextualPanel({
	tab,
	onTab,
	onClose,
}: {
	tab: PanelTab;
	onTab: (t: PanelTab) => void;
	onClose: () => void;
}): JSX.Element {
	const TABS: Array<{ id: PanelTab; label: string }> = [
		{ id: "diff", label: "Diff" },
		{ id: "block", label: "Plan" },
		{ id: "session", label: "Session" },
	];
	return (
		<aside
			data-ds-component="Am1ContextualPanel"
			aria-label="Referenced content"
			className="flex h-full w-[380px] shrink-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--surface-container)] transition-transform duration-[var(--motion-default)]"
		>
			{/* Header + close */}
			<div className="flex items-center gap-[8px] border-b border-[var(--border-subtle)] px-[12px] py-[9px]">
				<span className="text-[12px] font-medium uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
					Reference
				</span>
				<button
					type="button"
					aria-label="Close panel"
					onClick={onClose}
					className="ml-auto inline-flex h-[22px] w-[22px] items-center justify-center rounded-[var(--r-subtle)] border-none bg-transparent text-[var(--text-tertiary)] cursor-pointer hover:bg-[var(--surface-elevated)] hover:text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)]"
				>
					<Glyph d="M4 4l8 8M12 4l-8 8" size={12} />
				</button>
			</div>
			{/* Tab bar (addressable, scoped to the thread) */}
			<div className="flex gap-[2px] border-b border-[var(--border-subtle)] px-[8px]">
				{TABS.map((t) => {
					const on = t.id === tab;
					return (
						<button
							key={t.id}
							type="button"
							onClick={() => onTab(t.id)}
							className="relative border-none bg-transparent px-[10px] py-[8px] text-[13px] cursor-pointer transition-colors duration-[var(--motion-fast)]"
							style={{
								color: on ? "var(--text-primary)" : "var(--text-tertiary)",
								fontWeight: on ? 600 : 400,
								boxShadow: on ? "inset 0 -2px 0 var(--accent-primary)" : "none",
							}}
						>
							{t.label}
						</button>
					);
				})}
			</div>
			{/* Body */}
			<div className="min-h-0 flex-1 overflow-y-auto px-[12px] py-[10px]">
				{tab === "diff" && <PanelDiff />}
				{tab === "block" && <PanelBlock />}
				{tab === "session" && <PanelSession />}
			</div>
		</aside>
	);
}

// Full diff preview (the heavy content the column kept out of itself)
function PanelDiff(): JSX.Element {
	const lines: Array<{ t: "ctx" | "add" | "del"; n: string }> = [
		{ t: "ctx", n: "import { startRegistration } from \"@simplewebauthn/browser\";" },
		{ t: "del", n: "export async function login(email, password) {" },
		{ t: "add", n: "export async function login(email: string) {" },
		{ t: "add", n: "  const opts = await fetchPasskeyChallenge(email);" },
		{ t: "add", n: "  const cred = await startRegistration(opts);" },
		{ t: "add", n: "  return verifyPasskey(email, cred);" },
		{ t: "ctx", n: "}" },
	];
	return (
		<div>
			<div className="mb-[9px] flex items-center gap-[8px]">
				<span className="font-mono text-[12px] text-[var(--text-primary)]">auth/passkey.ts</span>
				<span className="rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] px-[7px] py-[1px] text-[11px] font-medium text-[var(--accent-primary)]">
					text_diff
				</span>
				<span className="ml-auto font-mono text-[11px] tabular-nums">
					<span className="text-[var(--status-success)]">+124</span>{" "}
					<span className="text-[var(--status-error)]">−18</span>
				</span>
			</div>
			<pre className="m-0 overflow-x-auto rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-0 font-mono text-[12px] leading-[1.6]">
				{lines.map((l, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: static fixture lines
						key={i}
						className="px-[10px]"
						style={{
							color:
								l.t === "add"
									? "var(--status-success)"
									: l.t === "del"
										? "var(--status-error)"
										: "var(--text-secondary)",
							background:
								l.t === "add"
									? "var(--accent-primary-dim)"
									: l.t === "del"
										? "var(--status-error-dim)"
										: "transparent",
						}}
					>
						<span className="mr-[8px] select-none text-[var(--text-tertiary)]">
							{l.t === "add" ? "+" : l.t === "del" ? "−" : " "}
						</span>
						{l.n}
					</div>
				))}
			</pre>
		</div>
	);
}

// Referenced-block preview (knowledge item rendered, not a link)
function PanelBlock(): JSX.Element {
	return (
		<div>
			<div className="mb-[9px] flex items-center gap-[8px]">
				<span className="text-[var(--text-tertiary)]">
					<Glyph d={ICON_BLOCK} />
				</span>
				<span className="text-[13px] font-semibold text-[var(--text-primary)]">
					Auth migration plan
				</span>
			</div>
			<div className="rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-[12px]">
				<h4 className="m-0 text-[13px] font-semibold text-[var(--text-primary)]">
					§2 Dual-auth window
				</h4>
				<p className="mt-[6px] mb-0 text-[13px] leading-[1.5] text-[var(--text-secondary)]">
					Both password and passkey credentials authenticate during phase 2. Existing
					sessions remain valid; new sign-ins are offered passkey enrollment. Password
					sign-in is deprecated only after enrollment crosses 80%.
				</p>
			</div>
		</div>
	);
}

// Session-reference preview — a REFERENCE CARD + dial-in entry, NOT a work-log.
function PanelSession(): JSX.Element {
	const meta: Array<[string, string]> = [
		["Agent", "Atlas"],
		["Model", "Opus 4.8"],
		["Cost", "$0.42"],
		["Tool calls", "14"],
	];
	return (
		<div>
			<div className="mb-[9px] flex items-center gap-[8px]">
				<span className="text-[var(--accent-primary)]">
					<Glyph d={ICON_SESSION} />
				</span>
				<span className="text-[13px] font-semibold text-[var(--text-primary)]">
					Session reference
				</span>
			</div>
			<div className="rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-[12px]">
				<dl className="m-0 grid grid-cols-2 gap-x-[12px] gap-y-[6px]">
					{meta.map(([k, v]) => (
						<div key={k} className="flex items-baseline justify-between">
							<dt className="text-[11px] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
								{k}
							</dt>
							<dd className="m-0 text-[13px] tabular-nums text-[var(--text-primary)]">{v}</dd>
						</div>
					))}
				</dl>
				<p className="mt-[9px] mb-0 text-[12px] leading-[1.5] text-[var(--text-tertiary)]">
					Activity stays in the session. This is a reference, not a work-log.
				</p>
				<button
					type="button"
					className="mt-[9px] inline-flex w-full items-center justify-center gap-[6px] rounded-[var(--r-subtle)] border border-[var(--border-default)] bg-transparent px-[10px] py-[8px] text-[13px] font-medium text-[var(--accent-primary)] cursor-pointer hover:bg-[var(--accent-primary-dim)] transition-colors duration-[var(--motion-fast)]"
				>
					Open dial-in
					<Glyph d={ICON_CHEVRON} size={11} />
				</button>
			</div>
		</div>
	);
}

// ── Composer (terse; NO model/effort pills — those are AM3) ─────
function Composer(): JSX.Element {
	return (
		<div className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--surface-page)] px-[12px] py-[9px]">
			<div className="flex items-end gap-[8px] rounded-[var(--r-default)] border border-[var(--border-default)] bg-[var(--surface-elevated)] px-[12px] py-[9px] focus-within:border-[var(--accent-primary)] transition-colors duration-[var(--motion-fast)]">
				<textarea
					rows={1}
					placeholder="Message the thread…"
					className="min-h-[20px] flex-1 resize-none border-none bg-transparent text-[13px] leading-[1.4] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-placeholder)]"
				/>
				<button
					type="button"
					aria-label="Send"
					className="inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] border-none bg-[var(--accent-primary)] text-[var(--text-on-accent)] cursor-pointer hover:bg-[var(--accent-primary-hover)] transition-colors duration-[var(--motion-fast)]"
				>
					<Glyph d={ICON_SEND} size={13} />
				</button>
			</div>
		</div>
	);
}

// ── Thread host banner (terse) ──────────────────────────────────
function HostBanner(): JSX.Element {
	return (
		<div className="flex shrink-0 items-center gap-[8px] border-b border-[var(--border-subtle)] bg-[var(--surface-page)] px-[12px] py-[9px]">
			<span className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] px-[7px] py-[1px] text-[10px] font-medium uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
				Task
			</span>
			<span className="text-[13px] font-semibold text-[var(--text-primary)]">Passkey login</span>
			<span className="ml-auto text-[11px] text-[var(--text-tertiary)]">2 participants</span>
		</div>
	);
}

// ── State chrome (empty / loading / error) ──────────────────────
type RenderState = "populated" | "empty" | "loading" | "error";

function StateMessage({ state }: { state: Exclude<RenderState, "populated"> }): JSX.Element {
	if (state === "loading") {
		return (
			<div className="flex flex-1 flex-col gap-[9px] px-[12px] py-[12px]">
				{[0, 1, 2].map((i) => (
					<div key={i} className="flex gap-[9px]">
						<div className="h-[22px] w-[22px] shrink-0 animate-pulse rounded-[var(--r-pill)] bg-[var(--surface-container)]" />
						<div className="flex-1 space-y-[6px]">
							<div className="h-[10px] w-[120px] animate-pulse rounded-[var(--r-subtle)] bg-[var(--surface-container)]" />
							<div className="h-[10px] w-full max-w-[420px] animate-pulse rounded-[var(--r-subtle)] bg-[var(--surface-container)]" />
						</div>
					</div>
				))}
			</div>
		);
	}
	const copy =
		state === "empty"
			? { title: "No messages yet", body: "Start the conversation — send a message below." }
			: { title: "Couldn't load this conversation", body: "Something went wrong fetching messages." };
	return (
		<div className="flex flex-1 flex-col items-center justify-center px-[24px] py-[36px] text-center">
			<p className="m-0 text-[15px] font-semibold text-[var(--text-primary)]">{copy.title}</p>
			<p className="mt-[6px] mb-0 text-[13px] text-[var(--text-secondary)]">{copy.body}</p>
			{state === "error" && (
				<button
					type="button"
					className="mt-[12px] rounded-[var(--r-subtle)] border border-[var(--border-default)] bg-transparent px-[12px] py-[7px] text-[13px] font-medium text-[var(--text-primary)] cursor-pointer hover:bg-[var(--surface-container)] transition-colors duration-[var(--motion-fast)]"
				>
					Retry
				</button>
			)}
		</div>
	);
}

// ── The variant ─────────────────────────────────────────────────
export interface Am1ConversationTwoPaneProps {
	/** Default render state. `populated` shows the full fixture + open panel. */
	readonly state?: RenderState;
	/** Whether the contextual panel starts open (populated only). */
	readonly panelOpen?: boolean;
	/** Which tab the panel opens to. */
	readonly panelTab?: PanelTab;
}

export default function Am1ConversationTwoPane({
	state = "populated",
	panelOpen = true,
	panelTab = "diff",
}: Am1ConversationTwoPaneProps): JSX.Element {
	const [tab, setTab] = useState<PanelTab>(panelTab);
	const [open, setOpen] = useState(panelOpen);

	const founderAsk = M_FOUNDER_ASK.payload as PlainPayload;
	const atlasWork = M_ATLAS_WORK.payload as PlainPayload;
	const review = M_ATLAS_REVIEW.payload as ReviewPayload;
	const verdict = M_FOUNDER_VERDICT.payload as VerdictPayload;

	const openTo = (t: PanelTab): void => {
		setTab(t);
		setOpen(true);
	};

	return (
		<div
			data-ds-component="Am1ConversationTwoPane"
			data-ds-thread-id={THREAD.id}
			className="flex h-[680px] overflow-hidden rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-page)] text-[var(--text-primary)]"
			style={{ fontFamily: "var(--font-sans)" }}
		>
			{/* LEFT: terse, scannable conversation column */}
			<div className="flex min-w-0 flex-1 flex-col">
				<HostBanner />
				{state !== "populated" ? (
					<StateMessage state={state} />
				) : (
					<div className="min-h-0 flex-1 overflow-y-auto py-[6px]">
						{/* 1 · Founder ask (plain) */}
						<PartRow who={IDENTITIES[M_FOUNDER_ASK.senderId]!} time="9:02">
							<p className="m-0 text-[13px] leading-[1.5] text-[var(--text-primary)]">
								{founderAsk.text}
							</p>
						</PartRow>

						{/* 2 · Atlas work — Fold to one line (aggressive fold) */}
						<PartRow who={IDENTITIES[M_ATLAS_WORK.senderId]!} time="9:11">
							<Fold summary="Worked for 1m 12s · 14 steps">
								<p className="m-0">{atlasWork.text}</p>
							</Fold>
						</PartRow>

						{/* 3 · Atlas — artifact-diff Embed (compact chip → panel) */}
						<PartRow who={ATLAS} time="9:12">
							<p className="m-0 text-[13px] leading-[1.5] text-[var(--text-primary)]">
								Here's the diff for the auth path.
							</p>
							<ReferenceChip
								chip={{
									key: "diff",
									icon: <Glyph d={ICON_DIFF} />,
									label: "auth/passkey.ts",
									stat: "+124 −18",
								}}
								active={open && tab === "diff"}
								onOpen={() => openTo("diff")}
							/>
						</PartRow>

						{/* 4 · Atlas — referenced-block Embed (compact chip → panel) */}
						<PartRow who={ATLAS} time="9:12">
							<p className="m-0 text-[13px] leading-[1.5] text-[var(--text-primary)]">
								Context for the dual-auth window:
							</p>
							<ReferenceChip
								chip={{
									key: "referenced-block",
									icon: <Glyph d={ICON_BLOCK} />,
									label: "Auth migration plan",
									stat: "§2",
								}}
								active={open && tab === "block"}
								onOpen={() => openTo("block")}
							/>
						</PartRow>

						{/* 5 · Atlas — session-reference Embed (chip → dial-in, NEVER a work-log) */}
						<PartRow who={ATLAS} time="9:13">
							<p className="m-0 text-[13px] leading-[1.5] text-[var(--text-primary)]">
								This came out of my work session.
							</p>
							<ReferenceChip
								chip={{
									key: "session-reference",
									icon: <Glyph d={ICON_SESSION} />,
									label: "Session · Atlas · Opus 4.8",
									stat: "$0.42 · 14",
								}}
								active={open && tab === "session"}
								onOpen={() => openTo("session")}
							/>
						</PartRow>

						{/* 6 · Atlas review (folded reasoning + verdict bar) */}
						<PartRow who={ATLAS} time="9:13">
							<ReviewPart
								payload={review}
								resolved={true}
								onOpenDiff={() => openTo("diff")}
								diffActive={open && tab === "diff"}
							/>
						</PartRow>

						{/* 7 · Founder verdict → review resolved */}
						<PartRow who={IDENTITIES[M_FOUNDER_VERDICT.senderId]!} time="9:14">
							<VerdictPart payload={verdict} />
						</PartRow>
					</div>
				)}
				<Composer />
			</div>

			{/* RIGHT: contextual panel (slides in; holds the substance) */}
			{state === "populated" && open && (
				<ContextualPanel tab={tab} onTab={setTab} onClose={() => setOpen(false)} />
			)}
		</div>
	);
}
