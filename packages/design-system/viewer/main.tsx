import {
	type ComponentType,
	StrictMode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createRoot } from "react-dom/client";
import "./viewer.css";

/* ── Story discovery ─────────────────────────────────────────────── */

interface StoryMeta {
	title: string;
	/** Explicit variant order matching the HTML demo section order. */
	order?: string[];
}
interface StoryEntry {
	name: string;
	render: ComponentType;
}
interface StoryModule {
	title: string;
	variants: StoryEntry[];
}

const storyGlobs = import.meta.glob<Record<string, unknown>>("../src/*.stories.tsx", {
	eager: true,
});

function discoverStories(): StoryModule[] {
	const modules: StoryModule[] = [];
	for (const mod of Object.values(storyGlobs)) {
		const meta = mod.default as StoryMeta | undefined;
		if (!meta?.title) continue;
		const variants: StoryEntry[] = [];
		for (const [key, value] of Object.entries(mod)) {
			if (key === "default") continue;
			if (typeof value === "function") {
				variants.push({ name: key, render: value as ComponentType });
			}
		}
		if (variants.length > 0) {
			// Sort variants to match the explicit order from story meta (mirrors HTML demo section order)
			const order = (meta as StoryMeta).order;
			if (order) {
				const orderMap = new Map(order.map((name, i) => [name, i]));
				variants.sort((a, b) => (orderMap.get(a.name) ?? 999) - (orderMap.get(b.name) ?? 999));
			}
			modules.push({ title: meta.title, variants });
		}
	}
	return modules.sort((a, b) => a.title.localeCompare(b.title));
}

/* ── Routing (hash-based, no deps) ───────────────────────────────── */

function useHashRoute(): [string, (path: string) => void] {
	const [hash, setHash] = useState(() => decodeURIComponent(window.location.hash.slice(1)) || "");
	useState(() => {
		const handler = (): void => setHash(decodeURIComponent(window.location.hash.slice(1)) || "");
		window.addEventListener("hashchange", handler);
		return () => window.removeEventListener("hashchange", handler);
	});
	const navigate = (path: string): void => {
		window.location.hash = path;
		setHash(path);
	};
	return [hash, navigate];
}

/* ── Theme ────────────────────────────────────────────────────────── */

type Theme = "lucid-dark" | "lucid-light";

