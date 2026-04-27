/**
 * L9 — FileLeaseView. Side-by-side competing artifacts for a file
 * collision; verdict-variant labels exposed via `getVerdictVariants` so
 * the parent that owns ReviewHeader can derive labels without a callback
 * round-trip.
 */

import { dsShellProps } from "@hyperidle/design-system";
import type {
	ArtifactMetadataExtended,
	FileLeasePayload,
	VerdictVariants,
} from "@hyperidle/shared";
import type { JSX } from "react";
import { ArtifactShell } from "./ArtifactShell.js";

export interface FileLeaseViewProps {
	metadata: ArtifactMetadataExtended;
	payload: FileLeasePayload;
}

export function getVerdictVariants(payload: FileLeasePayload): VerdictVariants {
	return {
		approve: `Grant lease to A (${payload.agentA.name})`,
		requestChanges: "Ask both to coordinate",
		reject: `Grant lease to B (${payload.agentB.name})`,
	};
}

export function FileLeaseView({ metadata, payload }: FileLeaseViewProps): JSX.Element {
	return (
		<div {...dsShellProps("FileLeaseView")}>
			<ArtifactShell metadata={metadata}>
				<div className="flex flex-col gap-3">
					<p className="text-xs font-mono text-[var(--text-mid)]">{payload.filePath}</p>

					<div className="grid grid-cols-2 gap-3">
						<section
							data-testid="file-lease-a"
							aria-label={`Agent ${payload.agentA.name} submission`}
							className="border border-[var(--border-subtle)] p-2 flex flex-col gap-1"
						>
							<h4 className="text-xs uppercase tracking-wider text-[var(--text-lo)]">
								{`Agent A: ${payload.agentA.name}`}
							</h4>
							<pre className="overflow-x-auto text-xs font-mono leading-[1.4] text-[var(--text-hi)]">
								<code>{payload.agentA.artifactSnippet}</code>
							</pre>
						</section>
						<section
							data-testid="file-lease-b"
							aria-label={`Agent ${payload.agentB.name} submission`}
							className="border border-[var(--border-subtle)] p-2 flex flex-col gap-1"
						>
							<h4 className="text-xs uppercase tracking-wider text-[var(--text-lo)]">
								{`Agent B: ${payload.agentB.name}`}
							</h4>
							<pre className="overflow-x-auto text-xs font-mono leading-[1.4] text-[var(--text-hi)]">
								<code>{payload.agentB.artifactSnippet}</code>
							</pre>
						</section>
					</div>
				</div>
			</ArtifactShell>
		</div>
	);
}
