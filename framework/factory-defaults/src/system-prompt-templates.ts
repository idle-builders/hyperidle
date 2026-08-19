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
 * @lore AU29: moved verbatim from `framework/db/src/system-prompt-templates.ts`
 * into `framework/factory-defaults` — this module performs no database access (it never
 * had a `db:*` surface; `tools/governance/architecture.json` deliberately did not
 * name it, and it was one of the four symbols that fell to `db:unknown`). The
 * cwd-relative `docs/` resolution and the closed allowlist map are unchanged
 * — this IS the traversal defense; "improving" it is a regression, not a move.
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

/**
 * Strip YAML frontmatter from markdown content.
 *
 * @lore Moved verbatim from `factory-bootstrap.ts` (AU18 round 3) — it was a
 * local, non-exported function whose only caller was bootstrap itself
 * (grep-confirmed no other importer), so the move is a safe, non-duplicating
 * refactor. `context-assembly-prompt.ts` in `packages/server` has its own,
 * unrelated exported `stripFrontmatter` — deliberately not consolidated
 * (different packages, different concerns; @hyperidle/db must not depend on
 * @hyperidle/server).
 */
function stripFrontmatter(content: string): string {
	return content.replace(/^---\n[\s\S]*?\n---\n*/, "");
}

/**
 * Read a system prompt template file from `<docsRoot>/system-prompts/<filename>`
 * and strip frontmatter. Returns null if the file does not exist (graceful
 * degradation — moved verbatim from `factory-bootstrap.ts`, name + signature
 * unchanged).
 *
 * @lore AU29 end state (architecture.md §2.3): module-internal, not
 * barrel-exported. It was barrel-exported only as an interim state between
 * tasks A and D, while `framework/db/src/factory-bootstrap.ts:192` still
 * called it cross-package; task D deleted that file (its successor, the
 * agent-orchestration first-boot face, calls `readSystemPromptTemplateForRole`
 * instead). Its only remaining caller is `readSystemPromptTemplateForRole`
 * below, in-module.
 */
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
 * returns `null` before any filesystem access ever happens. The filename
 * that reaches `fs` is therefore always a compile-time literal from the map,
 * never derived from `role` itself — this is what closes the path-traversal
 * sink by construction (AU18 round 3 CRITICAL fix).
 *
 * @lore AU18 §10 Q2: resolves docsRoot as `path.resolve(process.cwd(), "docs")`.
 * `factory-bootstrap.ts` already resolves the identical path and reads the
 * identical files in-process at server startup, so this introduces no new
 * deployment dependency — if `docs/` is missing, bootstrap already fails first.
 */
export function readSystemPromptTemplateForRole(role: string): string | null {
	const filename = SYSTEM_PROMPT_TEMPLATE_FILES[role];
	if (filename === undefined) return null;
	const docsRoot = path.resolve(process.cwd(), "docs");
	return readSystemPromptTemplate(docsRoot, filename);
}
