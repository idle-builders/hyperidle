import { useState } from "react";
import type { SubmenuFilter } from "./Submenu";
import { Submenu } from "./Submenu";

export default {
	title: "Submenu",
	tier: "3" as const,
	uses: ["NavItem", "SearchField", "ThreadRow"],
};

export const Expanded = (): React.JSX.Element => (
	<Submenu title="Conversations" collapsed={false} onToggleCollapse={() => {}}>
		<ul className="menu menu-sm">
			<li>
				<button type="button">Thread Alpha</button>
			</li>
			<li>
				<button type="button">Thread Beta</button>
			</li>
			<li>
				<button type="button">Thread Gamma</button>
			</li>
		</ul>
	</Submenu>
);

export const Collapsed = (): React.JSX.Element => (
	<Submenu title="Conversations" collapsed onToggleCollapse={() => {}}>
		<p>Hidden content</p>
	</Submenu>
);

export const WithSearch = (): React.JSX.Element => {
	const [search, setSearch] = useState("");
	return (
		<Submenu
			title="Knowledge"
			collapsed={false}
			onToggleCollapse={() => {}}
			searchValue={search}
			onSearchChange={setSearch}
		>
			<ul className="menu menu-sm">
				<li>
					<button type="button">Doc A</button>
				</li>
				<li>
					<button type="button">Doc B</button>
				</li>
			</ul>
		</Submenu>
	);
};

export const Interactive = (): React.JSX.Element => {
	const [collapsed, setCollapsed] = useState(false);
	return (
		<Submenu
			title="Active Bets"
			collapsed={collapsed}
			onToggleCollapse={() => setCollapsed(!collapsed)}
		>
			<ul className="menu menu-sm">
				<li>
					<button type="button">Launch MVP</button>
				</li>
				<li>
					<button type="button">User Onboarding</button>
				</li>
			</ul>
		</Submenu>
	);
};

// L10: Conversations-style filter row — [All, Blocking, Async] with the
// inline `× Clear` affordance shown when the filter is non-default.
export const WithFiltersConversations = (): React.JSX.Element => {
	const [filter, setFilter] = useState<SubmenuFilter>("all");
	return (
		<Submenu
			title="Conversations"
			collapsed={false}
			onToggleCollapse={() => {}}
			count={4}
			filters={[
				{ id: "all", label: "All" },
				{ id: "blocking", label: "Blocking" },
				{ id: "async", label: "Async" },
			]}
			activeFilter={filter}
			onFilterChange={setFilter}
			onClearFilter={() => setFilter("all")}
		>
			<ul className="menu menu-sm">
				<li>
					<button type="button">Review Queue</button>
				</li>
				<li>
					<button type="button">Chat</button>
				</li>
			</ul>
		</Submenu>
	);
};

// L10: Conversations chips with a non-default filter active so the inline
// `× Clear` button is mounted (visible affordance — not a chip).
export const ConversationsClearAffordance = (): React.JSX.Element => {
	const [filter, setFilter] = useState<SubmenuFilter>("blocking");
	return (
		<Submenu
			title="Conversations"
			collapsed={false}
			onToggleCollapse={() => {}}
			count={2}
			filters={[
				{ id: "all", label: "All" },
				{ id: "blocking", label: "Blocking" },
				{ id: "async", label: "Async" },
			]}
			activeFilter={filter}
			onFilterChange={setFilter}
			onClearFilter={() => setFilter("all")}
		>
			<ul className="menu menu-sm">
				<li>
					<button type="button">API key needed</button>
				</li>
				<li>
					<button type="button">OAuth scopes review</button>
				</li>
			</ul>
		</Submenu>
	);
};

// L10 / approved §5.5: chips inert during error state — aria-disabled,
// reduced opacity, click handlers short-circuit.
export const ConversationsDisabledChips = (): React.JSX.Element => (
	<Submenu
		title="Conversations"
		collapsed={false}
		onToggleCollapse={() => {}}
		count={0}
		filters={[
			{ id: "all", label: "All" },
			{ id: "blocking", label: "Blocking" },
			{ id: "async", label: "Async" },
		]}
		activeFilter="all"
		onFilterChange={() => {}}
		filtersDisabled={true}
	>
		<p className="px-2 py-1 text-xs text-[var(--text-lo)]">
			Couldn't load threads — chips disabled.
		</p>
	</Submenu>
);

// J2: Knowledge-style filter row (shorter).
export const WithFiltersKnowledge = (): React.JSX.Element => {
	const [filter, setFilter] = useState<SubmenuFilter>("all");
	return (
		<Submenu
			title="Knowledge"
			collapsed={false}
			onToggleCollapse={() => {}}
			count={12}
			filters={[
				{ id: "all", label: "All" },
				{ id: "needs-review", label: "Needs review" },
			]}
			activeFilter={filter}
			onFilterChange={setFilter}
		>
			<ul className="menu menu-sm">
				<li>
					<button type="button">All Items</button>
				</li>
			</ul>
		</Submenu>
	);
};

// J2: Work view renders no filter row (empty filters array).
export const NoFiltersWork = (): React.JSX.Element => (
	<Submenu
		title="Work"
		collapsed={false}
		onToggleCollapse={() => {}}
		filters={[]}
		activeFilter="all"
		onFilterChange={() => {}}
	>
		<ul className="menu menu-sm">
			<li>
				<button type="button">Portfolio</button>
			</li>
			<li>
				<button type="button">Team Board</button>
			</li>
		</ul>
	</Submenu>
);
