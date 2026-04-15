import type { HealthResponse } from "@hyperidle/shared";
import { useEffect, useState } from "react";

export function App(): React.JSX.Element {
	const [health, setHealth] = useState<HealthResponse | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetch("/api/health")
			.then((r) => r.json() as Promise<HealthResponse>)
			.then(setHealth)
			.catch((e: unknown) => {
				setError(e instanceof Error ? e.message : "Connection failed");
			});
	}, []);

	return (
		<div className="min-h-screen bg-base-100 flex items-center justify-center">
			<div className="text-center">
				<h1 className="text-4xl font-bold text-primary">HyperIdle</h1>
				<p className="text-base-content/60 mt-2">
					{error
						? `Error: ${error}`
						: health
							? `Status: ${health.status}`
							: "The Factory is loading..."}
				</p>
			</div>
		</div>
	);
}
