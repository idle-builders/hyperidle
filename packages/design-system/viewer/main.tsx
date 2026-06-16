import { Component, StrictMode, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AnnotationOverlay } from "./annotations/annotation-overlay.js";
import {
	type CatalogGroup,
	discoverStories,
	type GlobSource,
	GROUPS,
	type StoryModule,
} from "./discovery.js";
import "./viewer.css";

/* ── Story discovery ─────────────────────────────────────────────────
 *
 * @lore K12: cross-package glob is build-time only via Vite workspace
 *   symlinks; design-system has no runtime dep on @hyperidle/web. The
 *   workbench is a developer-only build target — it must NOT leak the web
 *   package into design-system's published exports.
 *
 * @lore AJ1: HTML mode removed. TSX is the single design source of truth.
 *   The htmlGlobs / HTML_AVAILABLE_TITLES / isHtmlAvailable / RenderMode /
 *   HtmlComponentView / HTML-TSX toolbar toggle were all removed here.
 *   The viewer renders only live TSX stories. See plans/AJ1/architecture.md.
 *
 * @lore AJ6: Four new globs added — kinds/, nested pages/work|knowledge/*,
 *   settings/, layouts/. These surface the ~16 previously-hidden stories.
 *   Only main.tsx (the dev-only viewer target) cross-imports web; discovery.ts
 *   and design-system/src/ never import @hyperidle/web. AC8 ESLint rule enforces
 *   this at the import site. The viewer uses workspace symlinks at build time.
 *
 * @lore AJ6 no-cycle: cross-package globs live ONLY in this file (main.tsx).
 *   discovery.ts and design-system/src/** never import @hyperidle/web.
 *   The AC8 ESLint rule enforces this; it fires on any @hyperidle/web or
 *   ../../web/** import in design-system/src/** or viewer/discovery.ts.
 */

const dsStoryGlobs = import.meta.glob<Record<string, unknown>>("../src/*.stories.tsx", {
	eager: true,
}) as GlobSource;
const dsKindsStoryGlobs = import.meta.glob<Record<string, unknown>>("../src/kinds/*.stories.tsx", {
	eager: true,
}) as GlobSource;
const webShellStoryGlobs = import.meta.glob<Record<string, unknown>>(
	"../../web/src/shell/*.stories.tsx",
	{ eager: true },
) as GlobSource;
const webComponentStoryGlobs = import.meta.glob<Record<string, unknown>>(
	"../../web/src/components/*.stories.tsx",
	{ eager: true },
) as GlobSource;
// @lore AD9: page-level stories live in packages/web/src/pages/*.stories.tsx.
// Added so full-page surfaces are reviewable live (/human-design-review gate).
const webPageStoryGlobs = import.meta.glob<Record<string, unknown>>(
	"../../web/src/pages/*.stories.tsx",
	{ eager: true },
) as GlobSource;
// @lore AJ6: nested pages — pages/knowledge/* and pages/work/* stories.
// Disjoint from the flat pages/* glob (Vite globs don't recurse). No dedup needed.
const webNestedPageStoryGlobs = import.meta.glob<Record<string, unknown>>(
	"../../web/src/pages/*/*.stories.tsx",
	{ eager: true },
) as GlobSource;
// @lore AJ6: settings panels (4 stories) and AppShell layout (1 story).
const webSettingsStoryGlobs = import.meta.glob<Record<string, unknown>>(
	"../../web/src/settings/*.stories.tsx",
	{ eager: true },
) as GlobSource;
const webLayoutsStoryGlobs = import.meta.glob<Record<string, unknown>>(
	"../../web/src/layouts/*.stories.tsx",
	{ eager: true },
) as GlobSource;

/* ── Routing (hash-based, no deps) ───────────────────────────────── */

function useHashRoute(): [string, (path: string) => void] {
	const [hash, setHash] = useState(() => decodeURIComponent(window.location.hash.slice(1)) || "");
	useEffect(() => {
		const handler = (): void => setHash(decodeURIComponent(window.location.hash.slice(1)) || "");
		window.addEventListener("hashchange", handler);
		return () => window.removeEventListener("hashchange", handler);
	}, []);
	const navigate = (path: string): void => {
		window.location.hash = path;
		setHash(path);
	};
	return [hash, navigate];
}

/* ── Theme ────────────────────────────────────────────────────────── */

