## 13. Decisions

- **Desktop shell:** web-first. Plain web app served by the API process. No Tauri wrapper, no PWA. Native shells can be added later if needed.
- **Mobile:** responsive web app, online-first. No dedicated native app in v1.
- **Tech stack:** Tailwind CSS + DaisyUI + custom `factory-dark` theme. Behavior gaps filled by `focus-trap-react` and `@floating-ui/react`. Data utilities from `@tanstack/react-*` when needed.
- **Canvas tech:** symbolic UI — standard React components in a two-column layout (shaped / committed) with a hard capacity cap. Not an actual canvas or drag-and-drop zone.
- **Navigation model:** IconRail (icons only, always visible) → Submenu (per-view, collapsible) → Main pane. Breadcrumbs within views, not across. The Rail is a right sidebar, always visible regardless of the active view — not a menu item, not a floating overlay.
- **Cross-view deep linking:** clicking anything on the Rail links to the corresponding view and item. Trivial with the shared Item model.
- **Thread types:** two kinds — review (has verdict, blocking indicator) and chat. The Chief of Staff's conversation is a pinned chat thread, not a separate type.
- **Notification adapter:** TBD during development. Will need some notification mechanism; specific technology decided at implementation time.
- **Knowledge view model:** catalogue with topic/node structure, not page tree. Three scopes (practice, product, factory). Topics group knowledge items within a practice or product. Views (saved filter perspectives) serve both curation and exploration.
- **Knowledge view is agent-free:** no human-agent interaction. Human and knowledge only. Recommendations go to the Rail, proposals go to Conversations.
- **ArtifactView shapes:** five typed renderers for review artifacts — text_diff, content_preview, visual_comparison, action_summary, data_metrics. Each external tool integration can ship a skill that extends a base renderer. `proposed_action` in the Item model carries the type and payload.
- **ArtifactView rendering:** simple artifacts render inline in the thread; complex artifacts promote to a companion pane (conversation left, artifact right). Implementation order: text_diff → content_preview → action_summary → data_metrics → visual_comparison.

---
