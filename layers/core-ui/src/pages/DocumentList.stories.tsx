import { DocumentList } from "./DocumentList";

export default { title: "Page: Knowledge/List" };

export const Default = (): React.JSX.Element => <DocumentList />;

export const Loading = (): React.JSX.Element => <DocumentList loading />;

export const ErrorState = (): React.JSX.Element => (
	<DocumentList error={{ message: "Network request failed", onRetry: () => {} }} />
);
