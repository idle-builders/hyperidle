import type { JSX } from "react";
import { TAG_KIND_ICONS, type TagKind } from "./tag-kinds";

export interface TagProps {
	label: string;
	/** Optional Tier-2 kind. When omitted, renders the legacy neutral chip. */
	kind?: TagKind;
}

export function Tag({ label, kind }: TagProps): JSX.Element {
	if (!kind) {
		return <span className="badge badge-neutral badge-sm border-0">{label}</span>;
	}
	const meta = TAG_KIND_ICONS[kind];
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
