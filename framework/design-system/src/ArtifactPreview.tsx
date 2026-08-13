import type { Artifact } from "@hyperidle/domain-model";
import { artifactDisplayTitle } from "@hyperidle/domain-model";
import type { JSX, ReactNode } from "react";
import { ArtifactKindBadge } from "./ArtifactKindBadge.js";
import { ArtifactPreviewSurface } from "./ArtifactPreviewSurface.js";
import { ArtifactTimestamp } from "./ArtifactTimestamp.js";
import { dsProps } from "./ds-attrs.js";

export interface ArtifactPreviewProps {
	data: Artifact;
	discussion?: ReactNode;
	state?: "populated" | "loading" | "error";
	/**
	 * The app's HTML sanitiser, applied to HTML embedded inside a prose body.
	 *
	 * @lore AZ6: required, not optional. When it was optional every call site
	 * forgot it and the flagship artifact kind rendered as its own source text.
	 * The `html` kind does not use it — that kind is isolated, not stripped.
	 */
	sanitizeHtml: (raw: string) => string;
	/** Page routes may move the repeated display title into PageHeader. */
	showTitle?: boolean;
}

const WRAP =
	"bg-[var(--surface-container)] rounded-[var(--r-default)] p-[24px] grid grid-cols-1 [@media(min-width:1024px)]:grid-cols-[1fr_320px] gap-[24px]";
const HEADER = "[grid-column:1/-1] flex flex-col gap-[9px]";
const META =
	"flex items-center gap-[6px] font-mono text-[11px] text-[var(--text-secondary)] uppercase tracking-[var(--tracking-caps-sm)] flex-wrap";
const TITLE = "text-[20px] font-semibold text-[var(--text-primary)] leading-[1.2] normal-case";
const DISCUSSION =
	"bg-[var(--surface-elevated)] rounded-[var(--r-subtle)] p-[16px] text-[var(--text-tertiary)] text-[12px]";

export function ArtifactPreview({
	data,
	discussion,
	state = "populated",
	sanitizeHtml,
	showTitle = true,
}: ArtifactPreviewProps): JSX.Element {
	return (
		<div {...dsProps("ArtifactPreview", "2")} className={WRAP} data-state={state}>
			<div className={HEADER}>
				<div className={META}>
					<ArtifactKindBadge kind={data.kind} />
					{data.label && (
						<>
							<span className="text-[var(--text-tertiary)]">/</span>
							<span className="text-[var(--text-tertiary)]">{data.label}</span>
						</>
					)}
					<span className="text-[var(--text-tertiary)]">·</span>
					<span>{data.producingTaskTitle}</span>
					<span className="text-[var(--text-tertiary)]">·</span>
					<ArtifactTimestamp value={data.createdAt} />
					<span className="ml-auto text-[var(--text-tertiary)] normal-case">{data.id}</span>
				</div>
				{showTitle && <div className={TITLE}>{artifactDisplayTitle(data)}</div>}
			</div>
			<ArtifactPreviewSurface
				kind={data.kind}
				preview={data.preview}
				size="full"
				sanitizeHtml={sanitizeHtml}
				documentTitle={artifactDisplayTitle(data)}
			/>
			{discussion ? <div className={DISCUSSION}>{discussion}</div> : null}
		</div>
	);
}
