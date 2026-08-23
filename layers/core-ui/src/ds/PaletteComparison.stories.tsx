/**
 * CP1 — Hearth palette refinement comparison.
 *
 * Variants (live viewer: `npm run ds:serve`, :8098 · Foundation → "Palette Comparison"):
 *  - LayeredBothModes  — ROUND-2 PRIMARY. The real surface nesting (page →
 *      container → elevated → overlay) both modes side by side. This is the
 *      "can I tell the surfaces apart?" view the founder asked for in round 1.
 *  - NewPaletteBothModes — full panel per mode: the layered nesting, the surface
 *      ladder, the text ramp on each surface, accent + status chips, a composed card.
 *  - BeforeAfterSwatches — literal round-1 (left half) vs round-2 (right half)
 *      hex board, theme-independent, for "see exactly what moved this round".
 *
 * The "live" surfaces paint tokens via `var(--x)` so they always reflect
 * tokens.css; the before/after board hardcodes hexes for an honest diff. Each
 * top-level story self-scopes its theme with an inner `data-theme` wrapper so
 * both modes show regardless of the viewer's Dark/Light toggle. This is a
 * design-comparison artifact, not a production surface.
 */

import type { JSX } from "react";

export default { title: "Palette Comparison", group: "Foundation" as const };

// ── Round-1 (PREVIOUS) literal values, for side-by-side reference only ──
// The before/after board now diffs round-1 → round-2 (the live tokens), since
// round-1 is what the founder saw and gave feedback on. Original pre-CP1 hexes
// are documented in design-proposal.md §2 for the full history.
const OLD = {
	dark: {
		surfacePage: "#12100e",
		surfaceContainer: "#1c1917",
		surfaceElevated: "#25221f",
		surfaceOverlay: "#312d2a",
		textPrimary: "#ebe5e0",
		textSecondary: "#a79e97",
		textTertiary: "#938c87",
		textPlaceholder: "#5b5551",
		borderSubtle: "#312d2a",
		borderDefault: "#403c39",
		borderStrong: "#595450",
	},
	light: {
		surfacePage: "#f5f0e6",
		surfaceContainer: "#f0ece5",
		surfaceElevated: "#ffffff",
		textPrimary: "#2c241a",
		textSecondary: "#675f56",
		textTertiary: "#958e85",
		textPlaceholder: "#bcb7ae",
		borderSubtle: "#e8e4dd",
		borderDefault: "#d8d4cb",
		borderStrong: "#bab3a6",
	},
} as const;

const mono: React.CSSProperties = {
	fontFamily: "var(--font-mono)",
	fontSize: "10px",
	letterSpacing: "0.02em",
	lineHeight: 1.5,
};

const capLabel: React.CSSProperties = {
	fontFamily: "var(--font-sans)",
	fontSize: "11px",
	fontWeight: 600,
	letterSpacing: "var(--tracking-caps-sm)",
	textTransform: "uppercase",
	color: "var(--text-tertiary)",
	marginBottom: "10px",
	display: "block",
};

function Swatch({
	color,
	name,
	hex,
	textOn,
}: {
	color: string;
	name: string;
	hex: string;
	textOn?: string;
}): JSX.Element {
	return (
		<div style={{ minWidth: 0 }}>
			<div
				style={{
					height: "52px",
					borderRadius: "var(--r-subtle)",
					background: color,
					border: "1px solid var(--border-default)",
					display: "flex",
					alignItems: "flex-end",
					padding: "5px 7px",
				}}
			>
				{textOn ? <span style={{ ...mono, color: textOn, fontSize: "11px" }}>Aa</span> : null}
			</div>
			<span style={{ ...mono, color: "var(--text-tertiary)", marginTop: "5px", display: "block" }}>
				{name}
			</span>
			<span style={{ ...mono, color: "var(--text-placeholder)", display: "block" }}>{hex}</span>
		</div>
	);
}

function SwatchRow({ children }: { children: React.ReactNode }): JSX.Element {
	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: "repeat(4, 1fr)",
				gap: "10px",
			}}
		>
			{children}
		</div>
	);
}

