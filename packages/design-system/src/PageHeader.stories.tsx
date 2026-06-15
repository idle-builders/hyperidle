/**
 * PageHeader — design-system stories (AI7).
 *
 * Covers: title-only, breadcrumb+actions, subtitle, long-title-truncates.
 * Uses plain node stubs for Breadcrumb/Button so no router dependency.
 */

import type { JSX } from "react";
import { PageHeader } from "./PageHeader.js";

export default { title: "PageHeader" };

// Title-only — minimal usage
export function TitleOnly(): JSX.Element {
	return (
		<div style={{ background: "var(--surface-page, #faf8f5)" }}>
			<PageHeader title="Portfolio" />
		</div>
	);
}

// Breadcrumb leading slot + action buttons
export function WithBreadcrumbAndActions(): JSX.Element {
	return (
		<div style={{ background: "var(--surface-page, #faf8f5)" }}>
			<PageHeader
				title="Ship onboarding redesign"
				leading={
					<nav
						aria-label="Breadcrumb"
						style={{ fontSize: 13, color: "var(--text-secondary, #6b5d4d)" }}
					>
						<a href="/work/portfolio" style={{ color: "inherit" }}>
							Work
						</a>
						/<span>Ship onboarding redesign</span>
					</nav>
				}
				actions={
					<button
						type="button"
						style={{
							padding: "6px 12px",
							border: "none",
							borderRadius: "var(--r-pill, 9999px)",
							background: "var(--accent-primary, #16764f)",
							color: "#fff",
							fontSize: 13,
							cursor: "pointer",
						}}
					>
						New task
					</button>
				}
			/>
		</div>
	);
}

// Subtitle below the title row
export function WithSubtitle(): JSX.Element {
	return (
		<div style={{ background: "var(--surface-page, #faf8f5)" }}>
			<PageHeader title="Acme Corp" subtitle="Phase: build · Lead: Dana" />
		</div>
	);
}

// Long title that truncates on narrow viewports
export function LongTitleTruncates(): JSX.Element {
	return (
		<div style={{ background: "var(--surface-page, #faf8f5)", maxWidth: 400 }}>
			<PageHeader title="A Very Long Page Title That Would Overflow On Narrow Screens With Extra Words" />
		</div>
	);
}
