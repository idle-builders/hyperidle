/**
 * X1: Session Prompt Composition.
 *
 * Assembles a complete instruction document from:
 *  - A soul prompt template file (persona/identity section)
 *  - Session context data (task, bet, team)
 *  - Tool definitions for the agent's role
 *  - Fixed workspace orientation text
 *
 * The composed prompt is written as CLAUDE.md to the workspace root.
 * Claude Agent SDK auto-discovers CLAUDE.md when `settingSources` includes
 * 'project' (the default), injecting it as a system-reminder.
 *
 * @lore X1: CLAUDE.md as primary delivery (not systemPrompt): writing the
 * composed prompt as CLAUDE.md in the workspace means Claude Agent SDK
 * auto-discovers and injects it without duplication. External harnesses
 * (Aider, Goose, OpenCode) read CLAUDE.md from the workspace root by
 * convention. The adapter's `prompt` field becomes a short kickoff message.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createLogger } from "@hyperidle/shared";
import { communityForRole } from "./role-community-map.js";
import type { RoutineSessionContextData, SessionContextData } from "./session-context.js";
import { countTokens } from "./token-budget.js";

const logger = createLogger({ pkg: "fabric.prompt-composition" });

/** Input to prompt composition. All fields come from prior provisioning phases. */
export interface PromptCompositionInput {
	/**
	 * Inline soul prompt text. Empty string = no persona section.
	 *
	 * @lore X3: Changed from soulPromptPath (file read) to soulPromptText (inline
	 * from DB). The DB stores soul prompts directly, eliminating the filesystem read
	 * attack surface. The content may still contain YAML frontmatter (seeded from
	 * .md files) — stripFrontmatter() is called before inclusion.
	 */
	readonly soulPromptText: string;
	/** Session context data (task, bet, agent, team). */
	readonly context: SessionContextData;
	/** Tool definitions available to this agent role. */
	readonly tools: readonly ToolSummary[];
	/** Absolute path to the materialized workspace. */
	readonly workspacePath: string;
}

/** Minimal tool info needed for prompt composition. */
export interface ToolSummary {
	readonly name: string;
	readonly description: string;
}

/** Result of prompt composition. */
export interface PromptCompositionResult {
	/** The fully composed prompt text, ready to write as CLAUDE.md. */
	readonly composedPrompt: string;
	/** Token count of the persona + tools sections (for budget validation). */
	readonly personaToolsTokens: number;
}

/**
 * Maximum tokens allowed for the persona (soul prompt) + tools sections combined.
 * A safety rail — not a tight constraint. Typical prompts use 500-800 tokens.
 */
const PERSONA_TOOLS_TOKEN_BUDGET = 4000;

/**
 * Strip YAML frontmatter from markdown content.
 * Frontmatter is delimited by `---` at the very start of the file.
 */
export function stripFrontmatter(content: string): string {
	// Match frontmatter: starts at position 0, first --- to second ---, including trailing newlines
	return content.replace(/^---\n[\s\S]*?\n---\n*/, "");
}

/**
 * Substitute `{{key}}` placeholders in a template string.
 * Keys not present in `vars` are left as-is (passthrough behavior — unregistered
 * variables appear literally in the output, making gaps visible during review).
 */
export function substituteTemplateVars(template: string, vars: Record<string, string>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
		const value = vars[key];
		return value !== undefined ? value : `{{${key}}}`;
	});
}

/**
 * Build the template variable map for a given session context.
 * Returns { product, community }.
 */
export function buildTemplateVariables(context: SessionContextData): Record<string, string> {
	const community = communityForRole(context.agent.role);
	return {
		product: context.team.name,
		community,
	};
}

/**
 * Truncate persona content to fit within the token budget.
 * Keeps the first heading and first paragraph after it.
 * If no heading is found, keeps the first 500 tokens.
 *
 * @lore X1 critique: truncation strategy specified as: find the first line
 * matching /^#/ and the first blank line after it. Keep everything from start
 * through that blank line. If no heading, keep first 500 tokens.
 */
