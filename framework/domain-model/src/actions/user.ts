import { z } from "zod";
import { AGENT_BEHAVIOR_CONFIG_KINDS } from "../agent-behavior-config.js";
import { CONNECTION_AUTH_SOURCES, CONNECTION_HEALTH, HELD_AUTH_SOURCES } from "../connection.js";
import { MODEL_PROVIDERS } from "../model-provider.js";
import { AGENT_CATEGORIES, HARNESS_TYPES, ORG_EDGE_MECHANISMS } from "../types.js";
import type { ActionDeclaration, Problem } from "./action.js";
import { DOCUMENT_SLOTS } from "./document.js";

/**
 * @lore BC5: the user action list — search, open, edit. Users — humans and
 * agents alike — are one module now, the way task/thread/document already
 * are: subscriptions on the row replace routines and the notification
 * queue, team and org edges are attributes read by `open_user` and changed
 * by `edit_user`. `core-ui` imports this file directly — never `core-api` —
 * for the same reason every other action module does: the browser needs the
 * exact `input`/invariant shape the server runs. The pipeline item that
 * planned this module is referenced here, in this one lore block, because
 * the shapes below reproduce a lot of pre-existing surface (harness
 * descriptors, folders, connections, behaviour) verbatim and a future reader
 * asking "why does this one file carry so much" needs the pointer; no other
 * comment, test or commit in this change names it.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export const USER_KINDS = ["human", "ai"] as const;
export type UserKind = (typeof USER_KINDS)[number];

/** Derived from the real writers — `routes/agents.ts`, `users/src/runnable-agent.ts`. */
export const USER_STATUSES = ["active", "idle", "inactive", "retired"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * The nine object events — every change row on `task`/`thread`/`document`/
 * `user` is one of these, edit-in named singular, changed-out named plural
 * per object. `framework/event-bus/src/events.ts` carries the same nine
 * names as `EVENT_TYPES` members once the modules that emit them are wired;
 * this constant is the vocabulary a subscription is written against and the
 * shape `edit_user`'s `event` field parses against, independent of that
 * wiring.
 */
export const OBJECT_EVENTS = [
	"task.created",
	"task.changed",
	"thread.created",
	"thread.message",
	"thread.changed",
	"document.created",
	"document.changed",
	"user.created",
	"user.changed",
] as const;
export type ObjectEventName = (typeof OBJECT_EVENTS)[number];

/**
 * The persona text a welcome-screen assistant and a plugin-free scaffolded
 * assistant both start with. Moved verbatim from
 * `org/src/resolve-scaffold-specs.ts`'s `APP_ASSISTANT_SYSTEM_PROMPT` — that
 * file imports this constant instead of keeping its own copy.
 */
export const ASSISTANT_IDENTITY =
	"You are a helpful AI assistant. Be concise, direct, and thoughtful in your responses.";

/** Matches the `changes` table's `changes_kind_ck` check verbatim. */
export const CHANGE_KINDS = ["created", "changed", "message"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

/** Matches the `changes` table's `changes_object_ck` check verbatim. */
export const CHANGE_OBJECTS = ["task", "thread", "document", "user"] as const;
export type ChangeObject = (typeof CHANGE_OBJECTS)[number];

/**
 * The wire shape of one `changes` row — `before`/`after` decoded, unlike the
 * DB row itself, which stores them as JSON text. Read by `open_user`'s
 * inbox and carried whole into a subscription's woken context.
 */
export const ChangeRowSchema = z.object({
	id: z.string(),
	object: z.enum(CHANGE_OBJECTS),
	objectId: z.string(),
	kind: z.enum(CHANGE_KINDS),
	actor: z.string(),
	before: z.record(z.string(), z.unknown()).nullable(),
	after: z.record(z.string(), z.unknown()),
	at: z.string(),
});
export type ChangeRow = z.infer<typeof ChangeRowSchema>;

// ---------------------------------------------------------------------------
// The row — architecture.md §1. `team` is the effective team (own, else the
// owner's); `edges` are the user's outgoing `org_edges`, so the org chart
// needs one call.
// ---------------------------------------------------------------------------

export const UserRowSchema = z.object({
	id: z.string(),
	kind: z.enum(USER_KINDS),
	name: z.string(),
	role: z.string(),
	status: z.enum(USER_STATUSES),
	email: z.string().nullable(),
	avatarUrl: z.string().nullable(),
	createdAt: z.string(),
	agentCategory: z.enum(AGENT_CATEGORIES).nullable(),
	ownerUserId: z.string().nullable(),
	/** F1: a note on the agent, e.g. a crash count — null for a healthy row. */
	health: z.string().nullable(),
	team: z.object({ id: z.string(), name: z.string() }).nullable(),
	edges: z.array(
		z.object({ id: z.string(), mechanism: z.enum(ORG_EDGE_MECHANISMS), target: z.string() }),
	),
});
export type UserRow = z.infer<typeof UserRowSchema>;

// ---------------------------------------------------------------------------
// search_users
// ---------------------------------------------------------------------------

export const SearchUsersInputSchema = z
	.object({
		ids: z.array(z.string()).optional(),
		kind: z.enum(USER_KINDS).optional(),
		/** Matches the effective team, not only an own one. */
		teamId: z.string().optional(),
		/** Case-insensitive contains. */
		name: z.string().min(1).optional(),
		ownerUserId: z.string().optional(),
		status: z.enum(USER_STATUSES).optional(),
		limit: z.number().int().min(1).max(500).optional(), // default 500
	})
	.strict();
export type SearchUsersInput = z.infer<typeof SearchUsersInputSchema>;

export const searchUsers: ActionDeclaration<SearchUsersInput, UserRow[]> = {
	name: "search_users",
	sentence:
		"Search users — people and agents alike. No parameter lists everyone, name order. Filter " +
		"by kind (human or agent), team, name (contains), owner, or status.",
	input: SearchUsersInputSchema,
	output: z.array(UserRowSchema),
};

// ---------------------------------------------------------------------------
// open_user — architecture.md §1. The supporting views (harness, folder,
// connection, behaviour, inbox) are declared as zod shapes in this file so
// the wire contract is self-contained; the TS interfaces this mirrors
// (`HarnessCapabilityDescriptor`, `ServiceConnectionView`, `Filesystem`,
// `AgentBehaviorConfigView`) keep their own server-side lives until the
// module that actually reads and writes through this door replaces their
// callers.
// ---------------------------------------------------------------------------

export const OpenUserInputSchema = z.object({ id: z.string().min(1).optional() }).strict();
export type OpenUserInput = z.infer<typeof OpenUserInputSchema>;

const HarnessOptionChoiceSchema = z.object({ value: z.string(), label: z.string() });

const HarnessModelOptionControlSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("select"), choices: z.array(HarnessOptionChoiceSchema) }),
	z.object({ kind: z.literal("boolean") }),
	z.object({
		kind: z.literal("number"),
		min: z.number().optional(),
		max: z.number().optional(),
		step: z.number().optional(),
	}),
	z.object({ kind: z.literal("text"), placeholder: z.string().optional() }),
]);

