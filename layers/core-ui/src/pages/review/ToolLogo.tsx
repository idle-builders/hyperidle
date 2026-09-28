// Canvases — shared mini provider logo: every artifact
// and canvas carries its source tool's mark = provenance at a glance).
//
// Prototype treatment: a brand-colored monogram chip (the recommended Logo.dev
// "monogram fallback") + inline real marks for the marquee tools. Production swaps
// for simple-icons (bundled, known set) / Logo.dev (domain-keyed long tail).
//
// hearth-internal: brand colors below are TOOL IDENTITY (trademark, nominative use),
// intentionally exempt from AQ-008 semantic-token rules — a logo must be its real color.

import type { JSX } from "react";

export type ToolId =
	| "stripe"
	| "salesforce"
	| "hubspot"
	| "mailchimp"
	| "klaviyo"
	| "quickbooks"
	| "figma"
	| "github"
	| "zendesk"
	| "intercom"
	| "airtable"
	| "apollo"
	| "meta"
	| "linear"
	| "notion"
	| "sentry"
	| "ga4"
	| "vercel";

interface Brand {
	readonly label: string;
	readonly bg: string;
	readonly fg: string;
	readonly mark: string; // monogram
}

const BRANDS: Record<ToolId, Brand> = {
	stripe: { label: "Stripe", bg: "#635bff", fg: "#ffffff", mark: "S" },
	salesforce: { label: "Salesforce", bg: "#00a1e0", fg: "#ffffff", mark: "sf" },
	hubspot: { label: "HubSpot", bg: "#ff7a59", fg: "#ffffff", mark: "H" },
	mailchimp: { label: "Mailchimp", bg: "#ffe01b", fg: "#241c15", mark: "M" },
	klaviyo: { label: "Klaviyo", bg: "#1a1a18", fg: "#ffffff", mark: "K" },
	quickbooks: { label: "QuickBooks", bg: "#2ca01c", fg: "#ffffff", mark: "qb" },
	figma: { label: "Figma", bg: "#1e1e1e", fg: "#ffffff", mark: "F" },
	github: { label: "GitHub", bg: "#1f2328", fg: "#ffffff", mark: "GH" },
	zendesk: { label: "Zendesk", bg: "#03363d", fg: "#ffffff", mark: "Z" },
	intercom: { label: "Intercom", bg: "#1f8ded", fg: "#ffffff", mark: "ic" },
	airtable: { label: "Airtable", bg: "#fcb400", fg: "#1d1f25", mark: "A" },
	apollo: { label: "Apollo", bg: "#6334e6", fg: "#ffffff", mark: "ap" },
	meta: { label: "Meta", bg: "#0866ff", fg: "#ffffff", mark: "M" },
	linear: { label: "Linear", bg: "#5e6ad2", fg: "#ffffff", mark: "L" },
	notion: { label: "Notion", bg: "#ffffff", fg: "#191919", mark: "N" },
	sentry: { label: "Sentry", bg: "#362d59", fg: "#ffffff", mark: "se" },
	ga4: { label: "GA4", bg: "#e8710a", fg: "#ffffff", mark: "GA" },
	vercel: { label: "Vercel", bg: "#171717", fg: "#ffffff", mark: "V" },
};

const SIZE: Record<"sm" | "md", { box: number; font: number; radius: number }> = {
	sm: { box: 16, font: 8, radius: 5 },
	md: { box: 22, font: 10, radius: 6 },
};

export interface ToolLogoProps {
	readonly tool: ToolId | string;
	readonly size?: "sm" | "md";
	/** show the tool name next to the mark. */
	readonly withLabel?: boolean;
	/** Optional explicit label/title. Falls back to the known brand name or the tool id. */
	readonly label?: string;
}

/** A mini provider logo. Falls back to a neutral monogram for unknown tools. */
export function ToolLogo({
	tool,
	size = "sm",
	withLabel = false,
	label: labelProp,
}: ToolLogoProps): JSX.Element {
	const brand: Brand =
		(BRANDS as Record<string, Brand>)[tool] ??
		({ label: tool, bg: "#675f56", fg: "#ffffff", mark: tool.slice(0, 1).toUpperCase() } as Brand);
	const label = labelProp ?? brand.label;
	const s = SIZE[size];
	return (
		<span className="inline-flex items-center gap-[6px] align-middle" title={label}>
			<span
				aria-hidden="true"
				className="type-small border-width-thin inline-flex items-center justify-center shrink-0    border-[var(--border-subtle)]"
				style={{
					width: s.box,
					height: s.box,
					borderRadius: s.radius,
					background: brand.bg,
					color: brand.fg,
				}}
			>
				{brand.mark}
			</span>
			{withLabel ? (
				<span className="type-metadata   text-[var(--text-secondary)]">{label}</span>
			) : null}
		</span>
	);
}
