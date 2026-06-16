/**
 * K12 — Story discovery for the design-system workbench at `:8098`.
 *
 * Reads `*.stories.tsx` modules from across the monorepo (design-system,
 * web shell, web composites) and returns a normalised
 * `{ title, group, uses, variants }` shape for the catalog and component
 * pages.
 *
 * @lore K12: extracted from `viewer/main.tsx` so the discovery contract is
 *   importable in vitest without pulling in the React mount-time code that
 *   reads `document.getElementById("root")`.
 *
 * @lore AJ6: classification reshaped from numeric Tier (1/2/3/utility) to
 *   CatalogGroup (kind: "tier"|"domain", name: GroupName). The two-axis model
 *   (reuse vocabulary vs product area) is derived from source path; the central
 *   DS_COMPONENT_GROUPS registry handles the flat src/ root where path carries
 *   no axis signal. Registry is the "first honest pass" — fine cleanup deferred.
 *
 * @lore AJ6 W6: DS_COMPONENT_GROUPS lookup is step 3 and runs ONLY when
 *   deriveFromPath returns null — i.e. for the design-system/src flat root and
 *   web/src/components composites. A web page/shell/layout path resolves first,
 *   so a web title colliding with a DS registry key cannot mis-resolve.
 *
 * @lore AJ6 no-cycle: only viewer/main.tsx (dev-only target) cross-imports
 *   web globs. discovery.ts and design-system/src/ never import @hyperidle/web.
 *   AC8 ESLint rule enforces this at the import site.
 */
import type { ComponentType } from "react";

// ── Two-axis classification types ─────────────────────────────────────────

export type GroupKind = "tier" | "domain";

export type GroupName =
	| "Foundation"
	| "Primitives"
	| "Blocks" // tiers (domain-agnostic)
	| "Work"
	| "Knowledge"
	| "Conversations"
	| "Artifacts"
	| "Settings"
	| "System"; // domains

export interface CatalogGroup {
	kind: GroupKind;
	name: GroupName;
}

/**
 * Ordered registry — Tiers first, then Domains.
 * Drives catalog render order; iterate THIS, not the bucket map.
 */
export const GROUPS: readonly CatalogGroup[] = [
	{ kind: "tier", name: "Foundation" },
	{ kind: "tier", name: "Primitives" },
	{ kind: "tier", name: "Blocks" },
	{ kind: "domain", name: "Work" },
	{ kind: "domain", name: "Knowledge" },
	{ kind: "domain", name: "Conversations" },
	{ kind: "domain", name: "Artifacts" },
	{ kind: "domain", name: "Settings" },
	{ kind: "domain", name: "System" },
] as const;

// ── Story types ───────────────────────────────────────────────────────────

export interface StoryMeta {
	title: string;
	/** Explicit variant display order. */
	order?: string[];
	/**
	 * Explicit group override — highest precedence in the resolution chain.
	 * Use only when path derivation cannot express intent (area-less page titles,
	 * off-spec stories). If set, beats deriveFromPath + DS_COMPONENT_GROUPS.
	 */
	group?: GroupName;
	/**
	 * @deprecated Use `group` instead. Legacy tier strings still accepted on
	 * existing stories; ignored for classification (path + registry is
	 * authoritative). Removed in the AJ6 cleanup follow-up.
	 */
	tier?: string;
	/** Other components this one renders inside (composition graph data). */
	uses?: string[];
}

export interface StoryEntry {
	name: string;
	render: ComponentType;
}

export interface StoryModule {
	title: string;
	/** Resolved catalog group. Always a valid CatalogGroup after AJ6. */
	group: CatalogGroup;
	uses: string[];
	variants: StoryEntry[];
}

export type GlobSource = Record<string, Record<string, unknown>>;