const HarnessModelOptionDescriptorSchema = z.object({
	key: z.string(),
	label: z.string(),
	helpText: z.string().optional(),
	control: HarnessModelOptionControlSchema,
	required: z.boolean(),
	defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

const HarnessModelDescriptorSchema = z.object({
	id: z.string(),
	label: z.string(),
	provider: z.enum(MODEL_PROVIDERS).optional(),
	contextWindow: z.number().optional(),
	selectable: z.boolean(),
	options: z.array(HarnessModelOptionDescriptorSchema),
});

const HarnessAuthActionDescriptorSchema = z.object({
	kind: z.enum(["enter_api_key", "native_cli_login", "none"]),
	label: z.string(),
	description: z.string().optional(),
	command: z.array(z.string()).optional(),
	credentialNames: z.array(z.string()).optional(),
});

const HarnessDiscoveryStatusSchema = z.object({
	state: z.enum(["missing", "installed", "unauthenticated", "ready", "unavailable"]),
	version: z.string().optional(),
	reason: z.string().optional(),
	disabled: z.boolean().optional(),
});

/** Mirrors `@hyperidle/harness-capability`'s `HarnessCapabilityDescriptor`. */
export const HarnessDescriptorSchema = z.object({
	type: z.string(),
	name: z.string(),
	kind: z.enum(["local", "remote"]),
	authAction: HarnessAuthActionDescriptorSchema,
	discovery: HarnessDiscoveryStatusSchema,
	models: z.array(HarnessModelDescriptorSchema),
	returnEnforcement: z
		.enum([
			"sdk-inprocess",
			"settings-claude",
			"settings-codex",
			"process-reengage",
			"soft-continue",
			"none",
		])
		.optional(),
	modelProviders: z.array(z.string()),
});
export type HarnessDescriptor = z.infer<typeof HarnessDescriptorSchema>;

/** Mirrors `ServiceConnectionView` — never a token, held or projected alike. */
export const ConnectionViewSchema = z.object({
	id: z.string(),
	service: z.string(),
	via: z.string(),
	authSource: z.enum(CONNECTION_AUTH_SOURCES),
	health: z.enum(CONNECTION_HEALTH),
	removable: z.boolean(),
});
export type ConnectionView = z.infer<typeof ConnectionViewSchema>;

/** Mirrors `InheritedConnectionFact` — a service the machine already holds auth for. */
export const InheritedReachViewSchema = z.object({
	name: z.string(),
	kind: z.enum(["mcp-server", "cli"]),
	source: z.string(),
	health: z.enum([...CONNECTION_HEALTH, "unknown"]),
});
export type InheritedReachView = z.infer<typeof InheritedReachViewSchema>;

const FolderResourceRefSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("code"), repo: z.string().min(1), branch: z.string().min(1) }),
	z.object({ kind: z.literal("doc_set"), folder: z.string().min(1) }),
]);

