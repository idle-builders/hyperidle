/**
 * AU21 Increment 14b (Decision L2) — `@hyperidle/model-gateway` is dissolved;
 * `resolveModel`/`UnsupportedAgentProviderError` moved into `@hyperidle/shared`.
 *
 * `layers/core-api/model-gateway` is deleted (its `package.json`, `src/*`,
 * and every dependency/tsconfig-reference entry pointing at it are removed —
 * `npm run check`'s per-package `tsc -b` build proves this: any surviving
 * `@hyperidle/model-gateway` import anywhere in the workspace would fail to
 * resolve at the TypeScript-project-reference level and fail that build,
 * see `scripts/typecheck-gate.ts`). `@lore` a bare `import("@hyperidle/model-
 * gateway")` at test runtime is NOT a reliable proof of deletion in this repo:
 * a nested `.worktrees/<id>` checkout sits inside the primary checkout, and
 * Node's module resolution climbs directory-by-directory past the worktree's
 * own `node_modules` into the (untouchable, per `CLAUDE.md` worktree-isolation
 * rule) primary checkout's `node_modules`, which still has the pre-move
 * package — so the assertion would flip depending on which checkout happens
 * to still have it, not on this change. The real, load-bearing proof that the
 * move landed intact is behavioral: `@hyperidle/shared` now exports the moved
 * function unchanged.
 */

import { describe, expect, it } from "vitest";

describe("@hyperidle/model-gateway dissolved into @hyperidle/shared", () => {
	it("@hyperidle/shared exports resolveModel + UnsupportedAgentProviderError directly (the moved fns)", async () => {
		const shared = await import("@hyperidle/shared");
		expect(typeof shared.resolveModel).toBe("function");
		expect(typeof shared.UnsupportedAgentProviderError).toBe("function");
	});
});
