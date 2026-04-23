import { useState } from "react";
import type { SubmenuFilter } from "./Submenu";
import { Submenu } from "./Submenu";

export default { title: "Submenu" };

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

// J2: Conversations-style filter row with count bubble.
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
				{ id: "needs-review", label: "Needs review" },
				{ id: "chats", label: "Chats" },
				{ id: "resolved", label: "Resolved" },
			]}
			activeFilter={filter}
			onFilterChange={setFilter}
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