/** Mirrors `Filesystem` (`agent-orchestration/filesystems`'s wire shape). */
export const FolderViewSchema = z.object({
	id: z.string(),
	teamId: z.string(),
	source: z.string(),
	kind: z.enum(["code", "doc_set"]),
	connectionId: z.string().nullable(),
	resourceRef: FolderResourceRefSchema,
	writeback: z.enum(["git", "file", "none"]),
	state: z.enum(["attached", "reachable", "needs_attention"]),
	createdAt: z.string(),
});
export type FolderView = z.infer<typeof FolderViewSchema>;

const BehaviourOriginSchema = z.object({
	type: z.enum(["builtin", "plugin", "user"]),
	label: z.string(),
	state: z.enum(["enabled", "disabled", "removed", "user_owned"]),
});

const BehaviourFieldOptionSchema = z.object({ value: z.string(), label: z.string() });

const BehaviourEditableFieldSchema = z.object({
	id: z.string(),
	label: z.string(),
	kind: z.enum(["text", "textarea", "select", "toggle", "url"]),
	value: z.union([z.string(), z.boolean(), z.null()]),
	options: z.array(BehaviourFieldOptionSchema).optional(),
	placeholder: z.string().optional(),
	required: z.boolean().optional(),
	maxLength: z.number().optional(),
	helpText: z.string().optional(),
});

const BehaviourLinkSchema = z.object({
	target: z.enum([
		"settings-agents",
		"settings-agent-backends",
		"settings-connections",
		"routine-detail",
	]),
	label: z.string(),
	href: z.string(),
});

