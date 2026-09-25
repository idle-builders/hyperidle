// Canvas — browser preview (the LOW-fidelity end of the proof spectrum).
//
// Founder direction (human-design-review round 1): "not all stuff will be combined
// and fancy — some things will be a simple browser window to look at." This canvas
// is the deliberately-basic member of the family: a browser chrome frame (traffic
// lights + URL bar) wrapping a faithful render of a deployed page.
// The frame IS the framing — no inbox row, no diff panel, no flags. Look, then verdict.
//
// @lore The "web page" inside is hand-built from divs with neutral, email-safe-style
// inline styling, NOT a live <iframe>. The prototype/component viewer runs offline
// with no deploy to point an iframe at, and an iframe wouldn't be diffable in the
// DOM-snapshot net. So the page is a styled render of a real deployed pricing page.
// The REVIEW CHROME (header, URL bar) uses Hearth/CP1 tokens by name
// only (AQ-008); the rendered page is the one place neutral page styling is allowed,
// because that IS the artifact under review (it must read as a real web page).
// Tool-brand color lives only in <ToolLogo> (via CanvasSourceHeader).
//
// Presentational isolation component: no local state needed (the page is static —
// there is nothing to toggle). The verdict gate lives in the review frame, not here.

import type { JSX } from "react";
import { headingIdentityMatches } from "../../ds";
import { CanvasSourceHeader } from "./CanvasSourceHeader";
import { isPlainObject } from "./payload-guard";
import { ReviewUnknownCanvas } from "./ReviewUnknownCanvas";
import type { BrowserPreviewPayload, ReviewCanvasProps } from "./review-artifact";

// ── The page under review ──────────────────────────────────────────────────
// `BrowserPreviewPayload` is `{url, title, previewBody}` — nothing else, so
// the page shape below carries only what that supplies. No nav bar, pricing
// tiers, or footer note: the payload has no source for any of them.

interface PreviewPage {
	readonly url: string;
	readonly brand: string;
	readonly eyebrow: string;
	readonly headline: string;
	readonly subhead: string;
}

// ── The artifact under review: a hand-rendered web page ───────────────────────
// Neutral page styling — the one place not using Hearth chrome tokens, because
// this IS the deployed page as a visitor sees it (must read as a real web page,
// not as Hearth chrome).

function RenderedPage({
	data,
	documentTitle,
}: {
	readonly data: PreviewPage;
	readonly documentTitle?: string;
}): JSX.Element {
	return (
		<div
			data-token-subject="foreign"
			style={{ background: "#fbf8f2", color: "#26221b", fontSize: 14 }}
		>
			{/* page nav: brand only — the payload carries no nav links or CTA copy */}
			<nav
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: "18px 36px",
					borderBottom: "1px solid #ece5d8",
				}}
			>
				<span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", color: "#2f2a22" }}>
					{data.brand}
				</span>
			</nav>

			{/* hero */}
			<div style={{ padding: "48px 36px 36px", textAlign: "center" }}>
				<span
					style={{
						display: "inline-block",
						fontSize: 12,
						fontWeight: 600,
						letterSpacing: "0.06em",
						textTransform: "uppercase",
						color: "#b07a2c",
					}}
				>
					{data.eyebrow}
				</span>
				<h2
					hidden={documentTitle ? headingIdentityMatches(data.headline, documentTitle) : false}
					style={{
						margin: "12px auto 0",
						maxWidth: 560,
						fontSize: 34,
						lineHeight: 1.15,
						fontWeight: 700,
					}}
				>
					{data.headline}
				</h2>
				<p
					style={{
						margin: "12px auto 0",
						maxWidth: 480,
						fontSize: 15,
						lineHeight: 1.55,
						color: "#5a5246",
					}}
				>
					{data.subhead}
				</p>
			</div>
		</div>
	);
}

// ── Browser chrome ────────────────────────────────────────────────────────────

function TrafficLights(): JSX.Element {
	const dots: readonly string[] = ["#ff5f57", "#febc2e", "#28c840"];
	return (
		<div className="flex shrink-0 items-center gap-[6px]" aria-hidden="true">
			{dots.map((c) => (
				<span
					key={c}
					className="h-[12px] w-[12px] rounded-[var(--r-pill)]"
					style={{ background: c }}
				/>
			))}
		</div>
	);
}

