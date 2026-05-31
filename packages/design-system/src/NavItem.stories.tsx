import { NavItem } from "./NavItem.js";

export default {
	title: "NavItem",
	tier: "1" as const,
	order: [
		"DefaultTextOnly",
		"SelectedState",
		"WithIcons",
		"WithCountBadge",
		"WithStatusDot",
		"FullNavigationInteractive",
	],
};

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

const AgentIcon = (): React.JSX.Element => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 20 20"
		fill="currentColor"
		className="h-4 w-4"
	>
		<title>Agent</title>
		<path
			fillRule="evenodd"
			d="M10 2a6 6 0 00-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 00.515 1.076 32.91 32.91 0 003.256.508 3.5 3.5 0 006.972 0 32.903 32.903 0 003.256-.508.75.75 0 00.515-1.076A11.448 11.448 0 0116 8a6 6 0 00-6-6z"
			clipRule="evenodd"
		/>
	</svg>
);

const GearIcon = (): React.JSX.Element => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 20 20"
		fill="currentColor"
		className="h-4 w-4"
	>
		<title>Settings</title>
		<path
			fillRule="evenodd"
			d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z"
			clipRule="evenodd"
		/>
	</svg>
);

export const DefaultTextOnly = (): React.JSX.Element => (
	<ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 2, width: 220 }}>
		<NavItem label="Projects" />
		<NavItem label="Agents" />
		<NavItem label="Settings" />
	</ul>
);

export const SelectedState = (): React.JSX.Element => (
	<ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 2, width: 220 }}>
		<NavItem label="Projects" />
		<NavItem label="Agents" selected />
		<NavItem label="Settings" />
	</ul>
);

export const WithIcons = (): React.JSX.Element => (
	<ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 2, width: 220 }}>
		<NavItem label="Projects" icon={<FolderIcon />} />
		<NavItem label="Agents" icon={<AgentIcon />} />
		<NavItem label="Settings" icon={<GearIcon />} />
	</ul>
);

export const WithCountBadge = (): React.JSX.Element => (
	<ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 2, width: 220 }}>
		<NavItem label="Notifications" count={12} />
		<NavItem label="Tasks" count={3} />
		<NavItem label="Errors" count={0} />
	</ul>
);

export const WithStatusDot = (): React.JSX.Element => (
	<ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 2, width: 220 }}>
		<NavItem label="Healthy Agent" statusDot="success" />
		<NavItem label="Delayed Task" statusDot="warning" />
		<NavItem label="Blocked Item" statusDot="error" />
		<NavItem label="Paused Routine" statusDot="info" />
		<NavItem label="No Status" />
	</ul>
);

export const FullNavigationInteractive = (): React.JSX.Element => (
	<ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 2, width: 220 }}>
		<NavItem label="Dashboard" icon={<FolderIcon />} selected />
		<NavItem label="Projects" icon={<FolderIcon />} count={3} />
		<NavItem label="Agents" icon={<AgentIcon />} count={7} />
		<NavItem label="Settings" icon={<GearIcon />} />
	</ul>
);
