## 13. Decisions

- **Desktop shell:** Electron. Server embedded in main process. Desktop is the primary form factor. The same web app is accessible from mobile browsers for review triage and agent unblocking. No native mobile app. No offline support.
- **Tech stack:** Tailwind CSS + DaisyUI + Hearth theme (dark/light/system). Behavior gaps filled by `focus-trap-react` and `@floating-ui/react`. Data utilities from `@tanstack/react-*` when needed.
- **Canvas tech:** symbolic UI — standard React components with a hard capacity cap. Humans create bets via BetCreateDialog, not drag-and-drop.
- **Navigation model:** view switching + per-view sub-navigation + main content pane. Breadcrumbs within views, not across. Specific layout structure is a design-time decision.
- **Thread primitive:** one Thread model with typed messages (plain, review, questionnaire, verdict). No "review threads" vs "chat threads" as separate types — the distinction is derived from message content. See §4.5.
- **Chief of Staff:** just another agent. Communicates through normal threads like any other teammate. No special UI surface.
- **Human-initiated conversations:** humans can create threads with agents and dial into live sessions.
- **Notification adapter:** TBD during development. Will need some notification mechanism; specific technology decided at implementation time.
- **Knowledge view model:** catalogue with topic/node structure, not page tree. Seven scopes (factory, product, practice, team, bet, task, user). Humans author knowledge at any scope. Threads attach to knowledge items for discussion.
- **Knowledge view:** three relevance signals on every item (recency, frequency, citation). Two tabs: Triage (draft) and Curated (active).
- **ArtifactView shapes:** five typed renderers for review artifacts — text_diff, content_preview, visual_comparison, action_summary, data_metrics. Each external tool integration can ship a skill that extends a base renderer.
- **ArtifactView rendering:** simple artifacts render inline in the thread; complex artifacts promote to a companion pane (conversation left, artifact right).
- **Cost model:** money + tokens, never duration. Structured minor-units currency handling (costCapMinor/costCapCurrency).
- **Task interaction:** tasks are agent-owned. Humans do not drag or move tasks. State changes requested via thread conversations. Bet-level actions show consequence previews.
- **Settings:** overlay pattern. Seven sections: Profile, Org Chart, Credentials, Notifications, Appearance, Products, Backend.
- **Setup:** full-page SetupFlow guides first-run (profile, product, API key). 5 contextual hints for first-time interactions.

---
