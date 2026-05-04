## 11. What the Meta Layer Actually Ships at This Layer

To be deployable for anyone (per the constraint from RESEARCH_EXECUTION_LAYER.md), the meta layer ships:

1. **The normalized Item / Response data model.** SQLite-backed by default, swappable. The schema in §6 is the contract.
2. **A small router** that takes any Item from any facilitator and sends it to the right view (Conversations / Rail / Work / Knowledge). The "facilitator → view" mapping in §7, made executable.
3. **One reference application — the Factory — with two form factors:**
   - **Desktop.** A web app (PWA) with four zones: IconRail + Submenu + Main pane (Conversations / Work / Knowledge) + Rail sidebar on the right. Single codebase. Tauri wrapper optional for deployers who want a real desktop binary.
   - **Mobile.** The same PWA responsive-layout-shifted into Home / Conversations / Work tabs. Native wrapper only if push integrations demand it.
4. **A notification adapter** that hooks the review-thread stream into push services (APNs, Firebase, ntfy, plain email — deployer chooses). Notifications only fire for blocking reviews and agent-flagged urgent chats.
5. **A silence-mode + autonomy-level engine** that gates which items push, which queue, and which auto-resolve based on policy.
6. **Per-deployer profile defaults.** A laptop install can strip the app down to a CLI conversation client + a tmux Rail + a markdown-file Knowledge view, all reading the same SQLite store. A team install gets the full PWA. Same data model, different rendering.

Everything else — beautification, themes, Slack/Discord integrations — is downstream of this. The meta layer's job is the data model, the router, one reference app, and the notification/autonomy engine.

---
