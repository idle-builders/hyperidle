import * as fs from "node:fs";
import * as path from "node:path";

/**
 * AU18 §3/§7 (round 3): single home for docs-backed system-prompt template
 * resolution. Extracted from `factory-bootstrap.ts` when `factorySettings`
 * (which used to cache these as `system_template:<role>` rows) was retired.
 *
 * @lore AU18 round-3 CRITICAL fix: the round-2 plan tried `${role}.md` +
 * a `^[a-z][a-z-]*$` charset regex as the traversal defense. Both were wrong:
 * the regex rejected the underscore in `product_manager`/`qa_engineer`, and
 * the naive stem produced `product_manager.md` — a file that does not exist
 * (the real file is `product-manager.md`). The fix is this exact map: it IS
 * the allowlist. An untrusted `role` string only ever indexes into this
 * compile-time-literal map — a `role` that is not an exact key returns
 * `null` before any filesystem access, so path traversal is closed by
 * construction (no regex, no post-resolve containment check needed).
 *
 * `assistant` is deliberately NOT a key here: `factory-bootstrap.ts` never
 * seeded `system_template:assistant` (@lore AD8a — assistant.md exists on
 * disk but the catalog entry's `hasTemplate:true` was never backed by a
 * bootstrap seed), so `GET /api/agents/templates/assistant` has always been
 * a 404. Excluding it from the map preserves that 404 exactly.
 *
 * @lore AU44 AU20-fd: moved from `framework/factory-defaults/src/system-prompt-templates.ts`
 * into `@hyperidle/org` — the package that owns scaffold resolution and the
 * system-prompt seam. No database access. The traversal defense is unchanged.
 */
const SYSTEM_PROMPT_TEMPLATE_FILES: Readonly<Record<string, string>> = {
	product_manager: "product-manager.md",
	facilitator: "facilitator.md",
	builder: "builder.md",
	growth: "growth.md",
	designer: "designer.md",
	qa_engineer: "qa-engineer.md",
	ops: "ops.md",
};

function stripFrontmatter(content: string): string {
	return content.replace(/^---\n[\s\S]*?\n---\n*/, "");
}

function readSystemPromptTemplate(docsRoot: string, filename: string): string | null {
	const filePath = path.join(docsRoot, "system-prompts", filename);
	try {
		const content = fs.readFileSync(filePath, "utf8");
		return stripFrontmatter(content);
	} catch {
		return null;
	}
}

/**
 * Read a system prompt template by role. `role` is untrusted (route param /
 * roster lookup) — it is resolved ONLY via a lookup into
 * {@link SYSTEM_PROMPT_TEMPLATE_FILES}; a `role` that is not an exact key
 * returns `null` before any filesystem access ever happens.
 *
 * @lore AU18 §10 Q2: resolves docsRoot as `path.resolve(process.cwd(), "docs")`.
 */
export function readSystemPromptTemplateForRole(role: string): string | null {
	const filename = SYSTEM_PROMPT_TEMPLATE_FILES[role];
	if (filename === undefined) return null;
	const docsRoot = path.resolve(process.cwd(), "docs");
	return readSystemPromptTemplate(docsRoot, filename);
}