/** Mirrors `AgentBehaviorConfigView` as a zod shape. */
export const BehaviourEntrySchema = z.object({
	id: z.string(),
	kind: z.enum(AGENT_BEHAVIOR_CONFIG_KINDS),
	name: z.string(),
	description: z.string().optional(),
	origin: BehaviourOriginSchema,
	valueSource: z.enum(["default", "user_override", "user_owned", "fallback"]),
	activeSummary: z.string(),
	defaultSummary: z.string().optional(),
	statusLabel: z.string(),
	active: z.boolean(),
	editableFields: z.array(BehaviourEditableFieldSchema),
	links: z.array(BehaviourLinkSchema).optional(),
});
export type BehaviourEntry = z.infer<typeof BehaviourEntrySchema>;

export const SubscriptionViewSchema = z.object({
	id: z.string(),
	event: z.enum(OBJECT_EVENTS).nullable(),
	schedule: z.string().nullable(),
	paused: z.boolean(),
	documentId: z.string().nullable(),
	nextRunAt: z.string().nullable(),
});
export type SubscriptionView = z.infer<typeof SubscriptionViewSchema>;

const InboxRowViewSchema = z.object({
	change: ChangeRowSchema,
	seenAt: z.string().nullable(),
	readAt: z.string().nullable(),
});

const RunConfigViewSchema = z.object({
	harnessType: z.enum(HARNESS_TYPES).nullable(),
	modelId: z.string().nullable(),
	modelProvider: z.enum(MODEL_PROVIDERS).nullable(),
	maxConcurrentSessions: z.number().int(),
	modelOptions: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).nullable(),
});

export const UserViewSchema = z.object({
	/** null only for a caller with no row — the first-run moment. */
	user: UserRowSchema.nullable(),
	/** Install-wide: this machine's harnesses, `discovery.disabled` stamped. */
	runsOn: z.array(HarnessDescriptorSchema),
	runConfig: RunConfigViewSchema.nullable(),
	/** Agent-parented identity / skill / rule documents. */
	documentIds: z.array(z.object({ slot: z.enum(DOCUMENT_SLOTS), id: z.string() })),
	/** Agent: folders given to it. Person: their team's folders. */
	folders: z.array(FolderViewSchema),
	subscriptions: z.array(SubscriptionViewSchema),
	/** Self only. */
	connections: z
		.object({
			connections: z.array(ConnectionViewSchema),
			inherited: z.array(InheritedReachViewSchema),
		})
		.nullable(),
	/** Self view; install-wide values underneath. */
	behaviour: z.array(BehaviourEntrySchema).nullable(),
	/** Self only, newest 50. */
	inbox: z.array(InboxRowViewSchema).nullable(),
});
export type UserView = z.infer<typeof UserViewSchema>;

export const openUser: ActionDeclaration<OpenUserInput, UserView> = {
	name: "open_user",
	sentence:
		"Open a user: name, role, kind, team, status, who they report to, how they run, their " +
		"identity and skill documents, folders, connections, subscriptions — and, when you open " +
		"yourself, your inbox. No id opens you.",
	input: OpenUserInputSchema,
	output: UserViewSchema,
};

// ---------------------------------------------------------------------------
// edit_user — architecture.md §1. One partial; no `id` creates.
// ---------------------------------------------------------------------------

const EditUserTeamRefSchema = z.object({ name: z.string().min(1) }).strict();

const EditUserRunConfigSchema = z
	.object({
		harnessType: z.enum(HARNESS_TYPES).optional(),
		modelId: z.string().optional(),
		modelProvider: z.enum(MODEL_PROVIDERS).optional(),
		modelOptions: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
		maxConcurrentSessions: z.number().int().min(1).optional(),
	})
	.strict();

const EditUserEdgesSchema = z
	.object({
		add: z
			.array(
				z.object({ mechanism: z.enum(ORG_EDGE_MECHANISMS), target: z.string().min(1) }).strict(),
			)
			.optional(),
		remove: z.array(z.string().min(1)).optional(),
	})
	.strict();

