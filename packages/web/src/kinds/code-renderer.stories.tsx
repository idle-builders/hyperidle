// AE6 — CodeRenderer stories.

import { CodeRenderer } from "./code-renderer.js";

export default { title: "Kinds/CodeRenderer" };

export function WithDiff() {
	return (
		<CodeRenderer
			preview={{
				kind: "code",
				file: "packages/shared/src/types/artifact.ts",
				hunks: [
					{
						header: "@@ -10,7 +10,9 @@",
						lines: [
							{ kind: "ctx", text: "export type ArtifactKind =" },
							{ kind: "del", text: '  | "code_diff"' },
							{ kind: "del", text: '  | "contract"' },
							{ kind: "add", text: '  | "text"' },
							{ kind: "add", text: '  | "code"' },
							{ kind: "ctx", text: ";" },
						],
					},
				],
			}}
			kind="code"
		/>
	);
}

export function EmptyHunks() {
	return (
		<CodeRenderer preview={{ kind: "code", file: "src/unchanged.ts", hunks: [] }} kind="code" />
	);
}

export function NoPreview() {
	return <CodeRenderer preview={null} kind="code" />;
}
