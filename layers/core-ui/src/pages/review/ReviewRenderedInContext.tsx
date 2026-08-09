// AL1 review canvas #4 — rendered-in-context.
//
// Proof family: an asset shown AS its recipient sees it. Fixture: a Mailchimp
// marketing launch email. The reviewer's question is "does this land right in
// the inbox?" — so the canvas leads with the INBOX ROW (L1), drills to the
// faithful opened email render with a desktop/mobile toggle (L2), then exposes
// flags + the send plan on demand (L3).
//
// @lore The email body is hand-built from divs with neutral, email-safe inline
// styling (white background, neutral borders) rather than a screenshot or an
// <iframe srcDoc>. This keeps the render diffable in the DOM-snapshot net and
// avoids shipping raw HTML. The REVIEW CHROME around it uses Hearth/CP1 tokens
// by name only (AQ-008); the email body is the one place neutral email styling
// is allowed, because that IS the artifact under review (it must look like an
// email, not like Hearth chrome). Tool-brand color lives only in <ToolLogo>.
//
// Presentational isolation component: local useState for the desktop/mobile
// toggle + flag-panel expand; verdict callbacks are no-ops in the story.

import type { AnchorRef, Block } from "@hyperidle/domain-model";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import { CanvasSourceHeader } from "./CanvasSourceHeader";
import { isPlainObject, isString } from "./payload-guard";
import type { RenderedInContextPayload, ReviewCanvasProps } from "./review-artifact";
import {
	AnchoredThreadCard,
	deriveProseBlocks,
	InlineComposer,
	useReviewAnchors,
} from "./review-canvas.js";
import { ToolLogo } from "./ToolLogo";

// ── Fixture ──────────────────────────────────────────────────────────────────

type Viewport = "desktop" | "mobile";

interface FlaggedClaim {
	readonly text: string;
	readonly reason: string;
}

export interface RenderedEmail {
	readonly tool: "mailchimp";
	readonly campaignName: string;
	readonly sender: string;
	readonly senderEmail: string;
	readonly subject: string;
	readonly preview: string;
	readonly receivedAt: string; // inbox-row time label
	readonly audienceLabel: string; // "12,400 free + trial"
	readonly excludedNote: string; // segment-exclusion note
	readonly sendPlan: string; // "Thu, Jun 18 · 9:00am ET"
	readonly heroHeadline: string;
	readonly bodyParas: readonly string[];
	readonly ctaLabel: string;
	readonly footer: string;
	readonly flaggedClaims: readonly FlaggedClaim[];
}

export const FIXTURE: RenderedEmail = {
	tool: "mailchimp",
	campaignName: "Solo plan launch — $19/mo",
	sender: "HyperIdle",
	senderEmail: "hello@hyperidle.com",
	subject: "Your team, minus the busywork — now $19",
	preview: "The agent OS that plans, drafts, and waits for your call. Founder pricing ends Sunday.",
	receivedAt: "9:00 AM",
	audienceLabel: "to 12,400 free + trial",
	excludedNote: "412 paid recipients excluded (already on a higher plan)",
	sendPlan: "Thu, Jun 18 · 9:00 AM ET",
	heroHeadline: "Run a team of agents. Keep the final say.",
	bodyParas: [
		"HyperIdle gives you a flat team of AI agents that plan work, draft the output, and stop at the decisions only you should make. No prompt-wrangling, no babysitting a chat window.",
		"For the next launch week, the Solo plan is $19/mo — one founder, unlimited agents, every integration. After Sunday it goes to $29.",
		"You stay in the loop where it counts: every send, refund, and record change waits for your approval first. Set up in under 5 minutes and point your first agent at real work today.",
	],
	ctaLabel: "Start for $19/mo",
	footer:
		"HyperIdle · 2261 Market St #4242, San Francisco CA · You're receiving this as a HyperIdle free or trial user. Unsubscribe · Manage preferences",
	flaggedClaims: [
		{
			text: "Set up in under 5 minutes",
			reason: "Unverified claim — no source. Median onboarding in last 30d was 11 min.",
		},
	],
};