type Theme = "hearth-dark" | "hearth-light";

function useTheme(): [Theme, (t: Theme) => void] {
	const [theme, setThemeState] = useState<Theme>(() => {
		const saved = localStorage.getItem("ds-theme");
		return saved === "hearth-dark" ? "hearth-dark" : "hearth-light";
	});

	const setTheme = useCallback((t: Theme) => {
		document.documentElement.setAttribute("data-theme", t);
		localStorage.setItem("ds-theme", t);
		setThemeState(t);
	}, []);

	// Apply on mount
	useEffect(() => {
		document.documentElement.setAttribute("data-theme", theme);
	}, [theme]);

	return [theme, setTheme];
}

/* ── Density ──────────────────────────────────────────────────────── */

type Density = "compact" | "default" | "comfortable";

function useDensity(): [Density, (d: Density) => void] {
	const [density, setDensityState] = useState<Density>(() => {
		const saved = localStorage.getItem("ds-density");
		return saved === "compact" || saved === "comfortable" ? saved : "default";
	});

	const setDensity = useCallback((d: Density) => {
		document.documentElement.setAttribute("data-density", d);
		localStorage.setItem("ds-density", d);
		setDensityState(d);
	}, []);

	useEffect(() => {
		document.documentElement.setAttribute("data-density", density);
	}, [density]);

	return [density, setDensity];
}

/* ── Content wrappers ──────────────────────────────────────────────
 * CatalogWrapper: max-width 960px (matches _catalog.html inline #root style)
 * ComponentWrapper: padding only, no max-width (matches _tokens.css #root)
 */

function CatalogWrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
	return <div style={{ maxWidth: 1024, margin: "0 auto", padding: 24 }}>{children}</div>;
}

function ComponentWrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
	return <div style={{ maxWidth: 1024, margin: "0 auto", padding: 24 }}>{children}</div>;
}

/* ── Story error boundary ─────────────────────────────────────────
 * @lore AJ6: Each story variant is wrapped in an error boundary so a
 * throwing page can't blank the whole catalog. The boundary renders a
 * small fallback tile with a `data-story-error` marker so AC6 tests
 * can assert its presence without coupling to the copy.
 */

interface StoryErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
}

class StoryErrorBoundary extends Component<
	{ children: React.ReactNode; storyTitle: string },
	StoryErrorBoundaryState
> {
	constructor(props: { children: React.ReactNode; storyTitle: string }) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): StoryErrorBoundaryState {
		return { hasError: true, error };
	}

	override render(): React.ReactNode {
		if (this.state.hasError) {
			return (
				<div className="story-error-boundary" data-story-error="true">
					<span>Error rendering story</span>
				</div>
			);
		}
		return this.props.children;
	}
}

/* ── Axis divider ──────────────────────────────────────────────────
 * Rendered once, lazily, before the first non-empty Domain group.
 * Presentational — labels are readable text, not aria-hidden.
 * data-axis-divider attribute used by AC4 tests for detection.
 */
function AxisDivider(): React.JSX.Element {
	return (
		<div className="axis-divider" data-axis-divider="true">
			<span>Reuse vocabulary</span>
			<span className="axis-divider-line" />
			<span>Product areas</span>
		</div>
	);
}

/* ── CatalogGroup section ─────────────────────────────────────────
 * Renamed from CatalogTier. Heading promoted to <h2> for W3 a11y landmark.
 * Class `.tier-heading` kept to avoid churn on viewer.css and snapshots.
 */
function CatalogGroupSection({
	group,
	items,
	onNavigate,
}: {
	group: CatalogGroup;
	items: StoryModule[];
	onNavigate: (name: string) => void;
}): React.JSX.Element {
	return (
		<>
			<h2 className="tier-heading">{group.name}</h2>
			<div className="component-grid">
				{items.map((item) => (
					<button
						key={item.title}
						type="button"
						className="component-link"
						onClick={() => onNavigate(item.title)}
					>
						<div>
							<div className="component-name">{item.title}</div>
							<div className="component-meta">
								{item.variants.length} variant{item.variants.length === 1 ? "" : "s"}
							</div>
							{item.uses.length > 0 && (
								<div className="component-uses">Uses: {item.uses.join(", ")}</div>
							)}
						</div>
					</button>
				))}
			</div>
		</>
	);
}

