## 13. Decisions

- **Desktop shell:** Electron. Server embedded in main process. Desktop-only — no mobile form factor.
- **Tech stack:** Tailwind CSS + DaisyUI + custom Lucid theme (dark/light/system). Behavior gaps filled by `focus-trap-react` and `@floating-ui/react`. Data utilities from `@tanstack/react-*` when needed.
- **Canvas tech:** symbolic UI — standard React components in a two-column layout (shaped / committed) with a hard capacity cap. Founders create bets via BetCreateDialog, not drag-and-drop.
- **Navigation model:** IconRail (icons only, always visible) → Submenu (per-view, collapsible) → Main pane. Breadcrumbs within views, not across. The Rail is a right sidebar, always visible regardless of the active view — not a menu item, not a floating overlay.
- **Cross-view deep linking:** clicking anything on the Rail links to the corresponding view and item.
- **Thread primitive:** one Thread model with typed messages (plain, review, questionnaire, verdict). No "review threads" vs "chat threads" as separate types — the distinction is derived from message content. See §4.5.
- **Chief of Staff:** accessible via overlay triggered from bottom-right Rail button, not a pinned thread in the list. Structurally still a Thread attached to the user host.
- **Human-initiated conversations:** humans can create threads with agents (RecipientPicker, N key) and dial into live sessions (D key).
- **Notification adapter:** TBD during development. Will need some notification mechanism; specific technology decided at implementation time.
- **Knowledge view model:** catalogue with topic/node structure, not page tree. Seven scopes (factory, product, practice, team, bet, task, user). Humans author knowledge at any scope. Threads attach to knowledge items for discussion.
- **Knowledge view:** three relevance signals on every item (recency, frequency, citation). Two tabs: Triage (draft) and Curated (active).
- **ArtifactView shapes:** five typed renderers for review artifacts — text_diff, content_preview, visual_comparison, action_summary, data_metrics. Each external tool integration can ship a skill that extends a base renderer.
- **ArtifactView rendering:** simple artifacts render inline in the thread; complex artifacts promote to a companion pane (conversation left, artifact right).
- **Cost model:** money + tokens, never duration. Structured minor-units currency handling (costCapMinor/costCapCurrency).
- **Task interaction:** tasks are agent-owned. Humans do not drag or move tasks. State changes requested via thread conversations. Bet-level actions show consequence previews.
- **Settings:** overlay pattern (Submenu swaps to settings nav, Main shows section, Escape to close). Seven sections: Profile, Org Chart, Credentials, Notifications, Appearance, Products, Backend.
- **Setup:** full-page SetupFlow guides first-run (profile, product, API key). 5 contextual hints for first-time interactions.

---
