/**
 * NavHistoryCluster — shell component stories.
 *
 * Renders the [←][→] history navigation buttons in various states.
 * Note: mocks useHistoryAvailability since stories run outside a Router context.
 */

import { type JSX, useState } from "react";

export default { title: "Shell/NavHistoryCluster" };

// Inline stub since stories can't import the real component without Router + history
function NavClusterStub({
	canGoBack,
	canGoForward,
}: {
	canGoBack: boolean;
	canGoForward: boolean;
}): JSX.Element {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 3,
				padding: 12,
				background: "var(--surface-page, #faf8f5)",
			}}
		>
			<button
				type="button"
				aria-label="Back"
				disabled={!canGoBack}
				style={{
					width: 28,
					height: 28,
					padding: 0,
					border: "none",
					background: "none",
					cursor: canGoBack ? "pointer" : "not-allowed",
					opacity: canGoBack ? 1 : 0.35,
					color: "var(--text-secondary, #6b5d4d)",
					borderRadius: "var(--r-subtle, 10px)",
				}}
			>
				<svg
					width={18}
					height={18}
					viewBox="0 0 18 18"
					fill="none"
					stroke="currentColor"
					strokeWidth={2}
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<polyline points="11 4 6 9 11 14" />
				</svg>
			</button>
			{canGoForward && (
				<button
					type="button"
					aria-label="Forward"
					style={{
						width: 28,
						height: 28,
						padding: 0,
						border: "none",
						background: "none",
						cursor: "pointer",
						color: "var(--text-secondary, #6b5d4d)",
						borderRadius: "var(--r-subtle, 10px)",
					}}
				>
					<svg
						width={18}
						height={18}
						viewBox="0 0 18 18"
						fill="none"
						stroke="currentColor"
						strokeWidth={2}
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
					>
						<polyline points="7 4 12 9 7 14" />
					</svg>
				</button>
			)}
		</div>
	);
}

// Deep link: no history — back disabled, no forward
export function DeepLink(): JSX.Element {
	return <NavClusterStub canGoBack={false} canGoForward={false} />;
}

// Has history: back enabled, no forward
export function HasBackOnly(): JSX.Element {
	return <NavClusterStub canGoBack={true} canGoForward={false} />;
}

// Has back and forward
export function HasBackAndForward(): JSX.Element {
	return <NavClusterStub canGoBack={true} canGoForward={true} />;
}

// Interactive demo with state
export function Interactive(): JSX.Element {
	const [step, setStep] = useState(1);
	const canGoBack = step > 0;
	const canGoForward = step < 3;

	return (
		<div style={{ padding: 24, background: "var(--surface-page, #faf8f5)" }}>
			<div style={{ marginBottom: 12, fontSize: 13, color: "var(--text-tertiary, #9a8d7e)" }}>
				Step {step} / 3 — use buttons to navigate
			</div>
			<NavClusterStub canGoBack={canGoBack} canGoForward={canGoForward} />
			<div style={{ marginTop: 12, display: "flex", gap: 6 }}>
				<button
					type="button"
					onClick={() => setStep((s) => Math.max(0, s - 1))}
					disabled={!canGoBack}
					style={{ fontSize: 12, padding: "4px 8px" }}
				>
					Simulate Back
				</button>
				<button
					type="button"
					onClick={() => setStep((s) => Math.min(3, s + 1))}
					disabled={!canGoForward}
					style={{ fontSize: 12, padding: "4px 8px" }}
				>
					Simulate Forward
				</button>
			</div>
		</div>
	);
}