// ── Text ramp painted on a given surface ──
function TextRamp({ surface, surfaceName }: { surface: string; surfaceName: string }): JSX.Element {
	return (
		<div
			style={{
				background: surface,
				borderRadius: "var(--r-default)",
				border: "1px solid var(--border-default)",
				padding: "14px 16px",
			}}
		>
			<span
				style={{ ...mono, color: "var(--text-tertiary)", display: "block", marginBottom: "8px" }}
			>
				on {surfaceName}
			</span>
			<div style={{ fontFamily: "var(--font-sans)", fontSize: "14px", lineHeight: 1.55 }}>
				<div style={{ color: "var(--text-primary)", fontWeight: 600 }}>
					Primary — titles, values, active nav
				</div>
				<div style={{ color: "var(--text-secondary)" }}>
					Secondary — body copy, descriptions, the bulk of running text in a paragraph.
				</div>
				<div style={{ color: "var(--text-tertiary)" }}>
					Tertiary — timestamps, IDs, quiet metadata 14:32 · #a91f
				</div>
				<div style={{ color: "var(--text-placeholder)" }}>Placeholder — empty field hint…</div>
			</div>
		</div>
	);
}

function Chip({ bg, fg, label }: { bg: string; fg: string; label: string }): JSX.Element {
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: "6px",
				background: bg,
				color: fg,
				borderRadius: "var(--r-pill)",
				padding: "4px 11px",
				fontFamily: "var(--font-sans)",
				fontSize: "12px",
				fontWeight: 500,
			}}
		>
			<span
				style={{
					width: "7px",
					height: "7px",
					borderRadius: "var(--r-pill)",
					background: fg,
				}}
			/>
			{label}
		</span>
	);
}

// ── Representative composed card ──
function SampleCard(): JSX.Element {
	return (
		<div
			style={{
				background: "var(--surface-elevated)",
				borderRadius: "var(--r-default)",
				boxShadow: "var(--shadow-default)",
				border: "1px solid var(--border-subtle)",
				padding: "16px 18px",
				maxWidth: "340px",
			}}
		>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
				<span
					style={{
						fontFamily: "var(--font-sans)",
						fontSize: "15px",
						fontWeight: 600,
						color: "var(--text-primary)",
					}}
				>
					Reduce onboarding drop-off
				</span>
				<span style={{ ...mono, color: "var(--text-tertiary)", fontSize: "11px" }}>2d left</span>
			</div>
			<p
				style={{
					fontFamily: "var(--font-sans)",
					fontSize: "13px",
					lineHeight: 1.55,
					color: "var(--text-secondary)",
					margin: "8px 0 12px",
				}}
			>
				Cut the steps between signup and first agent run. Measure activation at day-1 and day-7
				against the current baseline.
			</p>
			<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
				<button
					type="button"
					style={{
						background: "var(--accent-primary)",
						color: "var(--text-on-accent)",
						border: "none",
						borderRadius: "var(--r-pill)",
						padding: "7px 16px",
						fontFamily: "var(--font-sans)",
						fontSize: "13px",
						fontWeight: 600,
						cursor: "pointer",
					}}
				>
					Approve
				</button>
				<button
					type="button"
					style={{
						background: "transparent",
						color: "var(--text-secondary)",
						border: "1px solid var(--border-default)",
						borderRadius: "var(--r-pill)",
						padding: "7px 16px",
						fontFamily: "var(--font-sans)",
						fontSize: "13px",
						fontWeight: 500,
						cursor: "pointer",
					}}
				>
					Snooze
				</button>
				<span style={{ ...mono, color: "var(--text-tertiary)", marginLeft: "auto" }}>$1.2k</span>
			</div>
		</div>
	);
}

