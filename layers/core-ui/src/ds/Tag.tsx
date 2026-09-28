import type { JSX } from "react";
import { dsProps } from "./ds-attrs";
import { TAG_KIND_ICONS, type TagKind } from "./tag-kinds";

export interface TagProps {
	label: string;
	/** Optional Tier-2 kind. When omitted, renders the neutral chip. */
	kind?: TagKind;

	tone?: "neutral" | "accent" | "solid";
}

const TAG_BASE =
	"inline-flex items-center gap-[4px] px-[8px] py-[2px] rounded-[var(--r-pill)] whitespace-nowrap border-none";

export function Tag({ label, kind, tone = "neutral" }: TagProps): JSX.Element {
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
