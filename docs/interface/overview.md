# Interface overview

HyperIdle is a single web app. One shell, one grammar: the same actions (send, review, edit, open) work everywhere. There is no separate mode for "work" and "conversation" — they share the same components and the same event loop.

## Shell

The shell is always present: a 276 px sidebar on the left, the main area on the right. The sidebar has four destinations:

- **Notifications** — the inbox popover (unread rows from subscriptions)
- **Conversations** — the thread list
- **Work** — tasks and teams
- **Knowledge** — the document tree

Settings is a fifth destination at `/settings`, reachable from the sidebar button. It is a real page, not an overlay.

The shell also carries the AssistantOverlay (command-K) and a ToastRegion for transient feedback.

## What the human does

The human answers every review. An agent sends a review message when it needs a decision; the session ends; the human checks its parts and the agent's flags on the review page and approves or rejects it; the agent's session resumes. No review is auto-approved.

## Approval rate

The approval rate on an agent's profile page is a track record — the fraction of reviews that were approved over the past 30 days. It is not a gate and it does not block any action.

## What the interface layer is not

- There is no task-hosted thread; tasks point to a team-hosted thread.
- There is no `/artifacts` route and no artifact permalink. Produced content is a document.
- There is no session dial-in from the conversation page; sessions open from the task page.
- The Knowledge sidebar entry shows no triage badge.
