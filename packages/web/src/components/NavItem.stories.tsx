import { NavItem } from "./NavItem.js";

export default { title: "NavItem" };

const FolderIcon = (): React.JSX.Element => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 20 20"
		fill="currentColor"
		className="h-4 w-4"
	>
		<title>Folder</title>
		<path d="M3.75 3A1.75 1.75 0 002 4.75v3.26a3.235 3.235 0 011.75-.51h12.5c.644 0 1.245.188 1.75.51V6.75A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75z" />
		<path d="M3.75 9A1.75 1.75 0 002 10.75v4.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-4.5A1.75 1.75 0 0016.25 9H3.75z" />
	</svg>
);

export const Default = (): React.JSX.Element => (
	<ul className="menu w-56">
		<NavItem label="Projects" />
	</ul>
);

export const Selected = (): React.JSX.Element => (
	<ul className="menu w-56">
		<NavItem label="Projects" selected />
	</ul>
);

export const WithIcon = (): React.JSX.Element => (
	<ul className="menu w-56">
		<NavItem label="Projects" icon={<FolderIcon />} />
	</ul>
);

export const WithCount = (): React.JSX.Element => (
	<ul className="menu w-56">
		<NavItem label="Notifications" count={12} />
	</ul>
);

export const FullNav = (): React.JSX.Element => (
	<ul className="menu w-56">
		<NavItem label="Dashboard" icon={<FolderIcon />} selected />
		<NavItem label="Projects" icon={<FolderIcon />} count={3} />
		<NavItem label="Agents" icon={<FolderIcon />} count={7} />
		<NavItem label="Settings" icon={<FolderIcon />} />
	</ul>
);
