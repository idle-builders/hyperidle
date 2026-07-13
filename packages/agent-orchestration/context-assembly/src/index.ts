/**
 * Barrel for @hyperidle/context-assembly (agent-orchestration Layer Service).
 *
 * Exports the assembly function and its port interfaces. Depends on NO other
 * Service (Mechanism C): domain reads arrive as injected ports wired by the
 * agent-orchestration Layer.
 */
export { assemble } from "./assemble.js";
export type {
	AssembledContext,
	AssemblyScope,
	ContextAssemblyPorts,
	FilesystemsReader,
	KnowledgeReader,
	RoutineReader,
	UsersReader,
	WorkReader,
} from "./assemble.js";