// ── Component ────────────────────────────────────────────────────────────────

export interface ReviewBrowserPreviewProps {
	readonly data: PreviewPage;
	readonly documentTitle?: string;
}

/**
 * Browser-preview review canvas — the LOW-fidelity proof. A browser chrome frame
 * (traffic lights + URL bar) wrapping a faithful render of a deployed page. The
 * reviewer's whole job: look at the page, then call it in the review frame.
 *
 * States (this story shows `populated`):
 *  - empty:   no preview deploy yet → EmptyState ("No preview to look at").
 *  - loading: chrome with a shimmering page area.
 *  - error:   deploy failed → inline error inside the frame with a retry link.
 *  - populated (shown here): the deployed pricing page.
 */
function ReviewBrowserPreviewView({ data, documentTitle }: ReviewBrowserPreviewProps): JSX.Element {
	return (
		<div
			className="type-small flex flex-col gap-[18px] p-[18px] text-left"
			style={{
				maxWidth: 760,
				background: "var(--surface-page)",
				color: "var(--text-primary)",
			}}
		>
			{/* the browser window — the frame IS the framing */}
			<div
				className="overflow-hidden"
				style={{
					border: "var(--bw-thin) solid var(--border-default)",
					borderRadius: "var(--r-default)",
					boxShadow: "var(--shadow-default)",
				}}
			>
				{/* chrome bar: traffic lights + URL bar */}
				<div
					className="flex items-center gap-[12px] px-[12px] py-[9px]"
					style={{
						background: "var(--surface-elevated)",
						borderBottom: "var(--bw-thin) solid var(--border-subtle)",
					}}
				>
					<TrafficLights />
					<div
						className="flex min-w-0 flex-1 items-center gap-[9px] px-[12px] py-[6px]"
						style={{
							background: "var(--surface-container)",
							border: "var(--bw-thin) solid var(--border-subtle)",
							borderRadius: "var(--r-pill)",
						}}
					>
						<span
							aria-hidden="true"
							className="type-metadata shrink-0 "
							style={{ color: "var(--status-success)" }}
						>
							🔒
						</span>
						<span className="type-data truncate " style={{ color: "var(--text-secondary)" }}>
							{data.url}
						</span>
					</div>
				</div>

				{/* the rendered page (the artifact) */}
				<RenderedPage data={data} documentTitle={documentTitle} />
			</div>
		</div>
	);
}

function isBrowserPreviewPayload(payload: unknown): payload is BrowserPreviewPayload {
	return (
		isPlainObject(payload) &&
		typeof payload.url === "string" &&
		typeof payload.title === "string" &&
		typeof payload.previewBody === "string"
	);
}

// Review artifact wrapper.
//
// @lore `BrowserPreviewPayload` is `{url, title, previewBody}` — nothing else.
// An earlier mapper invented a fixed nav bar and a "Solo / $19/mo" pricing
// tier the payload never carried, and reused `previewBody` as both the
// subhead AND a footer note (rendering it twice). Fixed: `PreviewPage` now
// has no nav/tier/footer fields at all — there is nothing in the payload to
// derive them from, so the regions were deleted rather than left empty.
function mapBrowserPayload(payload: BrowserPreviewPayload): PreviewPage {
	return {
		url: payload.url,
		brand: payload.title,
		eyebrow: "Preview",
		headline: payload.title,
		subhead: payload.previewBody,
	};
}

export function ReviewBrowserPreview({ artifact }: ReviewCanvasProps): JSX.Element {
	if (!isBrowserPreviewPayload(artifact.payload)) {
		// A malformed payload gets the honest unknown-canvas
		// fallback, never the pricing-page demo fixture.
		return <ReviewUnknownCanvas artifact={artifact} />;
	}
	const data = mapBrowserPayload(artifact.payload);
	return (
		<div className="flex flex-col gap-[12px]">
			<CanvasSourceHeader
				tool={artifact.tool}
				app={artifact.app}
				record={artifact.title}
				href={artifact.sourceHref}
			/>
			<ReviewBrowserPreviewView data={data} documentTitle={artifact.title} />
		</div>
	);
}
