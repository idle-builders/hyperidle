# Getting Started

From zero to HyperIdle running locally, with a task and an agent responding.

---

## Prerequisites

- **Node.js 24 or later** — check with `node --version`. Install from [nodejs.org](https://nodejs.org).
- **Git** — check with `git --version`.
- **An agent harness, logged in.** HyperIdle uses your existing CLI logins — it does not store API keys. Install and sign in to at least one: `claude` (Claude Code), `codex`, `opencode`, or `cursor-agent`. You do this in your terminal before running HyperIdle.

---

## Install

**Option A — macOS desktop app (recommended)**

Download the signed DMG from the [releases page](https://github.com/ambrovia/hyperidle/releases) or install via Homebrew:

```bash
brew tap ambrovia/homebrew-tap
brew install --cask hyperidle
```

Open the app. It uses an embedded PGlite database — no external database required.

**Option B — from source**

```bash
git clone https://github.com/ambrovia/hyperidle.git
cd hyperidle
npm install
npm run setup -- --profile laptop
npm run dev
```

The server starts on port 3001 and the web UI on port 5173. Open [http://localhost:5173](http://localhost:5173).

---

## Setup

The first time you open HyperIdle, setup asks three things:

1. **Your name** — what to call you.
2. **Harness** — which CLI to use for your personal assistant (the harnesses you have installed appear here).
3. **Folder (optional)** — a code repository or folder to attach to your team.

No API key. No team type. No preset selection. After you click **Finish**, HyperIdle creates your user account, a team, and your personal assistant — subscribed to all nine object events.

---

## What you get after setup

- **You** — your user account.
- **Your assistant** — an individual agent, subscribed to every object event, ready to help from the sidebar overlay.
- **A team** — named after your folder if you provided one, otherwise "My Team".
- **No team agents.** The assistant is yours, not a team member. To get team agents — Builder, Designer, Product Manager, and others — install the **role-personas** plugin.

---

## Install a plugin (optional)

Go to **Settings → Plugins**. The plugins that ship with the app are listed:

- **role-personas** — seven shaped team agents. Install it for your team to get a Builder, Designer, Product Manager, QA Engineer, Growth, Ops, and Facilitator, each pre-configured with a harness and system prompt.
- **document-management** — a Document Librarian agent that triages and curates your knowledge on a schedule.

Click **Install** on any plugin. You can edit the agents it brings, or restore the originals with **Restore**.

---

## Create your first task

1. Go to **Work** in the sidebar.
2. Click **New task**.
3. Fill in a **Title** and **Goal** — what success looks like, what is out of scope. The goal is the contract.
4. Click **Create**.

The task starts in `proposed`. Nothing runs yet.

---

## Set an owner and accept the task

Open the task you just created. In the task header:

1. Set the **Owner** — pick your assistant or one of your team agents.
2. Set **State** to `accepted`.

Both must be set for a session to start. When an accepted task has an owner, the agent begins.

---

## Answer a review

When an agent needs a decision from you, it sends a review message and its session ends. A notification lands in your inbox (the **Notifications** entry in the sidebar).

Open the review: it shows what the agent proposed and a set of verdicts. Pick one — **Approve**, **Approve with comments**, **Request changes**, **Edit**, or **Reject**. The agent's session resumes with your verdict.

---

## Where to go next

- [Views](./views.md) — walkthrough of Conversations, Work, and Knowledge
- [Agents](./agents.md) — subscriptions, harness settings, and adding more agents
- [Connecting Services](./connections.md) — GitHub, Stripe, and other tools via tokens or MCP
