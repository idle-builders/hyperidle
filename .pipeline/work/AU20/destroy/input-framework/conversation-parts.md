# Destroyer input — `conversation-parts` (framework)

Package: `framework/conversation-parts`
Surface: 5 exported functions, 0 classes (0 member methods), 13 interface/type declarations, 3 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `groupParts` | yes | `framework/conversation-parts/src/part.ts:247` |
| 2 | `derivePartsFromMessages` | yes | `framework/conversation-parts/src/part.ts:336` |
| 3 | `derivePartsFromSession` | yes | `framework/conversation-parts/src/part.ts:494` |
| 4 | `aggregateToolRun` | yes | `framework/conversation-parts/src/part.ts:664` |
| 5 | `deriveComposerPills` | yes | `framework/conversation-parts/src/part.ts:721` |

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `PartKind` (type, public) `framework/conversation-parts/src/part.ts:56`
- `ToolKind` (type, public) `framework/conversation-parts/src/part.ts:78`
- `PartId` (type, public) `framework/conversation-parts/src/part.ts:81`
- `PartAuthor` (interface, public) `framework/conversation-parts/src/part.ts:83` — members: `id`, `name`, `isAgent`, `isMe`
- `ReviewTarget` (interface, public) `framework/conversation-parts/src/part.ts:101` — members: `betId`, `reviewId`
- `FoldDescriptor` (interface, public) `framework/conversation-parts/src/part.ts:106` — members: `label`, `cta`, `target`
- `Part` (type, public) `framework/conversation-parts/src/part.ts:112`
- `EmbedKind` (type, public) `framework/conversation-parts/src/part.ts:180`
- `Embed` (type, public) `framework/conversation-parts/src/part.ts:182`
- `OpenTarget` (type, public) `framework/conversation-parts/src/part.ts:209`
- `OpenHandler` (type, public) `framework/conversation-parts/src/part.ts:230`
- `PartGroup` (interface, public) `framework/conversation-parts/src/part.ts:235` — members: `author`, `parts`
- `ToolRunBlock` (type, public) `framework/conversation-parts/src/part.ts:646`

## D. Const / enum exports

- `PART_KINDS` (const, public) `framework/conversation-parts/src/part.ts:47`
- `TOOL_KINDS` (const, public) `framework/conversation-parts/src/part.ts:65`
- `EMBED_KINDS` (const, public) `framework/conversation-parts/src/part.ts:171`
