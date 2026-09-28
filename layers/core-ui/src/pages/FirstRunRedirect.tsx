import { type JSX, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { call } from "../services/call.js";

// @lore: first-run routing — API failure defaults to /setup (not /conversations); fresh install may have timing issues; /setup always safe
export function FirstRunRedirect(): JSX.Element {
	const [target, setTarget] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		call("search_users", { kind: "human" })
			.then((result) => {
				if (cancelled) return;
				const done = result.ok && result.data.some((user) => user.team !== null);
				setTarget(done ? "/work" : "/setup");
			})
			.catch(() => {
				if (!cancelled) setTarget("/setup");
			});

		return (): void => {
			cancelled = true;
		};
	}, []);

	if (!target) return <div className="flex items-center justify-center h-screen bg-base-100" />;

	return <Navigate to={target} replace />;
}