function truncatePersona(persona: string): string {
	const lines = persona.split("\n");

	// Find the first heading line
	const headingIdx = lines.findIndex((line) => /^#/.test(line));
	if (headingIdx === -1) {
		// No heading — keep first 500 tokens worth of words
		const words = persona.split(/\s+/);
		return words.slice(0, 500).join(" ");
	}

	// Find the first blank line after the heading
	let blankIdx = -1;
	for (let i = headingIdx + 1; i < lines.length; i++) {
		const line = lines[i];
		if (line !== undefined && line.trim() === "") {
			blankIdx = i;
			break;
		}
	}

	if (blankIdx === -1) {
		// No blank line found after heading — take heading + rest
		return lines.slice(0, headingIdx + 2).join("\n");
	}

	return lines.slice(0, blankIdx + 1).join("\n");
}

/**
 * Build the tools section markdown.
 */
function buildToolsSection(tools: readonly ToolSummary[]): string {
	if (tools.length === 0) {
		return "## Available Tools\n\nNo tools available for this session.\n";
	}
	const items = tools.map((t) => `- **${t.name}** -- ${t.description}`).join("\n");
	return `## Available Tools\n\nYou have access to the following tools:\n\n${items}\n`;
}

/**
 * Build the task section markdown.
 */
function buildTaskSection(context: SessionContextData): string {
	const description = context.task.description ?? "No description provided.";
	const doneCondition = context.bet.doneCondition ?? "Not specified.";

	return [
		"## Task",
		"",
		`**Title:** ${context.task.title}`,
		`**Description:** ${description}`,
		"",
		"### Done Condition",
		"",
		doneCondition,
		"",
		"### Bet Context",
		"",
		`**Bet:** ${context.bet.description}`,
		`**Appetite:** ${context.bet.appetite}`,
		"",
	].join("\n");
}

/** Fixed workspace orientation text. */
const WORKSPACE_SECTION = `## Workspace

Your workspace is organized as follows:

- \`context/\` -- Read-only context files. Product knowledge, practice knowledge, factory-wide knowledge, and your session context (session.toon).
  - \`product/\` -- Product-specific knowledge items (L2).
  - \`practices/\` -- Practice community knowledge items (L3).
  - \`factory/\` -- Factory-wide knowledge items (L4).
  - \`session.toon\` -- Encoded session context (task, bet, agent, team data).
- \`knowledge/\` -- Knowledge files you can read and update.
  - \`practices/\` -- Practice knowledge.
  - \`decisions/\` -- Decision records.
  - \`failures/\` -- Failure postmortems.
- \`work/\` -- Your working area.
  - \`artifacts/\` -- Output artifacts.
  - \`task-notes.md\` -- Your session notes (use write_session_notes tool).
- \`.fabric/manifest.json\` -- Manifest of materialized items (do not modify).
`;

/**
 * Compose a complete session instruction prompt from soul prompt, context,
 * tools, and workspace orientation.
 *
 * If `soulPromptPath` is empty, the Identity section is omitted.
 * Enforces a 4000-token budget on persona + tools; truncates persona if exceeded.
 */
export async function composePrompt(
	input: PromptCompositionInput,
): Promise<PromptCompositionResult> {
	const { soulPromptText, context, tools, workspacePath: _workspacePath } = input;

	// Build persona section from inline text (no file read).
	// @lore X3: Previously read from disk via soulPromptPath. Now uses inline text
	// from the DB (agent.soulPrompt). stripFrontmatter is called because the DB
	// content may have been seeded from .md files that include YAML frontmatter.
	let personaSection = "";
	if (soulPromptText.length > 0) {
		const stripped = stripFrontmatter(soulPromptText);
		const vars = buildTemplateVariables(context);
		personaSection = substituteTemplateVars(stripped, vars);
	}

	const toolsContent = buildToolsSection(tools);

	// Enforce token budget on persona + tools
	const personaTokens = countTokens(personaSection);
	const toolsTokens = countTokens(toolsContent);
	let personaToolsTokens = personaTokens + toolsTokens;

	if (personaToolsTokens > PERSONA_TOOLS_TOKEN_BUDGET && personaSection.length > 0) {
		logger.warn(
			`Persona + tools section exceeds ${PERSONA_TOOLS_TOKEN_BUDGET} tokens (${personaToolsTokens}). Truncating persona.`,
		);
		personaSection = `${truncatePersona(personaSection)}\n\n(Persona truncated to fit token budget.)`;
		personaToolsTokens = countTokens(personaSection) + toolsTokens;
	}

	// Assemble sections
	const parts: string[] = ["# Session Instructions", ""];

	if (personaSection.length > 0) {
		parts.push("## Identity", "", personaSection.trimEnd(), "");
	}

	const taskSection = buildTaskSection(context);
	parts.push(taskSection);

	parts.push(toolsContent);

	parts.push(WORKSPACE_SECTION);

	const composedPrompt = parts.join("\n");

	return { composedPrompt, personaToolsTokens };
}

/**
 * Write the composed prompt as CLAUDE.md in the workspace root.
 * Synchronous — consistent with other materialization writes.
 */
export function writeWorkspaceCLAUDEmd(workspacePath: string, composedPrompt: string): void {
	const claudeMdPath = path.join(workspacePath, "CLAUDE.md");
	fs.writeFileSync(claudeMdPath, composedPrompt, "utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// AA2: Routine prompt composition
// ─────────────────────────────────────────────────────────────────────────────

/** Input to routine prompt composition (AA2). */
export interface RoutinePromptCompositionInput {
	readonly soulPromptText: string;
	/** Routine session context data — no task/bet fields. */
	readonly context: RoutineSessionContextData;
	readonly tools: readonly ToolSummary[];
	readonly workspacePath: string;
}

/**
 * Build the routine section markdown (AA2).
 * Replaces buildTaskSection for routine sessions — shows routine name/purpose
 * and last run summary instead of task/bet context.
 */
function buildRoutineTaskSection(context: RoutineSessionContextData): string {
	const parts: string[] = ["## Routine", "", `**Name:** ${context.routine.name}`];

	if (context.routine.description) {
		parts.push(`**Purpose:** ${context.routine.description}`);
	}

	parts.push("");
	parts.push("### Last Run Summary");
	parts.push("");

	if (context.routine.lastRunSummary) {
		parts.push(context.routine.lastRunSummary);
	} else {
		parts.push("This is the first run of this routine.");
	}

	parts.push("");

	return parts.join("\n");
}

/**
 * Compose a complete routine session instruction prompt (AA2).
 * Parallel to composePrompt but uses buildRoutineTaskSection instead of buildTaskSection.
 *
 * @lore AA2: composeRoutinePrompt is a standalone function (not a branch inside
 * composePrompt) because the context types are fundamentally different:
 * RoutineSessionContextData has no task/bet fields. Keeping them separate avoids
 * a type union that would require discriminated checks in every section builder.
 */
export async function composeRoutinePrompt(
	input: RoutinePromptCompositionInput,
): Promise<PromptCompositionResult> {
	const { soulPromptText, context, tools, workspacePath: _workspacePath } = input;

	// Build persona section from inline text (same as composePrompt)
	let personaSection = "";
	if (soulPromptText.length > 0) {
		const stripped = stripFrontmatter(soulPromptText);
		// For routine sessions, use team name as the product variable
		const vars: Record<string, string> = {
			product: context.team.name,
			community: communityForRole(context.agent.role),
		};
		personaSection = substituteTemplateVars(stripped, vars);
	}

	const toolsContent = buildToolsSection(tools);

	// Enforce token budget on persona + tools
	const personaTokens = countTokens(personaSection);
	const toolsTokens = countTokens(toolsContent);
	let personaToolsTokens = personaTokens + toolsTokens;

	if (personaToolsTokens > PERSONA_TOOLS_TOKEN_BUDGET && personaSection.length > 0) {
		logger.warn(
			`Routine persona + tools section exceeds ${PERSONA_TOOLS_TOKEN_BUDGET} tokens (${personaToolsTokens}). Truncating persona.`,
		);
		personaSection = `${truncatePersona(personaSection)}\n\n(Persona truncated to fit token budget.)`;
		personaToolsTokens = countTokens(personaSection) + toolsTokens;
	}

	// Assemble sections
	const parts: string[] = ["# Session Instructions", ""];

	if (personaSection.length > 0) {
		parts.push("## Identity", "", personaSection.trimEnd(), "");
	}

	const routineSection = buildRoutineTaskSection(context);
	parts.push(routineSection);

	parts.push(toolsContent);

	parts.push(WORKSPACE_SECTION);

	const composedPrompt = parts.join("\n");

	return { composedPrompt, personaToolsTokens };
}
