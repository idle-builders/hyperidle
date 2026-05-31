import { ErrorState } from "./ErrorState.js";

export default {
	title: "ErrorState",
	tier: "utility" as const,
	order: ["WithRetry", "WithoutRetry", "InContextStackedErrors"],
};

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

export const InContextStackedErrors = (): React.JSX.Element => (
	<div className="rounded-lg bg-[var(--surface-container)] p-4">
		<div className="flex flex-col gap-4">
			<ErrorState
				title="Network unreachable"
				description="Check your internet connection and try again."
				onRetry={() => undefined}
			/>
			<div className="border-t border-[var(--surface-elevated)]" />
			<ErrorState title="Permission denied" description="You don't have access to this resource." />
		</div>
	</div>
);
