// AM5 — Unified Split View (the money shot).
//
// The AM5 thesis, made visible: opening ANY reference, from ANYWHERE, lands in
// ONE consistent split. Three variants — conversation, review, document — each
// composes the SAME `SplitView` primitive (two sibling pane surfaces in the
// shell's layout space, with a transparent draggable gap and the same controls),
// and each destination is the SAME shape: the opened artifact rendered as a
// (Kind, Representation) cell via the real `Block` base primitive. Only the
// CONTENT differs. The three frames look structurally identical — that identity
// IS the proof of unification.
//
// Surface treatment: origin + destination are the only two rounded surfaces.
// There is no enclosing card or inner canvas; the transparent gap resizes them.
//
// REUSE, NOT REINVENTION:
//   • The fold container is the real `./SplitView` primitive (icon controls,
//     contextual modes, draggable divider) — imported, not forked. The same
//     component `SplitView.stories.tsx` exercises with placeholder boxes.
//   • The destinations render through the real `./Block` base primitive (the
//     (Kind,Representation) cell): text artifacts via heading/paragraph/list
//     block payloads; a data artifact via KPI figures + Sparkline + Block table.
//   • The origin surfaces are faithful Hearth fixtures built from REAL design-
//     system primitives (Block, ReferenceChip, Avatar, StatusChip, Fold). They
//     are NOT the production page components (ConversationSurface / Review /
//     DocumentBody live in `layers/core-ui`; a design-system story must not invert
//     the dependency boundary by importing upward). So each origin reproduces the
//     real surface's SHAPE — message rows + reference chips, a review canvas with
//     result KPIs + intent checklist, a document body of blocks — using the
//     same primitives the real surfaces compose.
//
// Presentational — drag state is local UI state, callbacks are noops.
// (states: populated real state only — empty/loading/error are representation-owned.)

import { type JSX, useState } from "react";
import type { BlockId, BlockPayload } from "../block/types.js";
import { Avatar } from "./Avatar.js";
import { Block } from "./Block.js";
import { Fold } from "./Fold.js";
import { ReferenceChip } from "./ReferenceChip.js";
import { type FoldMode, SplitView } from "./SplitView.js";
import { StatusChip } from "./StatusChip.js";

export default { title: "UnifiedSplitView", group: "System" as const };

const BLOCK_ID = "0123456789abcdef0123456789abcdef" as BlockId;
const para = (text: string): BlockPayload => ({
	kind: "paragraph",
	inline: [{ type: "text", value: text }],
});

// The desktop app-shell frame every variant renders inside (one consistent canvas).
const FRAME = "h-[480px] w-[920px]";

// ── Destination cells: the opened artifact as a (Kind, Representation) cell ──
// Each is the SAME shape — a captioned destination header + the artifact rendered
// through the real `Block` base primitive. Only the payload differs by Kind.

function DestinationHeader({
	kind,
	title,
	meta,
}: {
	kind: string;
	title: string;
	meta: string;
}): JSX.Element {
	return (
		<div className="flex items-center gap-[9px] border-b border-[var(--border-subtle)] px-[18px] py-[12px]">
			<span className="font-mono text-[10px] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
				{kind}
			</span>
			<span className="truncate text-[14px] font-semibold text-[var(--text-primary)]">{title}</span>
			<span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">
				{meta}
			</span>
		</div>
	);
}

