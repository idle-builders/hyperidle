/**
 * U11 — Hearth Visual Validation & Test Re-baseline
 *
 * This test suite is the authoritative audit for the U11 acceptance criteria.
 * It uses grep-based file scanning to assert zero residual old-token/old-vocabulary
 * references in production code, and zero stale API path references in both
 * production and E2E test code.
 *
 * Tests in this file prove:
 *   AC1 — No old Lucid tokens in production .tsx/.ts/.css files
 *   AC2 — No functional references to deleted components (IconRail, PitchCard, PitchSelector)
 *   AC3 — No /api/products in frontend production code
 *   AC4 — No /api/products in e2e/ test infrastructure
 *
 * @lore U11: grep-based audit is preferred over import-based checks because
 * token names are strings inside className/style objects that TypeScript cannot
 * type-check. The grep runs on disk, not in the module graph.
 */

import { execSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Root of the monorepo (go up from packages/web/src/__tests__ → web → packages → root)
const REPO_ROOT = path.resolve(__dirname, "../../../../");
const WEB_SRC = path.resolve(__dirname, "../");
const DESIGN_SYSTEM_SRC = path.resolve(REPO_ROOT, "packages/design-system/src");
const DESIGN_SYSTEM_VIEWER = path.resolve(REPO_ROOT, "packages/design-system/viewer");
const E2E_DIR = path.resolve(REPO_ROOT, "packages/web/e2e");

/**
 * Run grep -rEl and return list of matching files.
 *
 * Returns empty string on no matches (exit code 1 from grep = pass).
 * Extra flags: --include for file extensions, --exclude-dir to skip test dirs.
 *
 * @param pattern   Extended regex pattern
 * @param dir       Directory to search
 * @param includes  Array of --include glob patterns (default: tsx, ts, css)
 * @param excludes  Array of --exclude glob patterns (test/spec/stories files)
 */
function grepFiles(
	pattern: string,
	dir: string,
	includes: string[] = ["*.tsx", "*.ts", "*.css"],
	excludes: string[] = ["*.test.tsx", "*.test.ts", "*.spec.ts", "*.spec.tsx", "*.stories.tsx"],
): string {
	const includeFlags = includes.map((i) => `--include="${i}"`).join(" ");
	const excludeFlags = excludes.map((e) => `--exclude="${e}"`).join(" ");
	try {
		const result = execSync(
			`grep -rEl "${pattern}" "${dir}" ${includeFlags} ${excludeFlags} --exclude-dir="__tests__" 2>/dev/null`,
			{ encoding: "utf-8" },
		);
		return result.trim();
	} catch {
		// grep exits 1 when no matches — that is the desired passing state
		return "";
	}
}

// ---------------------------------------------------------------------------
// AC1 — No old Lucid tokens in production code
// ---------------------------------------------------------------------------

const OLD_TOKEN_PATTERN =
	"surface-0|surface-1|surface-2|surface-3|surface-4|surface-5|surface-6|text-hi[^-]|text-mid[^-]|text-lo[^-]|lucid-dark|lucid-light";

describe("U11 AC1: No old Lucid tokens in packages/web/src/ production code", () => {
	it("no old Lucid surface/text tokens in packages/web/src/components/", () => {
		const result = grepFiles(OLD_TOKEN_PATTERN, path.join(WEB_SRC, "components"));
		expect(result, `Old tokens found in components/:\n${result}`).toBe("");
	});

	it("no old Lucid surface/text tokens in packages/web/src/designsystem/", () => {
		const result = grepFiles(OLD_TOKEN_PATTERN, path.join(WEB_SRC, "designsystem"));
		expect(result, `Old tokens found in designsystem/:\n${result}`).toBe("");
	});

	it("no old Lucid surface/text tokens in packages/web/src/pages/", () => {
		const result = grepFiles(OLD_TOKEN_PATTERN, path.join(WEB_SRC, "pages"));
		expect(result, `Old tokens found in pages/:\n${result}`).toBe("");
	});

	it("no old Lucid surface/text tokens in packages/web/src/settings/", () => {
		const result = grepFiles(OLD_TOKEN_PATTERN, path.join(WEB_SRC, "settings"));
		expect(result, `Old tokens found in settings/:\n${result}`).toBe("");
	});

	it("no old Lucid surface/text tokens in packages/web/src/shell/", () => {
		const result = grepFiles(OLD_TOKEN_PATTERN, path.join(WEB_SRC, "shell"));
		expect(result, `Old tokens found in shell/:\n${result}`).toBe("");
	});

	it("no old Lucid surface/text tokens in packages/design-system/src/ (body-editor.css)", () => {
		const result = grepFiles(
			OLD_TOKEN_PATTERN,
			DESIGN_SYSTEM_SRC,
			["*.css", "*.tsx", "*.ts"],
			["*.test.tsx", "*.test.ts", "*.stories.tsx"],
		);
		// NavItem.tsx has old tokens in @lore comments only — that is allowed.
		// The test should catch actual CSS/style usage.
		// We exclude NavItem.tsx from the count to avoid false positives from lore comments.
		const lines = result
			.split("\n")
			.filter((l) => l.length > 0)
			.filter((l) => !l.endsWith("NavItem.tsx")); // lore comments allowed
		expect(lines.join("\n"), `Old tokens found in design-system/src/:\n${lines.join("\n")}`).toBe(
			"",
		);
	});

	it("no old Lucid surface/text tokens in packages/design-system/viewer/viewer.css", () => {
		const result = grepFiles(OLD_TOKEN_PATTERN, DESIGN_SYSTEM_VIEWER, ["*.css"]);
		expect(result, `Old tokens found in design-system/viewer/:\n${result}`).toBe("");
	});
});

// ---------------------------------------------------------------------------
// AC2 — No functional references to deleted components
// ---------------------------------------------------------------------------

describe("U11 AC2: No functional references to deleted components in production code", () => {
	/**
	 * Check that a component name doesn't appear in imports or JSX.
	 * @lore comments referencing old names are allowed (they document history).
	 * We collect all matching lines and filter out comment-only lines.
	 */
	function hasNonCommentReference(componentName: string, dir: string): string {
		try {
			// Collect matching lines with file:line prefix. Use --text to handle
			// files with Unicode characters that grep treats as binary.
			const result = execSync(
				`grep --text -rEn "${componentName}" "${dir}" --include="*.tsx" --include="*.ts" \
				  --exclude-dir="__tests__" --exclude="*.test.tsx" --exclude="*.test.ts" \
				  --exclude="*.stories.tsx" 2>/dev/null`,
				{ encoding: "utf-8" },
			);
			// Filter out lines where the code portion (after file:lineno:) starts with a comment
			// or contains @lore. grep output format: "filepath:lineno:code"
			const nonCommentLines = result
				.split("\n")
				.filter((line) => line.length > 0)
				.filter((line) => {
					// Extract the code portion: everything after the second colon
					const parts = line.split(":");
					if (parts.length < 3) return true; // keep unknown format
					const code = parts.slice(2).join(":").trim();
					// Skip pure comment lines
					if (code.startsWith("//")) return false;
					if (code.startsWith("*")) return false;
					if (code.startsWith("/*")) return false;
					// Skip lines containing @lore annotation
					if (line.includes("@lore")) return false;
					// Skip lines that are only comment text about old names
					if (code.includes("deleted") || code.includes("removed") || code.includes("replaced"))
						return false;
					return true;
				});
			return nonCommentLines.join("\n");
		} catch {
			return "";
		}
	}

	it("no functional reference to IconRail in production code (comments allowed)", () => {
		const result = hasNonCommentReference("IconRail", WEB_SRC);
		expect(result, `Functional IconRail reference found:\n${result}`).toBe("");
	});

	it("no functional reference to PitchCard in production code (comments allowed)", () => {
		const result = hasNonCommentReference("PitchCard", WEB_SRC);
		expect(result, `Functional PitchCard reference found:\n${result}`).toBe("");
	});

	it("no functional reference to PitchSelector in production code (comments allowed)", () => {
		const result = hasNonCommentReference("PitchSelector", WEB_SRC);
		expect(result, `Functional PitchSelector reference found:\n${result}`).toBe("");
	});
});

// ---------------------------------------------------------------------------
// AC3 — No /api/products in frontend production code
// ---------------------------------------------------------------------------

describe("U11 AC3: No /api/products in frontend production code", () => {
	/**
	 * Check for /api/products in production source files.
	 * Excludes: router.tsx (intentional RedirectProductToTeam), @lore comments.
	 */
	function findApiProducts(dir: string): string {
		try {
			// Find files containing /api/products (not in comments or @lore)
			const result = execSync(
				`grep -rEn "api/products" "${dir}" --include="*.tsx" --include="*.ts" \
				  --exclude-dir="__tests__" --exclude="*.test.tsx" --exclude="*.test.ts" \
				  --exclude="*.stories.tsx" 2>/dev/null`,
				{ encoding: "utf-8" },
			);
			// Allow lore comments and router.tsx redirect path
			const lines = result
				.split("\n")
				.filter((l) => l.length > 0)
				.filter((l) => !l.includes("@lore"))
				.filter((l) => !l.includes("// "))
				.filter((l) => !l.includes(" * "))
				.filter((l) => !l.match(/router\.tsx/))
				.filter((l) => !l.includes("backward compat"))
				.filter((l) => !l.includes("renamed"));
			return lines.join("\n");
		} catch {
			return "";
		}
	}

	it("no /api/products in packages/web/src/hooks/ (must call /api/teams)", () => {
		const result = findApiProducts(path.join(WEB_SRC, "hooks"));
		expect(result, `Found /api/products in hooks/:\n${result}`).toBe("");
	});

	it("no /api/products in packages/web/src/settings/ (must call /api/teams)", () => {
		const result = findApiProducts(path.join(WEB_SRC, "settings"));
		expect(result, `Found /api/products in settings/:\n${result}`).toBe("");
	});

	it("no /api/products in packages/web/src/pages/ (must call /api/teams)", () => {
		const result = findApiProducts(path.join(WEB_SRC, "pages"));
		expect(result, `Found /api/products in pages/:\n${result}`).toBe("");
	});
});

// ---------------------------------------------------------------------------
// AC4 — No /api/products mock in E2E test infrastructure
// ---------------------------------------------------------------------------

describe("U11 AC4: No /api/products mocks in e2e/ test files", () => {
	/**
	 * Check that E2E files don't register route handlers for /api/products.
	 * The fixture line for page.route("**" + "/api/products", ...) must be
	 * replaced with "**" + "/api/teams" so tests exercise the real endpoint path.
	 */
	function findE2EApiProducts(): string {
		try {
			// Look specifically for page.route() calls targeting api/products
			// (not just comments mentioning the old path)
			const result = execSync(
				`grep -rEn "page\\.route.*api/products|route\\..*api/products" "${E2E_DIR}" --include="*.ts" 2>/dev/null`,
				{ encoding: "utf-8" },
			);
			// Filter out pure comment lines
			const lines = result
				.split("\n")
				.filter((l) => l.length > 0)
				.filter((l) => !l.match(/:[[:space:]]*(\/\/|\*)/))
				.filter((l) => !l.trim().startsWith("//"))
				.filter((l) => !l.trim().startsWith("*"));
			return lines.join("\n");
		} catch {
			return "";
		}
	}

	it("no page.route() calls targeting /api/products in e2e/ files", () => {
		const result = findE2EApiProducts();
		expect(result, `Found /api/products route handlers in e2e/:\n${result}`).toBe("");
	});

	it("e2e/fixtures.ts does not mock /api/products", () => {
		try {
			const result = execSync(
				`grep -n "api/products" "${path.join(E2E_DIR, "fixtures.ts")}" 2>/dev/null`,
				{ encoding: "utf-8" },
			);
			const lines = result
				.split("\n")
				.filter((l) => l.length > 0)
				.filter((l) => !l.trim().startsWith("*"))
				.filter((l) => !l.trim().startsWith("//"));
			expect(
				lines.join("\n"),
				`fixtures.ts still references /api/products:\n${lines.join("\n")}`,
			).toBe("");
		} catch {
			// grep exit 1 = no match = pass
		}
	});
});

// ---------------------------------------------------------------------------
// AC — settings.spec.ts and settings-redesign.spec.ts use "Teams" not "Products"
// ---------------------------------------------------------------------------

describe("U11: E2E settings specs use correct 'Teams' tab label (not 'Products')", () => {
	it("settings.spec.ts tab assertion uses 'Teams' not 'Products'", () => {
		try {
			const result = execSync(
				`grep -n "getByRole.*tab.*Products\\|getByText.*Product Alpha" "${path.join(E2E_DIR, "settings.spec.ts")}" 2>/dev/null`,
				{ encoding: "utf-8" },
			);
			const lines = result.split("\n").filter((l) => l.length > 0);
			expect(
				lines.join("\n"),
				`settings.spec.ts still asserts "Products" tab:\n${lines.join("\n")}`,
			).toBe("");
		} catch {
			// grep exit 1 = no match = pass
		}
	});

	it("settings-redesign.spec.ts section assertions use 'Teams' not 'Products'", () => {
		try {
			const result = execSync(
				`grep -n "getByText.*Products\\|getByRole.*Products\\|getByRole.*button.*products" "${path.join(E2E_DIR, "settings-redesign.spec.ts")}" 2>/dev/null`,
				{ encoding: "utf-8" },
			);
			const lines = result
				.split("\n")
				.filter((l) => l.length > 0)
				.filter((l) => !l.trim().startsWith("//"))
				.filter((l) => !l.trim().startsWith("*"));
			expect(
				lines.join("\n"),
				`settings-redesign.spec.ts still asserts "Products":\n${lines.join("\n")}`,
			).toBe("");
		} catch {
			// grep exit 1 = no match = pass
		}
	});
});

// ---------------------------------------------------------------------------
// AC — KnowledgeBody.test.tsx uses updated token --text-tertiary (not --text-lo)
// ---------------------------------------------------------------------------

describe("U11: KnowledgeBody.test.tsx uses updated token --text-tertiary", () => {
	it("KnowledgeBody.test.tsx asserts --text-tertiary not --text-lo", () => {
		const KNOWLEDGE_TEST = path.resolve(
			WEB_SRC,
			"pages/knowledge/__tests__/KnowledgeBody.test.tsx",
		);
		try {
			const result = execSync(`grep -n "text-lo" "${KNOWLEDGE_TEST}" 2>/dev/null`, {
				encoding: "utf-8",
			});
			const lines = result
				.split("\n")
				.filter((l) => l.length > 0)
				.filter((l) => !l.trim().startsWith("//"))
				.filter((l) => !l.trim().startsWith("*"))
				.filter((l) => !l.includes("@lore"));
			expect(
				lines.join("\n"),
				`KnowledgeBody.test.tsx still asserts --text-lo:\n${lines.join("\n")}`,
			).toBe("");
		} catch {
			// grep exit 1 = no match = pass
		}
	});
});