// ── Layered surface nesting (the primary "can I tell them apart?" surface) ──
// Renders the real stacking order: page bg → container panel on it → elevated
// card on the container → overlay popover floating above. Each layer is labelled
// with its token + a one-line text ramp so inter-surface separation is judged in
// context, exactly as it appears in the running app. Uses LIVE tokens.
function SurfaceLabel({ name }: { name: string }): JSX.Element {
	return (
		<div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "8px" }}>
			<span
				style={{
					fontFamily: "var(--font-sans)",
					fontSize: "11px",
					fontWeight: 600,
					letterSpacing: "var(--tracking-caps-sm)",
					textTransform: "uppercase",
					color: "var(--text-secondary)",
				}}
			>
				{name}
			</span>
			<span style={{ ...mono, color: "var(--text-tertiary)", fontSize: "10px" }}>
				var(--surface-{name})
			</span>
		</div>
	);
}

// One line of the full text ramp, to prove text legibility on each layer.
function RampLine(): JSX.Element {
	return (
		<div style={{ fontFamily: "var(--font-sans)", fontSize: "13px", lineHeight: 1.5 }}>
			<span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Primary</span>
			<span style={{ color: "var(--text-secondary)" }}> · secondary body copy</span>
			<span style={{ color: "var(--text-tertiary)" }}> · tertiary 14:32 #a91f</span>
		</div>
	);
}

function LayeredSurfaces(): JSX.Element {
	return (
		// page
		<div
			style={{
				background: "var(--surface-page)",
				borderRadius: "var(--r-default)",
				border: "1px solid var(--border-subtle)",
				padding: "16px",
			}}
		>
			<SurfaceLabel name="page" />
			<RampLine />

			{/* container panel sitting on the page */}
			<div
				style={{
					background: "var(--surface-container)",
					borderRadius: "var(--r-default)",
					border: "1px solid var(--border-subtle)",
					padding: "16px",
					marginTop: "14px",
				}}
			>
				<SurfaceLabel name="container" />
				<RampLine />

				{/* elevated card sitting on the container */}
				<div
					style={{
						position: "relative",
						background: "var(--surface-elevated)",
						borderRadius: "var(--r-default)",
						border: "1px solid var(--border-subtle)",
						boxShadow: "var(--shadow-default)",
						padding: "16px",
						marginTop: "14px",
					}}
				>
					<SurfaceLabel name="elevated" />
					<RampLine />

					{/* overlay popover floating above the card */}
					<div
						style={{
							position: "absolute",
							right: "12px",
							bottom: "-26px",
							width: "210px",
							background: "var(--surface-overlay)",
							borderRadius: "var(--r-default)",
							border: "1px solid var(--border-default)",
							boxShadow: "var(--shadow-elevated)",
							padding: "12px 14px",
						}}
					>
						<SurfaceLabel name="overlay" />
						<RampLine />
					</div>
				</div>
				{/* spacer to make room for the overhanging overlay */}
				<div style={{ height: "20px" }} />
			</div>
		</div>
	);
}

// ── One full mode panel (uses LIVE tokens; theme set by wrapper) ──
function ModePanel(): JSX.Element {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
			<div>
				<span style={capLabel}>Layered surfaces (live · the real nesting)</span>
				<LayeredSurfaces />
			</div>

			<div>
				<span style={capLabel}>Surface ladder (live)</span>
				<SwatchRow>
					<Swatch color="var(--surface-page)" name="page" hex="" textOn="var(--text-primary)" />
					<Swatch
						color="var(--surface-container)"
						name="container"
						hex=""
						textOn="var(--text-primary)"
					/>
					<Swatch
						color="var(--surface-elevated)"
						name="elevated"
						hex=""
						textOn="var(--text-primary)"
					/>
					<Swatch
						color="var(--surface-overlay)"
						name="overlay"
						hex=""
						textOn="var(--text-primary)"
					/>
				</SwatchRow>
			</div>

			<div>
				<span style={capLabel}>Text ramp on each surface (live)</span>
				<div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
					<TextRamp surface="var(--surface-page)" surfaceName="page" />
					<TextRamp surface="var(--surface-container)" surfaceName="container" />
					<TextRamp surface="var(--surface-elevated)" surfaceName="elevated" />
				</div>
			</div>

			<div>
				<span style={capLabel}>Accent + status</span>
				<div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
					<Chip bg="var(--accent-primary-dim)" fg="var(--accent-primary)" label="Forest" />
					<Chip bg="var(--accent-secondary-dim)" fg="var(--accent-secondary)" label="Amber" />
					<Chip bg="var(--accent-primary-dim)" fg="var(--status-success)" label="Success" />
					<Chip bg="var(--status-error-dim)" fg="var(--status-error)" label="Error" />
					<Chip bg="var(--status-info-dim)" fg="var(--status-info)" label="Info" />
				</div>
			</div>

			<div>
				<span style={capLabel}>Composed card</span>
				<SampleCard />
			</div>
		</div>
	);
}