/* ── Catalog (data-driven) ──────────────────────────────────────── */

export function Catalog({
	modules,
	onNavigate,
}: {
	modules: StoryModule[];
	onNavigate: (name: string) => void;
}): React.JSX.Element {
	// Bucket modules by group name
	const buckets = useMemo(() => {
		const out = new Map<string, StoryModule[]>();
		for (const g of GROUPS) out.set(g.name, []);
		for (const m of modules) {
			const list = out.get(m.group.name);
			if (list) list.push(m);
		}
		// Sort each bucket alphabetically
		for (const list of out.values()) list.sort((a, b) => a.title.localeCompare(b.title));
		return out;
	}, [modules]);

	// Count non-empty groups
	const distinctGroupCount = GROUPS.filter((g) => (buckets.get(g.name)?.length ?? 0) > 0).length;

	const compositionEntries = useMemo(
		() =>
			modules
				.filter((m) => m.uses.length > 0)
				.sort((a, b) => {
					// Sort by GROUPS order first, then alphabetically
					const aIdx = GROUPS.findIndex((g) => g.name === a.group.name);
					const bIdx = GROUPS.findIndex((g) => g.name === b.group.name);
					if (aIdx !== bIdx) return aIdx - bIdx;
					return a.title.localeCompare(b.title);
				}),
		[modules],
	);

	// Render groups in GROUPS order (the ordered registry — never the bucket map).
	// Divider: emitted lazily before the first non-empty Domain group.
	let dividerEmitted = false;

	return (
		<CatalogWrapper>
			<h1 className="catalog-title">HyperIdle Design System</h1>
			<div className="catalog-version">
				{modules.length} entries &middot; {distinctGroupCount} groups &middot; hearth
			</div>

			{GROUPS.map((group) => {
				const items = buckets.get(group.name) ?? [];
				if (items.length === 0) return null;

				// Emit the axis divider lazily before the first non-empty Domain group
				let divider: React.JSX.Element | null = null;
				if (group.kind === "domain" && !dividerEmitted) {
					dividerEmitted = true;
					divider = <AxisDivider key="__axis-divider__" />;
				}

				return (
					<>
						{divider}
						<CatalogGroupSection
							key={group.name}
							group={group}
							items={items}
							onNavigate={onNavigate}
						/>
					</>
				);
			})}

			<div className="composition-section">
				<div className="tier-heading">Composition Graph</div>
				{compositionEntries.length === 0 ? (
					<div className="component-uses">No composition data declared.</div>
				) : (
					<pre className="dep-graph">
						{compositionEntries
							.map((m) => `${m.title.padEnd(20)} → ${m.uses.join(", ")}`)
							.join("\n")}
					</pre>
				)}
			</div>
		</CatalogWrapper>
	);
}

/* ── Component page (TSX mode) ───────────────────────────────────── */

