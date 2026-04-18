import { useState } from "react";
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
