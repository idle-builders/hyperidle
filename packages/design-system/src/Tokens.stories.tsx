/**
 * AJ6 — Token gallery. The rendered visual reference of live Hearth token
 * values. Concept: "reflects, never defines" — tokens.css stays canonical;
 * this paints them via inline `var(--x)` so the browser shows the real value
 * (theme-aware via the viewer's data-theme cascade) and jsdom serializes a
 * stable `var(--x)` string (no getComputedStyle — that returns empty in jsdom).
 */

const label: React.CSSProperties = {
	fontFamily: "var(--font-mono)",
	fontSize: "11px",
	letterSpacing: "var(--tracking-caps-sm)",
	color: "var(--text-secondary)",
	marginTop: "6px",
	display: "block",
};

const tileGrid: React.CSSProperties = {
	display: "grid",
	gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
	gap: "12px",
};

function Swatch({ token }: { token: string }): React.JSX.Element {
	return (
		<div>
			<div
				style={{
					height: "44px",
					borderRadius: "var(--r-subtle)",
					background: `var(${token})`,
					border: "1px solid var(--border-default)",
				}}
			/>
			<span style={label}>
				{token.replace(/^--/, "")} &middot; var({token})
			</span>
		</div>
	);
}

const SURFACE = [
	"--surface-page",
	"--surface-container",
	"--surface-elevated",
	"--surface-overlay",
];
const TEXT = ["--text-primary", "--text-secondary", "--text-tertiary", "--text-placeholder"];
const ACCENT = [
	"--accent-primary",
	"--accent-primary-hover",
	"--accent-secondary",
	"--text-on-accent",
];
const STATUS = ["--status-success", "--status-warning", "--status-error", "--status-info"];
const BORDER = ["--border-subtle", "--border-default", "--border-strong"];

// AJ6: group replaces tier. "Foundation" is correct — the token gallery is the
// entry point to the token system and belongs with other Foundation entries.
export default { title: "Tokens", group: "Foundation" as const };

export const Colors = (): React.JSX.Element => (
	<div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
		{(
			[
				["Surfaces", SURFACE],
				["Text", TEXT],
				["Accent", ACCENT],
				["Status", STATUS],
				["Border", BORDER],
			] as const
		).map(([title, tokens]) => (
			<div key={title}>
				<div style={{ ...label, color: "var(--text-tertiary)", marginTop: 0 }}>{title}</div>
				<div style={tileGrid}>
					{tokens.map((t) => (
						<Swatch key={t} token={t} />
					))}
				</div>
			</div>
		))}
	</div>
);

export const Spacing = (): React.JSX.Element => (
	<div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
		{(
			[
				["--space-1", "3px"],
				["--space-2", "6px"],
				["--space-3", "9px"],
				["--space-4", "12px"],
				["--space-6", "18px"],
				["--space-8", "24px"],
				["--space-12", "36px"],
				["--space-16", "48px"],
			] as const
		).map(([token, px]) => (
			<div key={token} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
				<span style={{ ...label, marginTop: 0, width: "120px" }}>
					{token.replace(/^--/, "")} {px}
				</span>
				<div
					style={{ height: "12px", width: `var(${token})`, background: "var(--accent-primary)" }}
				/>
			</div>
		))}
	</div>
);

export const Radius = (): React.JSX.Element => (
	<div style={{ display: "flex", gap: "18px" }}>
		{(["--r-none", "--r-subtle", "--r-default", "--r-pill"] as const).map((token) => (
			<div key={token}>
				<div
					style={{
						height: "64px",
						width: "64px",
						background: "var(--surface-elevated)",
						border: "1px solid var(--border-strong)",
						borderRadius: `var(${token})`,
					}}
				/>
				<span style={label}>{token.replace(/^--/, "")}</span>
			</div>
		))}
	</div>
);

export const TypeScale = (): React.JSX.Element => (
	<div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
		{(
			[
				["--text-xs", "12px"],
				["--text-sm", "13px"],
				["--text-base", "15px"],
				["--text-lg", "17px"],
				["--text-xl", "20px"],
				["--text-2xl", "24px"],
				["--text-3xl", "30px"],
			] as const
		).map(([token, px]) => (
			<div key={token} style={{ fontSize: `var(${token})`, color: "var(--text-primary)" }}>
				{token.replace(/^--/, "")} {px} — The quick brown fox
			</div>
		))}
		<div style={{ display: "flex", gap: "18px", marginTop: "12px" }}>
			{(
				[
					["--fw-normal", 400],
					["--fw-medium", 500],
					["--fw-semibold", 600],
					["--fw-bold", 700],
				] as const
			).map(([token, w]) => (
				<span key={token} style={{ fontWeight: w, fontSize: "15px" }}>
					{token.replace(/^--/, "")}
				</span>
			))}
		</div>
	</div>
);

export const Motion = (): React.JSX.Element => (
	<div style={{ display: "flex", gap: "18px" }}>
		{(["--motion-fast", "--motion-default", "--motion-slow"] as const).map((token) => (
			<div key={token}>
				{/* biome-ignore lint/a11y/noStaticElementInteractions: motion demo — pointer-only interaction for visual token preview; no keyboard behavior needed */}
				<div
					style={{
						height: "44px",
						width: "120px",
						background: "var(--accent-primary)",
						borderRadius: "var(--r-subtle)",
						transition: `transform var(${token}) var(--motion-ease)`,
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.transform = "translateX(48px)";
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.transform = "translateX(0)";
					}}
				/>
				<span style={label}>{token.replace(/^--/, "")} (hover)</span>
			</div>
		))}
	</div>
);

export const Shadows = (): React.JSX.Element => (
	<div style={{ display: "flex", gap: "24px", padding: "12px" }}>
		{(["--shadow-subtle", "--shadow-default", "--shadow-elevated"] as const).map((token) => (
			<div key={token}>
				<div
					style={{
						height: "64px",
						width: "120px",
						background: "var(--surface-elevated)",
						borderRadius: "var(--r-subtle)",
						boxShadow: `var(${token})`,
					}}
				/>
				<span style={label}>{token.replace(/^--/, "")}</span>
			</div>
		))}
	</div>
);

export const Borders = (): React.JSX.Element => (
	<div style={{ display: "flex", gap: "18px" }}>
		{(["--bw-thin", "--bw-default", "--bw-strong"] as const).map((token) => (
			<div key={token}>
				<div
					style={{
						height: "64px",
						width: "120px",
						background: "var(--surface-elevated)",
						borderRadius: "var(--r-subtle)",
						border: `var(${token}) solid var(--border-strong)`,
					}}
				/>
				<span style={label}>{token.replace(/^--/, "")}</span>
			</div>
		))}
	</div>
);
