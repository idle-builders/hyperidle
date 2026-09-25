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
// toggle + flag-panel expand. The review frame owns the verdict gate.

import type { AnchorRef } from "@hyperidle/domain-model";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import type { Block } from "../../block/types.js";
import { Button, headingIdentityMatches } from "../../ds";
import { CanvasSourceHeader } from "./CanvasSourceHeader";
import { isPlainObject, isString } from "./payload-guard";
import { ReviewUnknownCanvas } from "./ReviewUnknownCanvas";
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
	/** Widened from the literal `"mailchimp"` — carries the real `artifact.tool`. */
	readonly tool: string;
	readonly campaignName: string;
	readonly sender: string;
	readonly subject: string;
	readonly preview: string;
	readonly receivedAt: string; // inbox-row time label
	readonly heroHeadline: string;
	readonly bodyParas: readonly string[];
	readonly flaggedClaims: readonly FlaggedClaim[];
}

// ── Small chrome atoms (Hearth tokens by name) ───────────────────────────

function ChromeLabel({ children }: { readonly children: string }): JSX.Element {
	return (
		<span className="type-label   uppercase" style={{ color: "var(--text-tertiary)" }}>
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
				border: "var(--bw-thin) solid var(--border-subtle)",
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
						className="type-control px-[12px] py-[6px]   capitalize "
						style={{
							borderRadius: "var(--r-pill)",
							background: active ? "var(--surface-elevated)" : "transparent",
							color: active ? "var(--text-primary)" : "var(--text-secondary)",
							boxShadow: active ? "var(--shadow-subtle)" : "none",
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
	documentTitle,
}: {
	readonly data: RenderedEmail;
	readonly viewport: Viewport;
	readonly documentTitle?: string;
}): JSX.Element {
	const width = viewport === "mobile" ? 380 : 600;
	return (
		<div
			data-token-subject="foreign"
			className="mx-auto overflow-hidden "
			style={{
				maxWidth: width,
				width: "100%",
				background: "#ffffff",
				border: "1px solid #e2dcd2",
				borderRadius: 12,
			}}
		>
			{/* No brand name here: this header bar used to hardcode "HyperIdle"
			    regardless of who actually sent the email. There is no payload field
			    for a brand distinct from the sender already named in the inbox row
			    above — subtracted rather than duplicating that same value here. */}

			{/* hero */}
			<div style={{ padding: viewport === "mobile" ? "24px 20px" : "32px 36px" }}>
				<h2
					hidden={documentTitle ? headingIdentityMatches(data.heroHeadline, documentTitle) : false}
					style={{
						margin: 0,
						fontSize: viewport === "mobile" ? 22 : 28,
						lineHeight: 1.2,
						fontWeight: 700,
						color: "#26221b",
					}}
				>
					{data.heroHeadline}
				</h2>

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
			</div>
		</div>
	);
}

// ── Component ────────────────────────────────────────────────────────────────

export interface ReviewRenderedInContextProps {
	readonly data: RenderedEmail;
	readonly documentTitle?: string;
	readonly artifactId?: string;
	readonly blocks?: ReadonlyArray<Block>;
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
	data,
	documentTitle,
	artifactId = "",
	blocks = [],
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
			className="type-small flex flex-col gap-[18px] p-[18px] text-left"
			style={{
				maxWidth: 760,
				background: "var(--surface-page)",
				color: "var(--text-primary)",
			}}
		>
			{/* ── L1: the inbox row ────────────────────────────────────────────── */}
			<section
				aria-label="Inbox preview"
				className="flex flex-col gap-[9px] p-[12px]"
				style={{
					background: "var(--surface-container)",
					border: "var(--bw-thin) solid var(--border-subtle)",
					borderRadius: "var(--r-default)",
				}}
			>
				<div className="flex items-center gap-[9px]">
					<ToolLogo tool={data.tool} size="md" withLabel label="" />
				</div>

				{/* the row as a mail client paints it */}
				<div
					className="flex items-start gap-[12px] p-[12px]"
					style={{
						background: "var(--surface-elevated)",
						border: "var(--bw-thin) solid var(--border-subtle)",
						borderRadius: "var(--r-subtle)",
						boxShadow: "var(--shadow-subtle)",
					}}
				>
					<div
						className="type-copy mt-[3px] flex h-[36px] w-[36px] shrink-0 items-center justify-center  "
						style={{
							background: "var(--accent-primary-dim)",
							color: "var(--accent-primary)",
							borderRadius: "var(--r-pill)",
						}}
					>
						{/* Derived from `data.sender`, not a fixed letter. */}
						{data.sender.slice(0, 1).toUpperCase()}
					</div>
					<div className="flex min-w-0 flex-1 flex-col gap-[3px]">
						<div className="flex items-baseline justify-between gap-[12px]">
							<span className="type-copy truncate  " style={{ color: "var(--text-primary)" }}>
								{data.sender}
							</span>
							<span className="type-metadata shrink-0 " style={{ color: "var(--text-tertiary)" }}>
								{data.receivedAt}
							</span>
						</div>
						<span className="type-copy truncate  " style={{ color: "var(--text-primary)" }}>
							{data.subject}
						</span>
						<span className="type-small truncate " style={{ color: "var(--text-secondary)" }}>
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
						<Button variant="primary" size="sm" onClick={() => setComposerOpen((o) => !o)}>
							{composerOpen ? "Cancel" : "Comment on body"}
						</Button>
					) : null}
					<ViewportToggle value={viewport} onChange={setViewport} />
				</div>
				<div
					className="p-[24px]"
					style={{
						background: "var(--surface-container)",
						border: "var(--bw-thin) solid var(--border-subtle)",
						borderRadius: "var(--r-default)",
					}}
				>
					<EmailRender data={data} viewport={viewport} documentTitle={documentTitle} />
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
					className="flex items-center justify-between gap-[12px] p-[12px] text-left "
					style={{
						background: "var(--surface-container)",
						border: "var(--bw-thin) solid var(--border-subtle)",
						borderRadius: "var(--r-default)",
					}}
				>
					<div className="flex items-center gap-[9px]">
						<span
							className="type-label flex items-center gap-[6px] px-[9px] py-[3px]   uppercase"
							style={{
								background: "var(--accent-secondary-dim)",
								color: "var(--status-warning)",
								borderRadius: "var(--r-pill)",
							}}
						>
							{flagCount} flag{flagCount === 1 ? "" : "s"}
						</span>
						{/* No fixed-prose summary here: a hardcoded "1 unverified claim ·
						    send plan · exclusions" would assert something regardless of how
						    many flags there actually were or what they said. The badge above
						    already carries the real count; nothing generic to add when
						    there is at least one. */}
						{flagCount === 0 ? (
							<span className="type-small " style={{ color: "var(--text-secondary)" }}>
								No flags
							</span>
						) : null}
					</div>
					<span
						className="motion-move type-metadata  "
						style={{
							color: "var(--text-tertiary)",
							transform: flagsOpen ? "rotate(180deg)" : "none",
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
									border: "var(--bw-thin) solid var(--border-subtle)",
									borderRadius: "var(--r-subtle)",
								}}
							>
								<span className="type-small  " style={{ color: "var(--text-primary)" }}>
									“{claim.text}”
								</span>
								<span className="type-metadata " style={{ color: "var(--text-secondary)" }}>
									{claim.reason}
								</span>
							</div>
						))}
					</div>
				) : null}
			</section>
		</div>
	);
}

