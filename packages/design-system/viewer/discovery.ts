/**
 * K12 — Story discovery for the design-system workbench at `:8098`.
 *
 * Reads `*.stories.tsx` modules from across the monorepo (design-system,
 * web shell, web composites) and returns a normalised
 * `{ title, tier, uses, variants }` shape for the catalog and component
 * pages.
 *
 * @lore K12: extracted from `viewer/main.tsx` so the discovery contract is
 *   importable in vitest without pulling in the React mount-time code that
 *   reads `document.getElementById("root")`.
 */
import type { ComponentType } from "react";

export type Tier = "1" | "2" | "3" | "utility";

export interface StoryMeta {
	title: string;
	/** Explicit variant display order. */
	order?: string[];
	/** Tier bucket for the catalog. Missing → "utility" + console.warn. */
	tier?: Tier;
	/** Other components this one renders inside (composition graph data). */
	uses?: string[];
}

export interface StoryEntry {
	name: string;
	render: ComponentType;
}

export interface StoryModule {
	title: string;
	tier: Tier;
	uses: string[];
	variants: StoryEntry[];
}

export type GlobSource = Record<string, Record<string, unknown>>;

const VALID_TIERS: ReadonlySet<Tier> = new Set<Tier>(["1", "2", "3", "utility"]);

function extractVariant(key: string, value: unknown): StoryEntry | null {
	if (typeof value === "function") {
		return { name: key, render: value as ComponentType };
	}
	if (
		value !== null &&
		typeof value === "object" &&
		typeof (value as { render?: unknown }).render === "function"
	) {
		// CSF-style story object: { name, render }.
		const obj = value as { name?: string; render: ComponentType };
		return { name: obj.name ?? key, render: obj.render };
	}
	return null;
}

function collectVariants(mod: Record<string, unknown>, order: string[] | undefined): StoryEntry[] {
	const variants: StoryEntry[] = [];
	for (const [key, value] of Object.entries(mod)) {
		if (key === "default") continue;
		const entry = extractVariant(key, value);
		if (entry) variants.push(entry);
	}
	if (order && variants.length > 0) {
		const orderMap = new Map(order.map((name, i) => [name, i]));
		variants.sort((a, b) => (orderMap.get(a.name) ?? 999) - (orderMap.get(b.name) ?? 999));
	}
	return variants;
}

function resolveTier(meta: StoryMeta, path: string): Tier {
	if (meta.tier && VALID_TIERS.has(meta.tier)) return meta.tier;
	// biome-ignore lint/suspicious/noConsole: developer-only workbench warning naming the offending module
	console.warn(
		`[design-system] Story "${meta.title}" (${path}) has no tier on its default export; bucketed as "utility". Add tier: "1" | "2" | "3" | "utility".`,
	);
	return "utility";
}

function buildModule(path: string, mod: Record<string, unknown>): StoryModule | null {
	const meta = mod.default as StoryMeta | undefined;
	if (!meta?.title) return null;
	const variants = collectVariants(mod, meta.order);
	if (variants.length === 0) return null;
	const tier = resolveTier(meta, path);
	const uses = Array.isArray(meta.uses) ? meta.uses : [];
	return { title: meta.title, tier, uses, variants };
}

/**
 * Build the catalog's module list from one or more `import.meta.glob` results.
 *
 * The optional `extraGlobs` parameter lets tests pass a synthetic shape
 * without a Vite build. In production, the viewer hands in the three globs
 * (design-system primitives + web shells + web composites).
 */
export function discoverStories(...globSources: GlobSource[]): StoryModule[] {
	const modules: StoryModule[] = [];
	for (const source of globSources) {
		for (const [path, mod] of Object.entries(source)) {
			const built = buildModule(path, mod);
			if (built) modules.push(built);
		}
	}
	return modules.sort((a, b) => a.title.localeCompare(b.title));
}

export const TIER_LABELS: Record<Tier, string> = {
	"1": "Tier 1 — Primitives",
	"2": "Tier 2 — Blocks",
	"3": "Tier 3 — Shells",
	utility: "Utility",
};

export const TIER_ORDER: readonly Tier[] = ["1", "2", "3", "utility"] as const;