// ── Small chrome atoms (Hearth/CP1 tokens by name) ───────────────────────────

function ChromeLabel({ children }: { readonly children: string }): JSX.Element {
	return (
		<span
			className="text-[11px] font-[600] uppercase"
			style={{ color: "var(--text-tertiary)", letterSpacing: "var(--tracking-caps-sm)" }}
		>
			{children}
		</span>
	);
}

function ViewportToggle({
	value,
	onChange,
}: {
	readonly value: Viewport;
	readonly onChange: (v: Viewport) => void;
}): JSX.Element {
	const options: readonly Viewport[] = ["desktop", "mobile"];
	return (
		<div
			role="tablist"
			aria-label="Render viewport"
			className="inline-flex items-center gap-[3px] p-[3px]"
			style={{
				background: "var(--surface-container)",
				border: "1px solid var(--border-subtle)",
				borderRadius: "var(--r-pill)",
			}}
		>
			{options.map((opt) => {
				const active = opt === value;
				return (
					<button
						key={opt}
						type="button"
						role="tab"
						aria-selected={active}
						onClick={() => onChange(opt)}
						className="px-[12px] py-[6px] text-[12px] font-[600] capitalize transition-[opacity]"
						style={{
							borderRadius: "var(--r-pill)",
							background: active ? "var(--surface-elevated)" : "transparent",
							color: active ? "var(--text-primary)" : "var(--text-secondary)",
							boxShadow: active ? "var(--shadow-subtle)" : "none",
							transitionDuration: "var(--motion-fast)",
						}}
					>
						{opt}
					</button>
				);
			})}
		</div>
	);
}

// ── The artifact under review: the rendered email ────────────────────────────
// Neutral, email-safe styling — the one place not using Hearth chrome tokens,
// because this IS the asset as the recipient sees it (must read as an email).

export function EmailRender({
	data,
	viewport,
}: {
	readonly data: RenderedEmail;
	readonly viewport: Viewport;
}): JSX.Element {
	const width = viewport === "mobile" ? 380 : 600;
	return (
		<div
			className="mx-auto overflow-hidden transition-[max-width]"
			style={{
				maxWidth: width,
				width: "100%",
				background: "#ffffff",
				border: "1px solid #e2dcd2",
				borderRadius: 12,
				transitionDuration: "var(--motion-default)",
				transitionTimingFunction: "var(--motion-ease)",
			}}
		>
			{/* email header / logo bar */}
			<div style={{ padding: "18px 24px", borderBottom: "1px solid #efeae1" }}>
				<span style={{ fontSize: 17, fontWeight: 700, color: "#2f2a22", letterSpacing: "-0.01em" }}>
					HyperIdle
				</span>
			</div>

			{/* hero */}
			<div style={{ padding: viewport === "mobile" ? "24px 20px" : "32px 36px" }}>
				<h1
					style={{
						margin: 0,
						fontSize: viewport === "mobile" ? 22 : 28,
						lineHeight: 1.2,
						fontWeight: 700,
						color: "#26221b",
					}}
				>
					{data.heroHeadline}
				</h1>

				{data.bodyParas.map((p) => (
					<p
						key={p.slice(0, 24)}
						style={{
							marginTop: 16,
							marginBottom: 0,
							fontSize: 15,
							lineHeight: 1.55,
							color: "#4a4338",
						}}
					>
						{p}
					</p>
				))}

				{/* CTA pill */}
				<div style={{ marginTop: 28 }}>
					<a
						href="https://hyperidle.com/start"
						onClick={(e) => e.preventDefault()}
						style={{
							display: "inline-block",
							padding: "13px 28px",
							fontSize: 15,
							fontWeight: 600,
							color: "#ffffff",
							background: "#2f6b4f",
							borderRadius: 9999,
							textDecoration: "none",
						}}
					>
						{data.ctaLabel}
					</a>
				</div>
			</div>

			{/* footer */}
			<div style={{ padding: "18px 24px", borderTop: "1px solid #efeae1", background: "#faf7f1" }}>
				<p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: "#8a8174" }}>{data.footer}</p>
			</div>
		</div>
	);
}