// Text artifact — `single` representation: heading + paragraph + list blocks.
function TextArtifact(): JSX.Element {
	return (
		<div className="flex h-full flex-col">
			<DestinationHeader
				kind="Artifact · text"
				title="auth/passkey.ts — migration plan"
				meta="§2"
			/>
			<div className="flex-1 overflow-auto px-[18px] py-[12px]">
				<Block
					id={BLOCK_ID}
					payload={{
						kind: "heading",
						level: 2,
						text: "Dual-auth window",
						inline: [{ type: "text", value: "Dual-auth window" }],
					}}
				/>
				<Block
					id={BLOCK_ID}
					payload={para(
						"Existing password sessions stay valid through phase 2. WebAuthn registration runs alongside the legacy flow so enterprise tenants who can't yet enroll passkeys keep a working login.",
					)}
				/>
				<Block
					id={BLOCK_ID}
					payload={{
						kind: "list",
						ordered: true,
						start: 1,
						items: [
							{ children: [para("Register the WebAuthn credential on first sign-in")] },
							{ children: [para("Keep the password fallback enabled through phase 2")] },
							{ children: [para("Drop the fallback once tenant enrollment clears 95%")] },
						],
					}}
				/>
				<Block
					id={BLOCK_ID}
					payload={{
						kind: "code",
						lang: "ts",
						text: "if (await hasPasskey(user)) return verifyPasskey(req)\nreturn verifyPassword(req) // phase-2 fallback",
					}}
				/>
			</div>
		</div>
	);
}

// Data artifact — `single` representation: KPI figures + Sparkline + Block table.
// KPI + Sparkline reproduce the extracted base-primitive shapes (data-renderer).
function MetricFigures(): JSX.Element {
	const metrics = [
		{ label: "Silent failures", value: "0" },
		{ label: "Tests", value: "47 / 47" },
		{ label: "Coverage", value: "+0.4%" },
		{ label: "Error path", value: "covered" },
	];
	return (
		<div className="flex flex-wrap gap-[12px]">
			{metrics.map((m) => (
				<div key={m.label} className="flex flex-col">
					<span className="font-mono text-[11px] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
						{m.label}
					</span>
					<span className="text-[16px] font-semibold tabular-nums text-[var(--text-primary)]">
						{m.value}
					</span>
				</div>
			))}
		</div>
	);
}

function TrendRow({ label, values }: { label: string; values: number[] }): JSX.Element {
	const max = Math.max(...values);
	const min = Math.min(...values);
	const range = max - min || 1;
	const width = 80;
	const height = 24;
	const step = width / Math.max(values.length - 1, 1);
	const points = values
		.map((v, i) => `${i * step},${height - ((v - min) / range) * height}`)
		.join(" ");
	return (
		<div className="flex items-center gap-[9px]">
			<span className="w-[120px] shrink-0 font-mono text-[11px] uppercase text-[var(--text-tertiary)]">
				{label}
			</span>
			<svg
				role="img"
				aria-label={`${label} sparkline`}
				width={width}
				height={height}
				viewBox={`0 0 ${width} ${height}`}
				className="inline-block"
			>
				<polyline fill="none" stroke="var(--accent-deep)" strokeWidth="1.5" points={points} />
			</svg>
		</div>
	);
}

function DataArtifact(): JSX.Element {
	return (
		<div className="flex h-full flex-col">
			<DestinationHeader
				kind="Artifact · data"
				title="Checkout reliability — result"
				meta="9 min"
			/>
			<div className="flex flex-1 flex-col gap-[18px] overflow-auto px-[18px] py-[12px]">
				<MetricFigures />
				<div className="flex flex-col gap-[6px]">
					<TrendRow label="Silent failures" values={[31, 28, 22, 19, 12, 8, 4, 2, 1, 0]} />
					<TrendRow
						label="Checkout p95"
						values={[140, 132, 138, 120, 118, 110, 115, 108, 104, 99]}
					/>
				</div>
				<Block
					id={BLOCK_ID}
					payload={{
						kind: "table",
						align: ["left", "right"],
						header: [[{ type: "text", value: "Path" }], [{ type: "text", value: "Status" }]],
						rows: [
							[
								[{ type: "text", value: "Expired promo → 422" }],
								[{ type: "text", value: "now covered" }],
							],
							[
								[{ type: "text", value: "Silent 200 success" }],
								[{ type: "text", value: "removed" }],
							],
						],
					}}
				/>
			</div>
		</div>
	);
}

// ── Origin surfaces: faithful Hearth fixtures from real DS primitives ──────────

