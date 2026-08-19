import { join } from "node:path";
import { defineConfig } from "vitest/config";

const PROJECTS = [
	"framework/api-contract",
	"framework/db",
	"applications/desktop",
	"applications/website",
	"tools/eval",
	"tools/setup",
	"tools/repo-gates",
	"tools/trace",
	"applications/remote-server",
	"applications/remote-worker",
	"framework/domain-model",
	"framework/diagnostics",
	"framework/harness-capability",
	"framework/event-bus",
	"framework/presentation-format",
	"framework/block-derivation",
	"framework/conversation-parts",
	"framework/toon-codec",
	"framework/factory-defaults",
	"framework/host-process",
	"framework/http-middleware",
	"framework/harness-protocol",
	"layers/core-ui",
	"framework/design-system",
	"tools/eslint-plugin-design",
	"tools/eslint-plugin-authz",
	"layers/core-api",
	"layers/core-api/knowledge",
	"layers/core-api/routine",
	"layers/core-api/review",
	"layers/core-api/work",
	"layers/core-api/org",
	"layers/core-api/users",
	"layers/core-api/conversation",
	"layers/core-api/settings",
	"layers/core-api/notifications",
	"layers/core-api/credentials",
	"layers/agent-orchestration",
	"layers/agent-orchestration/agent-run-config",
	"layers/agent-orchestration/connections",
	"layers/agent-orchestration/run-orchestration",
	"layers/agent-orchestration/filesystems",
	"layers/agent-orchestration/tool-handlers",
	"layers/agent-execution",
	"layers/agent-execution/harness-registry",
];

// @lore affected-determinism: vitest's DEFAULT forceRerunTriggers make
// `--changed` selection depend on WHERE the checkout lives on disk.
//
// The defaults are globs ("** /package.json/**" and "** /{vitest,vite}.config.*/**"
// without the spaces) matched by picomatch against ABSOLUTE changed-file paths,
// and picomatch's `**` does not cross dot-directories (`dot:false` default). So:
//
//  - In CI (/home/runner/work/..., no dot segments) any PR touching ANY
//    package.json matched the package.json glob → force-rerun → the WHOLE suite
//    ("563 of 563 files" — the measurement that broke affected in ci.yml lore).
//  - In a `.worktrees/` checkout the same commit matched NOTHING (the `.worktrees`
//    segment blocks `**`), so selection silently differed from CI and from the
//    primary checkout — same branch, different slice, per checkout location.
//  - The config glob never matches at all (vitest.config.ts is a file, the
//    trailing glob-star requires a directory), so config/setup changes selected
//    0 tests — a silent green. Per-PROJECT setupFiles are appended to each
//    project's forceRerunTriggers, but workspace-mode filtering matches against
//    the ROOT config's list only, so they never fire either.
//
// The fix is absolute literal paths (no globs), which match identically in every
// checkout location: the lockfile (the honest signal that node_modules content
// changed — a blanket package.json trigger would re-run everything on any script
// tweak), both root configs, every project config (derived from PROJECTS so the
// list cannot drift), and every setupFile vitest loads outside the import graph
// (the affected dep-walk never sees them, so they must trigger explicitly).
// Deliberately NOT triggered: package.json itself. Known narrow hole: a
// workspace `exports` edit without lockfile change — typecheck/build gates cover.
const FORCE_RERUN_TRIGGERS = [
	join(import.meta.dirname, "package-lock.json"),
	join(import.meta.dirname, "vitest.config.ts"),
	...PROJECTS.map((p) => join(import.meta.dirname, p, "vitest.config.ts")),
	join(import.meta.dirname, "framework/db/src/__testing__/vitest-setup.ts"),
	join(import.meta.dirname, "framework/design-system/src/__testing__/test-setup.ts"),
	join(import.meta.dirname, "layers/core-api/src/__testing__/vitest-setup.ts"),
	join(import.meta.dirname, "layers/core-ui/src/__testing__/test-setup.ts"),
];

export default defineConfig({
	test: {
		forceRerunTriggers: FORCE_RERUN_TRIGGERS,
		hookTimeout: 120_000,
		testTimeout: 120_000,
		maxWorkers: 4,
		minWorkers: 1,
		exclude: [
			"**/node_modules/**",
			"**/.git/**",
			"**/dist/**",
			"**/.worktrees/**",
			"**/*.integration.test.{ts,tsx}",
		],
		reporters: ["dot"],
		projects: PROJECTS,
	},
});
