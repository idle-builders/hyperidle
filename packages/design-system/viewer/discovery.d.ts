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
/**
 * Build the catalog's module list from one or more `import.meta.glob` results.
 *
 * The optional `extraGlobs` parameter lets tests pass a synthetic shape
 * without a Vite build. In production, the viewer hands in the three globs
 * (design-system primitives + web shells + web composites).
 */
export declare function discoverStories(...globSources: GlobSource[]): StoryModule[];
export declare const TIER_LABELS: Record<Tier, string>;
export declare const TIER_ORDER: readonly Tier[];
//# sourceMappingURL=discovery.d.ts.map