import * as fs from "node:fs";
import * as path from "node:path";
import type {
	Bet,
	HyperIdleDb,
	KnowledgeItem,
	Routine,
	Task,
	Team,
	User,
	WriteExecutor,
} from "@hyperidle/db";
import {
	type AgentSessionSourceCorrelation,
	type AgentSessionSourceKind,
	communityForRole,
	createLogger,
	type EventBus,
	encodeTyped,
	type KnowledgeLayer,
	type UserRole,
} from "@hyperidle/shared";

interface ContextAssemblyKnowledgeListFilters {
	readonly layer: KnowledgeLayer;
	readonly scopeId?: string;
	readonly limit: number;
	readonly offset: number;
}

interface ContextAssemblyScoringContext {
	readonly taskDescription: string;
	readonly taskTags: readonly string[];
	readonly agentRole: string;
	readonly productId: string;
}

interface KnowledgeReader {
	list(
		db: HyperIdleDb,
		filters: ContextAssemblyKnowledgeListFilters,
	): Promise<readonly KnowledgeItem[]>;
	rankAndBudget(
		db: HyperIdleDb,
		items: readonly KnowledgeItem[],
		scoringContext: ContextAssemblyScoringContext,
	): Promise<readonly KnowledgeItem[]>;
	countTokens(text: string): number;
}

interface WorkReader {
	getTaskById(db: WriteExecutor, taskId: string): Promise<Task | undefined>;
	getBetById(db: WriteExecutor, betId: string): Promise<Bet | undefined>;
}

interface UsersReader {
	getUserById(db: HyperIdleDb, userId: string): Promise<User | undefined>;
}

interface RoutineReader {
	getRoutineById(db: WriteExecutor, routineId: string): Promise<Routine | undefined>;
}

interface ContextAssemblyFileWatcherConfig {
	readonly sandboxPath: string;
	readonly sessionId: string;
	readonly manifestPath: string;
	readonly eventBus: EventBus;
}

interface ContextAssemblyFileWatcher {
	stop(): void;
}

interface FilesystemsReader {
	startWatcher(config: ContextAssemblyFileWatcherConfig): ContextAssemblyFileWatcher;
}

interface TeamReader {
	getTeamById(db: HyperIdleDb, teamId: string): Promise<Team | undefined>;
}

interface ContextAssemblyPorts {
	readonly knowledge: KnowledgeReader;
	readonly work: WorkReader;
	readonly users: UsersReader;
	readonly routine: RoutineReader;
	readonly filesystems: FilesystemsReader;
	readonly org: TeamReader;
}

interface SessionContextConfig {
	sessionId: string;
	taskId: string;
	agentId: string;
	agentRole: UserRole;
	productId: string;
}

