// Item ids are docEntryId's contract; URL is always `<base>docs/<id>/`.
// Installation is an ASSEMBLY (not a rendered directory): user getting-started + deployment docs gathered into one ordered path.

export interface DocNavItem {
	id: string;
	title: string;
}

export interface DocNavSection {
	id: string;
	title: string;
	items: DocNavItem[];
}

export const DOCS_NAV: readonly DocNavSection[] = [
	{
		id: "installation",
		title: "Installation",
		items: [
			{ id: "guides/user/getting-started", title: "Getting started" },
			{ id: "deployment", title: "Deployment overview" },
			{ id: "deployment/laptop", title: "Laptop" },
			{ id: "deployment/self-hosting", title: "Self-hosting" },
			{ id: "deployment/shared-backend", title: "Shared backend" },
			{ id: "deployment/releases", title: "Releases" },
		],
	},
	{
		id: "user-guide",
		title: "User Guide",
		items: [
			{ id: "guides/user", title: "Overview" },
			{ id: "guides/user/getting-started", title: "Getting started" },
			{ id: "guides/user/the-interface", title: "The interface" },
			{ id: "guides/user/three-core-views", title: "Three core views" },
			{ id: "guides/user/agents", title: "Agents" },
			{ id: "guides/user/running-your-team", title: "Running your team" },
			{ id: "guides/user/settings", title: "Settings" },
			{ id: "guides/user/connections", title: "Connecting services" },
			{ id: "guides/user/deployment", title: "Deployment" },
		],
	},
	{
		id: "developer-guide",
		title: "Developer Guide",
		items: [
			{ id: "guides/developer", title: "Overview" },
			{ id: "guides/developer/getting-started", title: "Getting started" },
			{ id: "guides/developer/commands", title: "Commands" },
			{ id: "guides/developer/testing", title: "Testing" },
			{ id: "guides/developer/mock-data-policy", title: "Mock data policy" },
			{ id: "guides/developer/design-system", title: "Design system" },
			{ id: "guides/developer/linting-and-formatting", title: "Linting & formatting" },
			{ id: "guides/developer/work-packages", title: "Work packages" },
		],
	},
	{
		id: "concepts",
		title: "Concepts",
		items: [
			{ id: "product", title: "Overview" },
			{ id: "product/what-is-hyperidle", title: "What is HyperIdle?" },
			{ id: "product/how-work-flows", title: "How work flows" },
			{ id: "product/human-ai-collaboration", title: "Human + AI collaboration" },
			{ id: "product/how-knowledge-compounds", title: "How knowledge compounds" },
			{ id: "product/product-decisions", title: "Product decisions" },
		],
	},
];

export function navItemUrl(id: string, base: string): string {
	return `${base}docs/${id}/`;
}

// Installation wins for deployment docs (they appear in both User Guide and Installation sections).
export function findNavSection(entryId: string): DocNavSection | undefined {
	return DOCS_NAV.find((section) => section.items.some((item) => item.id === entryId));
}
