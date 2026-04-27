/**
 * L9 — ArtifactKindRenderer dispatcher. Switches on `kind` and renders the
 * matching view. `kind` is a semantic role (deploy / skill change / lease /
 * permission); orthogonal to J4's `shape` (text-diff / data-metrics / …).
 *
 * @lore L9: parents derive verdict-variant labels via `getVerdictVariantsFor`
 * (a pure function), not via a child→parent callback. See plan §S4.
 */

import type {
	ActionSummaryPayload,
	ArtifactMetadataExtended,
	FileLeasePayload,
	PermissionRequestPayload,
	SkillChangePayload,
	VerdictVariants,
} from "@hyperidle/shared";
import type { JSX } from "react";
import { ActionSummaryView } from "./ActionSummaryView.js";
import { FileLeaseView, getFileLeaseVariants } from "./FileLeaseView.js";
import { getPermissionRequestVariants, PermissionRequestView } from "./PermissionRequestView.js";
import { SkillChangeView } from "./SkillChangeView.js";

export type ArtifactKindRendererProps =
	| {
			kind: "action_summary";
			metadata: ArtifactMetadataExtended;
			payload: ActionSummaryPayload;
			/** L9 review: lifted readiness signal so the parent that owns
			 * ReviewHeader can gate Approve until the type-to-confirm token
			 * is matched. */
			onReadyChange?: (ready: boolean) => void;
	  }
	| {
			kind: "skill_change";
			metadata: ArtifactMetadataExtended;
			payload: SkillChangePayload;
			onRolloutChange?: (policy: {
				mode: "pin_version" | "rollback_window";
				value: string;
			}) => void;
	  }
	| {
			kind: "file_lease";
			metadata: ArtifactMetadataExtended;
			payload: FileLeasePayload;
	  }
	| {
			kind: "permission_request";
			metadata: ArtifactMetadataExtended;
			payload: PermissionRequestPayload;
	  };

/**
 * Pure derivation of the three verdict-variant labels for a given kind +
 * payload. Returns `null` for kinds that don't override (action_summary,
 * skill_change). The parent that owns ReviewHeader passes this directly
 * into the `verdictVariants` prop.
 */
export function getVerdictVariantsFor(
	props:
		| { kind: "file_lease"; payload: FileLeasePayload }
		| { kind: "permission_request"; payload: PermissionRequestPayload }
		| { kind: "action_summary" }
		| { kind: "skill_change" },
): VerdictVariants | null {
	switch (props.kind) {
		case "file_lease":
			return getFileLeaseVariants(props.payload);
		case "permission_request":
			return getPermissionRequestVariants();
		case "action_summary":
		case "skill_change":
			return null;
	}
}

export function ArtifactKindRenderer(props: ArtifactKindRendererProps): JSX.Element {
	switch (props.kind) {
		case "action_summary":
			return (
				<ActionSummaryView
					metadata={props.metadata}
					payload={props.payload}
					onReadyChange={props.onReadyChange}
				/>
			);
		case "skill_change":
			return (
				<SkillChangeView
					metadata={props.metadata}
					payload={props.payload}
					onRolloutChange={props.onRolloutChange}
				/>
			);
		case "file_lease":
			return <FileLeaseView metadata={props.metadata} payload={props.payload} />;
		case "permission_request":
			return <PermissionRequestView metadata={props.metadata} payload={props.payload} />;
	}
}
