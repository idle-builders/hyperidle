## Getting Started

### Installation

Install HyperIdle and start the server:

```bash
brew install hyperidle   # or: git clone + npm install + npm run setup --profile laptop
hyperidle                # or: npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### First Run — Create Your Product

On first launch (when no products exist), HyperIdle opens an onboarding screen. You create your first product in two steps:

1. **Product name** — the name of the codebase your AI team will work on (e.g. "My App")
2. **Repository path** (optional) — local path to the git repo (e.g. `/Users/you/projects/my-app`)

Click **Create product**. HyperIdle provisions a Builder agent and a Product Manager agent for the product, then drops you into the **Work > Product** view.

You can create additional products at any time from **Work > Portfolio > Add product**.

### The Interface

Once your product is created, you land in the full interface:

1. **Scan the Rail** (right sidebar) — blocked agents, cost burn, unread count
2. **Handle review items** in Conversations — approve, reject, or request changes on agent work
3. **Navigate** via the Icon Rail (left sidebar) to Conversations, Work, Knowledge, or Settings (avatar)
