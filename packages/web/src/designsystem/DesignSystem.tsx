import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import type { StoryMeta, StoryModule } from "./types.js";

// Auto-discover all .stories.tsx files in components/, shell/, pages/, and layouts/
const componentModules = import.meta.glob<Record<string, unknown>>("../components/*.stories.tsx", {
	eager: true,
});
const shellModules = import.meta.glob<Record<string, unknown>>("../shell/*.stories.tsx", {
	eager: true,
});
const pageModules = import.meta.glob<Record<string, unknown>>("../pages/*.stories.tsx", {
	eager: true,
});
const layoutModules = import.meta.glob<Record<string, unknown>>("../layouts/*.stories.tsx", {
	eager: true,
});
const storyGlobs = { ...componentModules, ...shellModules, ...pageModules, ...layoutModules };

function parseStoryModules(): StoryModule[] {
	const modules: StoryModule[] = [];

	for (const [, mod] of Object.entries(storyGlobs)) {
		const defaultExport = mod.default as StoryMeta | undefined;
		if (!defaultExport?.title) continue;

		const variants: StoryModule["variants"] = [];
		for (const [key, value] of Object.entries(mod)) {
			if (key === "default") continue;
			if (typeof value === "function") {
				variants.push({ name: key, Component: value as ComponentType });
			}
		}

		if (variants.length > 0) {
			// Sort by file path for stable ordering
			modules.push({ meta: defaultExport, variants });
		}
	}

	return modules.sort((a, b) => a.meta.title.localeCompare(b.meta.title));
}

function parseHash(): { component: string | null; variant: string | null } {
	const hash = window.location.hash.replace(/^#\/?/, "");
	if (!hash) return { component: null, variant: null };
	const [component, variant] = hash.split("/");
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
		window.location.hash = variant ? `${component}/${variant}` : component;
	}, []);

	return (
		<div className="min-h-screen bg-base-100 flex">
			{/* Sidebar */}
			<nav className="w-56 shrink-0 border-r border-[var(--surface-4)] bg-[var(--surface-1)] p-3 flex flex-col gap-1">
				<h1 className="font-heading text-sm font-medium text-[var(--text-hi)] mb-3 px-2">
					Design System
				</h1>
				{modules.map((mod) => (
					<button
						key={mod.meta.title}
						type="button"
						className={`text-left text-sm px-2 py-1.5 rounded transition-colors ${
							activeComponent === mod.meta.title
								? "bg-[var(--surface-4)] text-[var(--text-hi)]"
								: "text-[var(--text-mid)] hover:text-[var(--text-hi)] hover:bg-[var(--surface-2)]"
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
					<p className="text-[var(--text-lo)] text-sm">No components found.</p>
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
			<h2 className="font-heading text-lg font-medium text-[var(--text-hi)] mb-4">
				{module.meta.title}
			</h2>

			{/* Variant tabs */}
			<div className="flex flex-wrap gap-1 mb-6 border-b border-[var(--surface-4)] pb-2">
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
					? "bg-[var(--surface-4)] text-[var(--text-hi)]"
					: "text-[var(--text-lo)] hover:text-[var(--text-mid)]"
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
	Component: ComponentType;
}): React.JSX.Element {
	return (
		<div className="border border-[var(--surface-4)] rounded">
			<div className="px-3 py-1.5 border-b border-[var(--surface-4)] bg-[var(--surface-1)]">
				<span className="text-xs font-mono text-[var(--text-lo)]">{name}</span>
			</div>
			<div className="p-4">
				<Component />
			</div>
		</div>
	);
}