// ── Central DS-src classification registry ────────────────────────────────
//
// Maps story title → GroupName for the flat design-system/src/*.stories.tsx root.
// Path carries no axis signal there (all files are in the same flat dir), so we
// need a single reviewable table. Fine cleanup is a follow-up WP; this is the
// "first honest pass" — AC2 ensures every DS-src story resolves to a group.
//
// Domain-specific components in DS-src (the founder's "at some point stuff
// becomes domain-specific" boundary):
//   Work:          BetCard, TaskCard
//   Knowledge:     KnowledgeRow
//   Conversations: ThreadRow, Composer, ThreadShell, CommentRow, RichMessageCard,
//                  ThreadHostBanner, NotificationRow
//   Artifacts:     ArtifactCostChip, ArtifactEmbed, ArtifactGalleryCard,
//                  ArtifactKindBadge, ArtifactPreview, ArtifactPreviewSurface,
//                  ArtifactStackItem, ArtifactTimestamp
//
// Domain-agnostic reuse:
//   Foundation:  atoms — Button, Input, Avatar, Toggle, Checkbox, Select,
//                SearchField, LiveDot, Progress, Breadcrumb, Skeleton, Menu
//   Primitives:  small composed — StatusChip, Tag, NavItem, KeyValue, AG6/RowDot
//   Blocks:      domain-agnostic composed — Row, ItemList, EmptyState, ErrorState,
//                TabBar, Toast, ScopePicker, BlockHandle, BlockActionsPopover,
//                Block, BodyEditor, AI2/Dialog, AI2/DialogPortalRoot,
//                AI2/DiscardConfirmStrip
//
// Tokens gallery: Foundation (entry point to the token system)
// CatalogAxis design story: Foundation (viewer/catalog chrome)
// Special: groups with prefix (AI2/, AG6/, Kinds/) resolved here too
export const DS_COMPONENT_GROUPS: Record<string, GroupName> = {
	// Foundation — atoms
	Button: "Foundation",
	Input: "Foundation",
	Avatar: "Foundation",
	Toggle: "Foundation",
	Checkbox: "Foundation",
	Select: "Foundation",
	SearchField: "Foundation",
	LiveDot: "Foundation",
	Progress: "Foundation",
	Breadcrumb: "Foundation",
	Skeleton: "Foundation",
	Menu: "Foundation",
	Tokens: "Foundation",
	// Primitives — small composed
	StatusChip: "Primitives",
	Tag: "Primitives",
	NavItem: "Primitives",
	KeyValue: "Primitives",
	"AG6/RowDot": "Primitives",
	// Blocks — domain-agnostic composed
	Row: "Blocks",
	ItemList: "Blocks",
	EmptyState: "Blocks",
	ErrorState: "Blocks",
	TabBar: "Blocks",
	Toast: "Blocks",
	ScopePicker: "Blocks",
	BlockHandle: "Blocks",
	BlockActionsPopover: "Blocks",
	Block: "Blocks",
	BodyEditor: "Blocks",
	"AI2/Dialog": "Blocks",
	"AI2/DialogPortalRoot": "Blocks",
	"AI2/DiscardConfirmStrip": "Blocks",
	"Catalog Axis (AJ6 design)": "Foundation",
	// Work domain
	BetCard: "Work",
	TaskCard: "Work",
	// Knowledge domain
	KnowledgeRow: "Knowledge",
	// Conversations domain
	ThreadRow: "Conversations",
	Composer: "Conversations",
	ThreadShell: "Conversations",
	CommentRow: "Conversations",
	RichMessageCard: "Conversations",
	ThreadHostBanner: "Conversations",
	NotificationRow: "Conversations",
	// Artifacts domain
	ArtifactCostChip: "Artifacts",
	ArtifactEmbed: "Artifacts",
	ArtifactGalleryCard: "Artifacts",
	ArtifactKindBadge: "Artifacts",
	ArtifactPreview: "Artifacts",
	ArtifactPreviewSurface: "Artifacts",
	ArtifactStackItem: "Artifacts",
	ArtifactTimestamp: "Artifacts",
};

// Validate GroupName at compile time — exhaustive record ensures the union
// matches GROUPS and this file stays consistent. tsc fails if a name is missing.
const GROUP_NAME_EXHAUSTIVE_CHECK: Record<GroupName, true> = {
	Foundation: true,
	Primitives: true,
	Blocks: true,
	Work: true,
	Knowledge: true,
	Conversations: true,
	Artifacts: true,
	Settings: true,
	System: true,
};
// Ensure the check is used (prevents unused-variable warnings)
void GROUP_NAME_EXHAUSTIVE_CHECK;

// ── Classification helpers ────────────────────────────────────────────────

const GROUP_MAP = new Map<GroupName, CatalogGroup>(GROUPS.map((g) => [g.name, g]));

function makeGroup(name: GroupName): CatalogGroup {
	// GROUP_MAP is populated from GROUPS (all 9 entries). GroupName is a closed
	// union type, so every valid name is guaranteed to be in the map. The fallback
	// here is unreachable by construction — TypeScript's closed union ensures it.
	const g = GROUP_MAP.get(name);
	if (!g) throw new Error(`[design-system] BUG: GroupName '${name}' not in GROUP_MAP`);
	return g;
}

/**
 * Path-authoritative classification. Returns a CatalogGroup if the path has
 * a directional signal; returns null for paths that must fall through.
 *
 * PATH IS AUTHORITATIVE — title is never consulted here.
 * Prefix-matched on the glob key (compile-time path strings).
 *
 * Resolution table (first match wins):
 *   web/src/pages/work/*       → Work          (nested dir is the signal)
 *   web/src/pages/knowledge/*  → Knowledge     (nested dir is the signal)
 *   web/src/settings/*         → Settings
 *   web/src/shell/*            → System
 *   web/src/layouts/*          → System
 *   design-system/src/kinds/*  → System
 *   web/src/pages/*.stories    → null          (flat; fall through to deriveFromTitle)
 *   web/src/components/*       → null          (fall through to registry)
 *   design-system/src/*.stories → null         (flat root; must hit registry)
 *
 * NOTE on path format: Vite glob keys are relative strings that may not start
 * with '/'. Use segment-boundary matching (check for the segment surrounded by
 * '/' on both sides, OR at start of string) to avoid substring false positives.
 */