function useTheme(): [Theme, (t: Theme) => void] {
	const [theme, setThemeState] = useState<Theme>(() => {
		const saved = localStorage.getItem("ds-theme");
		return saved === "lucid-light" ? "lucid-light" : "lucid-dark";
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

/* ── Content wrappers ─────────────────────────────────────────────
 * CatalogWrapper: max-width 960px (matches _catalog.html inline #root style)
 * ComponentWrapper: padding only, no max-width (matches _tokens.css #root)
 */

function CatalogWrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
	return <div style={{ maxWidth: 1024, margin: "0 auto", padding: 24 }}>{children}</div>;
}

function ComponentWrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
	return <div style={{ maxWidth: 1024, margin: "0 auto", padding: 24 }}>{children}</div>;
}

/* ── Catalog (same layout as _catalog.html) ──────────────────────── */

interface CatalogEntry {
	name: string;
	meta: string;
	uses: string;
}

const TIER1: CatalogEntry[] = [
	{
		name: "StatusChip",
		meta: "6 states",
		uses: "Used by: ThreadRow, BetCard, PitchCard, TaskCard, KnowledgeRow, NotificationRow, Rail",
	},
	{
		name: "Tag",
		meta: "plain + 3 kinds",
		uses: "Used by: ThreadRow, BetCard, PitchCard, TaskCard, KnowledgeRow, NotificationRow",
	},
	{
		name: "KeyValue",
		meta: "inline / stacked",
		uses: "Used by: BetCard, PitchCard, TaskCard, Rail",
	},
	{
		name: "NavItem",
		meta: "icon + label + count",
		uses: "Used by: IconRail, Submenu",
	},
	{
		name: "SearchField",
		meta: "input + kbd hint",
		uses: "Used by: Submenu, GlobalSearchPanel, PitchSelector",
	},
];

const TIER2: CatalogEntry[] = [
	{ name: "ThreadRow", meta: "avatar + title + status", uses: "Uses: StatusChip, Tag" },
	{ name: "BetCard", meta: "product + progress", uses: "Uses: StatusChip, Tag, KeyValue" },
	{ name: "PitchCard", meta: "kind + appetite", uses: "Uses: StatusChip, Tag, KeyValue" },
	{ name: "TaskCard", meta: "status + owner", uses: "Uses: StatusChip, Tag, KeyValue" },
	{ name: "KnowledgeRow", meta: "layer + category", uses: "Uses: StatusChip, Tag" },
	{ name: "NotificationRow", meta: "severity + action", uses: "Uses: StatusChip, Tag" },
];

const UTILITY: CatalogEntry[] = [
	{ name: "EmptyState", meta: "title + description", uses: "" },
	{ name: "ErrorState", meta: "alert + retry", uses: "" },
	{ name: "Skeleton", meta: "list + card shapes", uses: "" },
];

function Catalog({ onNavigate }: { onNavigate: (name: string) => void }): React.JSX.Element {
	return (
		<CatalogWrapper>
			<h1 className="catalog-title">HyperIdle Design System</h1>
			<div className="catalog-version">14 components &middot; 3 tiers &middot; factory-dark</div>

			<CatalogTier label="Tier 1 — Primitives" items={TIER1} onNavigate={onNavigate} />
			<CatalogTier label="Tier 2 — Blocks" items={TIER2} onNavigate={onNavigate} />
			<CatalogTier label="Utility" items={UTILITY} onNavigate={onNavigate} />

			<div className="composition-section">
				<div className="tier-heading">Composition Graph</div>
				<pre className="dep-graph">
					{`TIER 3 (shell)    → TIER 2 (blocks) → TIER 1 (primitives)

Canvas         → BetCard         → StatusChip, Tag, KeyValue
Kanban         → TaskCard        → StatusChip, Tag, KeyValue
PitchSelector  → PitchCard       → StatusChip, Tag, KeyValue
Submenu        → ThreadRow       → StatusChip, Tag
Rail           → NotificationRow → StatusChip, Tag
Submenu        → SearchField
Rail           → KeyValue, StatusChip`}
				</pre>
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
	items: CatalogEntry[];
	onNavigate: (name: string) => void;
}): React.JSX.Element {
	return (
		<>
			<div className="tier-heading">{label}</div>
			<div className="component-grid">
				{items.map((item) => (
					<button
						key={item.name}
						type="button"
						className="component-link"
						onClick={() => onNavigate(item.name)}
					>
						<div>
							<div className="component-name">{item.name}</div>
							<div className="component-meta">{item.meta}</div>
							{item.uses && <div className="component-uses">{item.uses}</div>}
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

/* ── Component page (HTML mode — iframe) ─────────────────────────── */

function HtmlComponentView({ name, theme }: { name: string; theme: Theme }): React.JSX.Element {
	const iframeRef = useRef<HTMLIFrameElement>(null);

	// Sync theme into iframe by setting data-theme on its <html> and toggling
	// the theme switcher CSS files. We also hide the iframe's own theme
	// switcher since the parent toolbar controls it.
	useEffect(() => {
		const iframe = iframeRef.current;
		if (!iframe) return;
		const trySync = (): void => {
			try {
				const doc = iframe.contentDocument;
				if (!doc) return;
				doc.documentElement.setAttribute("data-theme", theme);
				// Toggle the theme CSS files the _switcher.js created
				for (const link of doc.querySelectorAll<HTMLLinkElement>("link[data-theme]")) {
					link.disabled = link.dataset.theme !== theme;
				}
				// Hide the iframe's own theme switcher
				const switcher = doc.getElementById("__theme-switcher");
				if (switcher) switcher.style.display = "none";
			} catch {
				// cross-origin — can't access iframe content
			}
		};
		iframe.addEventListener("load", trySync);
		trySync();
		return () => iframe.removeEventListener("load", trySync);
	}, [theme]);

	return (
		<iframe
			ref={iframeRef}
			key={name}
			src={`/${name}.html`}
			title={`${name} — HTML`}
			style={{
				width: "100%",
				height: "calc(100vh - 48px)",
				border: "none",
				background: "var(--surface-0)",
				display: "block",
			}}
		/>
	);
}

/* ── Toolbar ─────────────────────────────────────────────────────── */

type RenderMode = "html" | "tsx";

function Toolbar({
	mode,
	onModeChange,
	showModeToggle,
	theme,
	onThemeChange,
}: {
	mode: RenderMode;
	onModeChange: (m: RenderMode) => void;
	showModeToggle: boolean;
	theme: Theme;
	onThemeChange: (t: Theme) => void;
}): React.JSX.Element {
	return (
		<div className="toolbar">
			{showModeToggle && (
				<div className="toolbar-pill">
					<button
						type="button"
						className={`toolbar-btn ${mode === "html" ? "toolbar-btn--active" : ""}`}
						onClick={() => onModeChange("html")}
					>
						HTML
					</button>
					<button
						type="button"
						className={`toolbar-btn ${mode === "tsx" ? "toolbar-btn--active" : ""}`}
						onClick={() => onModeChange("tsx")}
					>
						TSX
					</button>
				</div>
			)}
			<div className="toolbar-pill">
				<button
					type="button"
					className={`toolbar-btn ${theme === "lucid-dark" ? "toolbar-btn--active" : ""}`}
					onClick={() => onThemeChange("lucid-dark")}
				>
					Dark
				</button>
				<button
					type="button"
					className={`toolbar-btn ${theme === "lucid-light" ? "toolbar-btn--active" : ""}`}
					onClick={() => onThemeChange("lucid-light")}
				>
					Light
				</button>
			</div>
		</div>
	);
}

/* ── App ──────────────────────────────────────────────────────────── */

function App(): React.JSX.Element {
	const modules = useMemo(discoverStories, []);
	const [route, navigate] = useHashRoute();
	const [mode, setMode] = useState<RenderMode>("html");
	const [theme, setTheme] = useTheme();

	const activeModule = modules.find((m) => m.title === route);
	const isComponentPage = route !== "" && activeModule;

	return (
		<>
			<Toolbar
				mode={mode}
				onModeChange={setMode}
				showModeToggle={!!isComponentPage}
				theme={theme}
				onThemeChange={setTheme}
			/>
			{isComponentPage ? (
				mode === "tsx" ? (
					<TsxComponentView module={activeModule} />
				) : (
					<HtmlComponentView name={activeModule.title} theme={theme} />
				)
			) : (
				<Catalog onNavigate={navigate} />
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
