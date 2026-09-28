/**
 * DiscardConfirmStrip: the guard strip that replaces the dialog footer
 * when a dirty dialog receives a dismissal intent.
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

	// Focus "Keep editing" on mount (safe default).
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
				borderTop: "var(--bw-thin) solid var(--border-subtle)",
				background: "color-mix(in srgb, var(--status-warning) 4%, transparent)",
			}}
		>
			<span
				style={{
					color: "var(--text-secondary)",
					flex: 1,
				}}
				className="type-small"
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
						color: "var(--text-secondary)",
						background: "transparent",
						border: "var(--bw-thin) solid var(--border-default)",
						borderRadius: "var(--r-subtle)",
						padding: "var(--space-2) var(--space-4)",
						cursor: "pointer",
					}}
					className="type-control"
				>
					{copy.keep}
				</button>
				{/* Discard — second button, reachable via Tab */}
				<button
					type="button"
					onClick={onDiscard}
					style={{
						color: "var(--status-error)",
						background: "transparent",
						border: "var(--bw-thin) solid var(--status-error)",
						borderRadius: "var(--r-subtle)",
						padding: "var(--space-2) var(--space-4)",
						cursor: "pointer",
					}}
					className="type-control"
				>
					{copy.discard}
				</button>
			</div>
		</div>
	);
}
