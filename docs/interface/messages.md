# Messages

## Thread model

A thread has a host kind, a title, a participants list, a pinned flag, and a soft-delete. Host kinds are a closed set: `document`, `agent`, `user`, `team`, `factory`. There is no task host — a task points to a team-hosted thread.

Messages are append-only. Redaction sets the payload to a redacted marker; the row stays. `client_key` provides idempotency — submitting the same key twice is a no-op.

Message types: `plain`, `review`, `questionnaire`, `verdict`.

Verdicts: `approve`, `approve-with-comments`, `request-changes`, `edit`, `reject`.

Who may post: any member of the thread. Agents post via the `send_message` action on a session.

## Part model

A `Part` is the typed rendering unit of a conversation. Parts are **derived** from messages at render time and never stored. The renderer (`PartList`) imports only the `Part`/`Embed`/`OpenTarget` vocabulary — never the raw `Message` type. The adapters in `layers/core-ui/src/components/parts/part.ts` are the only place that know the source.

This separation is enforced by a scoped `no-restricted-imports` ESLint rule (W1, `eslint.config.ts`).

### Part kinds (closed)

| Kind | What it is |
|---|---|
| `prose` | A text body |
| `review` | A review message — shows a canvas summary, links to the review page |
| `resolved` | A resolved verdict with label and summary |
| `questionnaire` | A question with options |
| `tool` | One tool call the agent made (compact row) |
| `reasoning` | A span of agent thinking, collapsed until expanded |
| `unknown` | Wire-unrecognised type or redacted payload |

### Embed kinds (closed)

| Kind | What it is |
|---|---|
| `diff` | A file diff from a tool call |
| `session-reference` | A link to a session |
| `entity-ref` | A link to a document, task, or agent |
| `mention` | A user mention |
| `unknown` | Unrecognised reference, label only |

`InlineRef` in the domain model is `EntityRef | MentionRef | CanvasArtifactRef`. There is no block embed. Attaching a block now copies its text into a new document.

### Two source adapters

`messagesAdapter` converts `Message[]` into `Part[]`. The second adapter handles session activity entries. Both produce the same `Part` vocabulary; the renderer is source-agnostic.
