/** Mirrors `AgentRunConfig` (`@hyperidle/agent-run-config`). */
export interface AgentOrchestrationRunConfigView {
	// The agent's identity is NOT here. It is the `agent_file` document
	// bound to the agent (scope_kind='user', scope_id = the agent's id), edited
	// like any other document. Run config is how an agent runs; the identity is
	// who it is, and it stopped being a column so a plugin could contribute one.
	readonly harnessType: string | null;
	readonly modelId: string | null;
	readonly modelProvider: string | null;
	readonly maxConcurrentSessions: number;
	/**
	 * The harness options this agent's model runs with. Sparse — a key is present
	 * only where the user moved a control away from the harness's own default, so
	 * an absent key means "whatever the harness does".
	 */
	readonly modelOptions: Readonly<Record<string, string | number | boolean>>;
	/** Whose program login the agent runs with. */
	readonly login: "own" | "owner";
	/** The agent's space path on this computer; null until its first run. */
	readonly spacePath: string | null;
}

/** Mirrors `AgentRunConfigPatch` — a present key is written (incl. explicit `null`); an absent key is left alone. */
export type AgentOrchestrationRunConfigPatch = {
	-readonly [K in keyof AgentOrchestrationRunConfigView]?: AgentOrchestrationRunConfigView[K];
};

/** Admin routes stay core-hosted; only the store access crosses the seam. */
export interface AgentOrchestrationRunConfigPort {
	read(agentId: string): Promise<AgentOrchestrationRunConfigView>;
	readBatch(
		agentIds: readonly string[],
	): Promise<ReadonlyMap<string, AgentOrchestrationRunConfigView>>;
	write(agentId: string, patch: AgentOrchestrationRunConfigPatch): Promise<void>;
	/** Ensure a space directory exists for the agent, creating one if none is recorded.
	 * Returns the space path. Idempotent: returns the existing path if one is already set. */
	ensureSpace(agentId: string, agentName: string): Promise<string>;
}

/**
 * A remove-style write's outcome — shared by every `connections`
 * operation that either succeeds or reports the row was never there.
 */
export type AgentOrchestrationRemoveResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly code: "NOT_FOUND" };

/** Mirrors `ServiceConnectionView` — hand-typed (zero-runtime-deps); held and inherited connections share this shape. */
export interface AgentOrchestrationConnectionView {
	readonly id: string;
	readonly service: string;
	readonly via: string;
	readonly authSource: "token" | "mcp" | "inherited";
	readonly health: "working" | "needs-attention";
	readonly removable: boolean;
	readonly withheldFrom: readonly string[];
}

export interface AgentOrchestrationConnectionsListView {
	readonly connections: readonly AgentOrchestrationConnectionView[];
	readonly inherited: readonly AgentOrchestrationConnectionView[];
}

/**
 * Mirrors `createConnectionSchema`'s discriminated union
 * (`agent-orchestration/src/routes/connections.ts`) — the exact input the
 * extracted `createConnectionForUser` validates and encrypts.
 */
export type AgentOrchestrationConnectionCreateInput =
	| { readonly service: string; readonly authSource: "token"; readonly token: string }
	| { readonly service?: string; readonly authSource: "mcp"; readonly serverUrl: string };

export type AgentOrchestrationCreateConnectionResult =
	| { readonly ok: true; readonly connection: AgentOrchestrationConnectionView }
	| { readonly ok: false; readonly code: "MISSING_ROOT_SECRET" | "DUPLICATE_CONNECTION" };

export interface AgentOrchestrationConnectionsPort {
	list(userId: string): Promise<AgentOrchestrationConnectionsListView>;
	add(
		userId: string,
		input: AgentOrchestrationConnectionCreateInput,
	): Promise<AgentOrchestrationCreateConnectionResult>;
	remove(userId: string, id: string): Promise<AgentOrchestrationRemoveResult>;
	/** Keep one of the user's connections from one agent (`keep: true`), or let it reach it again. */
	withhold(
		userId: string,
		id: string,
		agentUserId: string,
		keep: boolean,
	): Promise<AgentOrchestrationRemoveResult>;
}

/** Mirrors `SpaceFolderView` (`@hyperidle/run-orchestration`). */
export interface AgentOrchestrationSpaceFolderView {
	readonly name: string;
	readonly path: string;
	readonly isGit: boolean;
	readonly isMissing: boolean;
}

export type AgentOrchestrationSpaceFolderAddCode =
	| "RESERVED_NAME"
	| "INVALID_NAME"
	| "CONFLICT"
	| "SOURCE_NOT_FOUND"
	| "SOURCE_NOT_DIRECTORY"
	| "SPACE_NOT_SET";

export type AgentOrchestrationSpaceFolderAddResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly code: AgentOrchestrationSpaceFolderAddCode };

export type AgentOrchestrationSpaceFolderRemoveCode = "NOT_FOUND" | "NOT_A_SYMLINK";

export type AgentOrchestrationSpaceFolderRemoveResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly code: AgentOrchestrationSpaceFolderRemoveCode };

/** An agent's space folders — the symlinks in `<space>/` that point at real directories. */
export interface AgentOrchestrationSpaceFoldersPort {
	list(agentId: string): Promise<readonly AgentOrchestrationSpaceFolderView[]>;
	add(
		agentId: string,
		path: string,
		name: string | undefined,
		agentName: string,
	): Promise<AgentOrchestrationSpaceFolderAddResult>;
	remove(agentId: string, name: string): Promise<AgentOrchestrationSpaceFolderRemoveResult>;
}

export interface AgentOrchestrationPort {
	readonly runConfig: AgentOrchestrationRunConfigPort;
	/** An agent's space folders — symlinks in its space directory. */
	readonly spaceFolders: AgentOrchestrationSpaceFoldersPort;
	/** One user's held connections plus the machine's inherited reach. */
	readonly connections: AgentOrchestrationConnectionsPort;
}

export type AgentOrchestrationTransport = (req: Request) => Promise<Response>;
