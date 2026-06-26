// AM5 — base-primitive foundation story: Code (pure content — NO diff; K0).
// The diff lives in the Review composition, not here. Thin wrapper over
// block/CodePayload. Highlighting is a deferred TODO (K6) — renders plain mono.
import type { JSX } from "react";
import { CodePayload } from "./block/CodePayload.js";

export default { title: "Code", group: "Blocks" as const };

export const WithLang = (): JSX.Element => (
	<CodePayload
		lang="ts"
		text={`export function deriveBlocks(body: string): Block[] {\n  return parse(body).map(toBlock);\n}`}
	/>
);

export const NoLang = (): JSX.Element => (
	<CodePayload lang={null} text="npm run dev\n# server 3001 + web 5173" />
);

export const Collapsible = (): JSX.Element => (
	<CodePayload
		lang="json"
		text={Array.from({ length: 28 }, (_, i) => `  "line_${i + 1}": ${i + 1},`).join("\n")}
	/>
);
