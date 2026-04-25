import type { JSX } from "react";
import { dsProps } from "./ds-attrs";
import { TAG_KIND_ICONS, type TagKind } from "./tag-kinds";

export interface TagProps {
	label: string;
	/** Optional Tier-2 kind. When omitted, renders the legacy neutral chip. */
	kind?: TagKind;
}

/**
 * @lore Tag styling matches the HTML reference in packages/design-system/html/Tag.html.
 * Uses custom Tailwind classes instead of DaisyUI badge so the TSX and HTML
 * renderings are pixel-identical.
 *
 * @lore All spacing/radius values use explicit pixel units (not rem-based
 * Tailwind utilities like gap-1, px-2, py-0.5, rounded-lg) because the
 * design-system viewer sets html { font-size: 14px }, which makes 1rem=14px.
 * Tailwind rem classes would compute to wrong values (e.g. gap-1=3.5px
 * instead of 4px, px-2=7px instead of 8px, rounded-lg=7px instead of 8px).
 */
const TAG_BASE =
	"inline-flex items-center gap-[4px] px-[8px] py-[2px] rounded-[var(--r2)] font-[family-name:var(--ui)] text-[12px] leading-[1.4] whitespace-nowrap border-none";

export function Tag({ label, kind }: TagProps): JSX.Element {
	// @lore J1 review: defensive guard — if a caller passes an arbitrary
	// string typed as `TagKind` (e.g. `kind={item.kind as TagKind}` for a
	// knowledge-item kind not in the Tier-2 set), `meta` would be undefined
	// and the render path would crash on `meta.tintClass`. Fall back to the
	// neutral chip in that case so the page stays up.
	const meta = kind ? TAG_KIND_ICONS[kind] : undefined;
	if (!meta) {
		return (
			<span
				{...dsProps("Tag", "1")}
				className={`${TAG_BASE} bg-[var(--surface-ghost)] text-[var(--text-mid)]`}
			>
				{label}
			</span>
		);
	}
	return (
		<span
			{...dsProps("Tag", "1")}
			className={`${TAG_BASE} ${meta.tintClass}`}
			aria-label={`${meta.ariaLabel}: ${label}`}
		>
			<span className="inline-flex items-center shrink-0">{meta.icon}</span>
			{label}
		</span>
	);
}
