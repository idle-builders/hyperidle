# Objects

The six things everything else is built on, plus plugins.

- **[Task](task.md)** — a unit of work. Has a state, an owner, a thread, and optionally subtasks. Killing a task kills its whole subtree.
- **[Thread](thread.md)** — a conversation attached to one host. Holds messages of four types: plain, review, questionnaire, verdict.
- **[Document](document.md)** — a record in the `documents` table. Can be knowledge, a skill, a rule, an agent identity file, or a subscription prompt. Scope is factory, team, or user.
- **[User](user.md)** — a person or an agent. Team is a name attribute. Subscriptions decide what each user watches and whether that fires an inbox row or wakes the agent.
- **[Session](session.md)** — one agent run: active, done, stopped, or crashed. Tied to a work intent. Writes notes back to its own row; does not pass notes to the next session.
- **[Documents in sessions](documents-in-sessions.md)** — how documents reach the agent: selection, scoring, the sandbox `knowledge/` tree, manifest, watcher, writeback.
- **[Folders](folders.md)** — team-registered code repos and doc folders mounted into an agent's sandbox.

Actions: `search_tasks open_task edit_task` | `search_threads open_thread send_message adjust_thread` | `search_documents open_document edit_document` | `search_users open_user edit_user` | `search_sessions watch_session stop_session` | `search_plugins edit_plugin`.
Plus the agent-only `return_status`.

Source: `framework/domain-model/src/actions/`.
