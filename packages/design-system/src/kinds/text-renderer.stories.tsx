// AE6 — TextRenderer stories.

import { TextRenderer } from "./text-renderer.js";

export default { title: "Kinds/TextRenderer" };

export function WithBody() {
	return (
		<TextRenderer
			preview={{
				kind: "text",
				body: "This is a contract between Party A and Party B.",
				format: "plain",
			}}
			kind="text"
		/>
	);
}

export function WithMarkdown() {
	return (
		<TextRenderer
			preview={{
				kind: "text",
				body: "## Decision\n\nWe chose PostgreSQL over SQLite for production because of multi-user concurrency requirements.\n\n### Rationale\n- Row-level locking\n- Concurrent writes\n- Replication support",
				format: "markdown",
			}}
			kind="text"
		/>
	);
}
