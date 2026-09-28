// Barrel for @hyperidle/document. Must not re-export the raw `documents` table — Table ACL.
// Consumers reach documents only through actions (search_documents/open_document/edit_document).

// -- the action mechanism --
export { createDocumentActions, type DocumentActionsDeps } from "./document-actions.js";
// WS authorizer's own read of a documents row for the document:<id> subscribe-authz check.
export { getDocument } from "./document-store.js";
// -- session context assembly --
export type { SessionDocument } from "./session-documents.js";
export { assembleSessionDocuments } from "./session-documents.js";
