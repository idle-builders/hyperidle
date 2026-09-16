import type { z } from "zod";

/**
 * The action shape. One name, four places: HTTP (`POST
 * /api/actions/<name>`), an MCP tool, the UI's `call("<name>", …)`, and this
 * declaration itself. `framework/domain-model` is where a declaration lives
 * because the UI cannot import `core-api` and must read the exact same
 * `input`/invariant shape the server runs — see the architecture doc
 * §3.
 *
 * `input`/`output` must be `z.toJSONSchema`-able: no `Date`, no `.transform()`.
 */
export interface Problem {
	readonly code: string;
	readonly message: string;
	readonly path?: string;
}

export interface ActionDeclaration<I, O> {
	/** Wire name — `[a-z_]+`. Used verbatim as the HTTP route segment, the MCP
	 * tool name and the UI's `call()` key, because underscore names are what
	 * every harness already accepts (dotted names are unverified). */
	readonly name: string;
	/** What the agent reads — a plain sentence describing what the action does. */
	readonly sentence: string;
	readonly input: z.ZodType<I>;
	readonly output: z.ZodType<O>;
}

export type ActionResult<O> =
	| { readonly ok: true; readonly data: O }
	| { readonly ok: false; readonly problems: readonly Problem[] };
