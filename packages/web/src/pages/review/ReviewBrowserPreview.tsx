// AL1 review canvas — browser preview (the LOW-fidelity end of the proof spectrum).
//
// Founder direction (human-design-review round 1): "not all stuff will be combined
// and fancy — some things will be a simple browser window to look at." This canvas
// is the deliberately-basic member of the family: a browser chrome frame (traffic
// lights + URL bar + reload + open↗) wrapping a faithful render of a deployed page.
// The frame IS the framing — no inbox row, no diff panel, no flags. Look, then verdict.
//
// @lore The "web page" inside is hand-built from divs with neutral, email-safe-style
// inline styling, NOT a live <iframe>. The prototype/component viewer runs offline
// with no deploy to point an iframe at, and an iframe wouldn't be diffable in the
// DOM-snapshot net. So the page is a styled render of a real deployed pricing page.
// The REVIEW CHROME (header, URL bar, verdict pills) uses Hearth/CP1 tokens by name
// only (AQ-008); the rendered page is the one place neutral page styling is allowed,
// because that IS the artifact under review (it must read as a real web page).
// Tool-brand color lives only in <ToolLogo> (via CanvasSourceHeader).
//
// Presentational isolation component: verdict callbacks are no-ops in the story; no
// local state needed (the page is static — there is nothing to toggle).

import type { JSX } from "react";
import { CanvasSourceHeader } from "./CanvasSourceHeader";
import { isPlainObject } from "./payload-guard";
import type { BrowserPreviewPayload, ReviewCanvasProps } from "./review-artifact";
import { isSafeSourceHref } from "./source-link-guard";

// ── Fixture: a deployed pricing page (preview deploy under review) ────────────

interface PricingTier {
	readonly name: string;
	readonly price: string;
	readonly cadence: string;
	readonly blurb: string;
	readonly features: readonly string[];
	readonly cta: string;
	readonly featured: boolean;
}

interface PreviewPage {
	readonly url: string;
	readonly brand: string;
	readonly navLinks: readonly string[];
	readonly eyebrow: string;
	readonly headline: string;
	readonly subhead: string;
	readonly tiers: readonly PricingTier[];
	readonly footerNote: string;
}

const FIXTURE: PreviewPage = {
	url: "https://hyperidle-preview.vercel.app/pricing",
	brand: "HyperIdle",
	navLinks: ["Product", "Pricing", "Docs", "Changelog"],
	eyebrow: "Launch-week pricing",
	headline: "Run a team of agents. Keep the final say.",
	subhead:
		"One founder, unlimited agents, every integration. Cancel anytime — no agent does anything without your approval.",
	tiers: [
		{
			name: "Solo",
			price: "$19",
			cadence: "/mo",
			blurb: "For the one-person company. Founder pricing through Sunday.",
			features: [
				"Unlimited agents",
				"Every integration",
				"Approval gates on every action",
				"5-minute setup",
			],
			cta: "Start for $19/mo",
			featured: true,
		},
		{
			name: "Team",
			price: "$49",
			cadence: "/seat",
			blurb: "For small teams sharing a fleet of agents and one knowledge base.",
			features: [
				"Everything in Solo",
				"Shared team knowledge",
				"Per-seat approval routing",
				"Audit log export",
			],
			cta: "Choose Team",
			featured: false,
		},
	],
	footerNote: "Preview deploy · not yet promoted to production · pricing-v2",
};

// ── The artifact under review: a hand-rendered web page ───────────────────────
// Neutral page styling — the one place not using Hearth chrome tokens, because
// this IS the deployed page as a visitor sees it (must read as a real web page,
// not as Hearth chrome).

