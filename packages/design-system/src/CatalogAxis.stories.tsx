/**
 * AJ6 DESIGN STORY — embodies the grouped-catalog render + the Tier↔Domain
 * axis divider for design review at :8098. Fixture-driven; it does NOT import
 * the not-yet-built `GROUPS`/`StoryModule.group` types (builder's green phase).
 * It paints the exact visual treatment the builder will wire into
 * viewer/main.tsx `Catalog`: group heading + card grid per group, one labeled
 * hairline between the last Tier and the first Domain.
 *
 * Selectors mirror viewer.css (.tier-heading/.component-grid/.component-link).
 * Those classes only load inside the viewer, so this story inlines equivalent
 * styles via tokens so the painted result is faithful even outside the viewer.
 */

const TIER_GROUPS: { name: string; items: string[] }[] = [
	{ name: "Foundation", items: ["Button", "Input", "Avatar", "Toggle", "Checkbox", "Select"] },
	{ name: "Primitives", items: ["StatusChip", "Tag", "NavItem", "LiveDot", "RowDot", "KeyValue"] },
	{ name: "Blocks", items: ["Row", "ItemList", "EmptyState", "ErrorState", "TabBar", "Toast"] },
];

const DOMAIN_GROUPS: { name: string; items: string[] }[] = [
	{ name: "Work", items: ["BetCard", "TaskCard", "Page: Work/Bet", "Page: Work/Overview"] },
	{ name: "Knowledge", items: ["KnowledgeRow", "Page: Knowledge"] },
	{ name: "Conversations", items: ["ThreadRow", "Composer", "ThreadShell", "Page: Conversations"] },
	{ name: "Artifacts", items: ["ArtifactEmbed", "ArtifactPreview", "ArtifactKindBadge"] },
	{ name: "Settings", items: ["ScopePicker", "Settings: Appearance"] },
	{ name: "System", items: ["AppShell", "Sidebar", "TaskSheet", "kind: code", "kind: url"] },
];

const heading: React.CSSProperties = {
	fontFamily: "var(--font-mono)",
	fontSize: "11px",
	fontWeight: 500,
	letterSpacing: "var(--tracking-caps-sm)",
	textTransform: "uppercase",
	color: "var(--text-tertiary)",
	paddingBottom: "9px",
	borderBottom: "1px solid var(--border-default)",
	marginBottom: "12px",
	marginTop: "36px",
};

const grid: React.CSSProperties = {
	display: "grid",
	gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
	gap: "6px",
	marginBottom: "24px",
};

const card: React.CSSProperties = {
	textAlign: "left",
	padding: "12px",
	background: "var(--surface-elevated)",
	borderRadius: "var(--r-subtle)",
	color: "var(--text-primary)",
	boxShadow: "var(--shadow-subtle)",
};

function Group({ name, items }: { name: string; items: string[] }): React.JSX.Element {
	return (
		<>
			<div style={heading}>{name}</div>
			<div style={grid}>
				{items.map((title) => (
					<div key={title} style={card} data-ds-catalog-card>
						<div style={{ fontSize: "14px", fontWeight: 500 }}>{title}</div>
						<div
							style={{
								fontFamily: "var(--font-mono)",
								fontSize: "11px",
								letterSpacing: "var(--tracking-caps-sm)",
								textTransform: "uppercase",
								color: "var(--text-tertiary)",
							}}
						>
							2 variants
						</div>
					</div>
				))}
			</div>
		</>
	);
}

/** The signature: one labeled hairline between the reuse axis and the product axis. */
function AxisDivider(): React.JSX.Element {
	return (
		<div
			data-ds-axis-divider
			style={{
				display: "flex",
				alignItems: "center",
				gap: "12px",
				marginTop: "48px",
				marginBottom: "12px",
				fontFamily: "var(--font-mono)",
				fontSize: "11px",
				letterSpacing: "var(--tracking-caps-sm)",
				textTransform: "uppercase",
				color: "var(--text-tertiary)",
			}}
		>
			<span>Reuse vocabulary</span>
			<span style={{ flex: 1, height: "1px", background: "var(--border-default)" }} />
			<span>Product areas</span>
		</div>
	);
}

export default { title: "Catalog Axis (AJ6 design)", tier: "utility" as const };

export const GroupedCatalog = (): React.JSX.Element => (
	<div style={{ maxWidth: 1024, margin: "0 auto", padding: 24 }}>
		<div
			style={{
				fontFamily: "var(--font-mono)",
				fontSize: "13px",
				fontWeight: 500,
				letterSpacing: "var(--tracking-caps-sm)",
				textTransform: "uppercase",
				marginBottom: "8px",
			}}
		>
			HyperIdle Design System
		</div>
		<div
			style={{
				fontFamily: "var(--font-mono)",
				fontSize: "11px",
				letterSpacing: "var(--tracking-caps-sm)",
				textTransform: "uppercase",
				color: "var(--text-tertiary)",
				marginBottom: "32px",
			}}
		>
			94 entries &middot; 9 groups &middot; hearth
		</div>

		{TIER_GROUPS.map((g) => (
			<Group key={g.name} name={g.name} items={g.items} />
		))}

		<AxisDivider />

		{DOMAIN_GROUPS.map((g) => (
			<Group key={g.name} name={g.name} items={g.items} />
		))}
	</div>
);

/** The divider alone, for close inspection. */
export const Divider = (): React.JSX.Element => (
	<div style={{ maxWidth: 1024, margin: "0 auto", padding: 24 }}>
		<Group name="Blocks" items={["Row", "ItemList", "EmptyState"]} />
		<AxisDivider />
		<Group name="Work" items={["BetCard", "TaskCard"]} />
	</div>
);
