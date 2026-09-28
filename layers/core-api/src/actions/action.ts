import type { HyperIdleDb } from "@hyperidle/db";
import type {
	ActionDeclaration,
	ActionResult,
	DocumentRow,
	EditUserInput,
	SearchDocumentsInput,
	SendMessageInput,
	SendMessageOutput,
	UserView,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";

// ActionContext carries db alongside actor/eventBus/now.
// @lore: `caller` filled ONLY by the MCP loop from ToolContext, never from a request body or header; no action reads it for authorization
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
	// @lore: `true` only for system-initiated calls; gates edit_document's forbidden_parent_kind invariant (agent/subscription parents are system-only)
	readonly internal?: boolean;
}

// Structural, not nominal — nested Services declare local mirrors (may not import the layer's own package).
export interface Action<I = unknown, O = unknown> {
	readonly declaration: ActionDeclaration<I, O>;
	readonly run: (ctx: ActionContext, input: I) => Promise<ActionResult<O>>;
}

/** send_message's bound run — one canonical shape for all consumers threading it through. */
export type SendMessageRunFn = (
	ctx: ActionContext,
	input: SendMessageInput,
) => Promise<ActionResult<SendMessageOutput>>;
/** edit_user's bound run — same canonical-shape idiom as SendMessageRunFn. */
export type EditUserRunFn = (
	ctx: ActionContext,
	input: EditUserInput,
) => Promise<ActionResult<UserView>>;
/** search_documents's bound run — the only door a document-reading neighbour gets onto @hyperidle/document. */
export type SearchDocumentsRunFn = (
	ctx: ActionContext,
	input: SearchDocumentsInput,
) => Promise<ActionResult<DocumentRow[]>>;