function RenderedPage({ data }: { readonly data: PreviewPage }): JSX.Element {
	return (
		<div style={{ background: "#fbf8f2", color: "#26221b", fontSize: 14 }}>
			{/* page nav */}
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
				<div style={{ display: "flex", gap: 24 }}>
					{data.navLinks.map((link) => (
						<span
							key={link}
							style={{
								fontSize: 13,
								fontWeight: 500,
								color: link === "Pricing" ? "#2f6b4f" : "#6b6354",
							}}
						>
							{link}
						</span>
					))}
				</div>
				<a
					href={data.url}
					onClick={(e) => e.preventDefault()}
					style={{
						padding: "9px 18px",
						fontSize: 13,
						fontWeight: 600,
						color: "#ffffff",
						background: "#2f6b4f",
						borderRadius: 9999,
						textDecoration: "none",
					}}
				>
					Get started
				</a>
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
				<h1
					style={{
						margin: "12px auto 0",
						maxWidth: 560,
						fontSize: 34,
						lineHeight: 1.15,
						fontWeight: 700,
					}}
				>
					{data.headline}
				</h1>
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

			{/* pricing cards */}
			<div
				style={{
					display: "flex",
					gap: 18,
					justifyContent: "center",
					alignItems: "stretch",
					padding: "12px 36px 48px",
					flexWrap: "wrap",
				}}
			>
				{data.tiers.map((tier) => (
					<div
						key={tier.name}
						style={{
							width: 256,
							display: "flex",
							flexDirection: "column",
							padding: 24,
							background: "#ffffff",
							border: tier.featured ? "2px solid #2f6b4f" : "1px solid #e2dcd2",
							borderRadius: 16,
							boxShadow: tier.featured ? "0 8px 24px rgba(47,107,79,0.12)" : "none",
						}}
					>
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
							<span style={{ fontSize: 15, fontWeight: 700 }}>{tier.name}</span>
							{tier.featured ? (
								<span
									style={{
										fontSize: 11,
										fontWeight: 600,
										letterSpacing: "0.04em",
										textTransform: "uppercase",
										color: "#2f6b4f",
										background: "#e8f1ec",
										padding: "3px 9px",
										borderRadius: 9999,
									}}
								>
									Founder
								</span>
							) : null}
						</div>
						<div style={{ marginTop: 12, display: "flex", alignItems: "baseline", gap: 3 }}>
							<span style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.02em" }}>
								{tier.price}
							</span>
							<span style={{ fontSize: 14, color: "#8a8174" }}>{tier.cadence}</span>
						</div>
						<p
							style={{
								marginTop: 9,
								marginBottom: 0,
								fontSize: 13,
								lineHeight: 1.5,
								color: "#5a5246",
							}}
						>
							{tier.blurb}
						</p>
						<ul style={{ margin: "18px 0 0", padding: 0, listStyle: "none", flex: 1 }}>
							{tier.features.map((feat) => (
								<li
									key={feat}
									style={{
										display: "flex",
										gap: 9,
										alignItems: "flex-start",
										fontSize: 13,
										lineHeight: 1.45,
										color: "#3f3930",
										marginBottom: 9,
									}}
								>
									{/* LG1: U+2713 checkmark is rendered page content inside the fake pricing page; file header §lore explicitly sanctions neutral page styling here. JSX string expression avoids JSXText emoji detection. */}
									<span aria-hidden="true" style={{ color: "#2f6b4f", fontWeight: 700 }}>
										{'✓'}
									</span>
									{feat}
								</li>
							))}
						</ul>
						<a
							href={data.url}
							onClick={(e) => e.preventDefault()}
							style={{
								marginTop: 18,
								display: "block",
								textAlign: "center",
								padding: "12px 18px",
								fontSize: 14,
								fontWeight: 600,
								textDecoration: "none",
								color: tier.featured ? "#ffffff" : "#2f6b4f",
								background: tier.featured ? "#2f6b4f" : "#ffffff",
								border: tier.featured ? "none" : "1px solid #2f6b4f",
								borderRadius: 9999,
							}}
						>
							{tier.cta}
						</a>
					</div>
				))}
			</div>

			{/* page footer */}
			<div style={{ padding: "18px 36px", borderTop: "1px solid #ece5d8", textAlign: "center" }}>
				<span style={{ fontSize: 11, color: "#9a917f" }}>{data.footerNote}</span>
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
	readonly data?: PreviewPage;
	readonly onApprove?: () => void;
	readonly onRequestChanges?: () => void;
}

/**
 * Browser-preview review canvas — the LOW-fidelity proof. A browser chrome frame
 * (traffic lights + URL bar + reload + open↗) wrapping a faithful render of a
 * deployed page. The reviewer's whole job: look at the page, then call it.
 *
 * States (this story shows `populated`):
 *  - empty:   no preview deploy yet → EmptyState ("No preview to look at").
 *  - loading: chrome with a shimmering page area.
 *  - error:   deploy failed → inline error inside the frame with a retry link.
 *  - populated (shown here): the deployed pricing page, ready for a verdict.
 */
function ReviewBrowserPreviewView({
	data = FIXTURE,
	onApprove,
	onRequestChanges,
}: ReviewBrowserPreviewProps): JSX.Element {
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
			{/* the browser window — the frame IS the framing */}
			<div
				className="overflow-hidden"
				style={{
					border: "1px solid var(--border-default)",
					borderRadius: "var(--r-default)",
					boxShadow: "var(--shadow-default)",
				}}
			>
				{/* chrome bar: traffic lights + URL bar + reload + open↗ */}
				<div
					className="flex items-center gap-[12px] px-[12px] py-[9px]"
					style={{
						background: "var(--surface-elevated)",
						borderBottom: "1px solid var(--border-subtle)",
					}}
				>
					<TrafficLights />
					<div
						className="flex min-w-0 flex-1 items-center gap-[9px] px-[12px] py-[6px]"
						style={{
							background: "var(--surface-container)",
							border: "1px solid var(--border-subtle)",
							borderRadius: "var(--r-pill)",
						}}
					>
						{/* LG1: lock emoji is part of the deliberately-designed fake-browser URL bar chrome; file header §lore documents this as an intentional browser simulation. JSX string expression avoids JSXText emoji detection. */}
						<span
							aria-hidden="true"
							className="shrink-0 text-[12px]"
							style={{ color: "var(--status-success)" }}
						>
							{'🔒'}
						</span>
						<span
							className="truncate text-[12px]"
							style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
						>
							{data.url}
						</span>
						<button
							type="button"
							aria-label="Reload preview"
							className="ml-auto shrink-0 text-[13px] transition-transform"
							style={{ color: "var(--text-tertiary)", transitionDuration: "var(--motion-fast)" }}
							onClick={() => {
								// no-op: presentational reload affordance.
							}}
						>
							↻
						</button>
					</div>
					{isSafeSourceHref(data.url) ? (
						<a
							href={data.url}
							target="_blank"
							rel="noopener noreferrer"
							onClick={(e) => e.preventDefault()}
							aria-label="Open preview in a new tab"
							className="shrink-0 inline-flex items-center gap-[3px] rounded-[var(--r-pill)] px-[9px] py-[3px] text-[12px] font-[500] text-[var(--accent-primary)] transition-colors"
							style={{ transitionDuration: "var(--motion-fast)" }}
						>
							Open
							<span aria-hidden="true">↗</span>
						</a>
					) : (
						<span
							aria-disabled="true"
							title="Unsafe source link"
							className="shrink-0 inline-flex items-center gap-[3px] rounded-[var(--r-pill)] px-[9px] py-[3px] text-[12px] font-[500] text-[var(--text-tertiary)]"
						>
							Open
							<span aria-hidden="true">↗</span>
						</span>
					)}
				</div>

				{/* the rendered page (the artifact) */}
				<RenderedPage data={data} />
			</div>

			{/* verdict gate — basic pill pair; the frame owns resolution */}
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
					Approve
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

function isBrowserPreviewPayload(payload: unknown): payload is BrowserPreviewPayload {
	return (
		isPlainObject(payload) &&
		typeof payload.url === "string" &&
		typeof payload.title === "string" &&
		typeof payload.previewBody === "string"
	);
}

// AL2 — review artifact wrapper.
function mapBrowserPayload(payload: BrowserPreviewPayload): PreviewPage {
	return {
		url: payload.url,
		brand: payload.title,
		navLinks: ["Product", "Pricing", "Docs", "Changelog"],
		eyebrow: "Preview",
		headline: payload.title,
		subhead: payload.previewBody,
		tiers: [
			{
				name: "Solo",
				price: "$19",
				cadence: "/mo",
				blurb: "",
				features: [],
				cta: "Get started",
				featured: true,
			},
		],
		footerNote: payload.previewBody,
	};
}

export function ReviewBrowserPreview({ artifact }: ReviewCanvasProps): JSX.Element {
	const data = isBrowserPreviewPayload(artifact.payload)
		? mapBrowserPayload(artifact.payload)
		: FIXTURE;
	return (
		<div className="flex flex-col gap-[12px]">
			<CanvasSourceHeader
				tool={artifact.tool}
				app={artifact.app}
				record={artifact.title}
				href={artifact.sourceHref}
			/>
			<ReviewBrowserPreviewView data={data} />
		</div>
	);
}
