import { StrictMode, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
	discoverStories,
	type GlobSource,
	type StoryModule,
	TIER_LABELS,
	TIER_ORDER,
	type Tier,
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
 */

const dsStoryGlobs = import.meta.glob<Record<string, unknown>>("../src/*.stories.tsx", {
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
// @lore AD9: page-level stories (e.g. WorkOverview, Conversations) live in
// packages/web/src/pages/*.stories.tsx. They were previously invisible in the
// viewer because only shell/ + components/ were globbed. Added so full-page
// surfaces are reviewable live (the /human-design-review gate needs the painted
// page, not just sub-components).
const webPageStoryGlobs = import.meta.glob<Record<string, unknown>>(
	"../../web/src/pages/*.stories.tsx",
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

/* ── Catalog (data-driven) ──────────────────────────────────────── */

function Catalog({
	modules,
	onNavigate,
}: {
	modules: StoryModule[];
	onNavigate: (name: string) => void;
}): React.JSX.Element {
	const buckets = useMemo(() => {
		const out = new Map<Tier, StoryModule[]>();
		for (const t of TIER_ORDER) out.set(t, []);
		for (const m of modules) out.get(m.tier)?.push(m);
		for (const list of out.values()) list.sort((a, b) => a.title.localeCompare(b.title));
		return out;
	}, [modules]);

	const distinctTierCount = TIER_ORDER.filter((t) => (buckets.get(t)?.length ?? 0) > 0).length;

	const compositionEntries = useMemo(
		() =>
			modules
				.filter((m) => m.uses.length > 0)
				.sort((a, b) => {
					const tierCmp = TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
					if (tierCmp !== 0) return tierCmp;
					return a.title.localeCompare(b.title);
				}),
		[modules],
	);

	return (
		<CatalogWrapper>
			<h1 className="catalog-title">HyperIdle Design System</h1>
			<div className="catalog-version">
				{modules.length} components &middot; {distinctTierCount} tiers &middot; factory-dark
			</div>

			{TIER_ORDER.map((tier) => {
				const items = buckets.get(tier) ?? [];
				if (items.length === 0) return null;
				return (
					<CatalogTier key={tier} label={TIER_LABELS[tier]} items={items} onNavigate={onNavigate} />
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

function CatalogTier({
	label,
	items,
	onNavigate,
}: {
	label: string;
	items: StoryModule[];
	onNavigate: (name: string) => void;
}): React.JSX.Element {
	return (
		<>
			<div className="tier-heading">{label}</div>
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

/* ── Component page (TSX mode) ───────────────────────────────────── */

/** Convert PascalCase export name to spaced title: "AllStatusVariants" → "All Status Variants" */
function pascalToTitle(name: string): string {
	return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

function TsxComponentView({ module }: { module: StoryModule }): React.JSX.Element {
	return (
		<ComponentWrapper>
			<div className="demo-grid">
				{module.variants.map((v) => (
					<div key={v.name} className="demo-section">
						<div className="demo-section-title">{pascalToTitle(v.name)}</div>
						<v.render />
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
			discoverStories(dsStoryGlobs, webShellStoryGlobs, webComponentStoryGlobs, webPageStoryGlobs),
		[],
	);
	const [route, navigate] = useHashRoute();
	const [theme, setTheme] = useTheme();
	const [density, setDensity] = useDensity();

	const activeModule = modules.find((m) => m.title === route);
	const isComponentPage = route !== "" && activeModule;

	return (
		<>
			<Toolbar
				theme={theme}
				onThemeChange={setTheme}
				density={density}
				onDensityChange={setDensity}
			/>
			{isComponentPage ? (
				<TsxComponentView module={activeModule} />
			) : (
				<Catalog modules={modules} onNavigate={navigate} />
			)}
		</>
	);
}

/* ── Mount ─────────────────────────────────────────────────────────── */

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");
createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