function ModeFrame({
	theme,
	title,
}: {
	theme: "hearth-light" | "hearth-dark";
	title: string;
}): JSX.Element {
	return (
		<div
			data-theme={theme}
			style={{
				background: "var(--surface-page)",
				color: "var(--text-primary)",
				padding: "22px",
				borderRadius: "var(--r-default)",
				border: "1px solid var(--border-strong)",
				flex: "1 1 420px",
				minWidth: "380px",
			}}
		>
			<h2
				style={{
					fontFamily: "var(--font-sans)",
					fontSize: "13px",
					fontWeight: 700,
					letterSpacing: "var(--tracking-caps)",
					textTransform: "uppercase",
					color: "var(--text-secondary)",
					margin: "0 0 18px",
				}}
			>
				{title}
			</h2>
			<ModePanel />
		</div>
	);
}

/**
 * Both modes side by side, each painting the LIVE (post-CP1) tokens. Toggle
 * nothing — both are always visible. This is the primary "is it right?" surface.
 */
export function NewPaletteBothModes(): JSX.Element {
	return (
		<div
			style={{
				display: "flex",
				flexWrap: "wrap",
				gap: "20px",
				padding: "20px",
				background: "#888",
			}}
		>
			<ModeFrame theme="hearth-light" title="Hearth Light — new" />
			<ModeFrame theme="hearth-dark" title="Hearth Dark — new" />
		</div>
	);
}

/**
 * Round-2 PRIMARY surface: just the layered nesting (page → container → elevated
 * → overlay), both modes side by side, rendered large. This is the "can I tell
 * the surfaces apart?" view the founder asked for in round 1 ("I would need to
 * see this layered"). Each layer is labelled with its token and carries a text
 * ramp so both surface-separation and text legibility are judged in context.
 */
export function LayeredBothModes(): JSX.Element {
	return (
		<div
			style={{
				display: "flex",
				flexWrap: "wrap",
				gap: "24px",
				padding: "24px",
				background: "#888",
			}}
		>
			{(["hearth-light", "hearth-dark"] as const).map((theme) => (
				<div
					key={theme}
					data-theme={theme}
					style={{
						flex: "1 1 360px",
						minWidth: "340px",
						background: "var(--surface-page)",
						borderRadius: "var(--r-default)",
						border: "1px solid var(--border-strong)",
						padding: "20px",
					}}
				>
					<h2
						style={{
							fontFamily: "var(--font-sans)",
							fontSize: "13px",
							fontWeight: 700,
							letterSpacing: "var(--tracking-caps)",
							textTransform: "uppercase",
							color: "var(--text-secondary)",
							margin: "0 0 16px",
						}}
					>
						{theme === "hearth-light" ? "Hearth Light — layered" : "Hearth Dark — layered"}
					</h2>
					<LayeredSurfaces />
				</div>
			))}
		</div>
	);
}

