/**
 * AI2 — DiscardConfirmStrip: the guard strip that replaces the dialog footer
 * when a dirty dialog receives a dismissal intent.
 *
 * Button order: Keep editing (safe default, first/focused) → Discard (second,
 * reachable via Tab). This matches the §1.2 keyboard discard path.
 *
 * @lore AI2: Keep editing is the FIRST button (index 0) — focused on mount.
 * Discard is the SECOND button (index 1) — reachable via Tab. This order
 * ensures a single Tab press from Keep editing reaches Discard, satisfying
 * the keyboard discard path without requiring a mouse.
 */

import type { JSX } from "react";
import { useEffect, useRef } from "react";

export interface DiscardConfirmStripProps {
	onKeepEditing: () => void;
	onDiscard: () => void;
	copy?: {
		prompt: string;
		keep: string;
		discard: string;
	};
}

const DEFAULT_COPY = {
	prompt: "Discard your changes?",
	keep: "Keep editing",
	discard: "Discard",
};

export function DiscardConfirmStrip({
	onKeepEditing,
	onDiscard,
	copy = DEFAULT_COPY,
}: DiscardConfirmStripProps): JSX.Element {
	const keepBtnRef = useRef<HTMLButtonElement>(null);

	// Focus "Keep editing" on mount (safe default — §1.2)
	useEffect(() => {
		keepBtnRef.current?.focus();
	}, []);

	return (
		<div
			data-testid="discard-confirm-strip"
			data-dialog-guard=""
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: "var(--space-3)",
				padding: "var(--space-3) 0",
				borderTop: "1px solid var(--border-subtle)",
				background: "color-mix(in srgb, var(--status-warning) 4%, transparent)",
			}}
		>
			<span
				style={{
					fontSize: "var(--text-sm)",
					color: "var(--text-secondary)",
					flex: 1,
				}}
			>
				{copy.prompt}
			</span>
			<div style={{ display: "flex", gap: "var(--space-2)" }}>
				{/* Keep editing — first button, safe default, focused on mount */}
				<button
					ref={keepBtnRef}
					type="button"
					onClick={onKeepEditing}
					style={{
						fontSize: "var(--text-sm)",
						fontWeight: "var(--fw-medium)",
						color: "var(--text-secondary)",
						background: "transparent",
						border: "1px solid var(--border-default)",
						borderRadius: "var(--r-subtle)",
						padding: "var(--space-2) var(--space-4)",
						cursor: "pointer",
					}}
				>
					{copy.keep}
				</button>
				{/* Discard — second button, reachable via Tab (§1.2 keyboard discard path) */}
				<button
					type="button"
					onClick={onDiscard}
					style={{
						fontSize: "var(--text-sm)",
						fontWeight: "var(--fw-medium)",
						color: "var(--status-error)",
						background: "transparent",
						border: "1px solid var(--status-error)",
						borderRadius: "var(--r-subtle)",
						padding: "var(--space-2) var(--space-4)",
						cursor: "pointer",
					}}
				>
					{copy.discard}
				</button>
			</div>
		</div>
	);
}
