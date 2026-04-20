import { KnowledgeDetail } from "./KnowledgeDetail";

export default { title: "Page: Knowledge/Detail" };

export const KnownItem = (): React.JSX.Element => <KnowledgeDetail overrideKnowledgeId="k1" />;

export const FactoryScopeNoEdit = (): React.JSX.Element => (
	<KnowledgeDetail overrideKnowledgeId="k11" />
);

export const FactoryNeedsHumanBanner = (): React.JSX.Element => (
	<KnowledgeDetail overrideKnowledgeId="k12" />
);

export const UnknownItem = (): React.JSX.Element => (
	<KnowledgeDetail overrideKnowledgeId="unknown" />
);
