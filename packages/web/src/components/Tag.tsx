import type { JSX } from "react";
import { TAG_KIND_ICONS, type TagKind } from "./tag-kinds";

export interface TagProps {
	label: string;
	/** Optional Tier-2 kind. When omitted, renders the legacy neutral chip. */
	kind?: TagKind;
}

export function Tag({ label, kind }: TagProps): JSX.Element {
	// @lore J1 review: defensive guard — if a caller passes an arbitrary
	// string typed as `TagKind` (e.g. `kind={item.kind as TagKind}` for a
	// knowledge-item kind not in the Tier-2 set), `meta` would be undefined
	// and the render path would crash on `meta.tintClass`. Fall back to the
	// neutral chip in that case so the page stays up.
	const meta = kind ? TAG_KIND_ICONS[kind] : undefined;
	if (!meta) {
		return <span className="badge badge-neutral badge-sm border-0">{label}</span>;
	}
	return (
		<span
			className={`badge badge-sm border-0 inline-flex items-center gap-1 ${meta.tintClass}`}
			aria-label={`${meta.ariaLabel}: ${label}`}
		>
			<span className="inline-flex">{meta.icon}</span>
			{label}
		</span>
	);
}