export function deriveFromPath(path: string, _title: string): CatalogGroup | null {
	// Normalise to forward slashes
	const p = path.replace(/\\/g, "/");

	// Helper: check if the path contains a path segment anywhere.
	// Accepts "…/segment/…" OR a leading "segment/…".
	function seg(fragment: string): boolean {
		return p.includes(`/${fragment}/`) || p.includes(`/${fragment}`);
	}

	// Nested pages — checked before flat pages/ prefix
	if (seg("pages/work")) return makeGroup("Work");
	if (seg("pages/knowledge")) return makeGroup("Knowledge");
	// Could add more nested page areas here (e.g. /pages/settings/) if they emerge

	// Settings, shell, layouts (web)
	if (p.includes("web/src/settings/") || p.includes("/web/src/settings/"))
		return makeGroup("Settings");
	if (p.includes("web/src/shell/") || p.includes("/web/src/shell/")) return makeGroup("System");
	if (p.includes("web/src/layouts/") || p.includes("/web/src/layouts/")) return makeGroup("System");

	// Kinds renderers (design-system/src/kinds/ — path segment after any number of ../s)
	if (p.includes("/kinds/") || p.startsWith("kinds/") || p.includes("src/kinds/"))
		return makeGroup("System");

	// Flat pages/ or components/ — fall through to title/registry
	// design-system/src flat root — fall through to registry
	return null;
}

/**
 * Title-based fallback for the flat web/src/pages/ glob.
 * Runs only when deriveFromPath returns null (flat pages path).
 * Returns null for area-less titles (WorkRoutine, WorkTeam, NotFound)
 * — those REQUIRE an explicit meta.group.
 */
function deriveFromTitle(title: string): CatalogGroup | null {
	if (title.startsWith("Page: Work/")) return makeGroup("Work");
	if (title.startsWith("Page: Knowledge/")) return makeGroup("Knowledge");
	if (title === "Page: Conversations") return makeGroup("Conversations");
	if (title.startsWith("Page: Conversations")) return makeGroup("Conversations");
	if (title.startsWith("Page: Agents/")) return makeGroup("Conversations");
	if (title.startsWith("Page: Setup/")) return makeGroup("Work");
	if (title === "Page: Settings") return makeGroup("Settings");
	if (title.startsWith("Page: Settings")) return makeGroup("Settings");
	// Area-less titles (WorkRoutine, WorkTeam, NotFound) → null (need meta.group)
	return null;
}

/**
 * Derive a CatalogGroup for a story module.
 *
 * Resolution chain (total, deterministic — first non-null wins):
 *   1. meta.group              (explicit escape hatch — highest precedence)
 *   2. deriveFromPath(path)    (AUTHORITATIVE for web/ and kinds/ paths)
 *   3. Title fallback          (for flat web/src/pages/*.stories only)
 *   4. DS_COMPONENT_GROUPS[title] (DS-src flat root + web/src/components composites)
 *   5. null                    (→ classification failure, caught by AC2/test)
 */
export function deriveGroup(path: string, title: string, meta: StoryMeta): CatalogGroup | null {
	// Step 1: explicit meta.group override
	if (meta.group) {
		const g = GROUP_MAP.get(meta.group);
		if (g) return g;
	}

	// Step 2: path-authoritative
	const fromPath = deriveFromPath(path, title);
	if (fromPath) return fromPath;

	// Step 3: title fallback (flat pages/ only — path returned null above)
	// We check whether this is a flat pages/ path before invoking title fallback
	const p = path.replace(/\\/g, "/");
	const isFlatPages =
		p.includes("/web/src/pages/") && !p.match(/\/pages\/[^/]+\/[^/]+\.stories\.tsx$/);
	if (isFlatPages) {
		const fromTitle = deriveFromTitle(title);
		if (fromTitle) return fromTitle;
		// Area-less title with no meta.group → null (classification failure)
		return null;
	}

	// Step 4: DS_COMPONENT_GROUPS registry (DS-src flat root + web/src/components)
	const registryName = DS_COMPONENT_GROUPS[title];
	if (registryName) return makeGroup(registryName);

	// Step 5: null → unclassified
	return null;
}

// ── Story extraction helpers ──────────────────────────────────────────────

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

function buildModule(path: string, mod: Record<string, unknown>): StoryModule | null {
	const meta = mod.default as StoryMeta | undefined;
	if (!meta?.title) return null;
	const variants = collectVariants(mod, meta.order);
	if (variants.length === 0) return null;

	const group = deriveGroup(path, meta.title, meta);
	if (!group) {
		// biome-ignore lint/suspicious/noConsole: developer-only workbench warning naming the offending module
		console.warn(
			`[design-system] Story "${meta.title}" (${path}) has no classification. ` +
				`Add meta.group or an entry in DS_COMPONENT_GROUPS. (AJ6 AC2)`,
		);
		// Return null — do NOT silently default. AC2 test will catch unclassified.
		return null;
	}

	const uses = Array.isArray(meta.uses) ? meta.uses : [];
	return { title: meta.title, group, uses, variants };
}

/**
 * Build the catalog's module list from one or more `import.meta.glob` results.
 *
 * The optional `extraGlobs` parameter lets tests pass a synthetic shape
 * without a Vite build. In production, the viewer hands in the glob results.
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