// ── OLD-vs-NEW literal board (no theme dependence — hardcoded hexes) ──
function BeforeAfterPair({
	label,
	oldHex,
	newHex,
}: {
	label: string;
	oldHex: string;
	newHex: string;
}): JSX.Element {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
			<div style={{ display: "flex", gap: "0" }}>
				<div
					style={{
						width: "44px",
						height: "44px",
						background: oldHex,
						borderRadius: "var(--r-subtle) 0 0 var(--r-subtle)",
						border: "1px solid var(--border-default)",
						borderRight: "none",
					}}
				/>
				<div
					style={{
						width: "44px",
						height: "44px",
						background: newHex,
						borderRadius: "0 var(--r-subtle) var(--r-subtle) 0",
						border: "1px solid var(--border-default)",
					}}
				/>
			</div>
			<div style={{ minWidth: 0 }}>
				<span style={{ ...mono, color: "var(--text-secondary)", display: "block" }}>{label}</span>
				<span style={{ ...mono, color: "var(--text-placeholder)", display: "block" }}>
					{oldHex} → {newHex}
				</span>
			</div>
		</div>
	);
}

function BeforeAfterColumn({
	title,
	pairs,
}: {
	title: string;
	pairs: Array<[string, string, string]>;
}): JSX.Element {
	return (
		<div style={{ flex: "1 1 280px", minWidth: "260px" }}>
			<span style={capLabel}>{title}</span>
			<div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
				{pairs.map(([label, oldHex, newHex]) => (
					<BeforeAfterPair key={label} label={label} oldHex={oldHex} newHex={newHex} />
				))}
			</div>
		</div>
	);
}

/**
 * Literal round-1 (left half of each pill) vs round-2 (right half) swatch board.
 * Hex values are hardcoded so the diff is honest and theme-independent — this is
 * the "see exactly what moved this round" surface. ↑ marks a token lifted in
 * round-2; (kept) marks one held from round-1.
 */
export function BeforeAfterSwatches(): JSX.Element {
	return (
		<div
			data-theme="hearth-light"
			style={{
				background: "var(--surface-page)",
				color: "var(--text-primary)",
				padding: "24px",
				display: "flex",
				flexWrap: "wrap",
				gap: "32px",
			}}
		>
			<BeforeAfterColumn
				title="Dark surfaces  (r1 | r2)"
				pairs={[
					["page (kept)", OLD.dark.surfacePage, "#12100e"],
					["container ↑step", OLD.dark.surfaceContainer, "#24211f"],
					["elevated ↑", OLD.dark.surfaceElevated, "#302d2a"],
					["overlay ↑", OLD.dark.surfaceOverlay, "#3d3a37"],
				]}
			/>
			<BeforeAfterColumn
				title="Dark text + border  (r1 | r2)"
				pairs={[
					["text-primary", OLD.dark.textPrimary, "#ece7e2"],
					["text-secondary ↑", OLD.dark.textSecondary, "#bcb4ae"],
					["text-tertiary ↑", OLD.dark.textTertiary, "#ada6a0"],
					["text-placeholder", OLD.dark.textPlaceholder, "#46413d"],
					["border-default", OLD.dark.borderDefault, "#433f3b"],
					["border-strong", OLD.dark.borderStrong, "#5f5a55"],
				]}
			/>
			<BeforeAfterColumn
				title="Light surface + border  (r1 | r2)"
				pairs={[
					["page ↑bright", OLD.light.surfacePage, "#fbf7f2"],
					["container ↑bright", OLD.light.surfaceContainer, "#f5f0eb"],
					["border-subtle", OLD.light.borderSubtle, "#ece7e2"],
					["border-default", OLD.light.borderDefault, "#ddd6cf"],
					["border-strong", OLD.light.borderStrong, "#c1b9b0"],
				]}
			/>
			<BeforeAfterColumn
				title="Light text  (r1 | r2 — kept)"
				pairs={[
					["text-primary (kept)", OLD.light.textPrimary, "#2c241a"],
					["text-secondary (kept)", OLD.light.textSecondary, "#675f56"],
					["text-tertiary (kept)", OLD.light.textTertiary, "#958e85"],
					["text-placeholder (kept)", OLD.light.textPlaceholder, "#bcb7ae"],
				]}
			/>
		</div>
	);
}