// Review artifact wrapper.
function isRenderedPayload(payload: unknown): payload is RenderedInContextPayload {
	return (
		isPlainObject(payload) &&
		isPlainObject(payload.inboxRow) &&
		isString((payload.inboxRow as Record<string, unknown>).sender) &&
		isString((payload.inboxRow as Record<string, unknown>).subject) &&
		Array.isArray(payload.flags)
	);
}

function mapRenderedPayload(
	payload: RenderedInContextPayload,
	title: string,
	tool: string,
): RenderedEmail {
	return {
		tool,
		campaignName: title,
		sender: payload.inboxRow.sender,
		subject: payload.inboxRow.subject,
		preview: payload.inboxRow.preview,
		receivedAt: "",
		heroHeadline: payload.body || title,
		bodyParas: payload.body ? [payload.body] : [],
		flaggedClaims: payload.flags.map((text) => ({ text, reason: "" })),
	};
}

export function ReviewRenderedInContext({ artifact }: ReviewCanvasProps): JSX.Element {
	const valid = isRenderedPayload(artifact.payload);
	// Hooks must run unconditionally on every render (rules-of-hooks) — computed
	// ahead of the guard-failure early return, using an empty body when the
	// payload doesn't validate (its result is unused on that path).
	const body = valid ? artifact.payload.body : "";
	const blocks = useMemo(() => deriveProseBlocks(artifact.id, body), [artifact.id, body]);
	if (!valid) {
		// A malformed payload gets the honest unknown-canvas
		// fallback, never the Mailchimp demo fixture.
		return <ReviewUnknownCanvas artifact={artifact} />;
	}
	const data = mapRenderedPayload(artifact.payload, artifact.title, artifact.tool);
	return (
		<div className="flex flex-col gap-[12px]">
			<CanvasSourceHeader
				tool={artifact.tool}
				app={artifact.app}
				record={artifact.title}
				href={artifact.sourceHref}
			/>
			<ReviewRenderedInContextView
				data={data}
				documentTitle={artifact.title}
				artifactId={artifact.id}
				blocks={blocks}
			/>
		</div>
	);
}
