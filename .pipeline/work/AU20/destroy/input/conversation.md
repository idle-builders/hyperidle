# Destroyer input — `conversation` (core-api)

Package: `layers/core-api/conversation`
Surface: 17 exported functions, 1 classes (0 member methods), 10 interface/type declarations, 1 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `registerAssistantThreadPinReaction` | yes | `layers/core-api/conversation/src/assistant-thread-pin-reaction.ts:56` |
| 2 | `resolveAssistantTurnRequest` | yes | `layers/core-api/conversation/src/assistant-turn-resolver.ts:119` |
| 3 | `insertThread` | yes | `layers/core-api/conversation/src/conversation-store.ts:125` |
| 4 | `updateThread` | yes | `layers/core-api/conversation/src/conversation-store.ts:129` |
| 5 | `insertMessage` | yes | `layers/core-api/conversation/src/conversation-store.ts:137` |
| 6 | `updateMessage` | yes | `layers/core-api/conversation/src/conversation-store.ts:141` |
| 7 | `resolveMessageIfUnresolved` | yes | `layers/core-api/conversation/src/conversation-store.ts:154` |
| 8 | `findOrCreateDirectThread` | yes | `layers/core-api/conversation/src/conversation-store.ts:179` |
| 9 | `findThread` | yes | `layers/core-api/conversation/src/conversation-store.ts:222` |
| 10 | `listThreads` | yes | `layers/core-api/conversation/src/conversation-store.ts:250` |
| 11 | `countThreads` | yes | `layers/core-api/conversation/src/conversation-store.ts:275` |
| 12 | `findMessage` | yes | `layers/core-api/conversation/src/conversation-store.ts:290` |
| 13 | `listMessages` | yes | `layers/core-api/conversation/src/conversation-store.ts:326` |
| 14 | `listInbox` | yes | `layers/core-api/conversation/src/conversation-store.ts:389` |
| 15 | `searchConversations` | yes | `layers/core-api/conversation/src/conversation-store.ts:434` |
| 16 | `getArtifactThreadSummaries` | yes | `layers/core-api/conversation/src/conversation-store.ts:490` |
| 17 | `registerSessionNotReturnedNotice` | yes | `layers/core-api/conversation/src/session-not-returned-notice.ts:67` |

## B. Classes and their member methods — EVERY MEMBER NEEDS A VERDICT

### `AssistantTurnSourceUnavailableError` — `layers/core-api/conversation/src/assistant-turn-resolver.ts:48` (public)
- (no public member methods)

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `AssistantThreadPinReactionDeps` (interface, public) `layers/core-api/conversation/src/assistant-thread-pin-reaction.ts:29` — members: `findUserById`
- `AssistantTurnResolverDeps` (interface, public) `layers/core-api/conversation/src/assistant-turn-resolver.ts:34` — members: `requireRunnableAgent`, `readServerConfig`
- `BakedTranscriptRow` (interface, internal) `layers/core-api/conversation/src/assistant-turn-resolver.ts:51` — members: `senderId`, `payload`, `type`
- `BakedAssistantTurnRequest` (interface, public) `layers/core-api/conversation/src/assistant-turn-resolver.ts:74` — members: `defaultAgentId`, `sourceKind`, `sourceId`, `streamId`, `userId`, `sourceCorrelation`, `transcript`, `callingThreadId`, `agentConfig`, `harnessDisabled`
- `ThreadFilter` (interface, public) `layers/core-api/conversation/src/conversation-store.ts:49` — members: `id`, `directKey`, `host`, `hostKind`, `pinned`, `participantProbe`, `ids`, `order`, `limit`, `offset`
- `MessageFilter` (interface, public) `layers/core-api/conversation/src/conversation-store.ts:75` — members: `id`, `clientKey`, `senderId`, `threadId`, `threadIds`, `types`, `blockId`, `unresolved`, `includeDeleted`, `threadInitiatorId`, `legacyItemIds`, `noLegacyItem`, `since`, `order`, `dir`, `tiebreakId`, `limit`
- `InboxFilter` (interface, public) `layers/core-api/conversation/src/conversation-store.ts:112` — members: `excludeSenderId`, `participantProbe`, `limit`, `offset`
- `InboxRow` (interface, public) `layers/core-api/conversation/src/conversation-store.ts:375` — members: `message`, `participants`
- `ThreadSearchRow` (interface, public) `layers/core-api/conversation/src/conversation-store.ts:421` — members: `id`, `hostKind`, `lastActiveAt`, `participants`
- `ArtifactThreadSummaryRow` (interface, public) `layers/core-api/conversation/src/conversation-store.ts:461` — members: `artifactId`, `threadId`, `messageCount`, `lastMessageAt`, `lastMessagePayload`, `hasUnresolvedReview`

## D. Const / enum exports

- `SESSION_NOT_RETURNED_NOTICE_TEXT` (const, public) `layers/core-api/conversation/src/session-not-returned-notice.ts:37`