function MessageRow({
	initials,
	agent,
	name,
	time,
	children,
}: {
	initials: string;
	agent?: boolean;
	name: string;
	time: string;
	children: React.ReactNode;
}): JSX.Element {
	return (
		<div className="flex gap-[9px] px-[18px] py-[9px]">
			<Avatar initials={initials} agent={agent} size="sm" />
			<div className="flex min-w-0 flex-col gap-[3px]">
				<div className="flex items-baseline gap-[6px]">
					<span className="text-[13px] font-semibold text-[var(--text-primary)]">{name}</span>
					<span className="font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">
						{time}
					</span>
				</div>
				{children}
			</div>
		</div>
	);
}

// Conversation origin — message rows + a reference chip (the thing you open).
function ConversationOrigin(): JSX.Element {
	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center gap-[6px] border-b border-[var(--border-subtle)] px-[18px] py-[12px]">
				<span className="font-mono text-[10px] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
					Conversation
				</span>
				<span className="text-[14px] font-semibold text-[var(--text-primary)]">Passkey login</span>
			</div>
			<div className="flex flex-1 flex-col overflow-auto py-[6px]">
				<MessageRow initials="AF" name="A. Founder" time="9:02">
					<p className="text-[13px] leading-[var(--leading-body)] text-[var(--text-primary)]">
						Can you wire passkey login and show me the diff before we deploy?
					</p>
				</MessageRow>
				<MessageRow initials="AT" agent name="Atlas" time="9:11">
					<p className="text-[13px] leading-[var(--leading-body)] text-[var(--text-primary)]">
						Added WebAuthn registration and the dual-auth window. Password fallback preserved.
					</p>
					<div className="mt-[3px] flex flex-wrap gap-[6px]">
						<ReferenceChip kind="artifact" label="auth/passkey.ts" meta="+2 −1" mode="posted" />
						<ReferenceChip kind="document" label="WebAuthn L3 spec" mode="posted" />
					</div>
				</MessageRow>
				<MessageRow initials="AT" agent name="Atlas" time="9:12">
					<p className="text-[13px] leading-[var(--leading-body)] text-[var(--text-primary)]">
						Context for the dual-auth window:
					</p>
					<div className="mt-[3px]">
						<ReferenceChip kind="block" label="Auth migration plan · §2" mode="posted" />
					</div>
				</MessageRow>
			</div>
		</div>
	);
}

// Review origin — the review canvas shape: header + intent checklist + change row.
function IntentRow({ text, met }: { text: string; met: boolean }): JSX.Element {
	return (
		<div className="flex items-center gap-[9px]">
			<span
				aria-hidden="true"
				className={`flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[var(--r-pill)] text-[10px] ${met ? "bg-[var(--accent-primary)] text-[var(--surface-page)]" : "border border-[var(--border-default)] text-[var(--text-tertiary)]"}`}
			>
				{met ? "✓" : ""}
			</span>
			<span className="text-[13px] text-[var(--text-primary)]">{text}</span>
		</div>
	);
}

function ReviewOrigin(): JSX.Element {
	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center gap-[9px] border-b border-[var(--border-subtle)] px-[18px] py-[12px]">
				<span className="font-mono text-[10px] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
					Review
				</span>
				<span className="truncate text-[14px] font-semibold text-[var(--text-primary)]">
					Fix expired-promo checkout
				</span>
				<span className="ml-auto shrink-0">
					<StatusChip status="blocked" />
				</span>
			</div>
			<div className="flex flex-1 flex-col gap-[18px] overflow-auto px-[18px] py-[12px]">
				<p className="text-[13px] leading-[var(--leading-body)] text-[var(--text-primary)]">
					Root cause: an unhandled <code className="font-mono text-[12px]">PromoExpiredError</code>{" "}
					was swallowed by a catch-all. Checkout now returns a typed 422; the deploy is staged.
				</p>
				<div className="flex flex-col gap-[6px]">
					<span className="font-mono text-[10px] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
						Intent
					</span>
					<IntentRow text="Expired codes show the user an error" met={true} />
					<IntentRow text="API returns a typed 422 (not silent 200)" met={true} />
					<IntentRow text="Regression test covers the expired path" met={true} />
					<IntentRow text="Deployed to production" met={false} />
				</div>
				<div className="flex flex-col gap-[6px]">
					<span className="font-mono text-[10px] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
						Changes
					</span>
					<ReferenceChip kind="artifact" label="OrderService.ts" meta="+18 −4" mode="posted" />
					<ReferenceChip kind="artifact" label="PromoField.tsx" meta="+6 −1" mode="posted" />
				</div>
			</div>
		</div>
	);
}