/** Convert PascalCase export name to spaced title: "AllStatusVariants" → "All Status Variants" */
function pascalToTitle(name: string): string {
	return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

/** @lore AJ6: exported for AC6 test isolation — error boundary wraps each variant. */
export function TsxComponentView({
	module,
	storyRootCb,
}: {
	module: StoryModule;
	/**
	 * @lore AJ7: callback ref (NOT a useRef). A callback ref re-renders the parent
	 * when the node attaches; a useRef does not. AnnotationOverlay needs the live
	 * element, so the parent must hold it as STATE — the AJ5 ref.current was null at
	 * the render that mounted the overlay, so arm() early-returned and nothing worked.
	 */
	storyRootCb: (node: HTMLDivElement | null) => void;
}): React.JSX.Element {
	return (
		<ComponentWrapper>
			{/* @lore AJ7: demo-grid is the story root scoped by usePicker's capturing listener.
			    data-variant on each .demo-section feeds per-element variant attribution. */}
			<div ref={storyRootCb} className="demo-grid">
				{module.variants.map((v) => (
					<div key={v.name} className="demo-section" data-variant={v.name}>
						<div className="demo-section-title">{pascalToTitle(v.name)}</div>
						{/* @lore AJ6: error boundary around each story variant so a throwing
						    page story doesn't blank the whole component page (AC6). */}
						<StoryErrorBoundary storyTitle={`${module.title} > ${v.name}`}>
							<v.render />
						</StoryErrorBoundary>
					</div>
				))}
			</div>
		</ComponentWrapper>
	);
}

/* ── Toolbar ─────────────────────────────────────────────────────── */

function Toolbar({
	theme,
	onThemeChange,
	density,
	onDensityChange,
}: {
	theme: Theme;
	onThemeChange: (t: Theme) => void;
	density: Density;
	onDensityChange: (d: Density) => void;
}): React.JSX.Element {
	return (
		<div className="toolbar">
			<div className="toolbar-pill">
				<button
					type="button"
					className={`toolbar-btn ${density === "compact" ? "toolbar-btn--active" : ""}`}
					onClick={() => onDensityChange("compact")}
				>
					Compact
				</button>
				<button
					type="button"
					className={`toolbar-btn ${density === "default" ? "toolbar-btn--active" : ""}`}
					onClick={() => onDensityChange("default")}
				>
					Default
				</button>
				<button
					type="button"
					className={`toolbar-btn ${density === "comfortable" ? "toolbar-btn--active" : ""}`}
					onClick={() => onDensityChange("comfortable")}
				>
					Comfortable
				</button>
			</div>
			<div className="toolbar-pill">
				<button
					type="button"
					className={`toolbar-btn ${theme === "hearth-dark" ? "toolbar-btn--active" : ""}`}
					onClick={() => onThemeChange("hearth-dark")}
				>
					Dark
				</button>
				<button
					type="button"
					className={`toolbar-btn ${theme === "hearth-light" ? "toolbar-btn--active" : ""}`}
					onClick={() => onThemeChange("hearth-light")}
				>
					Light
				</button>
			</div>
		</div>
	);
}

/* ── App ──────────────────────────────────────────────────────────── */

function App(): React.JSX.Element {
	const modules = useMemo(
		() =>
			discoverStories(
				dsStoryGlobs,
				dsKindsStoryGlobs,
				webShellStoryGlobs,
				webComponentStoryGlobs,
				webPageStoryGlobs,
				webNestedPageStoryGlobs,
				webSettingsStoryGlobs,
				webLayoutsStoryGlobs,
			),
		[],
	);
	const [route, navigate] = useHashRoute();
	const [theme, setTheme] = useTheme();
	const [density, setDensity] = useDensity();

	// @lore AJ7: storyRoot is STATE, set via a callback ref, NOT a useRef. The AJ5
	// useRef(null) meant the overlay received null at the mounting render (refs commit
	// after render and don't re-render the parent), so usePicker.arm() early-returned
	// and selection did nothing. The callback ref re-renders App once .demo-grid attaches.
	const [storyRoot, setStoryRoot] = useState<HTMLDivElement | null>(null);
	const storyRootCb = useCallback((node: HTMLDivElement | null) => setStoryRoot(node), []);

	const activeModule = modules.find((m) => m.title === route);
	const isComponentPage = route !== "" && activeModule;

	// Derive the active variant name (first variant of the active module, or empty)
	const activeVariant = activeModule?.variants[0]?.name ?? "";

	return (
		<>
			<Toolbar
				theme={theme}
				onThemeChange={setTheme}
				density={density}
				onDensityChange={setDensity}
			/>
			{isComponentPage ? (
				<TsxComponentView module={activeModule} storyRootCb={storyRootCb} />
			) : (
				<Catalog modules={modules} onNavigate={navigate} />
			)}
			{/* @lore AJ7: AnnotationOverlay is guarded by isComponentPage AND storyRoot — it
			    only mounts on a component page once the live .demo-grid element exists, never
			    on the catalog index, never in story render calls. The storyRoot guard moves
			    here so the overlay always receives a non-null root (AC1 wiring fix). It never
			    enters the snapshot net (which renders stories directly, not App) — AC13. */}
			{isComponentPage && storyRoot && (
				<AnnotationOverlay story={route} variant={activeVariant} storyRoot={storyRoot} />
			)}
		</>
	);
}

/* ── Mount ─────────────────────────────────────────────────────────── */

// @lore AJ6: Guard the createRoot call so the module is importable in vitest
// (which runs in jsdom without the "root" element). The catalog-render.test.tsx
// imports the Catalog named export without triggering the mount.
const rootEl = document.getElementById("root");
if (rootEl) {
	createRoot(rootEl).render(
		<StrictMode>
			<App />
		</StrictMode>,
	);
}
