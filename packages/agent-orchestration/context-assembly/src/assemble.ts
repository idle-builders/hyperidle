/**
 * context-assembly — assembles a run's context bundle from domain reads.
 *
 * This is the §7.3 worked example of Mechanism C (Composition boundary): the
 * Service depends on NO other Service. Every domain read arrives as a port
 * parameter typed here (the consuming Service declares its own ports); the owning
 * agent-orchestration Layer wires the concrete Service implementations in.
 *
 * @lore AU19 Increment 0: only the `knowledge` port is wired to a real Service
 * (`@hyperidle/knowledge`.list) — the single genuinely-single-edge slice the hard
 * gate proves. The other four ports (work/users/routine/filesystems) are wired to
 * clearly-marked transitional stubs by the Layer until Increments 1-3 migrate
 * those Services. context-assembly types domain rows off `@hyperidle/db` directly,
 * which is legal because it is an agent-orchestration Service (orchestration keeps
 * db; only agent-execution drops it).
 */
import type { KnowledgeItem } from "@hyperidle/db";

/** Structural scope selector — matches the knowledge Service's KnowledgeScope. */
export interface AssemblyScope {
	readonly scopeKind: string;
	readonly scopeId?: string | null;
}

export interface KnowledgeReader {
	list(scope: AssemblyScope): Promise<readonly KnowledgeItem[]>;
}
export interface WorkReader {
	openBets(scope: AssemblyScope): Promise<readonly string[]>;
}
export interface UsersReader {
	displayName(userId: string): Promise<string | null>;
}
export interface RoutineReader {
	activeRoutines(scope: AssemblyScope): Promise<readonly string[]>;
}
export interface FilesystemsReader {
	mountedPaths(scope: AssemblyScope): Promise<readonly string[]>;
}

/** The full port set an assembly needs. Wired by the agent-orchestration Layer. */
export interface ContextAssemblyPorts {
	readonly knowledge: KnowledgeReader;
	readonly work: WorkReader;
	readonly users: UsersReader;
	readonly routine: RoutineReader;
	readonly filesystems: FilesystemsReader;
}

export interface AssembledContext {
	readonly knowledge: readonly KnowledgeItem[];
	readonly openBets: readonly string[];
	readonly authorDisplayName: string | null;
	readonly activeRoutines: readonly string[];
	readonly mountedPaths: readonly string[];
}

/** Assemble the context bundle for a scope + author, reading through the ports. */
export async function assemble(
	ports: ContextAssemblyPorts,
	scope: AssemblyScope,
	authorId: string,
): Promise<AssembledContext> {
	const [knowledge, openBets, authorDisplayName, activeRoutines, mountedPaths] = await Promise.all([
		ports.knowledge.list(scope),
		ports.work.openBets(scope),
		ports.users.displayName(authorId),
		ports.routine.activeRoutines(scope),
		ports.filesystems.mountedPaths(scope),
	]);
	return { knowledge, openBets, authorDisplayName, activeRoutines, mountedPaths };
}
