import type { HyperIdleDb } from "@hyperidle/db";
import type {
	ActionDeclaration,
	ActionResult,
	AdjustThreadInput,
	DocumentRow,
	SearchDocumentsInput,
	SendMessageInput,
	SendMessageOutput,
	ThreadView,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";

/**
 * the layer's own composition code for actions, next to
 * `compose-api-application.ts`. Lives here, not in `framework/domain-model`,
 * because it carries `db` (the architecture doc §5).
 *
 * @lore BC3 architecture.md §3.2: `ActionContext` gained exactly one
 * optional field, `caller` — filled ONLY by the MCP loop
 * (`actions-as-tools.ts`) from `ToolContext`, never from a request body,
 * never from a header. Absent for every HTTP call. No action reads `caller`
 * for authorization; only for the thread module's no-target reply fallback,
 * the review→session link and the produced-item-parented-to-the-calling-task
 * check.
 */
export interface ActionContext {
	readonly actor: string;
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly now: string;
	readonly caller?: {
		readonly sessionId: string;
		readonly taskId: string | null;
		readonly threadId: string | null;
	};
}

/**
 * `Action<I, O>` is deliberately structural, not a nominal export a nested
 * Service imports: `createTaskActions` (in `@hyperidle/task`, a nested
 * Service under this layer) declares its own local mirror of this exact
 * shape and returns it — a nested Service may not import the layer's own
 * package (`layers/core-api/package.json` exports only `.`, `./app`,
 * `./boot`), so the two types agree by shape, not by import.
 */
export interface Action<I = unknown, O = unknown> {
	readonly declaration: ActionDeclaration<I, O>;
	readonly run: (ctx: ActionContext, input: I) => Promise<ActionResult<O>>;
}

/**
 * `send_message`/`adjust_thread`'s own bound `run`, as the composed action
 * list's `sendMessageAction.run`/`adjustThreadAction.run` are cast to —
 * ONE canonical shape so every consumer that threads them through
 * (`session-not-returned-notice.ts`, `agent-run-admission-reactions.ts`,
 * `service-bootstrap.ts`, `app.ts`) agrees on the same type rather than
 * each declaring its own narrower mirror.
 */
export type SendMessageRunFn = (
	ctx: ActionContext,
	input: SendMessageInput,
) => Promise<ActionResult<SendMessageOutput>>;
export type AdjustThreadRunFn = (
	ctx: ActionContext,
	input: AdjustThreadInput,
) => Promise<ActionResult<ThreadView>>;
/**
 * `search_documents`'s own bound `run` — the ONLY door a document-reading
 * neighbour ever gets onto `@hyperidle/document` (architecture.md §6.7,
 * §8.1). One canonical shape here rather than a private mirror in every
 * composition root that needs it (`compose.ts`, `task-run-resolver-bindings.ts`,
 * `routine-scheduler-bindings.ts`).
 */
export type SearchDocumentsRunFn = (
	ctx: ActionContext,
	input: SearchDocumentsInput,
) => Promise<ActionResult<DocumentRow[]>>;
