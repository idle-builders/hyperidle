/**
 * Breadcrumb — design-system stories.
 *
 * Covers: 2-segment, 3-segment, 4-segment (truncated middle), with-leading cluster.
 * Uses plain <a> as LinkComponent (no router dependency in DS stories).
 */

import type { JSX } from "react";
import { Breadcrumb } from "./Breadcrumb.js";

export default { title: "Breadcrumb" };

function StubLink({
	to,
	className,
	children,
}: {
	to: string;
	className?: string;
	children: React.ReactNode;
}): JSX.Element {
	return (
		<a href={to} className={className}>
			{children}
		</a>
	);
}

// 2-segment: single parent + current
export function TwoSegments(): JSX.Element {
	return (
		<div style={{ padding: 24, background: "var(--surface-page, #faf8f5)" }}>
			<Breadcrumb
				segments={[{ label: "Work", to: "/work/portfolio" }, { label: "Ship onboarding redesign" }]}
				LinkComponent={StubLink}
			/>
		</div>
	);
}

// 3-segment: parent + intermediate + current
export function ThreeSegments(): JSX.Element {
	return (
		<div style={{ padding: 24, background: "var(--surface-page, #faf8f5)" }}>
			<Breadcrumb
				segments={[
					{ label: "Work", to: "/work/portfolio" },
					{ label: "Acme Corp", to: "/work/team/team-1" },
					{ label: "Ship onboarding redesign" },
				]}
				LinkComponent={StubLink}
			/>
		</div>
	);
}

// 4-segment: three ancestors + current — middle segment should truncate
export function FourSegmentsTruncated(): JSX.Element {
	return (
		<div style={{ padding: 24, background: "var(--surface-page, #faf8f5)" }}>
			<Breadcrumb
				segments={[
					{ label: "Work", to: "/work/portfolio" },
					{ label: "A Very Long Team Name That Exceeds Limit", to: "/work/team/team-1" },
					{ label: "Build AI-powered onboarding flow for enterprise SaaS", to: "/work/bet/bet-1" },
					{ label: "Write test coverage" },
				]}
				LinkComponent={StubLink}
			/>
		</div>
	);
}

// With-leading: shows the [←][→] cluster slot using a plain button stub
export function WithLeadingCluster(): JSX.Element {
	return (
		<div style={{ padding: 24, background: "var(--surface-page, #faf8f5)" }}>
			<Breadcrumb
				segments={[
					{ label: "Work", to: "/work/portfolio" },
					{ label: "Acme Corp", to: "/work/team/team-1" },
					{ label: "Ship onboarding" },
				]}
				leading={
					<div style={{ display: "flex", gap: 3, marginRight: 6 }}>
						<button
							type="button"
							aria-label="Back"
							style={{
								width: 28,
								height: 28,
								padding: 0,
								border: "none",
								background: "none",
								cursor: "pointer",
								color: "var(--text-secondary, #6b5d4d)",
							}}
						>
							←
						</button>
					</div>
				}
				LinkComponent={StubLink}
			/>
		</div>
	);
}

// Deep-link: no history, back button disabled
export function DeepLink(): JSX.Element {
	return (
		<div style={{ padding: 24, background: "var(--surface-page, #faf8f5)" }}>
			<Breadcrumb
				segments={[
					{ label: "Work", to: "/work/portfolio" },
					{ label: "Acme Corp", to: "/work/team/team-1" },
					{ label: "Ship onboarding" },
				]}
				leading={
					<div style={{ display: "flex", gap: 3, marginRight: 6 }}>
						<button
							type="button"
							aria-label="Back"
							disabled
							style={{
								width: 28,
								height: 28,
								padding: 0,
								border: "none",
								background: "none",
								cursor: "not-allowed",
								opacity: 0.35,
								color: "var(--text-secondary, #6b5d4d)",
							}}
						>
							←
						</button>
					</div>
				}
				LinkComponent={StubLink}
			/>
		</div>
	);
}
