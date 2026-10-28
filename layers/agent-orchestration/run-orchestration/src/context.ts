import * as fs from "node:fs";
import * as path from "node:path";
import { createLogger } from "@hyperidle/diagnostics";
import type {
	AgentSessionSourceCorrelation,
	AgentSessionSourceKind,
	BakedContextBundle,
	BakedContextDocument,
	ChangeRow,
	DoneWhenLine,
	Reason,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import type { Manifest, ManifestEntry } from "./manifest-types.js";

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

/** `assembleAgentContext`/`beginAgentWriteback` ports — filesystems only; no domain-reading members. */
interface ContextAssemblyPorts {
	readonly filesystems: FilesystemsReader;
}

interface SessionContextData {
	task: {
		id: string;
		title: string;
		description: string | null;
		state: string;
		doneWhen: readonly DoneWhenLine[];
		reasons: readonly Reason[];
	};
	/** Root-first chain of ancestor tasks. ancestors[0] is the root task (the former "bet"). */
	ancestors: readonly {
		id: string;
		title: string;
		description: string | null;
		doneWhen: readonly DoneWhenLine[];
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
 * shape `assemblePrompt` needs — a pure passthrough, the two shapes match field-for-field.
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

/**
 * Encode an object into TOON format (flat key-path lines).
 * Encode-only — no decoder exists or is needed (the LLM is the decoder).
 */
function encodeToon(obj: object): string {
	const lines: string[] = [];
	flattenToLines(obj, "", lines);
	return lines.join("\n");
}

function flattenToLines(value: unknown, prefix: string, lines: string[]): void {
	// Skip undefined values, matching JSON.stringify behavior.
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

// ─────────────────────────────────────────────────────────────────────────────
// Subscription session context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context data for a subscription session.
 * Contains subscription + agent + team — no task/bet fields; a subscription
 * session is task-free, its content comes exclusively from the baked
 * `kind:"subscription"` contextBundle.
 */
interface SubscriptionSessionContextData {
	subscription: {
		id: string;
		event: string | null;
		schedule: string | null;
	};
	/** The subscription's own instruction — the `prompt` document's body, or null when it carries none. */
	prompt: string | null;
	/** The change that woke this subscription, or null for a schedule tick. */
	change: ChangeRow | null;
	agent: {
		id: string;
		name: string;
		role: string;
	};
	/** The subscriber's team, or null for a factory-wide agent. */
	team: {
		id: string;
		name: string;
	} | null;
}

/** Map a `kind:"subscription"` baked `contextBundle` onto `SubscriptionSessionContextData` — a pure passthrough. */
function subscriptionSessionContextDataFromBundle(
	bundle: Extract<BakedContextBundle, { kind: "subscription" }>,
): SubscriptionSessionContextData {
	return {
		subscription: bundle.subscription,
		prompt: bundle.prompt,
		change: bundle.change,
		agent: bundle.agent,
		team: bundle.team,
	};
}

/** Build session.toon content from a task/subscription session's derived context data. */
function buildSessionContextToon(
	data: SessionContextData | SubscriptionSessionContextData,
): string {
	return encodeToon(data);
}

// ---- context-assembly-prompt ----
const logger = createLogger({ pkg: "server.agent-context-prompt" });

/** Input to context assembly. All fields come from prior provisioning phases. */
interface PromptCompositionInput {
	/** Inline system prompt text. Empty string = no persona section. DB-stored; may contain YAML frontmatter (stripped before inclusion). */
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

/** Approximate token count for budget-checking the persona + tools sections (byte-length / 4). */
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
 * Returns { product }.
 */
function buildTemplateVariables(context: SessionContextData): Record<string, string> {
	return {
		product: context.team.name,
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
	// Fall back to root ancestor's done-when lines when the task's own list is empty.
	const rootAncestor = context.ancestors[0];
	const effectiveDoneWhen =
		context.task.doneWhen.length > 0 ? context.task.doneWhen : (rootAncestor?.doneWhen ?? []);

	const parts = [
		"## Task",
		"",
		`**Title:** ${context.task.title}`,
		`**Description:** ${description}`,
		"",
	];

	if (effectiveDoneWhen.length > 0) {
		parts.push("### Done When", "");
		for (const line of effectiveDoneWhen) {
			const stateLabel =
				line.state === "met" ? "[met]" : line.state === "failed" ? "[failed]" : "[ ]";
			const byLabel = line.by === "review" ? "(needs review)" : "";
			const howPart = line.how ? ` — ${line.how}` : "";
			parts.push(`- ${stateLabel} ${line.what}${byLabel ? ` ${byLabel}` : ""}${howPart}`);
		}
		parts.push("");
	} else {
		parts.push("### Done When", "", "Not specified.", "");
	}

	if (context.task.reasons.length > 0) {
		parts.push("### Decisions and Assumptions", "");
		for (const reason of context.task.reasons) {
			const kindLabel = reason.kind === "decision" ? "Decision" : "Assumption";
			const stateLabel = (() => {
				if (reason.kind === "decision") {
					return reason.state === "made" ? "[made]" : "[waiting]";
				}
				return reason.state === "held" ? "[held]" : reason.state === "broke" ? "[broke]" : "[open]";
			})();
			const whyPart = reason.why ? ` — ${reason.why}` : "";
			parts.push(`- ${stateLabel} ${kindLabel}: ${reason.what}${whyPart}`);
		}
		parts.push("");
	}
	parts.push(
		"Record the decisions you make and the assumptions you rely on in this task's `reasons`. Mark an assumption held or broke once you have checked it.",
		"",
	);

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

- \`context/\` -- Read-only. Your session context (session.toon: task, ancestors, agent, team data).
- \`knowledge/\` -- Documents you can read, edit, and reorganize. It mirrors the real document tree: a folder holds an \`index.md\` (that item's own content) plus its children as files or nested folders. Create, edit, move, and nest items here -- changes save back automatically. An \`.html\` file is an app: one whole page with its own styles and scripts, which people open and use; it runs sealed off from the network, so keep every image and font inside the page, and give it a \`<meta name="description">\` saying what it does.
  - \`rules/\` -- Rules and guidelines that apply to your work.
- \`work/\` -- Your working area.
  - \`artifacts/\` -- Output artifacts.
  - \`task-notes.md\` -- Your session notes.
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
 * @lore: writeSandboxAgentsMd dual-write — writes AGENTS.md AND CLAUDE.md (identical); all adapters read CLAUDE.md; AGENTS.md-only would break every harness
 */
/**
 * Root-level files emitted by writeSandboxAgentsMd (dual-write: AGENTS.md + CLAUDE.md).
 * Exported so the scaffolding-drift-guard can assert coverage.
 *
 * @lore: EMITTED_AGENT_FILES — this repo tracks AGENTS.md and CLAUDE.md; assembly overwrites them; scaffolding-exclusion prevents clobbered versions in commits
 */
const EMITTED_AGENT_FILES = ["AGENTS.md", "CLAUDE.md"] as const;

function writeSandboxAgentsMd(sandboxPath: string, assembledPrompt: string): void {
	for (const file of EMITTED_AGENT_FILES) {
		fs.writeFileSync(path.join(sandboxPath, file), assembledPrompt, "utf8");
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription prompt assembly
// ─────────────────────────────────────────────────────────────────────────────

/** Input to subscription prompt assembly. */
interface SubscriptionPromptCompositionInput {
	readonly systemPromptText: string;
	/** Subscription session context data — no task/bet fields. */
	readonly context: SubscriptionSessionContextData;
	readonly tools: readonly ToolSummary[];
	readonly sandboxPath: string;
	/**
	 * A one-line, pre-rendered reminder that this session's only satisfying
	 * return action is `return_status` — the self-check tool, never a forced
	 * `send_message` (a subscription wake speaks only when its own
	 * instruction asks it to) — named with the LITERAL tool name the selected
	 * harness exposes. Computed by the caller (`provisioner.ts`'s
	 * `requiresReturnStatusReturn` + `literalToolNamerForAdapterType`, the
	 * same pair `assembleTaskFreePrompt` uses) so this module never needs to
	 * import the harness-protocol return-action vocabulary itself. A
	 * subscription wake has no calling thread to infer this from — without
	 * the line here, the agent's only chance to learn it must call
	 * `return_status` is the reactive forced-return message, which is not
	 * every harness's most reliable channel. Absent ⇒ no line (matches
	 * `assembleTaskFreePrompt`'s empty-string degrade).
	 */
	readonly returnOrientation?: string;
}

/** A rendered change value over this many characters is cut, with a pointer back to the object. */
const CHANGE_RENDER_CHAR_LIMIT = 2000;

/** Render a change's `before`/`after` value, cut at the char limit rather than dumped whole. */
function renderChangeValue(value: Record<string, unknown> | null): string {
	if (value === null) return "(none)";
	const json = JSON.stringify(value, null, 2);
	if (json.length <= CHANGE_RENDER_CHAR_LIMIT) return json;
	return `${json.slice(0, CHANGE_RENDER_CHAR_LIMIT)}\n… (open the object for the rest)`;
}

/**
 * Build the subscription section markdown — shows the subscription's own
 * instruction (its `prompt` document) and what happened (the change that
 * woke it, or a note that this run came from a schedule).
 */
function buildSubscriptionSection(context: SubscriptionSessionContextData): string {
	const trigger = context.subscription.event ?? context.subscription.schedule ?? "unknown";
	const parts: string[] = ["## Subscription", "", `**Subscribed to:** ${trigger}`];

	if (context.prompt) {
		parts.push("", "### Instruction", "", context.prompt);
	}

	parts.push("", "### What happened", "");
	if (context.change) {
		const change = context.change;
		parts.push(`**Object:** ${change.object} ${change.objectId}`);
		parts.push(`**Kind:** ${change.kind}`);
		parts.push(`**Actor:** ${change.actor}`);
		parts.push(`**At:** ${change.at}`);
		parts.push("", "**Before:**", "", renderChangeValue(change.before));
		parts.push("", "**After:**", "", renderChangeValue(change.after));
	} else {
		parts.push("This run was woken by a schedule, not a change.");
	}

	parts.push("");

	return parts.join("\n");
}

/**
 * Assemble a complete subscription session context prompt.
 * Parallel to `assemblePrompt` but uses `buildSubscriptionSection` instead of
 * `buildTaskSection` — a subscription session has no task/bet fields.
 */
function assembleSubscriptionPrompt(
	input: SubscriptionPromptCompositionInput,
): PromptCompositionResult {
	const { systemPromptText, context, tools, sandboxPath: _sandboxPath, returnOrientation } = input;

	// Build persona section from inline text (same as assemblePrompt)
	let personaSection = "";
	if (systemPromptText.length > 0) {
		const stripped = stripFrontmatter(systemPromptText);
		// For subscription sessions, use team name as the product variable —
		// a factory-wide agent's subscription may belong to no team.
		const vars: Record<string, string> = {
			product: context.team?.name ?? "",
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
			`Subscription persona + tools section exceeds ${PERSONA_TOOLS_TOKEN_BUDGET} tokens (${personaToolsTokens}). Truncating persona.`,
		);
		personaSection = `${truncatePersona(personaSection)}\n\n(Persona truncated to fit token budget.)`;
		personaToolsTokens = approxTokenCount(personaSection) + toolsTokens;
	}

	// Assemble sections
	const parts: string[] = ["# Session Instructions", ""];

	if (personaSection.length > 0) {
		parts.push("## Identity", "", personaSection.trimEnd(), "");
	}

	const subscriptionSection = buildSubscriptionSection(context);
	parts.push(subscriptionSection);

	if (returnOrientation) {
		parts.push(returnOrientation, "");
	}

	parts.push(toolsContent);

	parts.push(WORKSPACE_SECTION);

	const assembledPrompt = parts.join("\n");

	return { assembledPrompt, personaToolsTokens };
}

// `ManifestEntry`/`Manifest` are shared with writeback-processor.ts's reader — see manifest-types.ts.

function toFilename(title: string, itemId?: string, extension = ".md"): string {
	const suffix = itemId ? `_${itemId.slice(0, 8)}` : "";
	if (/\.\w+$/.test(title)) {
		const sanitized = title.replace(/[/\\:*?"<>|]/g, "_");
		const dotIdx = sanitized.lastIndexOf(".");
		return `${sanitized.slice(0, dotIdx)}${suffix}${sanitized.slice(dotIdx)}`;
	}
	const slug = title.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
	return `${slug}${suffix}${extension}`;
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

const CONTEXT_ASSEMBLY_DIRS = [".fabric", "context", "knowledge/rules", "work/artifacts"] as const;

// @lore: HARNESS_SKILL_DIRS — empirically verified: .claude/skills (claude+cursor+opencode), .agents/skills (codex+cursor+opencode); re-probe on harness change
const HARNESS_SKILL_DIRS = [".claude/skills", ".agents/skills"] as const;
const CONTEXT_ASSEMBLY_ROOTS = [
	...new Set(
		CONTEXT_ASSEMBLY_DIRS.map((directory) => {
			const separator = directory.indexOf("/");
			return separator === -1 ? directory : directory.slice(0, separator);
		}),
	),
];

function createDirectoryStructure(sandboxPath: string, previousSessionNotes?: string | null): void {
	for (const dir of CONTEXT_ASSEMBLY_DIRS) {
		fs.mkdirSync(path.join(sandboxPath, dir), { recursive: true });
	}

	fs.writeFileSync(path.join(sandboxPath, "work/task-notes.md"), previousSessionNotes ?? "");
}

function writeItem(sandboxPath: string, item: BakedContextDocument, zone: string): string {
	const filename = toFilename(item.title, item.id, item.format === "html" ? ".html" : ".md");
	const relativePath = `${zone}/${filename}`;
	const fullPath = path.join(sandboxPath, relativePath);

	fs.writeFileSync(fullPath, item.body);

	return relativePath;
}

/**
 * Materialise every ordinary item, shaped like its real ancestor chain.
 * `writeContextBundle` does zero DB reads —
 * `item.parentChain` (baked at emit time, root first) is the only source for
 * "where in the tree does this go".
 *
 * Two passes, because which items are directories is only knowable once
 * every item's chain has been walked:
 *
 * Pass 1 creates every ancestor directory, a title-only `index.md`
 * placeholder (an ancestor not itself among the selected items still gets
 * one — a path with a missing middle means nothing), and its own manifest entry.
 * `!fs.existsSync`/`!manifestItems[ancestor.id]` dedupe across items that
 * share an ancestor (without a manifest entry, writeback's
 * `ensureDirectoryChainItem` mints a duplicate folder item).
 *
 * Pass 2 writes each item's own content. An item whose id was already
 * materialised as a directory in pass 1 — a parent-with-children that is
 * ALSO independently selected — gets its REAL body written into that
 * directory's `index.md` (overwriting the placeholder) and no separate leaf
 * file. Everything else still writes as an ordinary leaf.
 */
function writeOrdinaryItems(
	sandboxPath: string,
	items: readonly BakedContextDocument[],
	manifestItems: Record<string, ManifestEntry>,
): void {
	const dirPathByAncestorId: Record<string, string> = {};

	for (const item of items) {
		let cursor = "knowledge";
		for (const ancestor of item.parentChain) {
			cursor = `${cursor}/${toSkillDirName(ancestor.title)}`;
			const fullDir = path.join(sandboxPath, cursor);
			fs.mkdirSync(fullDir, { recursive: true });
			dirPathByAncestorId[ancestor.id] = cursor;
			const indexPath = path.join(fullDir, "index.md");
			if (!fs.existsSync(indexPath)) {
				fs.writeFileSync(indexPath, `# ${ancestor.title}\n`);
			}
			if (!manifestItems[ancestor.id]) {
				manifestItems[ancestor.id] = {
					version: ancestor.version,
					source_path: cursor,
					format: "markdown",
					scopeKind: ancestor.scopeKind,
				};
			}
		}
	}

	for (const item of items) {
		const ownDirPath = dirPathByAncestorId[item.id];
		if (ownDirPath !== undefined) {
			fs.writeFileSync(path.join(sandboxPath, ownDirPath, "index.md"), item.body);
			manifestItems[item.id] = {
				version: item.version,
				source_path: ownDirPath,
				format: item.format,
				scopeKind: item.scopeKind,
			};
			continue;
		}

		let cursor = "knowledge";
		for (const ancestor of item.parentChain) {
			cursor = `${cursor}/${toSkillDirName(ancestor.title)}`;
		}
		const relativePath = writeItem(sandboxPath, item, cursor);
		manifestItems[item.id] = {
			version: item.version,
			source_path: relativePath,
			format: item.format,
			scopeKind: item.scopeKind,
		};
	}
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

/** Slugify a skill title into a safe directory name. Plugin-contributed skills store the dirName as the title; manual skills use a slug. */
function toSkillDirName(title: string): string {
	return title
		.replace(/[^a-zA-Z0-9._-]/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_|_$/g, "");
}

/** Write a skill item to each known harness skill directory. Returns the first relative path written (for the manifest entry). */
function writeSkillItem(sandboxPath: string, item: BakedContextDocument): string {
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
 * manifest entries.
 *
 * @lore: agent_file — skipped here; this agent's own is already the AGENTS.md "## Identity" section, and an unbound row can't exist to belong to another.
 */
function writeBundleKnowledge(
	sandboxPath: string,
	knowledge: readonly BakedContextDocument[],
): Record<string, ManifestEntry> {
	const manifestItems: Record<string, ManifestEntry> = {};
	const ordinaryItems: BakedContextDocument[] = [];
	for (const item of knowledge) {
		const role = item.slot;

		if (role === "prompt") continue;

		if (role === "skill") {
			const relativePath = writeSkillItem(sandboxPath, item);
			manifestItems[item.id] = {
				version: item.version,
				source_path: relativePath,
				format: item.format,
				scopeKind: item.scopeKind,
			};
			continue;
		}

		if (role === "rule") {
			const relativePath = writeItem(sandboxPath, item, "knowledge/rules");
			manifestItems[item.id] = {
				version: item.version,
				source_path: relativePath,
				format: item.format,
				scopeKind: item.scopeKind,
			};
			continue;
		}

		if (role === "agent_file") {
			// The agent file bound to THIS agent is its identity, and its home in
			// the sandbox is the "## Identity" section of AGENTS.md. Writing it here
			// too would deliver the same text twice. Every other `agent_file` is
			// bound to a different agent and not ours to carry — an unbound one
			// cannot exist (`doc_agent_file_parent_ck` forbids that row).
			continue;
		}

		// role === 'ordinary': materialise into knowledge/, shaped like its
		// real ancestor chain — not a layer zone. Deferred
		// to writeOrdinaryItems below, which needs every ordinary item at once
		// to tell a directory-owning parent from a plain leaf.
		ordinaryItems.push(item);
	}
	writeOrdinaryItems(sandboxPath, ordinaryItems, manifestItems);
	return manifestItems;
}

interface ContextAssemblyResult {
	itemCount: number;
	manifest: Manifest;
	durationMs: number;
}

/**
 * Write a full (`kind:"task"` or `kind:"subscription"`) baked contextBundle
 * into the sandbox: clean + recreate the directory structure, write the
 * ranked+budgeted knowledge items to their zones, write `context/session.toon`,
 * set `context/` read-only, and write the manifest. ZERO db reads — every
 * byte comes from `bundle`.
 */
function writeContextBundle(
	sandboxPath: string,
	sessionId: string,
	bundle: Extract<BakedContextBundle, { kind: "task" | "subscription" }>,
	previousSessionNotes?: string | null,
): ContextAssemblyResult {
	const start = performance.now();

	cleanDirectory(path.join(sandboxPath, "context"));
	cleanDirectory(path.join(sandboxPath, "knowledge"));
	cleanDirectory(path.join(sandboxPath, "work"));
	cleanDirectory(path.join(sandboxPath, ".fabric"));
	createDirectoryStructure(sandboxPath, previousSessionNotes);

	const manifestItems = writeBundleKnowledge(sandboxPath, bundle.documents);

	const sessionToon =
		bundle.kind === "task"
			? buildSessionContextToon(sessionContextDataFromBundle(bundle))
			: buildSessionContextToon(subscriptionSessionContextDataFromBundle(bundle));
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
	readonly teamId: string | null;
	/** True for a subscription-fired session — no task/bet context to read. */
	readonly taskFree: boolean;
	readonly sourceKind: AgentSessionSourceKind | null;
	readonly sourceId: string | null;
	readonly sourceCorrelation: AgentSessionSourceCorrelation | null;
	/**
	 * The baked entity+knowledge bundle a
	 * `task_run` (`kind:"task"`) or `subscription_run`
	 * (`kind:"subscription"`) session's sandbox is built from. Absent for any
	 * session with no bundle at all (falls back to the same minimal stub
	 * every task-free session uses — never a DB read).
	 */
	readonly contextBundle?: BakedContextBundle;
	/**
	 * Notes written by the agent in the previous session on this task.
	 * Seeded into `work/task-notes.md` so the agent can pick up where it
	 * left off. Absent (or null/empty) when there is no prior session.
	 */
	readonly previousSessionNotes?: string | null;
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
): bundle is Extract<BakedContextBundle, { kind: "task" | "subscription" }> {
	return bundle !== undefined && (bundle.kind === "task" || bundle.kind === "subscription");
}

// @lore: writeOverwritable — context files are 0444 after assembly; a resumed session's directory already has them read-only; rmSync first avoids EACCES
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
		input.previousSessionNotes,
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
	assembleSubscriptionPrompt(
		input: SubscriptionPromptCompositionInput,
	): Promise<PromptCompositionResult>;
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
		assembleSubscriptionPrompt: (input) => Promise.resolve(assembleSubscriptionPrompt(input)),
		writeSandboxAgentsMd,
		stripFrontmatter,
		substituteTemplateVars,
		buildTemplateVariables,
		emittedAgentRoots: EMITTED_AGENT_FILES,
		emittedContextRoots: CONTEXT_ASSEMBLY_ROOTS,
		emittedSkillRoots: HARNESS_SKILL_DIRS,
	};
}

export type { AssembleAgentContextInput, SessionContextData, SubscriptionSessionContextData };
export { sessionContextDataFromBundle, subscriptionSessionContextDataFromBundle };