const EditUserFoldersSchema = z
	.object({
		/** Today's `POST /filesystems` body, minus `teamId` — implied by the caller. */
		add: z
			.array(
				z
					.object({
						kind: z.enum(["code", "doc_set"]),
						resourceRef: FolderResourceRefSchema,
						writeback: z.enum(["git", "file", "none"]),
						connectionId: z.string().nullable().optional(),
					})
					.strict(),
			)
			.optional(),
		remove: z.array(z.string().min(1)).optional(),
		give: z.array(z.string().min(1)).optional(),
		take: z.array(z.string().min(1)).optional(),
	})
	.strict();

const EditUserConnectionsSchema = z
	.object({
		add: z
			.array(
				z
					.object({
						service: z.string().min(1),
						authSource: z.enum(HELD_AUTH_SOURCES),
						token: z.string().optional(),
						serverUrl: z.string().optional(),
					})
					.strict(),
			)
			.optional(),
		remove: z.array(z.string().min(1)).optional(),
	})
	.strict();

const AddSubscriptionSchema = z
	.object({
		event: z.enum(OBJECT_EVENTS).optional(),
		schedule: z.string().min(1).optional(),
		prompt: z.string().nullable().optional(),
		paused: z.boolean().optional(),
	})
	.strict();
export type AddSubscriptionInput = z.infer<typeof AddSubscriptionSchema>;

const ChangeSubscriptionSchema = z
	.object({
		id: z.string().min(1),
		event: z.enum(OBJECT_EVENTS).optional(),
		schedule: z.string().min(1).optional(),
		prompt: z.string().nullable().optional(),
		paused: z.boolean().optional(),
	})
	.strict();

const EditUserSubscriptionsSchema = z
	.object({
		add: z.array(AddSubscriptionSchema).optional(),
		change: z.array(ChangeSubscriptionSchema).optional(),
		remove: z.array(z.string().min(1)).optional(),
	})
	.strict();

const EditUserInboxSchema = z
	.object({
		seen: z.union([z.literal("all"), z.array(z.string().min(1))]).optional(),
		read: z.array(z.string().min(1)).optional(),
	})
	.strict();

const EditUserBehaviourEntrySchema = z
	.object({
		id: z.string().min(1),
		fields: z.record(z.string(), z.union([z.string(), z.boolean(), z.null()])),
	})
	.strict();

export const EditUserInputSchema = z
	.object({
		/** Absent ⇒ create. Present ⇒ edit. */
		id: z.string().min(1).optional(),
		/** Create-only. */
		kind: z.enum(USER_KINDS).optional(),
		name: z.string().optional(),
		role: z.string().optional(),
		email: z.string().nullable().optional(),
		avatarUrl: z.string().nullable().optional(),
		status: z.enum(USER_STATUSES).optional(),
		health: z.string().nullable().optional(),
		/** Found by name (oldest), or created. */
		team: EditUserTeamRefSchema.optional(),
		/** Create-only, agents. */
		ownerUserId: z.string().min(1).optional(),
		/** Create-only, agents; default: owned → "individual", else "team". */
		agentCategory: z.enum(AGENT_CATEGORIES).optional(),
		/** Create-only, agents. `null`/`undefined` distinguish "no document" from "not touched". */
		identity: z.string().nullable().optional(),
		runConfig: EditUserRunConfigSchema.optional(),
		edges: EditUserEdgesSchema.optional(),
		folders: EditUserFoldersSchema.optional(),
		connections: EditUserConnectionsSchema.optional(),
		subscriptions: EditUserSubscriptionsSchema.optional(),
		inbox: EditUserInboxSchema.optional(),
		behaviour: z.array(EditUserBehaviourEntrySchema).optional(),
		redetectHarnesses: z.literal(true).optional(),
	})
	.strict();
export type EditUserInput = z.infer<typeof EditUserInputSchema>;

export const editUser: ActionDeclaration<EditUserInput, UserView> = {
	name: "edit_user",
	sentence:
		"Write a user, new or existing: no id creates — a person, or an agent with an owner or a " +
		"team. Name, role, team (by name — created if it does not exist), status, who they report " +
		"to, harness and model, folders given or taken, connections added or removed, subscriptions " +
		"added, changed, paused or removed, inbox rows marked read.",
	input: EditUserInputSchema,
	output: UserViewSchema,
};