// Document origin — a document body composed of real `Block` primitives, plus a
// calm Fold (the same disclosure used across the surface) and a reference chip.
function DocumentOrigin(): JSX.Element {
	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center gap-[6px] border-b border-[var(--border-subtle)] px-[18px] py-[12px]">
				<span className="font-mono text-[10px] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
					Document
				</span>
				<span className="text-[14px] font-semibold text-[var(--text-primary)]">
					Authentication architecture
				</span>
			</div>
			<div className="flex flex-1 flex-col overflow-auto px-[18px] py-[12px]">
				<Block
					id={BLOCK_ID}
					payload={{
						kind: "heading",
						level: 2,
						text: "Sign-in flow",
						inline: [{ type: "text", value: "Sign-in flow" }],
					}}
				/>
				<Block
					id={BLOCK_ID}
					payload={para(
						"Authentication runs through a dual-auth window during the passkey migration. The canonical plan and the WebAuthn spec are referenced inline.",
					)}
				/>
				<Block
					id={BLOCK_ID}
					payload={{
						kind: "list",
						ordered: false,
						start: null,
						items: [
							{ children: [para("Passkey-first, password fallback through phase 2")] },
							{ children: [para("Sessions migrate lazily on next sign-in")] },
						],
					}}
				/>
				<div className="my-[9px]">
					<ReferenceChip
						kind="artifact"
						label="auth/passkey.ts — migration plan"
						meta="§2"
						mode="posted"
					/>
				</div>
				<Fold label="Worked for 1m 12s" cta="Show session" />
			</div>
		</div>
	);
}

// ── Variants ───────────────────────────────────────────────────────────────
// All three compose the SAME `SplitView`. Structurally identical — only content
// differs. That is the unification, made visible.

// 1. Conversation → Artifact. Open a posted reference chip; the text artifact
//    lands in the destination half. `split` mode.
export const ConversationToArtifact = (): JSX.Element => {
	const [mode, setMode] = useState<FoldMode>("split");
	const [ratio, setRatio] = useState(0.5);
	return (
		<div className={FRAME}>
			<SplitView
				mode={mode}
				dividerRatio={ratio}
				onModeChange={setMode}
				onRatioChange={setRatio}
				origin={<ConversationOrigin />}
				destination={<TextArtifact />}
			/>
		</div>
	);
};

// 2. Review → Artifact. Open a change from the review canvas; the same split, the
//    same destination cell — here a data artifact (the result). `split` mode.
export const ReviewToArtifact = (): JSX.Element => {
	const [mode, setMode] = useState<FoldMode>("split");
	const [ratio, setRatio] = useState(0.5);
	return (
		<div className={FRAME}>
			<SplitView
				mode={mode}
				dividerRatio={ratio}
				onModeChange={setMode}
				onRatioChange={setRatio}
				origin={<ReviewOrigin />}
				destination={<DataArtifact />}
			/>
		</div>
	);
};

// 3. Document → Artifact, `full` mode. Opening from a document body folds the
//    destination fully forward — the fold's expand state is visible (the only
//    control is collapse-back-to-split). Same SplitView, same destination cell.
export const DocumentToArtifact = (): JSX.Element => {
	const [mode, setMode] = useState<FoldMode>("full");
	const [ratio, setRatio] = useState(0.5);
	return (
		<div className={FRAME}>
			<SplitView
				mode={mode}
				dividerRatio={ratio}
				onModeChange={setMode}
				onRatioChange={setRatio}
				origin={<DocumentOrigin />}
				destination={<TextArtifact />}
			/>
		</div>
	);
};
