/**
 * X1: Session Context Assembly (renamed in AK1 harness-vocab rollout).
 *
 * Assembles a complete instruction document from:
 *  - A system prompt template (persona/identity section)
 *  - Session context data (task, bet, team)
 *  - Tool definitions for the agent's role
 *  - Fixed sandbox orientation text
 *
 * The assembled prompt is written as AGENTS.md + CLAUDE.md to the sandbox root.
 * Claude Agent SDK auto-discovers CLAUDE.md when `settingSources` includes
 * 'project' (the default), injecting it as a system-reminder.
 *
 * @lore X1: CLAUDE.md as primary delivery: writing the assembled prompt as CLAUDE.md
 * in the sandbox means Claude Agent SDK auto-discovers and injects it without
 * duplication. External harnesses (Aider, Goose, OpenCode) read CLAUDE.md from
 * the sandbox root by convention. The adapter's `prompt` field is a short kickoff.
 * @lore AK1: Dual-write: AGENTS.md (standard surface) + CLAUDE.md (compat). See
 * writeSandboxAgentsMd for rationale. Rename per AK1: assembly function renamed,
 * assembled prompt renamed, sandbox path renamed.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { communityForRole, countTokens } from "@hyperidle/core-app";
import { createLogger } from "@hyperidle/shared";
import type { RoutineSessionContextData, SessionContextData } from "./session-context.js";

const logger = createLogger({ pkg: "server.agent-context-prompt" });

/** Input to context assembly. All fields come from prior provisioning phases. */
export interface PromptCompositionInput {
	/**
	 * Inline system prompt text. Empty string = no persona section.
	 *
	 * @lore X3: Changed from a file path to inline text from DB. The DB stores system
	 * prompts directly, eliminating the filesystem read attack surface. The content
	 * may still contain YAML frontmatter (seeded from .md files) — stripFrontmatter()
	 * is called before inclusion.
	 * @lore AK1: Renamed per AK1 harness-vocab plan.
	 */
	readonly systemPromptText: string;
	/** Session context data (task, bet, agent, team). */
	readonly context: SessionContextData;
	/** Tool definitions available to this agent role. */
	readonly tools: readonly ToolSummary[];
	/** Absolute path to the provisioned sandbox directory. */
	readonly sandboxPath: string;
}

/** Minimal tool info needed for context assembly. */
export interface ToolSummary {
	readonly name: string;
	readonly description: string;
}

/** Result of context assembly. */
export interface PromptCompositionResult {
	/** The fully assembled prompt text, written as AGENTS.md + CLAUDE.md in the sandbox. */
	readonly assembledPrompt: string;
	/** Token count of the persona + tools sections (for budget validation). */
	readonly personaToolsTokens: number;
}

/**
 * Maximum tokens allowed for the persona (system prompt) + tools sections combined.
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
 * @lore X1 critique: truncation method specified as: find the first line
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
- \`.fabric/manifest.json\` -- Manifest of assembled context items (do not modify).
`;

/**
 * Assemble a complete session context prompt from system prompt, context,
 * tools, and sandbox orientation.
 *
 * If `systemPromptText` is empty, the Identity section is omitted.
 * Enforces a 4000-token budget on persona + tools; truncates persona if exceeded.
 *
 * @lore AK1: Renamed per AK1 harness-vocab plan.
 * Behaviour identical; only the name and field names change.
 */
