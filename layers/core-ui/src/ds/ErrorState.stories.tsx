import { ErrorState } from "./ErrorState.js";

export default {
	title: "ErrorState",
	tier: "utility" as const,
	order: [
		"WithRetry",
		"WithDetail",
		"WithAction",
		"WithoutRetry",
		"InContextStackedErrors",
		"Compact",
		"CompactWithRetry",
	],
};

export const Compact = (): React.JSX.Element => (
	<div
		className="rounded-[var(--r-default)] bg-[var(--surface-container)] p-[12px]"
		style={{ maxWidth: "360px" }}
	>
		<ErrorState
			compact
			title="Couldn't load reference"
			description="The block reference failed to resolve."
		/>
	</div>
);

export const CompactWithRetry = (): React.JSX.Element => (
	<div
		className="rounded-[var(--r-default)] bg-[var(--surface-container)] p-[12px]"
		style={{ maxWidth: "360px" }}
	>
		<ErrorState
			compact
			title="Couldn't load reference"
			description="The block reference failed to resolve. Retry in a moment."
			detail="Error 404: block not found"
			onRetry={() => undefined}
		/>
	</div>
);

export const WithRetry = (): React.JSX.Element => (
	<ErrorState
		title="Couldn't load knowledge"
		description="The server returned an error. You can retry in a moment."
		onRetry={() => undefined}
	/>
);

export const WithDetail = (): React.JSX.Element => (
	<ErrorState
		title="Something went wrong"
		description="We couldn't load this data. This is usually temporary. If it persists, your agents may need a credential refresh."
		detail="Error 502: upstream service unavailable"
		onRetry={() => undefined}
	/>
);

export const WithAction = (): React.JSX.Element => (
	<ErrorState
		title="Something went wrong"
		description="We couldn't load this data. Check the status page for more information."
		onRetry={() => undefined}
		action={
			<a
				href="/status"
				className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
			>
				View status
			</a>
		}
	/>
);

export const WithoutRetry = (): React.JSX.Element => (
	<ErrorState
		title="Session expired"
		description="Your session has expired. Please reload the page to continue."
	/>
);

export const InContextStackedErrors = (): React.JSX.Element => (
	<div className="rounded-[var(--r-default)] bg-[var(--surface-container)] p-[24px]">
		<div className="flex flex-col gap-[18px]">
			<ErrorState
				title="Network unreachable"
				description="Check your internet connection and try again."
				onRetry={() => undefined}
			/>
			<div className="border-t border-[var(--border-subtle)]" />
			<ErrorState title="Permission denied" description="You don't have access to this resource." />
		</div>
	</div>
);
