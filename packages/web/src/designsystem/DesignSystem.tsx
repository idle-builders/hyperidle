import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { StoryMeta, StoryModule } from "./types.js";

// Auto-discover .stories.tsx for reusable components only (Tier 1-3).
// Pages and layouts are full compositions, not reusable — they belong
// in E2E tests, not the design system catalog.
// @lore Design system components (Tier 1-2) live in @hyperidle/design-system,
// shell components (Tier 3) stay in packages/web. Both are discovered here.
//
// @lore L1 step9 (Design pre-existing): the path was `../../../../` (4 levels)
// which resolved to `<repo>/design-system/...` instead of `packages/design-system/`.
// The L1 stories file existed but could never be discovered. Fixed to 3 levels.
const dsModules = import.meta.glob<Record<string, unknown>>(
	"../../../design-system/src/*.stories.tsx",
	{ eager: true },
);
const componentModules = import.meta.glob<Record<string, unknown>>("../components/*.stories.tsx", {
	eager: true,
});
const shellModules = import.meta.glob<Record<string, unknown>>("../shell/*.stories.tsx", {
	eager: true,
});
const storyGlobs = { ...dsModules, ...componentModules, ...shellModules };

/**
 * I4 D2: parseStoryModules now detects CSF3 object stories (`{ name, render }`)
 * in addition to the legacy function-style stories. The function is
 * exported for testability — vitest passes synthetic glob shapes to verify
 * detection without touching the real `import.meta.glob` output.
 *
 * @lore Behaviour is additive: function exports continue to be picked up
 * exactly as before; object exports are inspected for a `.render` function
 * and (optionally) a `.name` field.
 */
export function parseStoryModules(
	fakeModules?: Record<string, Record<string, unknown>>,
): StoryModule[] {
	const source: Record<string, Record<string, unknown>> = fakeModules ??
	(storyGlobs as Record<string, Record<string, unknown>>);
	const modules: StoryModule[] = [];

	for (const [, mod] of Object.entries(source)) {
		const defaultExport = mod.default as StoryMeta | undefined;
		if (!defaultExport?.title) continue;

		const variants: StoryModule["variants"] = [];
		for (const [key, value] of Object.entries(mod)) {
			if (key === "default") continue;
			if (typeof value === "function") {
				// biome-ignore lint/style/useNamingConvention: StoryEntry interface uses PascalCase Component
				variants.push({ name: key, Component: value as ComponentType });
				continue;
			}
			if (
				value &&
				typeof value === "object" &&
				"render" in value &&
				typeof (value as { render?: unknown }).render === "function"
			) {
				const obj = value as { name?: string; render: ComponentType };
				// biome-ignore lint/style/useNamingConvention: StoryEntry interface uses PascalCase Component
				variants.push({ name: obj.name ?? key, Component: obj.render });
			}
		}

		if (variants.length > 0) {
			// Sort by file path for stable ordering
			modules.push({ meta: defaultExport, variants });
		}
	}

	return modules.sort((a, b) => a.meta.title.localeCompare(b.meta.title));
}

/**
 * @lore I6-fix: the hash uses `::` (not `/`) as component/variant separator
 * because story titles such as "Page: Conversations/Chat" embed literal
 * slashes. Splitting on `/` would shred the title.
 */