export const USER_ACTIONS = {
	search_users: searchUsers,
	open_user: openUser,
	edit_user: editUser,
} as const;

// ---------------------------------------------------------------------------
// Pure invariants — architecture.md §1. DB-dependent problems (`not_found`,
// `unknown_actor`, `unknown_owner`, the runnable check, the harness/model
// codes `validate-agent-config.ts` already names, and the rest) need the
// database and belong in `edit_user.run` (a later task), not here.
// ---------------------------------------------------------------------------

/** `kind_required`, `name_required`, `belonging_required`, `owned_agent_has_no_team`,
 * `person_has_no_owner`, `agent_fields_for_agents` — only meaningful on a create (no `id`). */
function createUserInvariants(input: EditUserInput): Problem[] {
	const problems: Problem[] = [];
	if (input.kind === undefined) {
		problems.push({
			code: "kind_required",
			message: "Say whether this is a person or an agent.",
			path: "kind",
		});
	}
	if (input.name === undefined || input.name.trim().length === 0) {
		problems.push({ code: "name_required", message: "A user needs a name.", path: "name" });
	}
	if (input.team === undefined && input.ownerUserId === undefined) {
		problems.push({
			code: "belonging_required",
			message: "Every user is in a team, or owned by one who is — name one.",
			path: "team",
		});
	}
	if (input.ownerUserId !== undefined && input.team !== undefined) {
		problems.push({
			code: "owned_agent_has_no_team",
			message: "An owned agent takes its owner's team — do not name one of its own.",
			path: "team",
		});
	}
	if (input.kind === "human" && input.ownerUserId !== undefined) {
		problems.push({
			code: "person_has_no_owner",
			message: "A person is not owned by anyone.",
			path: "ownerUserId",
		});
	}
	if (
		input.kind === "human" &&
		(input.identity !== undefined ||
			input.agentCategory !== undefined ||
			input.runConfig !== undefined)
	) {
		problems.push({
			code: "agent_fields_for_agents",
			message: "Identity, category and run config belong to an agent, not a person.",
			path: "identity",
		});
	}
	return problems;
}

/** `name_required`, `kind_is_create_only`, `owner_is_create_only`, `identity_is_create_only` —
 * only meaningful on an edit (`id` given). */
function editExistingUserInvariants(input: EditUserInput): Problem[] {
	const problems: Problem[] = [];
	if (input.name !== undefined && input.name.trim().length === 0) {
		problems.push({ code: "name_required", message: "A user needs a name.", path: "name" });
	}
	if (input.kind !== undefined) {
		problems.push({
			code: "kind_is_create_only",
			message: "A user's kind cannot change after it is created.",
			path: "kind",
		});
	}
	if (input.ownerUserId !== undefined) {
		problems.push({
			code: "owner_is_create_only",
			message: "An agent's owner cannot change after it is created.",
			path: "ownerUserId",
		});
	}
	if (input.identity !== undefined) {
		problems.push({
			code: "identity_is_create_only",
			message: "An agent's identity is set at creation; edit its identity document afterwards.",
			path: "identity",
		});
	}
	return problems;
}

/** `event_or_schedule` — exactly one per added subscription. */
function subscriptionInvariants(input: EditUserInput): Problem[] {
	const problems: Problem[] = [];
	for (const subscription of input.subscriptions?.add ?? []) {
		const hasEvent = subscription.event !== undefined;
		const hasSchedule = subscription.schedule !== undefined;
		if (hasEvent === hasSchedule) {
			problems.push({
				code: "event_or_schedule",
				message: "A subscription fires on exactly one of an event or a schedule.",
				path: "subscriptions",
			});
		}
	}
	return problems;
}

export function editUserInvariants(input: EditUserInput): Problem[] {
	const isCreate = input.id === undefined;
	return [
		...(isCreate ? createUserInvariants(input) : editExistingUserInvariants(input)),
		...subscriptionInvariants(input),
	];
}
