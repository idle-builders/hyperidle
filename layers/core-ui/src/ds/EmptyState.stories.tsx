import { EmptyState } from "./EmptyState.js";

export default {
	title: "EmptyState",
	tier: "utility" as const,
	order: [
		"ConversationsEmpty",
		"DocumentEmpty",
		"TriageClear",
		"PortfolioEmpty",
		"WithActionSlot",
		"WithoutIcon",
		"Compact",
		"CompactWithAction",
	],
};

export const Compact = (): React.JSX.Element => (
	<div
		className="rounded-[var(--r-default)] bg-[var(--surface-container)] p-[12px]"
		style={{ maxWidth: "360px" }}
	>
		<EmptyState
			compact
			title="No discussions"
			description="Start a thread to discuss this artifact with your team."
		/>
	</div>
);

export const CompactWithAction = (): React.JSX.Element => (
	<div
		className="rounded-[var(--r-default)] bg-[var(--surface-container)] p-[12px]"
		style={{ maxWidth: "360px" }}
	>
		<EmptyState
			compact
			title="No activity yet"
			description="Tool calls and reasoning will appear here."
			action={
				<button
					type="button"
					// hearth-internal-padding
					className="inline-flex items-center px-[12px] py-[7px] text-[12px] font-[500] text-[var(--text-on-accent)] bg-[var(--accent-primary)] rounded-[var(--r-pill)] border-[1.5px] border-transparent cursor-pointer"
				>
					Start session
				</button>
			}
		/>
	</div>
);

export const ConversationsEmpty = (): React.JSX.Element => (
	<EmptyState
		icon={
			<svg
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
			</svg>
		}
		title="No conversations yet"
		description="Start a thread to coordinate with your team and agents. Conversations are where decisions happen."
		action={
			<button
				type="button"
				// hearth-internal-padding
				className="inline-flex items-center px-[18px] py-[10px] text-[13px] font-[500] text-[var(--text-on-accent)] bg-[var(--accent-primary)] rounded-[var(--r-pill)] border-[1.5px] border-transparent cursor-pointer transition-[background-color] duration-[var(--motion-default)] hover:bg-[var(--accent-primary-hover)]"
			>
				Start a thread
			</button>
		}
	/>
);

export const DocumentEmpty = (): React.JSX.Element => (
	<EmptyState
		icon={
			<svg
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
				<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
			</svg>
		}
		title="Your document library is empty"
		description="Documents capture patterns, decisions, and lessons learned. Agents will populate this as they work."
		action={
			<button
				type="button"
				// hearth-internal-padding
				className="inline-flex items-center px-[18px] py-[10px] text-[13px] font-[500] text-[var(--text-on-accent)] bg-[var(--accent-primary)] rounded-[var(--r-pill)] border-[1.5px] border-transparent cursor-pointer transition-[background-color] duration-[var(--motion-default)] hover:bg-[var(--accent-primary-hover)]"
			>
				Create first item
			</button>
		}
	/>
);

export const TriageClear = (): React.JSX.Element => (
	<EmptyState
		icon={
			<svg
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<polyline points="20 6 9 17 4 12" />
			</svg>
		}
		title="Nothing needs attention"
		description="Triage is clear. Come back when agents surface something new."
	/>
);

export const PortfolioEmpty = (): React.JSX.Element => (
	<EmptyState
		title="No products in the portfolio"
		description="Add a product from Settings to start shaping bets."
	/>
);

export const WithActionSlot = (): React.JSX.Element => (
	<EmptyState
		title="Custom action"
		description="This empty state has an action button."
		action={
			<button type="button" className="btn btn-sm btn-primary">
				Add item
			</button>
		}
	/>
);

export const WithoutIcon = (): React.JSX.Element => (
	<EmptyState
		title="No results found"
		description="Try adjusting your search terms or removing filters."
	/>
);