// ── Component ────────────────────────────────────────────────────────────────

export interface ReviewRenderedInContextProps {
	readonly data?: RenderedEmail;
	readonly artifactId?: string;
	readonly blocks?: ReadonlyArray<Block>;
	readonly onApprove?: () => void;
	readonly onRequestChanges?: () => void;
}

/**
 * Rendered-in-context review canvas. Three layers:
 *  L1 — the inbox row (sender · subject · preview · time) + Mailchimp logo + audience.
 *  L2 — the opened email render with a desktop/mobile viewport toggle.
 *  L3 — flags (1 unverified claim) + the send plan + segment-exclusion note.
 *
 * States (this story shows `populated`):
 *  - empty:   no campaign queued → render an EmptyState ("No render to review").
 *  - loading: skeleton inbox row + a shimmering render frame.
 *  - error:   render failed to assemble → inline error with retry.
 *  - needs-you (shown here): the flag panel is open by default when claims exist.
 */
function ReviewRenderedInContextView({
	data = FIXTURE,
	artifactId = "",
	blocks = [],
	onApprove,
	onRequestChanges,
}: ReviewRenderedInContextProps): JSX.Element {
	const [viewport, setViewport] = useState<Viewport>("desktop");
	// needs-you emphasis: flags open by default when there are flagged claims.
	const [flagsOpen, setFlagsOpen] = useState<boolean>(data.flaggedClaims.length > 0);
	const flagCount = data.flaggedClaims.length;
	const [composerOpen, setComposerOpen] = useState(false);

	const { anchors: allAnchors, readOnly, onAddAnchor } = useReviewAnchors();
	const paragraphBlocks = blocks.filter((b) => b.kind === "paragraph");
	const firstBlock = paragraphBlocks[0];
	const anchor: AnchorRef | null =
		firstBlock && artifactId
			? { artifactId, blockId: firstBlock.id, spotLabel: data.subject }
			: null;
	const threadComments = firstBlock
		? allAnchors.filter(
				(c) => c.anchor?.artifactId === artifactId && c.anchor?.blockId === firstBlock.id,
			)
		: [];

	return (
		<div
			className="flex flex-col gap-[18px] p-[18px] text-left"
			style={{
				maxWidth: 760,
				background: "var(--surface-page)",
				color: "var(--text-primary)",
				fontFamily: "var(--font-sans)",
			}}
		>
			{/* ── L1: the inbox row ────────────────────────────────────────────── */}
			<section
				aria-label="Inbox preview"
				className="flex flex-col gap-[9px] p-[12px]"
				style={{
					background: "var(--surface-container)",
					border: "1px solid var(--border-subtle)",
					borderRadius: "var(--r-default)",
				}}
			>
				<div className="flex items-center gap-[9px]">
					<ToolLogo tool="mailchimp" size="md" withLabel label="" />
					<span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
						·
					</span>
					<span className="text-[12px] font-[500]" style={{ color: "var(--text-secondary)" }}>
						{data.audienceLabel}
					</span>
				</div>

				{/* the row as a mail client paints it */}
				<div
					className="flex items-start gap-[12px] p-[12px]"
					style={{
						background: "var(--surface-elevated)",
						border: "1px solid var(--border-subtle)",
						borderRadius: "var(--r-subtle)",
						boxShadow: "var(--shadow-subtle)",
					}}
				>
					<div
						className="mt-[3px] flex h-[36px] w-[36px] shrink-0 items-center justify-center text-[15px] font-[700]"
						style={{
							background: "var(--accent-primary-dim)",
							color: "var(--accent-primary)",
							borderRadius: "var(--r-pill)",
						}}
					>
						H
					</div>
					<div className="flex min-w-0 flex-1 flex-col gap-[3px]">
						<div className="flex items-baseline justify-between gap-[12px]">
							<span
								className="truncate text-[15px] font-[700]"
								style={{ color: "var(--text-primary)" }}
							>
								{data.sender}
							</span>
							<span className="shrink-0 text-[12px]" style={{ color: "var(--text-tertiary)" }}>
								{data.receivedAt}
							</span>
						</div>
						<span
							className="truncate text-[15px] font-[600]"
							style={{ color: "var(--text-primary)" }}
						>
							{data.subject}
						</span>
						<span className="truncate text-[13px]" style={{ color: "var(--text-secondary)" }}>
							{data.preview}
						</span>
					</div>
				</div>
			</section>

			{/* ── L2: the opened render + viewport toggle ──────────────────────── */}
			<section aria-label="Email render" className="flex flex-col gap-[12px]">
				<div className="flex items-center justify-between gap-[12px]">
					<ChromeLabel>Opened render</ChromeLabel>
					{!readOnly && anchor ? (
						<button
							type="button"
							onClick={() => setComposerOpen((o) => !o)}
							className="rounded-[var(--r-pill)] bg-[var(--accent-primary)] px-[10px] py-[5px] text-[12px] font-[500] text-[var(--text-on-accent)]"
						>
							{composerOpen ? "Cancel" : "Comment on body"}
						</button>
					) : null}
					<ViewportToggle value={viewport} onChange={setViewport} />
				</div>
				<div
					className="p-[24px]"
					style={{
						background: "var(--surface-container)",
						border: "1px solid var(--border-subtle)",
						borderRadius: "var(--r-default)",
					}}
				>
					<EmailRender data={data} viewport={viewport} />
					{composerOpen && anchor ? (
						<div className="mt-[18px] flex gap-[12px] pl-[12px]">
							<InlineComposer
								anchor={anchor}
								onSubmit={async (text: string) => {
									if (onAddAnchor) await onAddAnchor({ anchor, text });
									setComposerOpen(false);
								}}
							/>
						</div>
					) : null}
					{threadComments.length > 0 && anchor ? (
						<div className="mt-[18px]">
							<AnchoredThreadCard
								anchor={anchor}
								comments={threadComments}
								readOnly={readOnly}
								onReply={async (text: string) => {
									if (onAddAnchor) await onAddAnchor({ anchor, text });
								}}
							/>
						</div>
					) : null}
				</div>
			</section>

			{/* ── L3: flags + send plan (on demand) ────────────────────────────── */}
			<section aria-label="Flags and send plan" className="flex flex-col gap-[9px]">
				<button
					type="button"
					onClick={() => setFlagsOpen((o) => !o)}
					aria-expanded={flagsOpen}
					className="flex items-center justify-between gap-[12px] p-[12px] text-left transition-[opacity]"
					style={{
						background: "var(--surface-container)",
						border: "1px solid var(--border-subtle)",
						borderRadius: "var(--r-default)",
						transitionDuration: "var(--motion-fast)",
					}}
				>
					<div className="flex items-center gap-[9px]">
						<span
							className="flex items-center gap-[6px] px-[9px] py-[3px] text-[12px] font-[600] uppercase"
							style={{
								background: "var(--accent-secondary-dim)",
								color: "var(--status-warning)",
								borderRadius: "var(--r-pill)",
								letterSpacing: "var(--tracking-caps-sm)",
							}}
						>
							{flagCount} flag{flagCount === 1 ? "" : "s"}
						</span>
						<span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
							{flagCount > 0 ? "1 unverified claim · send plan · exclusions" : "No flags"}
						</span>
					</div>
					<span
						className="text-[12px] transition-transform"
						style={{
							color: "var(--text-tertiary)",
							transform: flagsOpen ? "rotate(180deg)" : "none",
							transitionDuration: "var(--motion-fast)",
						}}
						aria-hidden="true"
					>
						▾
					</span>
				</button>

				{flagsOpen ? (
					<div className="flex flex-col gap-[9px]">
						{/* unverified claim */}
						{data.flaggedClaims.map((claim) => (
							<div
								key={claim.text}
								className="flex flex-col gap-[3px] p-[12px]"
								style={{
									background: "var(--surface-container)",
									borderLeft: "3px solid var(--status-warning)",
									border: "1px solid var(--border-subtle)",
									borderRadius: "var(--r-subtle)",
								}}
							>
								<span className="text-[13px] font-[600]" style={{ color: "var(--text-primary)" }}>
									“{claim.text}”
								</span>
								<span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
									{claim.reason}
								</span>
							</div>
						))}

						{/* send plan + exclusions */}
						<div
							className="flex flex-col gap-[6px] p-[12px]"
							style={{
								background: "var(--surface-container)",
								border: "1px solid var(--border-subtle)",
								borderRadius: "var(--r-subtle)",
							}}
						>
							<div className="flex items-baseline justify-between gap-[12px]">
								<ChromeLabel>Send plan</ChromeLabel>
								<span
									className="text-[13px] font-[600]"
									style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}
								>
									{data.sendPlan}
								</span>
							</div>
							<span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
								{data.excludedNote}
							</span>
						</div>
					</div>
				) : null}
			</section>

			{/* verdict gate — the canvas surfaces it; the frame owns resolution */}
			<div
				className="flex items-center gap-[9px] pt-[12px]"
				style={{ borderTop: "1px solid var(--border-subtle)" }}
			>
				<button
					type="button"
					onClick={() => onApprove?.()}
					className="px-[18px] py-[10px] text-[13px] font-[600] transition-[opacity]"
					style={{
						background: "var(--accent-primary)",
						color: "var(--surface-page)",
						borderRadius: "var(--r-pill)",
						transitionDuration: "var(--motion-fast)",
					}}
				>
					Approve send
				</button>
				<button
					type="button"
					onClick={() => onRequestChanges?.()}
					className="px-[18px] py-[10px] text-[13px] font-[600] transition-[opacity]"
					style={{
						background: "var(--surface-elevated)",
						color: "var(--text-primary)",
						border: "1px solid var(--border-default)",
						borderRadius: "var(--r-pill)",
						transitionDuration: "var(--motion-fast)",
					}}
				>
					Request changes
				</button>
			</div>
		</div>
	);
}

