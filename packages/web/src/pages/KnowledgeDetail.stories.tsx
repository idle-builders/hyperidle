/**
 * KnowledgeDetail stories — the (mixture / block-body) review surface.
 *
 * AM5: page-fed stories mount through the shared isolation harness
 * (`MockProviders`), exactly like `WorkBetCreate.stories.tsx`. The page reaches
 * for router hooks (useNavigate/useParams/<Link>) and AssistantContext; a bare
 * `<KnowledgeDetail />` throws ("Error rendering story"). `MockProviders`
 * supplies the router + context. `overrideKnowledgeId` resolves the fixture
 * (no server in the viewer) so the populated `KnownItem` renders the real
 * block-rich knowledge body — this is the `mixture` / block-body proof.
 */

import type { JSX } from "react";
import { MockProviders } from "../preview";
import { KnowledgeDetail } from "./KnowledgeDetail";

export default { title: "Page: Knowledge/Detail" };

export const KnownItem = (): JSX.Element => (
	<MockProviders route="/knowledge/k1">
		<KnowledgeDetail overrideKnowledgeId="k1" />
	</MockProviders>
);

export const FactoryScopeNoEdit = (): JSX.Element => (
	<MockProviders route="/knowledge/k11">
		<KnowledgeDetail overrideKnowledgeId="k11" />
	</MockProviders>
);

/**
 * AV3: exercises the resolved scope-name headline state — scope row shows
 * "Team Nimmly" and the breadcrumb carries a "Team Nimmly" segment.
 * scopeName is set directly on the LEGACY_DETAILS fixture ("k-team-scoped")
 * because stories run without a real API; resolveScopeName runs on the server.
 */
export const TeamScopedWithScopeName = (): JSX.Element => (
	<MockProviders route="/knowledge/k-team-scoped">
		<KnowledgeDetail overrideKnowledgeId="k-team-scoped" />
	</MockProviders>
);

export const FactoryNeedsHumanBanner = (): JSX.Element => (
	<MockProviders route="/knowledge/k12">
		<KnowledgeDetail overrideKnowledgeId="k12" />
	</MockProviders>
);

export const UnknownItem = (): JSX.Element => (
	<MockProviders route="/knowledge/unknown">
		<KnowledgeDetail overrideKnowledgeId="unknown" />
	</MockProviders>
);

/**
 * AK5: ArchivedItem — the overflow menu should show "Promote to bet" as disabled
 * when the knowledge item's status is "archived".
 */
export const ArchivedItem = (): JSX.Element => (
	<MockProviders route="/knowledge/k-archived">
		<KnowledgeDetail overrideKnowledgeId="k-archived" />
	</MockProviders>
);
