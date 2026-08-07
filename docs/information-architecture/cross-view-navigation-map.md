# Cross-View Navigation Map

Every navigation edge in the shipped app, verified against `layers/core-ui/src/router.tsx`. Shell structure (sidebar, routes, shortcuts) is owned by [app-shell-always-present.md](app-shell-always-present.md); per-view layout by the view docs. This map owns only the edges.

## Global edges (available from any view)

| From | To | Trigger |
|---|---|---|
| Any view | Conversations / Work / Knowledge | Sidebar section item; `⌘/Ctrl+1/2/3` (`useNavShortcuts.ts`) |
| Any view | Back / Forward in history | `⌘/Ctrl+[` / `⌘/Ctrl+]` (`useNavShortcuts.ts`); NavHistoryCluster |
| Any view | Thread / Team / Knowledge item | Sidebar fast-nav row → `/conversations/:threadId`, `/work/team/:teamId`, `/knowledge/:knowledgeId` |
| Any view | Settings | Sidebar gear (`Sidebar.tsx:324-361` SettingsFooter) → in-shell settings overlay (`AppShell` `settingsOpen`) — see [app-shell-always-present.md §5](app-shell-always-present.md) |

## Within Conversations

| From | To | Trigger |
|---|---|---|
| Thread list | Thread detail | Click ThreadSections row → `/conversations/:threadId` |

## Conversations ↔ Work (cross-view)

| From | To | Trigger |
|---|---|---|
| Review Part in a thread | ReviewPage | "Open review" (`ReviewRequestPart.tsx:63`) → `/work/bet/:betId/review/:reviewId` (`router.tsx:88`) |
| Bet detail TaskSheet | Conversation thread | Navigate `/conversations/chat?thread=…` (`WorkBet.tsx`); redirects to the canonical thread URL |

## Within Work

| From | To | Trigger |
|---|---|---|
| Work overview | Team view | Click team row → `/work/team/:teamId` (`WorkOverview.tsx:186-196`); the 1-team short-circuit skips the overview entirely (`WorkOverview.tsx:194`) |
| Team view | Bet detail | Click BetRow (`WorkTeam.tsx`) → `/work/bet/:betId` |
| Team view | New bet | "+ bet" → full page `/work/bet/new` (WorkBetCreate, `router.tsx:85`) — not an overlay |
| Bet detail | Task detail | Click task row → `/work/bet/:betId/task/:taskId` (`router.tsx:87`) |
| Bet detail | Team view | Breadcrumb (`WorkBet.tsx`, DS Breadcrumb + NavHistoryCluster) |

## Within Knowledge

| From | To | Trigger |
|---|---|---|
| Knowledge list | Item detail | Click KnowledgeRow → `/knowledge/:knowledgeId` (`router.tsx:92`) |
| Item detail | Knowledge list | Breadcrumb (`KnowledgeDetail.tsx`) |
| Item detail | Related item | Related-items sidebar (`structuredRelatedItems`, `KnowledgeDetail.tsx:109,327-328`) |

## Knowledge ↔ Conversations (cross-view)

Knowledge items host threads: HostThreadSection on the item detail page, plus per-block discussion anchored via `messages.block_id` (`framework/db/src/schema.ts`). Knowledge is not an agent-free view.
