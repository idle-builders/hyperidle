# Getting started

From nothing to your first conversation with an agent.

---

## Before you start

Agents work through an **agent program** on your computer: Claude Code, Codex, OpenCode or Cursor Agent. Install at least one and sign in to it in a terminal. HyperIdle uses that program's own sign-in; it never asks you for an AI key.

## Install

**Desktop app (macOS):**

```bash
brew tap ambrovia/homebrew-tap
brew install --cask hyperidle
```

**From source** (needs Node.js 24 or later and git):

```bash
git clone https://github.com/ambrovia/hyperidle.git
cd hyperidle
npm install
npm run setup -- --profile laptop
npm run dev
```

Then open <http://localhost:5173>. Other ways to run it, such as on a shared server: [Deployment](../../deployment/index.md).

---

## First start

A fresh install opens on the first-start page.

1. **Found on this computer** lists the agent programs HyperIdle found, each marked signed in, installed, or not installed. If none is ready, each row says how to fix it (for example, the sign-in command to run). Fix one, then press **Look again**. One ready program is enough.
2. Type **Your name** and **Name your team** (for example "Product").
3. Press **Start talking**.

This makes you, your team, and your first agent, **Builder**, which works for you. Folders, GitHub and teammates can come later.

**Joining a team on a server instead.** Press **Join a team on a server instead**, then give the server's address and the key whoever runs the server gave you. This works only in the desktop app, because a browser cannot keep the key.

---

## Your first conversation

Start talking opens a conversation called "Getting started". Builder says hello: it tells you which program it runs on and asks what you are working on.

Under the hello you can point Builder at your code:

- **Connect a folder** — opens the folder dialog on [your page](./your-page.md).
- **Connect GitHub** — opens the service dialog on your page.
- **Not now** — hides the offer.

More on both: [Folders and services](./connections.md).

Now just reply. To give Builder a piece of work, mention it with `@` — see [Conversations](./conversations.md).

---

## In the desktop app

The desktop app has no settings menu; [your page](./your-page.md) holds your settings. The **Help** menu has **Open Logs Folder** and **Open Data Folder**.

---

Next: [The interface](./the-interface.md)
