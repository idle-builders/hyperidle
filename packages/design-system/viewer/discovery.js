const VALID_TIERS = new Set(["1", "2", "3", "utility"]);
function extractVariant(key, value) {
    if (typeof value === "function") {
        return { name: key, render: value };
    }
    if (value !== null &&
        typeof value === "object" &&
        typeof value.render === "function") {
        // CSF-style story object: { name, render }.
        const obj = value;
        return { name: obj.name ?? key, render: obj.render };
    }
    return null;
}
function collectVariants(mod, order) {
    const variants = [];
    for (const [key, value] of Object.entries(mod)) {
        if (key === "default")
            continue;
        const entry = extractVariant(key, value);
        if (entry)
            variants.push(entry);
    }
    if (order && variants.length > 0) {
        const orderMap = new Map(order.map((name, i) => [name, i]));
        variants.sort((a, b) => (orderMap.get(a.name) ?? 999) - (orderMap.get(b.name) ?? 999));
    }
    return variants;
}
function resolveTier(meta, path) {
    if (meta.tier && VALID_TIERS.has(meta.tier))
        return meta.tier;
    // biome-ignore lint/suspicious/noConsole: developer-only workbench warning naming the offending module
    console.warn(`[design-system] Story "${meta.title}" (${path}) has no tier on its default export; bucketed as "utility". Add tier: "1" | "2" | "3" | "utility".`);
    return "utility";
}
function buildModule(path, mod) {
    const meta = mod.default;
    if (!meta?.title)
        return null;
    const variants = collectVariants(mod, meta.order);
    if (variants.length === 0)
        return null;
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
export function discoverStories(...globSources) {
    const modules = [];
    for (const source of globSources) {
        for (const [path, mod] of Object.entries(source)) {
            const built = buildModule(path, mod);
            if (built)
                modules.push(built);
        }
    }
    return modules.sort((a, b) => a.title.localeCompare(b.title));
}
export const TIER_LABELS = {
    "1": "Tier 1 — Primitives",
    "2": "Tier 2 — Blocks",
    "3": "Tier 3 — Shells",
    utility: "Utility",
};
export const TIER_ORDER = ["1", "2", "3", "utility"];
//# sourceMappingURL=discovery.js.map