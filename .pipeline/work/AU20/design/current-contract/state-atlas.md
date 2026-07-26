# Canonical TSX render atlas

These 26 images are captures from the official pipeline TSX viewer, not handcrafted HTML. `capture-viewer.mjs` selects a real story variant or real application component and fails on viewer story errors. Planning-only stories under `real-stories/` supply Router/fetch context while importing the production component or its existing story; they do not recreate product markup.

## Provenance and inspection

| Renders | Canonical source | Fixture/wrapper | Contract evidence observed |
|---|---|---|---|
| `work-empty`, `work-loading`, `work-error`, `work-populated` | `packages/web/src/pages/work/WorkOverview.stories.tsx` | existing story fixtures | mutually exclusive overview states and canonical Work hierarchy |
| `work-detail` | production `WorkBet` via existing `WithRichDescription` story | Router + Toast only | real bet regions; current backend-dependent errors remain regression evidence |
| `conversations-populated` | existing `Conversation.stories.tsx` populated story | isolated render to avoid global-fetch collision | real review request, Open review action, message composer |
| `knowledge-populated`, `knowledge-loading`, `knowledge-error` | production `KnowledgeList` | Router + response fixtures | mutually exclusive list states, Curated/Triage/scope/sort/signals |
| `settings` | production `SettingsPage` | Router + Toast | current stacked paint; visible Agent Behavior/section omissions are regression evidence, not contract authority |
| `assistant-empty`, `assistant-context` | production `AssistantOverlay` via existing stories | Router + thread response | real overlay empty paint; absent visible context difference is retained as regression evidence |
| `scope-dialog` | existing `ScopeChangeDialog` story | existing fixture | real 375 bottom sheet, reachable footer, no horizontal overflow |
| `agent-profile`, `agent-add` | existing AgentProfile/AgentAddDialog stories | existing fixtures | profile placement and real Add agent dialog |
| `status`, `time` | existing `StatusChip`/`CommentRow` stories | existing fixtures | real status vocabulary and ordinary timestamp paint; invalid-time behavior remains runtime proof |
| `search-results`, `search-empty`, `not-found` | production `GlobalSearchPanel` and production NotFound via its existing story | stable response fixture around the real search component; capture types a real query, then requires the open `dialog` plus mutually exclusive result/“No matches” semantics; Router only for NotFound | actual open result/empty overlays and standalone recovery |
| `review-overview`, `review-examining` | existing Review composition stories | existing fixtures | separate canonical review states and verdict ownership |
| `artifact-no-preview`, `block-actions` | existing ArtifactPreview/BlockActionsPopover stories | capture requires the real open `menu` and its two named `menuitem`s | Artifact currently paints “NO PREVIEW AVAILABLE,” contradicting locked “Preview pending”; this is regression evidence/runtime obligation, not approved fallback. Block actions proves the real open menu grammar. |
| `setup`, `desktop-titlebar` | existing SetupFlow/DesktopTitleBar stories | existing fixtures | setup paint and real Electron-context chrome at 1920 |

Files live in `states-real/` and include viewport/theme in each filename. Inspected viewports are 1920, 1440, 1024, 768, and 375; both Hearth light and dark are represented. Settings, Assistant context, backend-connected Work detail, invalid timestamps, focus restoration, outside-click behavior, axe, target geometry, requests, and desktop connectivity remain behavioral obligations where a static paint cannot prove the contract.

The diagnostic `mockup.html` and `screenshot.png` are navigation/accounting only. They are not product-state evidence.