// AL2 — review artifact wrapper.
function isRenderedPayload(payload: unknown): payload is RenderedInContextPayload {
	return (
		isPlainObject(payload) &&
		isPlainObject(payload.inboxRow) &&
		isString((payload.inboxRow as Record<string, unknown>).sender) &&
		isString((payload.inboxRow as Record<string, unknown>).subject) &&
		Array.isArray(payload.flags)
	);
}

function mapRenderedPayload(payload: RenderedInContextPayload, title: string): RenderedEmail {
	return {
		tool: "mailchimp",
		campaignName: title,
		sender: payload.inboxRow.sender,
		senderEmail: "hello@example.com",
		subject: payload.inboxRow.subject,
		preview: payload.inboxRow.preview,
		receivedAt: "",
		audienceLabel: "",
		excludedNote: "",
		sendPlan: "",
		heroHeadline: payload.body || title,
		bodyParas: payload.body ? [payload.body] : [],
		ctaLabel: "",
		footer: "",
		flaggedClaims: payload.flags.map((text) => ({ text, reason: "" })),
	};
}

export function ReviewRenderedInContext({ artifact }: ReviewCanvasProps): JSX.Element {
	const data = isRenderedPayload(artifact.payload)
		? mapRenderedPayload(artifact.payload, artifact.title)
		: FIXTURE;
	const body = isRenderedPayload(artifact.payload)
		? artifact.payload.body
		: FIXTURE.bodyParas.join("\n\n");
	const blocks = useMemo(() => deriveProseBlocks(artifact.id, body), [artifact.id, body]);
	return (
		<div className="flex flex-col gap-[12px]">
			<CanvasSourceHeader
				tool={artifact.tool}
				app={artifact.app}
				record={artifact.title}
				href={artifact.sourceHref}
			/>
			<ReviewRenderedInContextView data={data} artifactId={artifact.id} blocks={blocks} />
		</div>
	);
}