function parseHash(): { component: string | null; variant: string | null } {
	const hash = decodeURIComponent(window.location.hash.replace(/^#\/?/, ""));
	if (!hash) return { component: null, variant: null };
	const sepIdx = hash.indexOf("::");
	if (sepIdx === -1) return { component: hash || null, variant: null };
	const component = hash.slice(0, sepIdx);
	const variant = hash.slice(sepIdx + 2);
	return { component: component || null, variant: variant || null };
}

export function DesignSystem(): React.JSX.Element {
	const modules = useMemo(parseStoryModules, []);
	const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
	const [selectedVariant, setSelectedVariant] = useState<string | null>(null);

	// Sync state from hash on mount and hash changes
	useEffect(() => {
		function onHashChange(): void {
			const { component, variant } = parseHash();
			setSelectedComponent(component);
			setSelectedVariant(variant);
		}
		onHashChange();
		window.addEventListener("hashchange", onHashChange);
		return () => window.removeEventListener("hashchange", onHashChange);
	}, []);

	// Default to first component if none selected
	const activeComponent = selectedComponent ?? modules[0]?.meta.title ?? null;
	const activeModule = modules.find((m) => m.meta.title === activeComponent);

	const navigate = useCallback((component: string, variant?: string) => {
		window.location.hash = variant ? `${component}::${variant}` : component;
	}, []);

	return (
		<div className="min-h-screen bg-base-100 flex">
			{/* Sidebar */}
			<nav className="w-56 shrink-0 border-r border-[var(--border-default)] bg-[var(--surface-container)] p-3 flex flex-col gap-1">
				<h1 className="font-heading text-sm font-medium text-[var(--text-primary)] mb-3 px-2">
					Design System
				</h1>
				{modules.map((mod) => (
					<button
						key={mod.meta.title}
						type="button"
						className={`text-left text-sm px-2 py-1.5 rounded transition-colors ${
							activeComponent === mod.meta.title
								? "bg-[var(--surface-overlay)] text-[var(--text-primary)]"
								: "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]"
						}`}
						onClick={() => navigate(mod.meta.title)}
					>
						{mod.meta.title}
					</button>
				))}
			</nav>

			{/* Main content */}
			<main className="flex-1 p-6 overflow-auto">
				{activeModule ? (
					<ComponentView
						module={activeModule}
						selectedVariant={selectedVariant}
						onSelectVariant={(v) => navigate(activeModule.meta.title, v)}
					/>
				) : (
					<p className="text-[var(--text-tertiary)] text-sm">No components found.</p>
				)}
			</main>
		</div>
	);
}

function ComponentView({
	module,
	selectedVariant,
	onSelectVariant,
}: {
	module: StoryModule;
	selectedVariant: string | null;
	onSelectVariant: (variant: string) => void;
}): React.JSX.Element {
	const showAll = !selectedVariant || selectedVariant === "All";
	const activeVariant = module.variants.find((v) => v.name === selectedVariant);

	return (
		<div>
			<h2 className="font-heading text-lg font-medium text-[var(--text-primary)] mb-4">
				{module.meta.title}
			</h2>

			{/* Variant tabs */}
			<div className="flex flex-wrap gap-1 mb-6 border-b border-[var(--border-default)] pb-2">
				<TabButton label="All" active={showAll} onClick={() => onSelectVariant("All")} />
				{module.variants.map((v) => (
					<TabButton
						key={v.name}
						label={v.name}
						active={selectedVariant === v.name}
						onClick={() => onSelectVariant(v.name)}
					/>
				))}
			</div>

			{/* Render variants */}
			{showAll ? (
				<div className="flex flex-col gap-6">
					{module.variants.map((v) => (
						<VariantCard key={v.name} name={v.name} Component={v.Component} />
					))}
				</div>
			) : activeVariant ? (
				<VariantCard name={activeVariant.name} Component={activeVariant.Component} />
			) : null}
		</div>
	);
}

function TabButton({
	label,
	active,
	onClick,
}: {
	label: string;
	active: boolean;
	onClick: () => void;
}): React.JSX.Element {
	return (
		<button
			type="button"
			className={`text-xs px-2 py-1 rounded transition-colors ${
				active
					? "bg-[var(--surface-overlay)] text-[var(--text-primary)]"
					: "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
			}`}
			onClick={onClick}
		>
			{label}
		</button>
	);
}

function VariantCard({
	name,
	Component,
}: {
	name: string;
	// biome-ignore lint/style/useNamingConvention: React component props use PascalCase for component references
	Component: ComponentType;
}): React.JSX.Element {
	return (
		<div className="border border-[var(--border-default)] rounded">
			<div className="px-3 py-1.5 border-b border-[var(--border-default)] bg-[var(--surface-container)]">
				<span className="text-xs font-mono text-[var(--text-tertiary)]">{name}</span>
			</div>
			<div className="p-4">
				<Component />
			</div>
		</div>
	);
}
