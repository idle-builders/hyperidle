export {
	createPgliteDb,
	createPostgresDb,
	type DbHandle,
	type HyperIdleDb,
} from "./connection.js";
export { applyMigrations, isDowngrade, type MigrationResult } from "./migrate.js";
export * as schema from "./schema.js";
export {
	type AgentSessionRequest,
	type AgentWorkIntent,
	agentRunConfig,
	agentSessionRequests,
	agentWorkIntents,
	type Change,
	changes,
	type DocumentRow,
	documents,
	type ExplicitSessionStart,
	explicitSessionStarts,
	type FilesystemRow,
	filesystemInjections,
	filesystems,
	type InboxRow,
	inbox,
	type Message,
	messages,
	type NewAgentRunConfigRow,
	type NewChange,
	type NewFilesystem,
	type NewFilesystemInjection,
	type NewInboxRow,
	type NewMessage,
	type NewReviewSessionRow,
	type NewServiceConnectionRow,
	type NewSubscription,
	type NewTask,
	type NewThread,
	type NewUser,
	orgEdges,
	type PluginRow,
	pluginContributions,
	plugins,
	type ReviewSessionRow,
	reviewSessions,
	type ServiceConnectionRow,
	type Session,
	type Subscription,
	serverConfig,
	serviceConnections,
	sessions,
	subscriptions,
	type Task,
	// @lore U1 / AU44 B1: Team is the single domain entity (team_members dissolved in).
	type Team,
	type Thread,
	taskDispatchAttempts,
	tasks,
	// @lore U1: teams table (formerly products table).
	teams,
	threads,
	type User,
	users,
} from "./schema.js";
// @lore AU28 Ruling 9: `createTestDb` / `warmPool` / `closeAllInstances` /
// `TestDbHandle` used to be exported from this production barrel. That is one of the
// breaches the founder named which "no folder convention would have caught" — a
// development symbol reachable from a production entry point. They now live behind the
// `@hyperidle/db/testing` subpath, and the crossing rule polices who imports it.
export type { WriteExecutor } from "./write-executor.js";
