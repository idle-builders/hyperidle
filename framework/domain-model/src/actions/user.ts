import { z } from "zod";
import { CONNECTION_AUTH_SOURCES, CONNECTION_HEALTH, HELD_AUTH_SOURCES } from "../connection.js";
import { MODEL_PROVIDERS } from "../model-provider.js";
import { AGENT_CATEGORIES, HARNESS_TYPES, ORG_EDGE_MECHANISMS } from "../types.js";
import type { ActionDeclaration, Problem } from "./action.js";
import { DOCUMENT_SLOTS } from "./document.js";

export const USER_KINDS = ["human", "ai"] as const;
export type UserKind = (typeof USER_KINDS)[number];

/** Derived from the real writers — `users/src/runnable-agent.ts`. */
export const USER_STATUSES = ["active", "idle", "inactive", "retired"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

// Nine object events — vocabulary for subscriptions and edit_user's event field; event-bus/events.ts mirrors these as EVENT_TYPES members.
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
 * What tells a person something, in their own words — each a subscription of theirs, fired by the
 * object event it reads: a review raised for them, a message naming them, a task they started
 * ending done or stuck, and a change to something they follow (their one-object follows are heard
 * only while this one is on).
 */
export const PERSON_REASONS = [
	"review.raised_for_me",
	"mention.of_me",
	"started.done_or_stuck",
	"followed.changed",
] as const;
export type PersonReason = (typeof PERSON_REASONS)[number];

/** What a subscription can be about: an object event, or one of a person's reasons. */
export const SUBSCRIPTION_EVENTS = [...OBJECT_EVENTS, ...PERSON_REASONS] as const;
export type SubscriptionEventName = (typeof SUBSCRIPTION_EVENTS)[number];

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

// teams are every team the user is in — a person may be in several, an agent in one; edges are outgoing org_edges — the org chart needs one call.

export const UserRowSchema = z.object({
	id: z.string(),
	kind: z.enum(USER_KINDS),
	name: z.string(),
	role: z.string(),
	status: z.enum(USER_STATUSES),
	avatarUrl: z.string().nullable(),
	createdAt: z.string(),
	agentCategory: z.enum(AGENT_CATEGORIES).nullable(),
	ownerUserId: z.string().nullable(),
	/** A note on the agent, e.g. a crash count — null for a healthy row. */
	health: z.string().nullable(),
	/**
	 * Someone's craft. Applies to a human and an agent alike; clusters an
	 * agent's context bundle and nothing else — see `documents.discipline`'s
	 * own doc for the shared rule.
	 */
	discipline: z.string().nullable(),
	/** What they do, in a few words, as everyone sees it. */
	what: z.string().nullable(),
	teams: z.array(z.object({ id: z.string(), name: z.string() })),
	edges: z.array(
		z.object({
			id: z.string(),
			mechanism: z.enum(ORG_EDGE_MECHANISMS),
			target: z.string(),
			/**
			 * Every user currently holding this discipline, case-insensitive —
			 * populated for `discipline` edges only, recomputed on every read,
			 * never stored. Empty for `direct`/`team` edges, where `target`
			 * already names its own resolution (a userId, a teamId).
			 */
			resolvedUserIds: z.array(z.string()),
		}),
	),
});
export type UserRow = z.infer<typeof UserRowSchema>;

export const SearchUsersInputSchema = z
	.object({
		ids: z.array(z.string()).optional(),
		kind: z.enum(USER_KINDS).optional(),
		/** Everyone in this team. */
		teamId: z.string().optional(),
		/** Case-insensitive contains. */
		name: z.string().min(1).optional(),
		ownerUserId: z.string().optional(),
		status: z.enum(USER_STATUSES).optional(),
		/** Case-insensitive exact match against a user's own `discipline`. */
		discipline: z.string().min(1).optional(),
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
	/** The agents it is kept from; every other agent of its owner reaches it. Always empty for an inherited one. */
	withheldFrom: z.array(z.string()),
});
export type ConnectionView = z.infer<typeof ConnectionViewSchema>;

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

export const SubscriptionViewSchema = z.object({
	id: z.string(),
	event: z.enum(SUBSCRIPTION_EVENTS).nullable(),
	/** The one object it follows, or null for the event about anything the user reaches. */
	objectId: z.string().nullable(),
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

// derived trust signal, not a stored column
const ReviewTrackRecordSchema = z.object({
	/** approve / total. 0 when no verdicts. */
	approvalRate: z.number(),
	totalVerdicts: z.number().int(),
	/** Newest first, capped at 10. */
	recentVerdicts: z.array(
		z.object({ decision: z.string(), threadId: z.string(), createdAt: z.string() }),
	),
	windowDays: z.number().int(),
});

export const UserViewSchema = z.object({
	/** null only for a caller with no row — the first-run moment. */
	user: UserRowSchema.nullable(),
	/** Install-wide: this machine's harnesses, `discovery.disabled` stamped. */
	runsOn: z.array(HarnessDescriptorSchema),
	runConfig: RunConfigViewSchema.nullable(),
	/** An agent's identity, skill and rule documents; a person's About (their `agent_file`). */
	documentIds: z.array(z.object({ slot: z.enum(DOCUMENT_SLOTS), id: z.string() })),
	/** Agent: folders given to it. Person: the folders of every team they are in. */
	folders: z.array(FolderViewSchema),
	subscriptions: z.array(SubscriptionViewSchema),
	/** Yourself, or an agent: the services its sessions get — its owner's, or the first person's for an agent no one owns. */
	connections: z
		.object({
			connections: z.array(ConnectionViewSchema),
			/** Mirrors `ServiceConnectionView` too — the connections door
			 * (`projectFacts`) already projects inherited facts into the same
			 * held-row shape, never a separate one. */
			inherited: z.array(ConnectionViewSchema),
		})
		.nullable(),
	/** Self only, newest 50. */
	inbox: z.array(InboxRowViewSchema).nullable(),
	/**
	 * Agent only — derived trust signal from verdict-message history over a
	 * fixed 30-day window. `null` for a person, or when the caller wired no
	 * reviewTrackRecord reader.
	 */
	reviewTrackRecord: ReviewTrackRecordSchema.nullable(),
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
		/** `POST /filesystems` body, with the team named rather than given by id. */
		add: z
			.array(
				z
					.object({
						/** One of this user's teams, by name — needed only when they are in several. */
						team: z.string().min(1).optional(),
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
						// Optional: an "mcp" add derives its service name from
						// `serverUrl`'s hostname when the caller omits it (mirrors
						// `createConnectionSchema`'s own optional `service` on that
						// branch); a "token" add still needs one named explicitly.
						service: z.string().min(1).optional(),
						authSource: z.enum(HELD_AUTH_SOURCES),
						token: z.string().optional(),
						serverUrl: z.string().optional(),
					})
					.strict(),
			)
			.optional(),
		remove: z.array(z.string().min(1)).optional(),
		/** On an agent: let it reach these services of its owner again. */
		give: z.array(z.string().min(1)).optional(),
		/** On an agent: keep these services of its owner from it. */
		take: z.array(z.string().min(1)).optional(),
	})
	.strict();

const AddSubscriptionSchema = z
	.object({
		event: z.enum(SUBSCRIPTION_EVENTS).optional(),
		/** Follow one task, thread or document: only the event about it fires. Needs `event`. */
		objectId: z.string().min(1).optional(),
		schedule: z.string().min(1).optional(),
		/** What it makes an agent do, as a document; `""` makes the document empty, to be written next. */
		prompt: z.string().nullable().optional(),
		/** The name of what it does — the title of its prompt document. */
		title: z.string().min(1).optional(),
		paused: z.boolean().optional(),
	})
	.strict();
export type AddSubscriptionInput = z.infer<typeof AddSubscriptionSchema>;

const ChangeSubscriptionSchema = z
	.object({
		id: z.string().min(1),
		event: z.enum(SUBSCRIPTION_EVENTS).optional(),
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

export const EditUserInputSchema = z
	.object({
		/** Absent ⇒ create. Present ⇒ edit. */
		id: z.string().min(1).optional(),
		/** Create-only. */
		kind: z.enum(USER_KINDS).optional(),
		name: z.string().optional(),
		role: z.string().optional(),
		/** Someone's craft. Explicit only — never inherited. `null` clears it. */
		discipline: z.string().nullable().optional(),
		/** What they do, in a few words. `null` clears it. */
		what: z.string().nullable().optional(),
		avatarUrl: z.string().nullable().optional(),
		status: z.enum(USER_STATUSES).optional(),
		health: z.string().nullable().optional(),
		/** Every team this user is in, by name — each found (oldest) or created. Replaces the whole list. */
		teams: z.array(z.string().min(1)).optional(),
		/** Create-only, agents. */
		ownerUserId: z.string().min(1).optional(),
		/** Create-only, agents; default: owned → "individual", else "team". */
		agentCategory: z.enum(AGENT_CATEGORIES).optional(),
		/**
		 * Who an agent is, or a person's About: their `agent_file` document. Makes it with this text
		 * when there is none yet; never overwrites one that exists — that is edited as a document.
		 */
		identity: z.string().nullable().optional(),
		runConfig: EditUserRunConfigSchema.optional(),
		edges: EditUserEdgesSchema.optional(),
		folders: EditUserFoldersSchema.optional(),
		connections: EditUserConnectionsSchema.optional(),
		subscriptions: EditUserSubscriptionsSchema.optional(),
		inbox: EditUserInboxSchema.optional(),
		redetectHarnesses: z.literal(true).optional(),
	})
	.strict();
export type EditUserInput = z.infer<typeof EditUserInputSchema>;

export const editUser: ActionDeclaration<EditUserInput, UserView> = {
	name: "edit_user",
	sentence:
		"Write a user, new or existing: no id creates — a person, or an agent, owned by a person " +
		"or not. Name, role, teams (by name — created if they do not exist; a person may be in " +
		"several, an agent in exactly one), status, who they report " +
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

// Pure invariants — DB-dependent problems (not_found, unknown_actor, etc.) belong in edit_user.run, not here.

const BELONGING_REQUIRED: Problem = {
	code: "belonging_required",
	message: "Every user is in at least one team — name one.",
	path: "teams",
};

const AGENT_ONE_TEAM: Problem = {
	code: "agent_one_team",
	message: "An agent is in exactly one team.",
	path: "teams",
};

/** Who a team-membership check is about, once `edit_user.run` has read what the input alone cannot say. */
export interface TeamMembershipSubject {
	readonly kind: string;
	/** The teams the user is in after this edit. */
	readonly teams: readonly string[];
	/** An owned agent's owner's teams; `null` for a person or an agent no one owns. */
	readonly ownerTeams: readonly string[] | null;
	/** A person's owned agents' teams — each must stay one of theirs. */
	readonly ownedAgentTeams: readonly string[];
}

/** `belonging_required`, `agent_one_team`, `agent_team_not_owners` — every user is in at
 * least one team, an agent in exactly one, and an owned agent only in one of its owner's. */
export function teamMembershipProblems(subject: TeamMembershipSubject): Problem[] {
	const teams = new Set(subject.teams);
	if (teams.size === 0) return [BELONGING_REQUIRED];
	if (subject.kind === "ai" && teams.size > 1) return [AGENT_ONE_TEAM];
	const ownerTeams = subject.ownerTeams;
	if (ownerTeams !== null && ![...teams].every((t) => ownerTeams.includes(t))) {
		return [
			{
				code: "agent_team_not_owners",
				message: "An owned agent is in one of its owner's teams.",
				path: "teams",
			},
		];
	}
	if (subject.ownedAgentTeams.some((t) => !teams.has(t))) {
		return [
			{
				code: "agent_team_not_owners",
				message:
					"One of this person's agents is in a team they would leave — move the agent first.",
				path: "teams",
			},
		];
	}
	return [];
}

/** `kind_required`, `name_required`, `belonging_required`, `agent_one_team`,
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
	if (input.teams === undefined || input.teams.length === 0) problems.push(BELONGING_REQUIRED);
	if (input.kind === "ai" && new Set(input.teams).size > 1) problems.push(AGENT_ONE_TEAM);
	if (input.kind === "human" && input.ownerUserId !== undefined) {
		problems.push({
			code: "person_has_no_owner",
			message: "A person is not owned by anyone.",
			path: "ownerUserId",
		});
	}
	if (
		input.kind === "human" &&
		(input.agentCategory !== undefined || input.runConfig !== undefined)
	) {
		problems.push({
			code: "agent_fields_for_agents",
			message: "Category and run config belong to an agent, not a person.",
			path: "runConfig",
		});
	}
	return problems;
}

/** `name_required`, `kind_is_create_only`, `owner_is_create_only` — only meaningful on an edit (`id` given). */
function editExistingUserInvariants(input: EditUserInput): Problem[] {
	const problems: Problem[] = [];
	if (input.name !== undefined && input.name.trim().length === 0) {
		problems.push({ code: "name_required", message: "A user needs a name.", path: "name" });
	}
	if (input.teams !== undefined && input.teams.length === 0) problems.push(BELONGING_REQUIRED);
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
		if (subscription.objectId !== undefined && !hasEvent) {
			problems.push({
				code: "follow_needs_event",
				message: "Following one object needs the event to hear about it.",
				path: "subscriptions",
			});
		} else if (
			subscription.objectId !== undefined &&
			(PERSON_REASONS as readonly string[]).includes(subscription.event ?? "")
		) {
			problems.push({
				code: "follow_needs_object_event",
				message: "Following one object needs an event about objects, not a reason.",
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
