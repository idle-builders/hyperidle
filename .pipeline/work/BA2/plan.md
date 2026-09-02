# BA2 — An agent asks, a human clears

## What we need

An agent working on a task tries to do something consequential. A rule says that needs a person
first. The agent is not stopped dead — it is pushed back: *that is not something you do, you need an
approval for this, and you can get it via a review.* It makes its case as a review, using the review
product we already have. A human decides. The agent comes back and carries on.

**Why it matters.** This is how a human stays in control of an agent doing consequential work without
gating everything an agent does. The point is not to police agents — it is to **learn what agents
themselves flag as worth asking about**. On a fresh system the list is empty and the agent always
self-elects; as the system gets better, a list of what to actually interrupt accumulates.

**Who it is for.** The human who owns the work, in the thread they were already in.

### What success looks like

Done is what the task says done is — the agent decides it is done according to the task and marks it
done. There is no CI gate here and there does not need to be one; plenty of work has no CI as a
concept at all.

Proven by inventing a task locally, letting the agent hit the rule, watching it raise a review, then
approving it and declining it and seeing what happens each way. On all four harnesses.

### The shape

- **The list is per team, and empty on a fresh install.** Nothing is interrupted until someone adds a
  rule. It lives in settings.
- **The push-back is two pieces.** The interception states the fact. The instruction for what to do
  about it does not ride in the deny message.
- **The agent asks with a review** — the existing product: `submit_review`, review messages,
  artifacts, the nine canvases. Reviews are a formalised way of communicating that includes artifacts
  and examples. A stop on its own does not create a review; producing one is work the agent does.
- **A review needs a task.** Realistically anything is a task — anywhere you ask an agent to do
  something, it is a task of some sort.
- **It lands in the thread the human is already in.** If the task came from a thread, the review goes
  back there. If the task has no thread, one is attached to the task. Never the bet's.
- **What is approved is the agent's account** of what it wants to do — not a machine-captured record
  of what it tried. Nothing captures the attempted call verbatim.
- **The clearance is same kind, not the same command.** Approve the action, not the exact string.
- **It burns once, and only if the action was blocked in the first place.** An agent may raise a
  review proposing something it was never blocked from doing, and that must not start blocking it
  afterwards.
- **A decline is not final, and it does not decline the task.** A review declines *the solution*, not
  the target of the task. The rule stays in force, the reasoning goes back, and the agent keeps
  working toward the same goal another way.
- **The session ends and is resumed.** The verdict reaches the agent by resuming its own session, not
  by holding one open — a human may take days, and a held process does not survive that. Resume and
  hooks both work on all four harnesses.
- **All four harnesses, on their own terms.** Harness-specific solutions are expected. The target is
  what the agent does inside its session; our own MCP tool actions do not matter.

### Not in this

- Any general approval gate over ordinary agent actions.
- Reworking the review screen's layout.
- A classifier. Maintained lists are dated and a classifier is the modern answer, but that is a later
  point — for now it is a list.
- Anything that is not BA2 core.

## How it works

Someone adds a rule in settings. Until then nothing is interrupted.

When a session is provisioned for an agent on a task, we resolve the rules that apply to it and write
the gate into the sandbox — in each harness's own shape, because harness features are files and
writing one harness's shape into another fails silently. We own that whole filesystem, so the gate is
ours to place, and the session's prompt tells the agent once that some actions need a person and how
to ask.

The agent works. Every tool call it makes goes past the gate, which asks us whether this one is
allowed. Almost always it is, and nothing happens. When a rule matches, the call is refused and the
agent is told, as a plain statement of fact, which rule stopped it — nothing more. The instruction
for what to do about it is already in its prompt, because an imperative arriving in a refusal is a
message a model can reasonably distrust.

The agent then makes its case as a review — what it has done, what it wants to do next, why, with
real artifacts — and its session ends. The review lands in the thread the task already has, or in one
attached to the task. Then it sits. Nothing chases it and nothing expires; an unanswered review is
human working hygiene, like any other.

When a human approves, that kind of action is cleared and the agent's own session is resumed carrying
the verdict. It retries, the gate lets it through, and it carries on until it decides it is done. A
decline resumes it too, with the reasoning — the rule stays in force, because what was declined is
the solution, not the task, and the agent keeps working toward the same goal another way.

**Why this way.** A held session would be simpler, and every harness can in fact hold a tool call for
minutes — but a human may take days and a held process does not survive a restart. Resuming the
agent's own session also means the verdict arrives as a real turn from the human rather than a claim
about one, which an earlier attempt tried and a real agent refused as suspected injection.

**What it leans on.** The rules table and its settings surface, the review product and its canvases,
the session handles each harness already reports, and the provisioning step that writes the sandbox.

**Deliberately simple.** The list is a list a human maintains. Rules name tools, so an agent that
reaches the same outcome through a different tool is behaving normally — this gates a cooperative
agent, not a determined one, and outcome-level enforcement would need the classifier we have already
set aside. We do not monitor whether a gate is alive: a gate that fails is a session that failed, and
session health is a general concern we will want anyway, not something this package invents for
itself. We are not strict about exactly when a granted permission is used up.

**One thing the harnesses force.** The set of currently-cleared actions lives beside the gate as data
it re-reads on every call, never inside the gate's own configuration — changing that configuration
disarms the gate outright on one harness and is ignored until restart on another. And on one harness
a refusal has to name a pattern rather than a whole tool, because refusing the whole tool removes it
from the model's view and the agent never learns there was a rule to ask about.
