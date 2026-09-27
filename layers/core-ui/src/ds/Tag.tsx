import type { JSX } from "react";
import { dsProps } from "./ds-attrs";
import { TAG_KIND_ICONS, type TagKind } from "./tag-kinds";

export interface TagProps {
	label: string;
	/** Optional Tier-2 kind. When omitted, renders the legacy neutral chip. */
	kind?: TagKind;
	/**
	 * `"neutral"` (default) is the muted gray pill. `"accent"` is an
	 * uppercase, accent-tinted badge (bg-accent-primary-dim, text-accent-deep)
	 * — for a chip that names something distinctive (a source kind, a count,
	 * a role) rather than a plain inline label. `"solid"` is a solid
	 * accent-fill badge (bg-accent-primary, text-on-accent) — the attention
	 * signal for an unread/blocking count, where the tinted `"accent"` look
	 * reads as too quiet. Only applies when `kind` is omitted — a kind-tagged
	 * chip keeps its own tint.
	 */
	tone?: "neutral" | "accent" | "solid";
}

/**
 * @lore Tag styling matches the HTML reference in framework/design-system/html/Tag.html.
 * Uses custom Tailwind classes instead of DaisyUI badge so the TSX and HTML
 * renderings are pixel-identical.
 *
 * @lore All spacing/radius values use explicit pixel units (not rem-based
 * Tailwind utilities like gap-1, px-2, py-0.5, rounded-lg) because the
 * design-system viewer sets html { font-size: 14px }, which makes 1rem=14px.
 * Tailwind rem classes would compute to wrong values (e.g. gap-1=3.5px
 * instead of 4px, px-2=7px instead of 8px, rounded-lg=7px instead of 8px).
 *
 * @lore K10 / K11: badge-as-callout — every axis stays literal, same
 * rationale as StatusChip. Free-form labels make the case stronger: long
 * labels would visually swell at comfortable and break the ThreadRow
 * inline flow. The `design/no-density-tokens` lint rule treats Tag as
 * density-static. See framework/design-system/research/density-audit.md
 * § 3.1.2.
 */
const TAG_BASE =
	"inline-flex items-center gap-[4px] px-[8px] py-[2px] rounded-[var(--r-pill)] whitespace-nowrap border-none";

export function Tag({ label, kind, tone = "neutral" }: TagProps): JSX.Element {
	// @lore J1 review: defensive guard — if a caller passes an arbitrary
	// string typed as `TagKind` (e.g. `kind={item.kind as TagKind}` for a
	// document kind not in the Tier-2 set), `meta` would be undefined
	// and the render path would crash on `meta.tintClass`. Fall back to the
	// neutral chip in that case so the page stays up.
	const meta = kind ? TAG_KIND_ICONS[kind] : undefined;
	if (!meta) {
		if (tone === "accent") {
			return (
				<span
					{...dsProps("Tag", "1")}
					data-spacing-role="compact-pill"
					className={`type-label ${`${TAG_BASE} uppercase tabular-nums bg-[var(--accent-primary-dim)] text-[var(--accent-deep)]`}`}
				>
					{label}
				</span>
			);
		}
		if (tone === "solid") {
			return (
				<span
					{...dsProps("Tag", "1")}
					data-spacing-role="compact-pill"
					className={`type-label ${`${TAG_BASE} uppercase tabular-nums bg-[var(--accent-primary)] text-[var(--text-on-accent)]`}`}
				>
					{label}
				</span>
			);
		}
		return (
			<span
				{...dsProps("Tag", "1")}
				data-spacing-role="compact-pill"
				className={`type-metadata ${`${TAG_BASE} bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)] text-[var(--text-secondary)]`}`}
			>
				{label}
			</span>
		);
	}
	return (
		<span
			{...dsProps("Tag", "1")}
			data-spacing-role="compact-pill"
			className={`type-metadata ${`${TAG_BASE} ${meta.tintClass}`}`}
		>
			<span className="inline-flex items-center shrink-0">{meta.icon}</span>
			<span className="sr-only">{meta.ariaLabel}: </span>
			{label}
		</span>
	);
}
