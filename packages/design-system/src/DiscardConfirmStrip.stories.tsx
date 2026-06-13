/**
 * AI2 — DiscardConfirmStrip stories.
 *
 * The guard strip renders at the bottom of a dialog footer when
 * a dirty dialog receives a dismissal intent. Shows three states:
 * - Default (standard copy)
 * - Custom copy (optional override)
 * - Interactive (mounted with button handlers)
 */

import type { JSX } from "react";
import { DiscardConfirmStrip } from "./DiscardConfirmStrip.js";

export default { title: "AI2/DiscardConfirmStrip" };

export function Default(): JSX.Element {
	return (
		<div
			style={{
				padding: "var(--space-4) var(--space-6)",
				background: "var(--surface-elevated)",
				borderRadius: "var(--r-default)",
				maxWidth: "480px",
			}}
		>
			<DiscardConfirmStrip onKeepEditing={() => {}} onDiscard={() => {}} />
		</div>
	);
}

export function CustomCopy(): JSX.Element {
	return (
		<div
			style={{
				padding: "var(--space-4) var(--space-6)",
				background: "var(--surface-elevated)",
				borderRadius: "var(--r-default)",
				maxWidth: "480px",
			}}
		>
			<DiscardConfirmStrip
				onKeepEditing={() => {}}
				onDiscard={() => {}}
				copy={{
					prompt: "Unsaved changes will be lost.",
					keep: "Stay",
					discard: "Leave anyway",
				}}
			/>
		</div>
	);
}
