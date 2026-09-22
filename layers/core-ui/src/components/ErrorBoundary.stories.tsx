import type { JSX } from "react";
import { ErrorBoundary } from "./ErrorBoundary";

export default { title: "ErrorBoundary", tier: "utility" as const };

function Throws({ message }: { message: string }): JSX.Element {
	throw new Error(message);
}

function Healthy(): JSX.Element {
	return <div className="text-sm">Children rendered without error.</div>;
}

export const HealthyChildren: () => JSX.Element = (): JSX.Element => (
	<ErrorBoundary>
		<Healthy />
	</ErrorBoundary>
);

export const Caught: () => JSX.Element = (): JSX.Element => (
	<ErrorBoundary>
		<Throws message="Demo render failure: document feed unavailable." />
	</ErrorBoundary>
);
