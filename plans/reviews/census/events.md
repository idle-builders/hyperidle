# Census — events

34 declared. Culled below against the rule: *is this something a user would want to be
told about, or is it something the layer underneath happens to emit?*

## Headline

**Agents can subscribe to all 34. People can receive 2.**
`GET /routines/event-types` returns `EVENT_TYPES` wholesale, and the routine matcher
subscribes to every member — including 5 that can never fire. The human side has its own
2-key vocabulary with no relationship to events at all.

## Verdicts

**DELETE — never emitted, never consumed (5).** Still selectable as routine triggers, so
an agent can wire up a subscription that will never fire.
`bet_revised` · `dependency_met` · `thread_archived` · `work_selection_requested` ·
`proposed_call_executed`

**NOT AN OFFERING — internal plumbing (8).** Real mechanics, but no person would want a
notification and no agent should be triggered by them. Keep as bus traffic, remove from the
subscribable surface.
`agent_work_intent_recorded` · `agent_run_admission_failed` · `agent_run_lifecycle_changed` ·
`session_handoff_completed` · `sandbox_writeback_changes_detected` · `tool_call_recorded` ·
`propagation_applied` · `propagation_failed`

**KEEP — 21 real offerings**, with the scope each sits at:

| Event | Plain words | Scope | Notifies today |
|---|---|---|---|
| `task_state_changed` | a task moved | team | no |
| `bet_state_changed` | a bet changed state | team | no |
| `session_started` | an agent started working | team | no |
| `session_ended` | an agent finished working | team | **yes** |
| `session_not_returned` | an agent's turn ended without answering | user | thread notice |
| `thread_created` | a new conversation started | user | no |
| `thread_message_appended` | someone posted a message | user | no |
| `thread_resolved` | a conversation was resolved | user | no |
| `thread_reopened` | a conversation was reopened | user | no |
| `item_created` | a review item appeared | team | **yes** (via policy) |
| `knowledge_created` | a knowledge item was created | global | no |
| `knowledge_updated` | a knowledge item changed | global | no |
| `knowledge_archived` | a knowledge item was archived | global | no |
| `knowledge_accessed` | someone read a knowledge item | user | no |
| `artifact_created` | an agent produced an artifact | team | no |
| `team_created` | a new team was set up | global | no |
| `agent_added` | an agent joined a team | team | no |
| `user_created` | a person joined | global | no |
| `proposed_call_granted` | a person approved an agent's action | user | no |
| `routine_fired` | a routine ran | user | no |
| `notification` | something needs your attention | user | **yes** |

`notification` is itself an event type — a wrapper that exists only because the human side
has no vocabulary of its own. Under the target model it disappears: a person subscribes to
the real events directly.

## Other findings

- **15 events are emitted with no dedicated subscriber.** Only the blanket routine matcher
  can see them. Emitting into nothing is the norm, not the exception.
- **`proposed_call_granted` goes nowhere.** Its own doc comment claims a
  `task-dispatcher.handleProposedCallGranted` subscription re-engages session 2. No such
  subscriber exists — the only listener is a test. This is the second half of the broken
  approval path the parity audit found.
- **`framework/domain-model/src/events.ts` is a stale fork** of the event-bus file and is
  already behind it (`AgentRunLifecycleChangedEvent` is missing `failureCode`/`errorMessage`).
  Nothing imports its event types. Delete down to `SessionOutcome`.