interface SessionContextData {
	task: {
		id: string;
		title: string;
		description: string | null;
		state: string;
	};
	bet: {
		id: string;
		description: string;
		appetite: string;
		doneCondition: string | null;
	};
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

async function buildSessionContextData(
	db: HyperIdleDb,
	config: SessionContextConfig,
	ports: Pick<ContextAssemblyPorts, "work" | "users" | "org">,
	preloadedAgent?: { id: string; name: string; role: string },
): Promise<SessionContextData> {
	const task = await ports.work.getTaskById(db, config.taskId);
	if (!task) {
		throw new Error(`Task ${config.taskId} not found`);
	}

	const bet = await ports.work.getBetById(db, task.betId);
	if (!bet) {
		throw new Error(`Bet ${task.betId} not found`);
	}

	// @lore I0c: use preloadedAgent when supplied (session-provisioning already
	// fetched the agent row); fall back to a fresh getUserById only when the
	// caller does not supply one (e.g. buildSessionContext, standalone callers).
	const agent = preloadedAgent ?? (await ports.users.getUserById(db, config.agentId));
	if (!agent) {
		throw new Error(`Agent ${config.agentId} not found`);
	}

	// @lore U1: productId now holds a teams.id value (the domain entity id).
	const team = await ports.org.getTeamById(db, config.productId);
	if (!team) {
		throw new Error(`Team ${config.productId} not found`);
	}

	return {
		task: {
			id: task.id,
			title: task.title,
			description: task.description,
			state: task.state,
		},
		bet: {
			id: bet.id,
			// @lore U1: `description` replaces `pitch`.
			// @lore AF3 C12: bet.description is string | null in the DB; coerce to
			// empty string for the context interface (which requires non-null string).
			// @lore AF3 W2: the previous string | null assignment would flow `null`
			// through to string interpolation, rendering the literal text "null" into
			// the composed prompt (e.g. "**Bet:** null"). `?? ""` intentionally corrects
			// that to an empty string — a safe content fix, not merely a strictness fix.
			description: bet.description ?? "",
			// @lore AF3: appetite is nullable in DB but non-null in SessionContextData;
			// coerce null to empty string to satisfy the interface.
			appetite: bet.appetite ?? "",
			doneCondition: bet.doneCondition,
		},
		agent: {
			id: agent.id,
			name: agent.name,
			role: agent.role,
		},
		// @lore U1: `team` replaces `product` in the session context data.
		team: {
			id: team.id,
			name: team.name,
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// AA2: Routine session context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Config for building a routine session context (AA2).
 * Unlike task sessions, routines do not require a taskId for context assembly.
 */
interface RoutineSessionContextConfig {
	sessionId: string;
	routineId: string;
	agentId: string;
	agentRole: UserRole;
	teamId: string;
}

/**
 * Context data for a routine session (AA2).
 * Contains routine + agent + team — no task or bet fields.
 *
 * @lore AA2/AU1: Routine sessions MUST NOT read task/bet context. They are
 * task-free sessions; buildRoutineSessionContextData reads directly from the
 * routines table.
 */
interface RoutineSessionContextData {
	routine: {
		id: string;
		name: string;
		description: string | null;
		lastRunSummary: string | null;
	};
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
 * Query the DB and assemble RoutineSessionContextData for a routine session.
 * Does NOT read task or bet data — routine context is self-contained.
 */
async function buildRoutineSessionContextData(
	db: HyperIdleDb,
	config: RoutineSessionContextConfig,
	ports: Pick<ContextAssemblyPorts, "routine" | "users" | "org">,
): Promise<RoutineSessionContextData> {
	const routine = await ports.routine.getRoutineById(db, config.routineId);
	if (!routine) {
		throw new Error(`Routine ${config.routineId} not found`);
	}

	const agent = await ports.users.getUserById(db, config.agentId);
	if (!agent) {
		throw new Error(`Agent ${config.agentId} not found`);
	}

	const team = await ports.org.getTeamById(db, config.teamId);
	if (!team) {
		throw new Error(`Team ${config.teamId} not found`);
	}

	return {
		routine: {
			id: routine.id,
			name: routine.name,
			description: routine.description ?? null,
			lastRunSummary: routine.lastRunSummary ?? null,
		},
		agent: {
			id: agent.id,
			name: agent.name,
			role: agent.role,
		},
		team: {
			id: team.id,
			name: team.name,
		},
	};
}

/** Build session.toon content from DB state. */
async function buildSessionContext(
	db: HyperIdleDb,
	config: SessionContextConfig,
	ports: Pick<ContextAssemblyPorts, "work" | "users" | "org">,
): Promise<string> {
	const data = await buildSessionContextData(db, config, ports);
	return encodeTyped(data);
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
	const community = communityForRole(context.agent.role);
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

async function assemblePrompt(
	input: PromptCompositionInput,
	ports: Pick<ContextAssemblyPorts, "knowledge">,
): Promise<PromptCompositionResult> {
	const { systemPromptText, context, tools, sandboxPath: _sandboxPath } = input;

	let personaSection = "";
	if (systemPromptText.length > 0) {
		const stripped = stripFrontmatter(systemPromptText);
		const vars = buildTemplateVariables(context);
		personaSection = substituteTemplateVars(stripped, vars);
	}

	const toolsContent = buildToolsSection(tools);

	// Enforce token budget on persona + tools
	const personaTokens = ports.knowledge.countTokens(personaSection);
	const toolsTokens = ports.knowledge.countTokens(toolsContent);
	let personaToolsTokens = personaTokens + toolsTokens;

	if (personaToolsTokens > PERSONA_TOOLS_TOKEN_BUDGET && personaSection.length > 0) {
		logger.warn(
			`Persona + tools section exceeds ${PERSONA_TOOLS_TOKEN_BUDGET} tokens (${personaToolsTokens}). Truncating persona.`,
		);
		personaSection = `${truncatePersona(personaSection)}\n\n(Persona truncated to fit token budget.)`;
		personaToolsTokens = ports.knowledge.countTokens(personaSection) + toolsTokens;
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
// AH3: Assistant persona composer (task-free)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AH3 §4: Result of composing the assistant persona prompt.
 * The single canonical string consumed by both harness adapter paths:
 * - builtin: passed as config.composedPrompt
 * - SDK: written to CLAUDE.md via writeSandboxAgentsMd
 */
interface AssistantPromptResult {
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
function composeAssistantPrompt(systemPromptText: string): AssistantPromptResult {
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
interface RoutinePromptCompositionInput {
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
async function assembleRoutinePrompt(
	input: RoutinePromptCompositionInput,
	ports: Pick<ContextAssemblyPorts, "knowledge">,
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
	const personaTokens = ports.knowledge.countTokens(personaSection);
	const toolsTokens = ports.knowledge.countTokens(toolsContent);
	let personaToolsTokens = personaTokens + toolsTokens;

	if (personaToolsTokens > PERSONA_TOOLS_TOKEN_BUDGET && personaSection.length > 0) {
		logger.warn(
			`Routine persona + tools section exceeds ${PERSONA_TOOLS_TOKEN_BUDGET} tokens (${personaToolsTokens}). Truncating persona.`,
		);
		personaSection = `${truncatePersona(personaSection)}\n\n(Persona truncated to fit token budget.)`;
		personaToolsTokens = ports.knowledge.countTokens(personaSection) + toolsTokens;
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

interface ContextAssemblyConfig {
	sandboxPath: string;
	sessionId: string;
	taskId: string;
	agentId: string;
	agentRole: UserRole;
	productId: string;
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

interface ContextAssemblyResult {
	itemCount: number;
	manifest: Manifest;
	durationMs: number;
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

const CONTEXT_ASSEMBLY_DIRS = [
	".fabric",
	"context/product",
	"context/practices",
	"context/factory",
	"knowledge/practices",
	"knowledge/decisions",
	"knowledge/failures",
	"work/artifacts",
] as const;
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

function writeItem(sandboxPath: string, item: KnowledgeItem, zone: string): string {
	const filename = toFilename(item.title, item.id);
	const relativePath = `${zone}/${filename}`;
	const fullPath = path.join(sandboxPath, relativePath);

	fs.writeFileSync(fullPath, item.body);

	return relativePath;
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

/** Fetch all items for a layer, handling pagination. */
async function fetchAllForLayer(
	db: HyperIdleDb,
	ports: Pick<ContextAssemblyPorts, "knowledge">,
	layer: "L0" | "L1" | "L2" | "L3" | "L4",
	scopeId?: string,
): Promise<KnowledgeItem[]> {
	const batchSize = 500;
	const allItems: KnowledgeItem[] = [];
	let offset = 0;

	while (true) {
		const batch = await ports.knowledge.list(db, {
			layer,
			scopeId,
			limit: batchSize,
			offset,
		});
		allItems.push(...batch);
		if (batch.length < batchSize) break;
		offset += batchSize;
	}

	return allItems;
}

/**
 * Assemble context for an agent session sandbox.
 * @lore AK1: Renamed per harness-vocab plan (AK1). Old function was the assembly-entry-point variant.
 * Config type is now ContextAssemblyConfig.
 */
async function assembleContext(
	db: HyperIdleDb,
	config: ContextAssemblyConfig,
	ports: ContextAssemblyPorts,
): Promise<ContextAssemblyResult> {
	const start = performance.now();

	// Clean and recreate sandbox directory structure
	cleanDirectory(path.join(config.sandboxPath, "context"));
	cleanDirectory(path.join(config.sandboxPath, "knowledge"));
	cleanDirectory(path.join(config.sandboxPath, "work"));
	cleanDirectory(path.join(config.sandboxPath, ".fabric"));
	createDirectoryStructure(config.sandboxPath);

	const manifestItems: Record<string, ManifestEntry> = {};

	// Fetch all items by layer
	const community = communityForRole(config.agentRole);
	const [l4Items, l2Items, l3Items] = await Promise.all([
		fetchAllForLayer(db, ports, "L4"),
		fetchAllForLayer(db, ports, "L2", config.productId),
		fetchAllForLayer(db, ports, "L3", community),
	]);

	// @lore I6: apply rankAndBudget() before writing items to workspace.
	// This ensures that the agent's context window is not overwhelmed by
	// low-relevance knowledge. Items are scored against the task context
	// and trimmed to fit the configured token budget.
	//
	// Build a minimal scoring context from assembly config.
	// Task description is fetched from the DB if available.
	const task = await ports.work.getTaskById(db, config.taskId);
	const scoringContext = {
		taskDescription: task?.description ?? task?.title ?? "",
		taskTags: [],
		agentRole: config.agentRole,
		productId: config.productId,
	};

	const allItems = [...l4Items, ...l2Items, ...l3Items];
	const budgetedItems = await ports.knowledge.rankAndBudget(db, allItems, scoringContext);

	// Build a Set of budgeted item IDs for fast lookup
	const budgetedIds = new Set(budgetedItems.map((i) => i.id));

	// Write only budgeted items to their respective zones
	for (const item of l4Items) {
		if (!budgetedIds.has(item.id)) continue;
		const relativePath = writeItem(config.sandboxPath, item, "context/factory");
		manifestItems[item.id] = {
			version: item.version,
			source_path: relativePath,
			format: item.format,
		};
	}

	for (const item of l2Items) {
		if (!budgetedIds.has(item.id)) continue;
		const relativePath = writeItem(config.sandboxPath, item, "context/product");
		manifestItems[item.id] = {
			version: item.version,
			source_path: relativePath,
			format: item.format,
		};
	}

	for (const item of l3Items) {
		if (!budgetedIds.has(item.id)) continue;
		const relativePath = writeItem(config.sandboxPath, item, "context/practices");
		manifestItems[item.id] = {
			version: item.version,
			source_path: relativePath,
			format: item.format,
		};
	}

	// Build session.toon -> context/session.toon
	const sessionToon = await buildSessionContext(
		db,
		{
			sessionId: config.sessionId,
			taskId: config.taskId,
			agentId: config.agentId,
			agentRole: config.agentRole,
			productId: config.productId,
		},
		ports,
	);
	fs.writeFileSync(path.join(config.sandboxPath, "context/session.toon"), sessionToon);

	// Set context/ to read-only
	setContextReadOnly(config.sandboxPath);

	// Write manifest
	const manifest: Manifest = {
		session_id: config.sessionId,
		assembled_at: new Date().toISOString(),
		items: manifestItems,
	};

	fs.writeFileSync(
		path.join(config.sandboxPath, ".fabric/manifest.json"),
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
	readonly db: HyperIdleDb;
	readonly sandboxPath: string;
	readonly sessionId: string;
	readonly taskId: string | null;
	readonly agentId: string;
	readonly agentRole: UserRole;
	readonly teamId: string | null;
	readonly isRoutine: boolean;
	readonly sourceKind: AgentSessionSourceKind | null;
	readonly sourceId: string | null;
	readonly sourceCorrelation: AgentSessionSourceCorrelation | null;
}

interface AgentContextAssemblyOutcome {
	readonly itemCount: number;
	readonly durationMs: number;
	readonly manifestPath: string;
}

interface AgentWritebackHandle {
	dispose(): void;
}

async function assembleAgentContext(
	input: AssembleAgentContextInput,
	ports: ContextAssemblyPorts,
): Promise<AgentContextAssemblyOutcome> {
	const manifestPath = path.join(input.sandboxPath, ".fabric/manifest.json");
	if (!input.taskId) {
		fs.mkdirSync(path.join(input.sandboxPath, ".fabric"), { recursive: true });
		fs.mkdirSync(path.join(input.sandboxPath, "context"), { recursive: true });
		fs.writeFileSync(
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
		fs.writeFileSync(
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
	const result = await assembleContext(
		input.db,
		{
			sandboxPath: input.sandboxPath,
			sessionId: input.sessionId,
			taskId: input.taskId,
			agentId: input.agentId,
			agentRole: input.agentRole,
			productId: input.teamId ?? "task-free",
		},
		ports,
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
	const watcher = ports.filesystems.startWatcher(input);
	return {
		dispose: () => watcher.stop(),
	};
}

// ---- context ----
/** The deps-free surface this Service's downstream callers expect. */
interface ContextAssembler {
	assembleContext(db: HyperIdleDb, config: ContextAssemblyConfig): Promise<ContextAssemblyResult>;
	assembleAgentContext(input: AssembleAgentContextInput): Promise<AgentContextAssemblyOutcome>;
	beginAgentWriteback(input: {
		readonly sandboxPath: string;
		readonly sessionId: string;
		readonly manifestPath: string;
		readonly eventBus: EventBus;
	}): AgentWritebackHandle;
	buildSessionContextData(
		db: HyperIdleDb,
		config: SessionContextConfig,
		/** I0c: optional pre-fetched agent — skips the getUserById call when supplied. */
		preloadedAgent?: { id: string; name: string; role: string },
	): Promise<SessionContextData>;
	buildRoutineSessionContextData(
		db: HyperIdleDb,
		config: RoutineSessionContextConfig,
	): Promise<RoutineSessionContextData>;
	buildSessionContext(db: HyperIdleDb, config: SessionContextConfig): Promise<string>;
	assemblePrompt(input: PromptCompositionInput): Promise<PromptCompositionResult>;
	assembleRoutinePrompt(input: RoutinePromptCompositionInput): Promise<PromptCompositionResult>;
	composeAssistantPrompt(systemPromptText: string): AssistantPromptResult;
	writeSandboxAgentsMd(sandboxPath: string, assembledPrompt: string): void;
	stripFrontmatter(content: string): string;
	substituteTemplateVars(template: string, vars: Record<string, string>): string;
	buildTemplateVariables(context: SessionContextData): Record<string, string>;
	readonly emittedAgentRoots: readonly string[];
	readonly emittedContextRoots: readonly string[];
}

/** Bind this Service's ports-taking functions to a single `ContextAssemblyPorts` instance. */
export function createContextAssembler(ports: ContextAssemblyPorts): ContextAssembler {
	return {
		assembleContext: (db, config) => assembleContext(db, config, ports),
		assembleAgentContext: (input) => assembleAgentContext(input, ports),
		beginAgentWriteback: (input) => beginAgentWriteback(input, ports),
		buildSessionContextData: (db, config, preloadedAgent) =>
			buildSessionContextData(db, config, ports, preloadedAgent),
		buildRoutineSessionContextData: (db, config) =>
			buildRoutineSessionContextData(db, config, ports),
		buildSessionContext: (db, config) => buildSessionContext(db, config, ports),
		assemblePrompt: (input) => assemblePrompt(input, ports),
		assembleRoutinePrompt: (input) => assembleRoutinePrompt(input, ports),
		composeAssistantPrompt,
		writeSandboxAgentsMd,
		stripFrontmatter,
		substituteTemplateVars,
		buildTemplateVariables,
		emittedAgentRoots: EMITTED_AGENT_FILES,
		emittedContextRoots: CONTEXT_ASSEMBLY_ROOTS,
	};
}
