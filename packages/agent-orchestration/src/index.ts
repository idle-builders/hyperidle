/**
 * @hyperidle/agent-orchestration — Layer composition barrel.
 *
 * The orchestration Layer is the only place cross-Service wiring is named. Here
 * it wires `context-assembly`'s ports: the `knowledge` port to the real
 * `@hyperidle/knowledge` Service (reaching DOWN to the core-api Layer — legal),
 * and the other four to clearly-marked transitional stubs until those Services
 * migrate (Increments 1-3). This is the §7.3 worked example proving Mechanism C
 * end-to-end for one real edge.
 *
 * @lore AU19 Increment 0: `wiredAssemble` is NOT swapped into the live app
 * (`packages/server` keeps its in-process context-assembly for production) — the
 * stubbed ports never touch a production path, so "no behavior change" holds while
 * the package still compiles, passes all three guards, and is unit-tested on the
 * real knowledge edge.
 */
import {
	type AssembledContext,
	type AssemblyScope,
	type ContextAssemblyPorts,
	assemble,
} from "@hyperidle/context-assembly";
import type { HyperIdleDb } from "@hyperidle/db";
import { list as knowledgeList } from "@hyperidle/knowledge";

// TRANSITIONAL STUB — replaced when work/users/routine/filesystems migrate, Inc 1-3.
const stubWork: ContextAssemblyPorts["work"] = {
	async openBets() {
		return [];
	},
};
// TRANSITIONAL STUB — replaced when users migrates, Inc 1.
const stubUsers: ContextAssemblyPorts["users"] = {
	async displayName() {
		return null;
	},
};
// TRANSITIONAL STUB — replaced when routine migrates, Inc 1.
const stubRoutine: ContextAssemblyPorts["routine"] = {
	async activeRoutines() {
		return [];
	},
};
// TRANSITIONAL STUB — replaced when filesystems migrates, Inc 2.
const stubFilesystems: ContextAssemblyPorts["filesystems"] = {
	async mountedPaths() {
		return [];
	},
};

/** Assemble a context bundle with the knowledge edge wired to the real Service. */
export function wiredAssemble(
	db: HyperIdleDb,
	scope: AssemblyScope,
	authorId: string,
): Promise<AssembledContext> {
	const ports: ContextAssemblyPorts = {
		knowledge: { list: (s: AssemblyScope) => knowledgeList(db, s) },
		work: stubWork,
		users: stubUsers,
		routine: stubRoutine,
		filesystems: stubFilesystems,
	};
	return assemble(ports, scope, authorId);
}
