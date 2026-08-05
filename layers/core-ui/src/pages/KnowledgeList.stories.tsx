import { KnowledgeList } from "./KnowledgeList";

export default { title: "Page: Knowledge/List" };

export const Default = (): React.JSX.Element => <KnowledgeList />;

export const Loading = (): React.JSX.Element => <KnowledgeList loading />;

export const ErrorState = (): React.JSX.Element => (
	<KnowledgeList error={{ message: "Network request failed", onRetry: () => {} }} />
);