export async function assemblePrompt(
	input: PromptCompositionInput,
): Promise<PromptCompositionResult> {
	const { systemPromptText, context, tools, sandboxPath: _sandboxPath } = input;

	// Build persona section from inline text (no file read).
	// @lore X3: Previously read from disk via a path column. Now uses inline text
	// from the DB (agent.systemPrompt). stripFrontmatter is called because the DB
	// content may have been seeded from .md files that include YAML frontmatter.
	let personaSection = "";
	if (systemPromptText.length > 0) {
		const stripped = stripFrontmatter(systemPromptText);
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

	const assembledPrompt = parts.join("\n");

	return { assembledPrompt, personaToolsTokens };
}

/**
 * Write the assembled prompt to the sandbox root as BOTH AGENTS.md AND CLAUDE.md.
 * Synchronous — consistent with other context-assembly writes.
 *
 * @lore AK1: Renamed from writeWorkspaceCLAUDEmd (AK1 harness-vocab rename).
 * Dual-write (DEFAULT): writes AGENTS.md (Linux-Foundation cross-vendor standard,
 * per runtime-simplification.md §4) AND CLAUDE.md (current harness auto-discovery
 * for Claude Agent SDK + Aider/Goose/OpenCode). Both files contain identical content.
 *
 * Rationale for dual-write: no adapter positively verified to read AGENTS.md today;
 * all read CLAUDE.md (see cli-harness-adapter.ts + context-assembly-prompt.ts:10-17).
 * Writing AGENTS.md-only would stop every harness from seeing the assembled context = behaviour change.
 * Dual-write: every harness keeps reading CLAUDE.md (behaviour preserved); AGENTS.md exists
 * as the named standard surface (AC satisfied).
 *
 * @lore AK1 TODO: Once a later WP positively verifies every registered adapter auto-discovers
 * AGENTS.md, the CLAUDE.md write can be dropped. Until then, dual-write stays.
 */
/**
 * Root-level files emitted by writeSandboxAgentsMd (dual-write: AGENTS.md + CLAUDE.md).
 * Exported so the AO2 scaffolding-drift-guard can assert coverage.
 *
 * @lore AO2: These tracked files are critical for the self-host case: this repo
 * itself tracks AGENTS.md and CLAUDE.md. Assembly overwrites them with the assembled
 * system prompt. Without scaffolding-exclusion the authored commit would carry
 * a clobbered CLAUDE.md / AGENTS.md — making it look like the agent modified them.
 */
export const EMITTED_ROOTS_AGENTS_MD = ["AGENTS.md", "CLAUDE.md"] as const;

export function writeSandboxAgentsMd(sandboxPath: string, assembledPrompt: string): void {
	fs.writeFileSync(path.join(sandboxPath, "AGENTS.md"), assembledPrompt, "utf8");
	fs.writeFileSync(path.join(sandboxPath, "CLAUDE.md"), assembledPrompt, "utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// AH3: Assistant persona composer (task-free)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AH3 §4: Result of composing the assistant persona prompt.
 * The single canonical string consumed by both harness adapter paths:
 * - builtin: passed as config.composedPrompt
 * - SDK: written to CLAUDE.md via writeSandboxAgentsMd
 */
export interface AssistantPromptResult {
	/** The composed persona prompt, byte-equal for both adapter paths. */
	readonly composedPrompt: string;
}

/**
 * AH3 §4: Compose a task-free assistant persona prompt from a system prompt string.
 *
 * Unlike assemblePrompt (which requires task/bet/team context), this function
 * produces a lightweight prompt containing only the persona (identity section)
 * and a short orientation. Used for the assistant conversational turn — no task,
 * no bet, no sandbox context assembly.
 *
 * **Byte-equality invariant:** the returned `composedPrompt` must be:
 *   - Passed verbatim as the builtin adapter's config.composedPrompt
 *   - Written verbatim to CLAUDE.md for the SDK adapter via writeSandboxAgentsMd
 * This guarantees the same bytes reach the model regardless of which harness executes.
 *
 * @param systemPromptText - Raw system prompt (may contain YAML frontmatter). Empty = no identity section.
 * @returns { composedPrompt } — the canonical prompt string.
 *
 * @lore AH3: composeAssistantPrompt is intentionally synchronous (vs assemblePrompt's async)
 * because it does no I/O — no sandbox files to read, no token-budget checks against DB.
 * Kept synchronous to avoid unnecessary Promise overhead in the hot path of every turn.
 * @lore AK1: systemPromptText is the post-rename persona parameter (harness-vocab rename).
 * Behaviour identical.
 */
export function composeAssistantPrompt(systemPromptText: string): AssistantPromptResult {
	const parts: string[] = ["# Assistant Instructions", ""];

	if (systemPromptText.length > 0) {
		const stripped = stripFrontmatter(systemPromptText);
		if (stripped.trim().length > 0) {
			parts.push("## Identity", "", stripped.trimEnd(), "");
		}
	}

	parts.push("## Conversation");
	parts.push("");
	parts.push(
		"You are a helpful AI assistant in HyperIdle. Respond concisely and helpfully to the user's messages.",
	);
	parts.push("");

	const composedPrompt = parts.join("\n");
	return { composedPrompt };
}

// ─────────────────────────────────────────────────────────────────────────────
// AA2: Routine prompt assembly
// ─────────────────────────────────────────────────────────────────────────────

/** Input to routine prompt assembly (AA2). */
export interface RoutinePromptCompositionInput {
	readonly systemPromptText: string;
	/** Routine session context data — no task/bet fields. */
	readonly context: RoutineSessionContextData;
	readonly tools: readonly ToolSummary[];
	readonly sandboxPath: string;
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
 * Assemble a complete routine session context prompt (AA2).
 * Parallel to assemblePrompt but uses buildRoutineTaskSection instead of buildTaskSection.
 *
 * @lore AA2: assembleRoutinePrompt is a standalone function (not a branch inside
 * assemblePrompt) because the context types are fundamentally different:
 * RoutineSessionContextData has no task/bet fields. Keeping them separate avoids
 * a type union that would require discriminated checks in every section builder.
 * @lore AK1: Renamed from composeRoutinePrompt (harness-vocab rename).
 */
export async function assembleRoutinePrompt(
	input: RoutinePromptCompositionInput,
): Promise<PromptCompositionResult> {
	const { systemPromptText, context, tools, sandboxPath: _sandboxPath } = input;

	// Build persona section from inline text (same as assemblePrompt)
	let personaSection = "";
	if (systemPromptText.length > 0) {
		const stripped = stripFrontmatter(systemPromptText);
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

	const assembledPrompt = parts.join("\n");

	return { assembledPrompt, personaToolsTokens };
}
