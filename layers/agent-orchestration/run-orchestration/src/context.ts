import * as fs from "node:fs";
import * as path from "node:path";
import { createLogger } from "@hyperidle/diagnostics";
import type {
	AgentSessionSourceCorrelation,
	AgentSessionSourceKind,
	BakedContextBundle,
	BakedContextKnowledgeItem,
	RoutineTriggerEvent,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";

/**
 * AU21 §9 Increment 12 (Decision H3), Wave C — `context.ts` is now pure
 * format/write. Every DB-reading path (`fetchAllForLayer`/`rankAndBudget`/
 * `buildSessionContextData`/`buildRoutineSessionContextData`/`assembleContext`)
 * is DELETED, not seam-routed — the entity content (task/bet/agent/team or
 * routine/agent/team) + the ranked+budgeted knowledge bundle are baked at
 * EMIT time by each per-kind resolver (`@hyperidle/work`'s
 * `task-run-resolver.ts`, `@hyperidle/knowledge`'s
 * `knowledge-action-resolver.ts`, `@hyperidle/routine`'s
 * `resolveRoutineRunRequest`)
 * calling the shared `@hyperidle/knowledge`'s `assembleSessionKnowledge`
 * (Wave A) — the `requireRunnableAgent` precedent. `assembleAgentContext`
 * below consumes the baked `contextBundle` carried on the session request and
 * writes `session.toon` + `context/{product,practices,factory}/*` — ZERO db
 * reads, zero `ContextAssemblyPorts` domain members (`knowledge`/`work`/
 * `users`/`routine`/`org` are gone; only `filesystems` remains, for
 * `beginAgentWriteback`'s watcher).
 */

interface ContextAssemblyFileWatcherConfig {
	readonly sandboxPath: string;
	readonly sessionId: string;
	readonly manifestPath: string;
	readonly eventBus: EventBus;
	readonly onError: (error: Error) => void;
}

interface ContextAssemblyFileWatcher {
	stop(): void;
}

interface FilesystemsReader {
	startWatcher(config: ContextAssemblyFileWatcherConfig): ContextAssemblyFileWatcher;
}

/**
 * The deps-free surface `assembleAgentContext`/`beginAgentWriteback` need.
 * Shrunk to `filesystems` only (Increment 12 Wave C) — every domain-reading
 * member (`knowledge`/`work`/`users`/`routine`/`org`) is deleted; nothing in
 * this file reads core-api domain state anymore.
 */
interface ContextAssemblyPorts {
	readonly filesystems: FilesystemsReader;
}

interface SessionContextData {
	task: {
		id: string;
		title: string;
		description: string | null;
		state: string;
	};
	/** Root-first chain of ancestor tasks. ancestors[0] is the root task (the former "bet"). */
	ancestors: readonly {
		id: string;
		title: string;
		description: string | null;
		doneCondition: string | null;
	}[];
	agent: {
		id: string;
		name: string;
		role: string;
	};
	team: {
		id: string;
		name: string;
	};
}

/**
 * Map a `kind:"task"` baked `contextBundle` onto the `SessionContextData`
 * shape `assemblePrompt` needs — a pure passthrough, the two shapes match
 * field-for-field (Increment 12 Wave B baked exactly this shape).
 */
function sessionContextDataFromBundle(
	bundle: Extract<BakedContextBundle, { kind: "task" }>,
): SessionContextData {
	return {
		task: bundle.task,
		ancestors: bundle.ancestors,
		agent: bundle.agent,
		team: bundle.team,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// AA2: Routine session context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context data for a routine session (AA2).
 * Contains routine + agent + team — no task or bet fields.
 *
 * @lore AA2/AU1: Routine sessions MUST NOT read task/bet context. They are
 * task-free sessions; their content comes exclusively from the baked
 * `kind:"routine"` contextBundle (Increment 12 Wave C), never a task/bet read.
 */
interface RoutineSessionContextData {
	routine: {
		id: string;
		name: string;
		/** BA1 D3: one column, one field — replaces `description`. */
		prompt: string | null;
		lastRunSummary: string | null;
	};
	agent: {
		id: string;
		name: string;
		role: string;
	};
	/** BA1 D4: nullable — the owner agent may belong to no team. */
	team: {
		id: string;
		name: string;
	} | null;
	/**
	 * BA9c: The event that caused this routine to fire. Absent for clock-fired
	 * (heartbeat/calendar) routines.
	 */
	triggerEvent?: RoutineTriggerEvent;
}

/** Map a `kind:"routine"` baked `contextBundle` onto `RoutineSessionContextData` — a pure passthrough. */
function routineSessionContextDataFromBundle(
	bundle: Extract<BakedContextBundle, { kind: "routine" }>,
): RoutineSessionContextData {
	return {
		routine: bundle.routine,
		agent: bundle.agent,
		team: bundle.team,
		// BA9c: thread through the trigger event (absent for clock-fired runs).
		...(bundle.triggerEvent !== undefined ? { triggerEvent: bundle.triggerEvent } : {}),
	};
}

/**
 * Encode an object into TOON format (flat key-path lines).
 * Inlined from the deleted @hyperidle/toon-codec package — encode-only,
 * no decoder exists or is needed (the LLM is the decoder).
 */
function encodeToon(obj: object): string {
	const lines: string[] = [];
	flattenToLines(obj, "", lines);
	return lines.join("\n");
}

function flattenToLines(value: unknown, prefix: string, lines: string[]): void {
	// @lore I6: skip undefined values, matching JSON.stringify behavior.
	if (value === undefined) return;
	if (value === null) {
		lines.push(`${prefix}:`);
		return;
	}
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) flattenToLines(value[i], `${prefix}[${i}]`, lines);
		return;
	}
	if (typeof value === "object") {
		for (const [k, v] of Object.entries(value as Record<string, unknown>))
			flattenToLines(v, prefix ? `${prefix}.${k}` : k, lines);
		return;
	}
	if (typeof value === "string") {
		if (value === "") {
			lines.push(`${prefix}: `);
			return;
		}
		if (value.includes("\n")) {
			lines.push(`${prefix}: |`);
			for (const line of value.split("\n")) lines.push(`  ${line}`);
			return;
		}
		lines.push(`${prefix}: ${value}`);
		return;
	}
	lines.push(`${prefix}: ${String(value)}`);
}

/** Build session.toon content from a task-or-routine session's derived context data. */
function buildSessionContextToon(data: SessionContextData | RoutineSessionContextData): string {
	return encodeToon(data);
}

// ---- context-assembly-prompt ----
const logger = createLogger({ pkg: "server.agent-context-prompt" });

/** Input to context assembly. All fields come from prior provisioning phases. */
interface PromptCompositionInput {
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
interface ToolSummary {
	readonly name: string;
	readonly description: string;
}

/** Result of context assembly. */
interface PromptCompositionResult {
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
 * Approximate token count for budget-checking the persona + tools sections.
 *
 * @lore AU21 §9 Increment 12 (Decision H3), Wave C: relocated from
 * `contextPorts.knowledge.countTokens` (`run-orchestration-composition.ts`) —
 * that binding was ALWAYS this same self-contained byte-length approximation,
 * never a real `@hyperidle/knowledge` call (verified from source), so
 * inlining it here drops zero behavior and removes the last reason this file
 * needed a `knowledge` port at all.
 */
function approxTokenCount(text: string): number {
	return Math.ceil(Buffer.byteLength(text, "utf8") / 4);
}

/**
 * Strip YAML frontmatter from markdown content.
 * Frontmatter is delimited by `---` at the very start of the file.
 */
function stripFrontmatter(content: string): string {
	// Match frontmatter: starts at position 0, first --- to second ---, including trailing newlines
	return content.replace(/^---\n[\s\S]*?\n---\n*/, "");
}

/**
 * Substitute `{{key}}` placeholders in a template string.
 * Keys not present in `vars` are left as-is (passthrough behavior — unregistered
 * variables appear literally in the output, making gaps visible during review).
 */
function substituteTemplateVars(template: string, vars: Record<string, string>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
		const value = vars[key];
		return value !== undefined ? value : `{{${key}}}`;
	});
}

/**
 * Build the template variable map for a given session context.
 * Returns { product, community }.
 */
function buildTemplateVariables(context: SessionContextData): Record<string, string> {
	const community = context.agent.role;
	return {
		product: context.team.name,
		community,
	};
}

function truncatePersona(persona: string): string {
	const lines = persona.split("\n");

	const headingIdx = lines.findIndex((line) => /^#/.test(line));
	if (headingIdx === -1) {
		const words = persona.split(/\s+/);
		return words.slice(0, 500).join(" ");
	}

	let blankIdx = -1;
	for (let i = headingIdx + 1; i < lines.length; i++) {
		const line = lines[i];
		if (line !== undefined && line.trim() === "") {
			blankIdx = i;
			break;
		}
	}

	if (blankIdx === -1) {
		return lines.slice(0, headingIdx + 2).join("\n");
	}

	return lines.slice(0, blankIdx + 1).join("\n");
}

function buildToolsSection(tools: readonly ToolSummary[]): string {
	if (tools.length === 0) {
		return "## Available Tools\n\nNo tools available for this session.\n";
	}
	const items = tools.map((t) => `- **${t.name}** -- ${t.description}`).join("\n");
	return `## Available Tools\n\nYou have access to the following tools:\n\n${items}\n`;
}

function buildTaskSection(context: SessionContextData): string {
	const description = context.task.description ?? "No description provided.";
	// Root ancestor (ancestors[0]) carries the top-level done condition.
	const rootAncestor = context.ancestors[0];
	const doneCondition = rootAncestor?.doneCondition ?? "Not specified.";

	const parts = [
		"## Task",
		"",
		`**Title:** ${context.task.title}`,
		`**Description:** ${description}`,
		"",
		"### Done Condition",
		"",
		doneCondition,
		"",
	];

	if (context.ancestors.length > 0) {
		parts.push("### Context");
		parts.push("");
		// Show root-first so the agent sees the big goal before the immediate parent.
		for (const ancestor of context.ancestors) {
			const detail = ancestor.description ? ` — ${ancestor.description}` : "";
			parts.push(`- **${ancestor.title}**${detail}`);
		}
		parts.push("");
	}

	return parts.join("\n");
}

const WORKSPACE_SECTION = `## Workspace

Your workspace is organized as follows:

- \`context/\` -- Read-only context files. Product knowledge, practice knowledge, factory-wide knowledge, and your session context (session.toon).
  - \`product/\` -- Product-specific knowledge items (L2).
  - \`practices/\` -- Practice community knowledge items (L3).
  - \`factory/\` -- Factory-wide knowledge items (L4).
  - \`session.toon\` -- Encoded session context (task, ancestors, agent, team data).
- \`knowledge/\` -- Knowledge files you can read and update.
  - \`practices/\` -- Practice knowledge.
  - \`decisions/\` -- Decision records.
  - \`failures/\` -- Failure postmortems.
  - \`rules/\` -- Rules and guidelines that apply to your work.
- \`work/\` -- Your working area.
  - \`artifacts/\` -- Output artifacts.
  - \`task-notes.md\` -- Your session notes (use write_session_notes tool).
- \`.fabric/manifest.json\` -- Manifest of assembled context items (do not modify).
`;

function assemblePrompt(input: PromptCompositionInput): PromptCompositionResult {
	const { systemPromptText, context, tools, sandboxPath: _sandboxPath } = input;

	let personaSection = "";
	if (systemPromptText.length > 0) {
		const stripped = stripFrontmatter(systemPromptText);
		const vars = buildTemplateVariables(context);
		personaSection = substituteTemplateVars(stripped, vars);
	}

	const toolsContent = buildToolsSection(tools);

	// Enforce token budget on persona + tools
	const personaTokens = approxTokenCount(personaSection);
	const toolsTokens = approxTokenCount(toolsContent);
	let personaToolsTokens = personaTokens + toolsTokens;

	if (personaToolsTokens > PERSONA_TOOLS_TOKEN_BUDGET && personaSection.length > 0) {
		logger.warn(
			`Persona + tools section exceeds ${PERSONA_TOOLS_TOKEN_BUDGET} tokens (${personaToolsTokens}). Truncating persona.`,
		);
		personaSection = `${truncatePersona(personaSection)}\n\n(Persona truncated to fit token budget.)`;
		personaToolsTokens = approxTokenCount(personaSection) + toolsTokens;
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
const EMITTED_AGENT_FILES = ["AGENTS.md", "CLAUDE.md"] as const;

function writeSandboxAgentsMd(sandboxPath: string, assembledPrompt: string): void {
	for (const file of EMITTED_AGENT_FILES) {
		fs.writeFileSync(path.join(sandboxPath, file), assembledPrompt, "utf8");
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// AA2: Routine prompt assembly
// ─────────────────────────────────────────────────────────────────────────────

/** Input to routine prompt assembly (AA2). */
interface RoutinePromptCompositionInput {
	readonly systemPromptText: string;
	/** Routine session context data — no task/bet fields. */
	readonly context: RoutineSessionContextData;
	readonly tools: readonly ToolSummary[];
	readonly sandboxPath: string;
}

/**
 * Build the routine section markdown (AA2).
 * Replaces buildTaskSection for routine sessions — shows routine name/purpose,
 * last run summary, and (BA9c) the trigger event context when this run was
 * caused by a domain event rather than a clock tick.
 */
function buildRoutineTaskSection(context: RoutineSessionContextData): string {
	const parts: string[] = ["## Routine", "", `**Name:** ${context.routine.name}`];

	if (context.routine.prompt) {
		parts.push("", "### Instruction", "", context.routine.prompt);
	}

	// BA9c: render trigger event context when present.
	if (context.triggerEvent) {
		const ev = context.triggerEvent;
		const eventTime = new Date(ev.timestamp).toISOString();
		parts.push("");
		parts.push("### Trigger Event");
		parts.push("");
		parts.push(`**Event type:** ${ev.type}`);
		parts.push(`**When:** ${eventTime}`);
		if (ev.transition) {
			parts.push(`**Transition:** ${ev.transition.from} → ${ev.transition.to}`);
		}
		if (ev.subject) {
			if (ev.subject.kind === "task") {
				parts.push("");
				parts.push("**Task that triggered this run:**");
				parts.push(`- **Title:** ${ev.subject.task.title}`);
				parts.push(`- **ID:** ${ev.subject.task.id}`);
				parts.push(`- **State:** ${ev.subject.task.state}`);
				if (ev.subject.task.description) {
					parts.push(`- **Description:** ${ev.subject.task.description}`);
				}
				if (ev.subject.ancestors.length > 0) {
					parts.push("");
					parts.push("**Ancestor tasks (root first):**");
					for (const ancestor of ev.subject.ancestors) {
						const detail = ancestor.description ? ` — ${ancestor.description}` : "";
						parts.push(`- **${ancestor.title}**${detail}`);
					}
				}
			} else if (ev.subject.kind === "generic") {
				parts.push("");
				const kindLabel =
					ev.subject.entityKind.charAt(0).toUpperCase() + ev.subject.entityKind.slice(1);
				parts.push(`**${kindLabel} that triggered this run:**`);
				parts.push(`- **ID:** ${ev.subject.entityId}`);
				if (ev.subject.actorId) {
					parts.push(`- **Actor:** ${ev.subject.actorId}`);
				}
			} else if (ev.subject.kind === "thread") {
				parts.push("");
				parts.push("**Thread that triggered this run:**");
				parts.push(`- **Host:** ${ev.subject.thread.hostKind} ${ev.subject.thread.hostId}`);
				parts.push(
					`- **State:** ${ev.subject.thread.resolvedAt ? `resolved (${ev.subject.thread.resolvedAt})` : "open"}`,
				);
				if (ev.subject.actorId) {
					parts.push(`- **Actor:** ${ev.subject.actorId}`);
				}
			} else if (ev.subject.kind === "item") {
				parts.push("");
				parts.push("**Item that triggered this run:**");
				parts.push(`- **Title:** ${ev.subject.item.title}`);
				if (ev.subject.item.kind) {
					parts.push(`- **Type:** ${ev.subject.item.kind}`);
				}
				if (ev.subject.actorId) {
					parts.push(`- **Actor:** ${ev.subject.actorId}`);
				}
			} else if (ev.subject.kind === "knowledge-item") {
				parts.push("");
				parts.push("**Knowledge item that triggered this run:**");
				parts.push(`- **Title:** ${ev.subject.item.title}`);
				parts.push(`- **Format:** ${ev.subject.item.format}`);
				if (ev.subject.actorId) {
					parts.push(`- **Actor:** ${ev.subject.actorId}`);
				}
			} else if (ev.subject.kind === "team") {
				parts.push("");
				parts.push("**Team that triggered this run:**");
				parts.push(`- **Name:** ${ev.subject.team.name}`);
				if (ev.subject.actorId) {
					parts.push(`- **Actor:** ${ev.subject.actorId}`);
				}
			} else if (ev.subject.kind === "session") {
				parts.push("");
				parts.push("**Session that triggered this run:**");
				parts.push(`- **State:** ${ev.subject.session.state}`);
				parts.push(`- **Agent:** ${ev.subject.session.agentId}`);
				if (ev.subject.session.outcome) {
					parts.push(`- **Outcome:** ${ev.subject.session.outcome}`);
				}
				if (ev.subject.actorId) {
					parts.push(`- **Actor:** ${ev.subject.actorId}`);
				}
			} else if (ev.subject.kind === "agent") {
				parts.push("");
				parts.push("**Agent that triggered this run:**");
				parts.push(`- **Name:** ${ev.subject.agent.name}`);
				parts.push(`- **Role:** ${ev.subject.agent.role}`);
				if (ev.subject.actorId) {
					parts.push(`- **Actor:** ${ev.subject.actorId}`);
				}
			} else if (ev.subject.kind === "user") {
				parts.push("");
				parts.push("**User that triggered this run:**");
				parts.push(`- **Name:** ${ev.subject.user.name}`);
				parts.push(`- **Role:** ${ev.subject.user.role}`);
				if (ev.subject.actorId) {
					parts.push(`- **Actor:** ${ev.subject.actorId}`);
				}
			}
		} else {
			parts.push("**Subject:** no identifiable entity in this event");
		}
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
function assembleRoutinePrompt(input: RoutinePromptCompositionInput): PromptCompositionResult {
	const { systemPromptText, context, tools, sandboxPath: _sandboxPath } = input;

	// Build persona section from inline text (same as assemblePrompt)
	let personaSection = "";
	if (systemPromptText.length > 0) {
		const stripped = stripFrontmatter(systemPromptText);
		// For routine sessions, use team name as the product variable. BA1 D4:
		// the owner agent may belong to no team — `substituteTemplateVars`
		// leaves `{{product}}` literal when a variable is absent, so the
		// empty string is the right fallback rather than a visible defect.
		const vars: Record<string, string> = {
			product: context.team?.name ?? "",
			community: context.agent.role,
		};
		personaSection = substituteTemplateVars(stripped, vars);
	}

	const toolsContent = buildToolsSection(tools);

	// Enforce token budget on persona + tools
	const personaTokens = approxTokenCount(personaSection);
	const toolsTokens = approxTokenCount(toolsContent);
	let personaToolsTokens = personaTokens + toolsTokens;

	if (personaToolsTokens > PERSONA_TOOLS_TOKEN_BUDGET && personaSection.length > 0) {
		logger.warn(
			`Routine persona + tools section exceeds ${PERSONA_TOOLS_TOKEN_BUDGET} tokens (${personaToolsTokens}). Truncating persona.`,
		);
		personaSection = `${truncatePersona(personaSection)}\n\n(Persona truncated to fit token budget.)`;
		personaToolsTokens = approxTokenCount(personaSection) + toolsTokens;
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

interface ManifestEntry {
	version: number;
	// biome-ignore lint/style/useNamingConvention: manifest JSON schema uses snake_case keys
	source_path: string;
	format: string;
}

interface Manifest {
	// biome-ignore lint/style/useNamingConvention: manifest JSON schema uses snake_case keys
	session_id: string;
	// biome-ignore lint/style/useNamingConvention: manifest JSON schema uses snake_case keys
	assembled_at: string;
	items: Record<string, ManifestEntry>;
}

function toFilename(title: string, itemId?: string): string {
	const suffix = itemId ? `_${itemId.slice(0, 8)}` : "";
	if (/\.\w+$/.test(title)) {
		const sanitized = title.replace(/[/\\:*?"<>|]/g, "_");
		const dotIdx = sanitized.lastIndexOf(".");
		return `${sanitized.slice(0, dotIdx)}${suffix}${sanitized.slice(dotIdx)}`;
	}
	const slug = title.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
	return `${slug}${suffix}.md`;
}

function cleanDirectory(dirPath: string): void {
	if (!fs.existsSync(dirPath)) return;

	const entries = fs.readdirSync(dirPath, { withFileTypes: true, recursive: true });
	for (const entry of entries) {
		const fullPath = path.join(entry.parentPath, entry.name);
		if (entry.isFile()) {
			fs.chmodSync(fullPath, 0o644);
		}
	}
	fs.rmSync(dirPath, { recursive: true, force: true });
}

/**
 * @lore nested-knowledge-items §5: the per-layer `context/product|practices|
 * factory` zones and the `knowledge/practices|decisions|failures` legacy
 * kind-inference subdirectories are GONE — there is one writable, watched
 * `knowledge/` tree shaped like the real tree, not a set of layer buckets. An
 * agent's own materialised knowledge writes wherever its parent chain says;
 * `knowledge/rules` survives because role='rule' items land there regardless
 * of tree position (placement follows role, not tree position).
 */
const CONTEXT_ASSEMBLY_DIRS = [".fabric", "context", "knowledge/rules", "work/artifacts"] as const;

/**
 * @lore BA9b: Per-harness skill directories — empirically verified 2026-08-26.
 *
 * Two directories cover all four binary harnesses. Established by planting a
 * unique probe skill in each candidate directory and running every real binary
 * non-interactively; only the directories whose probe token appeared in output
 * are listed. Full evidence in:
 *   the "As built" section of .pipeline/work/BA9b/plan.md — including the
 *   probe method, to re-run when a harness is added or upgraded.
 *
 *   .claude/skills  — claude:        confirmed (probe-claudedir token returned).
 *                  — cursor-agent:   ALSO reads this directory (probe-claudedir
 *                                    appeared; .cursor/rules/ was NOT used).
 *                  — opencode:       reads .claude/skills in addition to its own
 *                                    .opencode/skills and .agents/skills.
 *
 *   .agents/skills  — codex:         ONLY directory codex reads; .codex-home/skills
 *                                    is the config dir (auth/hooks), not skills.
 *                                    probe-agentsdir appeared, probe-codexhomedir did not.
 *                  — cursor-agent:   also reads .agents/skills (probe-agentsdir appeared).
 *                  — opencode:       also reads .agents/skills (probe-agentsdir appeared).
 *
 * .opencode/skills is redundant (opencode reads .claude/skills too) and is
 * therefore omitted. .codex-home/skills is dead — nothing reads it.
 *
 * builtin: no file-based skill dirs. It is a direct LLM call through OpenRouter;
 * skills reach it via the system prompt injected in AGENTS.md (already written
 * by context assembly). No extra directory entry needed.
 *
 * Each subdir contains <skillDirName>/SKILL.md as per Agent Plugins 1.0.0.
 *
 * Re-run the probe (evidence file §Method) if a harness is added or upgraded;
 * skill discovery is harness behaviour, not ours, and it can change under us.
 */
const HARNESS_SKILL_DIRS = [".claude/skills", ".agents/skills"] as const;
const CONTEXT_ASSEMBLY_ROOTS = [
	...new Set(
		CONTEXT_ASSEMBLY_DIRS.map((directory) => {
			const separator = directory.indexOf("/");
			return separator === -1 ? directory : directory.slice(0, separator);
		}),
	),
];

function createDirectoryStructure(sandboxPath: string): void {
	for (const dir of CONTEXT_ASSEMBLY_DIRS) {
		fs.mkdirSync(path.join(sandboxPath, dir), { recursive: true });
	}

	fs.writeFileSync(path.join(sandboxPath, "work/task-notes.md"), "");
}

function writeItem(sandboxPath: string, item: BakedContextKnowledgeItem, zone: string): string {
	const filename = toFilename(item.title, item.id);
	const relativePath = `${zone}/${filename}`;
	const fullPath = path.join(sandboxPath, relativePath);

	fs.writeFileSync(fullPath, item.body);

	return relativePath;
}

/**
 * Write an ordinary item into `knowledge/`, shaped like its real ancestor
 * chain (architecture.md §5). `writeContextBundle` does zero DB reads —
 * `item.parentChain` (baked at emit time, root first) is the only source for
 * "where in the tree does this go".
 *
 * An ancestor that is not itself among the selected items still gets its
 * directory-with-index materialised (plan.md: "a path with a missing middle
 * means nothing") — the index holds only the ancestor's own title, since the
 * baked chain carries no body for it; that is incomplete, not fabricated.
 */
function writeOrdinaryItem(sandboxPath: string, item: BakedContextKnowledgeItem): string {
	let cursor = "knowledge";
	for (const ancestor of item.parentChain) {
		cursor = `${cursor}/${toSkillDirName(ancestor.title)}`;
		const fullDir = path.join(sandboxPath, cursor);
		fs.mkdirSync(fullDir, { recursive: true });
		const indexPath = path.join(fullDir, "index.md");
		if (!fs.existsSync(indexPath)) {
			fs.writeFileSync(indexPath, `# ${ancestor.title}\n`);
		}
	}
	return writeItem(sandboxPath, item, cursor);
}

function setContextReadOnly(sandboxPath: string): void {
	const contextDir = path.join(sandboxPath, "context");
	if (!fs.existsSync(contextDir)) return;

	const setReadOnlyRecursive = (dir: string): void => {
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				setReadOnlyRecursive(fullPath);
			} else if (entry.isFile()) {
				fs.chmodSync(fullPath, 0o444);
			}
		}
	};

	setReadOnlyRecursive(contextDir);
}

/**
 * @lore BA9b: Slugify a skill title into a safe directory name.
 * Plugin-contributed skills store the dirName as the title; manual skills use a slug.
 */
function toSkillDirName(title: string): string {
	return title
		.replace(/[^a-zA-Z0-9._-]/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_|_$/g, "");
}

/**
 * @lore BA9b: Write a skill item to each known harness skill directory.
 * Returns the first relative path written (for the manifest entry).
 */
function writeSkillItem(sandboxPath: string, item: BakedContextKnowledgeItem): string {
	const dirName = toSkillDirName(item.title);
	let firstPath: string | undefined;
	for (const harnessSkillDir of HARNESS_SKILL_DIRS) {
		const skillDir = path.join(sandboxPath, harnessSkillDir, dirName);
		fs.mkdirSync(skillDir, { recursive: true });
		const skillPath = path.join(skillDir, "SKILL.md");
		fs.writeFileSync(skillPath, item.body);
		if (!firstPath) {
			firstPath = `${harnessSkillDir}/${dirName}/SKILL.md`;
		}
	}
	return firstPath ?? `${HARNESS_SKILL_DIRS[0]}/${dirName}/SKILL.md`;
}

/**
 * Write the baked+ranked knowledge bundle to its sandbox zones, building the
 * manifest entries — the pure write-side counterpart to the (deleted)
 * `fetchAllForLayer`/`rankAndBudget` DB-reading pair.
 *
 * @lore BA9b: capability roles (skill/rule/agent_file) are routed by role,
 * not by layer.
 *
 * @lore BA9f: `agentId` decides which `agent_file` is THIS agent's identity.
 * That one is already delivered as the "## Identity" section of AGENTS.md
 * (baked at emit through `getAgentIdentity`), so materialising it here too
 * would put the same text in the sandbox twice. Every OTHER agent file — an
 * unbound one that applies to all sessions — is still written, which is what
 * BA9b delivers.
 *
 * @lore knowledge-attachment-slot: the binding compared below
 * (`item.agentBindingId`) is now the PARENT — `parentKind='agent'`,
 * `parentId=<agentId>` — not a scope reverse lookup. Nothing here changes:
 * `agentBindingId` is still derived once, upstream, in
 * `toBakedContextKnowledgeItems` (`@hyperidle/domain-model`), and this
 * function only ever compares the already-derived value.
 *
 */
function writeBundleKnowledge(
	sandboxPath: string,
	knowledge: readonly BakedContextKnowledgeItem[],
	agentId: string,
): Record<string, ManifestEntry> {
	const manifestItems: Record<string, ManifestEntry> = {};
	for (const item of knowledge) {
		const role = item.role;

		// @lore knowledge-attachment-slot Guard 2: `prompt` lands as the run's
		// instruction, never a sandbox file. This is NOT redundant with the
		// assembler-side filters (Guard 1, session-knowledge-assembler.ts) — the
		// code below is a FALL-THROUGH, not an `if role === 'ordinary'` branch,
		// so without this line a prompt reaching the bundle by any route would be
		// written as a knowledge file by the path that exists for ordinary items.
		if (role === "prompt") continue;

		if (role === "skill") {
			const relativePath = writeSkillItem(sandboxPath, item);
			manifestItems[item.id] = {
				version: item.version,
				source_path: relativePath,
				format: item.format,
			};
			continue;
		}

		if (role === "rule") {
			const relativePath = writeItem(sandboxPath, item, "knowledge/rules");
			manifestItems[item.id] = {
				version: item.version,
				source_path: relativePath,
				format: item.format,
			};
			continue;
		}

		if (role === "agent_file") {
			// The agent file bound to THIS agent is its identity, and its home in
			// the sandbox is the "## Identity" section of AGENTS.md. Writing it here
			// too would deliver the same text twice.
			if (item.agentBindingId === agentId) {
				continue;
			}
			// An agent file bound to someone else is not ours to carry.
			if (item.agentBindingId !== null && item.agentBindingId !== undefined) {
				continue;
			}
			// Unbound: applies to every session, so it is materialised (BA9b).
			const relativePath = writeItem(sandboxPath, item, "knowledge/rules");
			manifestItems[item.id] = {
				version: item.version,
				source_path: relativePath,
				format: item.format,
			};
			continue;
		}

		// role === 'ordinary': materialise into knowledge/, shaped like its
		// real ancestor chain (architecture.md §5) — not a layer zone.
		const relativePath = writeOrdinaryItem(sandboxPath, item);
		manifestItems[item.id] = {
			version: item.version,
			source_path: relativePath,
			format: item.format,
		};
	}
	return manifestItems;
}

interface ContextAssemblyResult {
	itemCount: number;
	manifest: Manifest;
	durationMs: number;
}

/**
 * Write a full (`kind:"task"` or `kind:"routine"`) baked contextBundle into
 * the sandbox: clean + recreate the directory structure, write the
 * ranked+budgeted knowledge items to their zones, write `context/session.toon`,
 * set `context/` read-only, and write the manifest. ZERO db reads — every
 * byte comes from `bundle`.
 */
function writeContextBundle(
	sandboxPath: string,
	sessionId: string,
	bundle: Extract<BakedContextBundle, { kind: "task" | "routine" }>,
	agentId: string,
): ContextAssemblyResult {
	const start = performance.now();

	cleanDirectory(path.join(sandboxPath, "context"));
	cleanDirectory(path.join(sandboxPath, "knowledge"));
	cleanDirectory(path.join(sandboxPath, "work"));
	cleanDirectory(path.join(sandboxPath, ".fabric"));
	createDirectoryStructure(sandboxPath);

	const manifestItems = writeBundleKnowledge(sandboxPath, bundle.knowledge, agentId);

	const sessionToon =
		bundle.kind === "task"
			? buildSessionContextToon(sessionContextDataFromBundle(bundle))
			: buildSessionContextToon(routineSessionContextDataFromBundle(bundle));
	fs.writeFileSync(path.join(sandboxPath, "context/session.toon"), sessionToon);

	setContextReadOnly(sandboxPath);

	const manifest: Manifest = {
		session_id: sessionId,
		assembled_at: new Date().toISOString(),
		items: manifestItems,
	};

	fs.writeFileSync(
		path.join(sandboxPath, ".fabric/manifest.json"),
		JSON.stringify(manifest, null, 2),
	);

	const durationMs = performance.now() - start;

	return {
		itemCount: Object.keys(manifestItems).length,
		manifest,
		durationMs,
	};
}

// ---- assemble-context ----
interface AssembleAgentContextInput {
	readonly sandboxPath: string;
	readonly sessionId: string;
	readonly taskId: string | null;
	readonly agentId: string;
	readonly agentRole: string;
	readonly teamId: string | null;
	readonly isRoutine: boolean;
	readonly sourceKind: AgentSessionSourceKind | null;
	readonly sourceId: string | null;
	readonly sourceCorrelation: AgentSessionSourceCorrelation | null;
	/**
	 * AU21 §9 Increment 12 (Decision H3) — the baked entity+knowledge bundle a
	 * `task_run` (`kind:"task"`) or `routine_run`
	 * (`kind:"routine"`) session's sandbox is built from. Absent for
	 * `knowledge_action` (`kind:"knowledge"` bundles carry no established
	 * sandbox-context shape yet — a knowledge-review turn keeps today's
	 * task-free minimal stub) and for any session with no bundle at all
	 * (falls back to the same minimal stub every task-free session got
	 * pre-migration — never a DB read).
	 */
	readonly contextBundle?: BakedContextBundle;
}

interface AgentContextAssemblyOutcome {
	readonly itemCount: number;
	readonly durationMs: number;
	readonly manifestPath: string;
}

interface AgentWritebackHandle {
	dispose(): void;
}

/** A baked bundle this file's sandbox-writing path knows how to consume. */
function isWritableBundle(
	bundle: BakedContextBundle | undefined,
): bundle is Extract<BakedContextBundle, { kind: "task" | "routine" }> {
	return bundle !== undefined && (bundle.kind === "task" || bundle.kind === "routine");
}

/**
 * Write a file that may already exist and may already be read-only.
 *
 * @lore BA2: context files are chmod-ed to 0444 after assembly so an agent
 * cannot edit its own context. That was safe while every session got a brand
 * new directory. A resumed session runs in the directory of the session it is
 * resuming, so `context/session.toon` is already there and already read-only,
 * and a plain write fails with EACCES before the agent ever starts — the human
 * approved, and nothing happened. The bundle path already handles this by
 * chmod-ing and deleting the whole tree first (`cleanDirectory`); this is the
 * same thing for the two files the bundle-less path writes on its own.
 */
function writeOverwritable(filePath: string, contents: string): void {
	fs.rmSync(filePath, { force: true });
	fs.writeFileSync(filePath, contents);
}

function assembleAgentContext(input: AssembleAgentContextInput): AgentContextAssemblyOutcome {
	const manifestPath = path.join(input.sandboxPath, ".fabric/manifest.json");

	if (!isWritableBundle(input.contextBundle)) {
		fs.mkdirSync(path.join(input.sandboxPath, ".fabric"), { recursive: true });
		fs.mkdirSync(path.join(input.sandboxPath, "context"), { recursive: true });
		writeOverwritable(
			path.join(input.sandboxPath, "context/session.toon"),
			[
				`session_id: ${input.sessionId}`,
				`source_kind: ${input.sourceKind ?? "task-free"}`,
				`source_id: ${input.sourceId ?? ""}`,
				`agent_id: ${input.agentId}`,
				`team_id: ${input.teamId ?? ""}`,
				`correlation_json: ${JSON.stringify(input.sourceCorrelation ?? {})}`,
			].join("\n"),
		);
		writeOverwritable(
			manifestPath,
			JSON.stringify(
				{
					session_id: input.sessionId,
					assembled_at: new Date().toISOString(),
					items: {},
				},
				null,
				2,
			),
		);
		return {
			itemCount: 0,
			durationMs: 0,
			manifestPath,
		};
	}

	const result = writeContextBundle(
		input.sandboxPath,
		input.sessionId,
		input.contextBundle,
		input.agentId,
	);
	return {
		itemCount: result.itemCount,
		durationMs: result.durationMs,
		manifestPath,
	};
}

function beginAgentWriteback(
	input: {
		readonly sandboxPath: string;
		readonly sessionId: string;
		readonly manifestPath: string;
		readonly eventBus: EventBus;
	},
	ports: Pick<ContextAssemblyPorts, "filesystems">,
): AgentWritebackHandle {
	let watcher: ContextAssemblyFileWatcher | undefined;
	let stopped = false;
	const stop = (): void => {
		if (stopped) return;
		stopped = true;
		watcher?.stop();
	};
	watcher = ports.filesystems.startWatcher({
		...input,
		onError(error) {
			logger.error("filesystem watcher ingestion failed", {
				sessionId: input.sessionId,
				sandboxPath: input.sandboxPath,
				error: error.message,
			});
			stop();
		},
	});
	return {
		dispose: stop,
	};
}

// ---- context ----
/** The deps-free surface this Service's downstream callers expect. */
interface ContextAssembler {
	assembleAgentContext(input: AssembleAgentContextInput): Promise<AgentContextAssemblyOutcome>;
	beginAgentWriteback(input: {
		readonly sandboxPath: string;
		readonly sessionId: string;
		readonly manifestPath: string;
		readonly eventBus: EventBus;
	}): AgentWritebackHandle;
	assemblePrompt(input: PromptCompositionInput): Promise<PromptCompositionResult>;
	assembleRoutinePrompt(input: RoutinePromptCompositionInput): Promise<PromptCompositionResult>;
	writeSandboxAgentsMd(sandboxPath: string, assembledPrompt: string): void;
	stripFrontmatter(content: string): string;
	substituteTemplateVars(template: string, vars: Record<string, string>): string;
	buildTemplateVariables(context: SessionContextData): Record<string, string>;
	readonly emittedAgentRoots: readonly string[];
	readonly emittedContextRoots: readonly string[];
	readonly emittedSkillRoots: readonly string[];
}

/** Bind this Service's ports-taking functions to a single `ContextAssemblyPorts` instance. */
export function createContextAssembler(ports: ContextAssemblyPorts): ContextAssembler {
	return {
		assembleAgentContext: (input) => Promise.resolve(assembleAgentContext(input)),
		beginAgentWriteback: (input) => beginAgentWriteback(input, ports),
		assemblePrompt: (input) => Promise.resolve(assemblePrompt(input)),
		assembleRoutinePrompt: (input) => Promise.resolve(assembleRoutinePrompt(input)),
		writeSandboxAgentsMd,
		stripFrontmatter,
		substituteTemplateVars,
		buildTemplateVariables,
		emittedAgentRoots: EMITTED_AGENT_FILES,
		emittedContextRoots: CONTEXT_ASSEMBLY_ROOTS,
		emittedSkillRoots: HARNESS_SKILL_DIRS,
	};
}

export type { AssembleAgentContextInput, RoutineSessionContextData, SessionContextData };
export { routineSessionContextDataFromBundle, sessionContextDataFromBundle };
