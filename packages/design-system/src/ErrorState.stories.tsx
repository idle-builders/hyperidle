import { ErrorState } from "./ErrorState.js";

export default { title: "ErrorState" };

export const WithRetry = (): React.JSX.Element => (
	<ErrorState
		title="Couldn't load knowledge"
		description="The server returned an error. You can retry in a moment."
		onRetry={() => undefined}
	/>
);

export const WithoutRetry = (): React.JSX.Element => (
	<ErrorState title="Session expired" description="Please reload the page to continue." />
);
