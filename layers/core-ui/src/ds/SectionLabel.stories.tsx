/**
 * SectionLabel — design-system stories (AI7).
 *
 * Covers: default h3, with trailing, with divider, as h2.
 */

import type { JSX } from "react";
import { SectionLabel } from "./SectionLabel.js";

export default { title: "SectionLabel" };

// Default — h3 with just a label
export function Default(): JSX.Element {
	return (
		<div style={{ padding: 24, background: "var(--surface-page, #faf8f5)" }}>
			<SectionLabel label="Members" />
		</div>
	);
}

// With trailing slot — count badge or action button
export function WithTrailing(): JSX.Element {
	return (
		<div style={{ padding: 24, background: "var(--surface-page, #faf8f5)" }}>
			<SectionLabel
				label="Active Bets"
				trailing={
					<button
						type="button"
						style={{
							padding: "4px 10px",
							border: "none",
							borderRadius: "var(--r-pill, 9999px)",
							background: "var(--accent-primary, #16764f)",
							color: "#fff",
							fontSize: 12,
							cursor: "pointer",
						}}
					>
						+ New
					</button>
				}
			/>
		</div>
	);
}

// With divider — border-bottom rule
export function WithDivider(): JSX.Element {
	return (
		<div style={{ padding: 24, background: "var(--surface-page, #faf8f5)" }}>
			<SectionLabel label="Configuration" divider />
		</div>
	);
}

// As h2 — used on KnowledgeDetail sidebar where SectionLabel is the top heading
export function AsH2(): JSX.Element {
	return (
		<div style={{ padding: 24, background: "var(--surface-page, #faf8f5)" }}>
			<SectionLabel label="Metadata" as="h2" />
		</div>
	);
}
