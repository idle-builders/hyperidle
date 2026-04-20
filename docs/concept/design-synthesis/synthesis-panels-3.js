/* synthesis-panels-3.js — Critique + Implementation Delta panels. */

/* ══════════════ PANEL · Critique ══════════════ */
(function panelCrit(){
  const slot = document.getElementById('crit-slot');
  if (!slot) return;

  slot.innerHTML = `
    <div class="eyebrow">Section 08 · Critique</div>
    <h1>Where this synthesis is still wrong.</h1>
    <p class="lede">
      Three things I'm not confident about, and five open questions I need answers to before handoff. Calling them out here because shipping a design with unresolved questions hidden inside is worse than shipping one with them visible.
    </p>

    <h3>What might still be wrong</h3>
    <div class="crit">

      <div class="crit-item">
        <div class="crit-sev red"><span class="dot"></span>High risk</div>
        <div class="crit-body">
          <div class="t"><span class="tag">IA</span> The 5-section grouping will break when it scales.</div>
          <p>
            Pinned / Blocking / Reviews / Chats / Resolved works cleanly at 7 threads (the demo data) but becomes noise at 50. By 200, the Reviews section alone will scroll past three viewports.
          </p>
          <p>
            <strong>What I should have done:</strong> keep the sections as the default sort key, but expose filter + search as a persistent control, not a dropdown. <em>&ldquo;Show only Orbit&rdquo;</em> and <em>&ldquo;unread only&rdquo;</em> are going to be the common case within a month.
          </p>
          <p class="q">
            Open question: at what thread-count threshold do we collapse older sections to a count-only summary? 30? 50?
          </p>
        </div>
      </div>

      <div class="crit-item">
        <div class="crit-sev red"><span class="dot"></span>High risk</div>
        <div class="crit-body">
          <div class="t"><span class="tag">Reasoning</span> Step-numbered reasoning is a crutch, and a tall one.</div>
          <p>
            The format <em>5 numbered steps, 20 seconds to scan</em> works for structured tasks like the rate-limiter PR. It's going to feel stilted and machine-generated for open-ended work like the blog post or the design revision. Prism doesn't think in 4 steps. Lumen doesn't either.
          </p>
          <p>
            <strong>Proposal for v4:</strong> let agents opt between a numbered list and a free-form narrative (still short, still above the fold). The format should follow the shape of the reasoning, not the other way around. Add a <code>Message.reasoning_format: 'steps' | 'prose'</code> hint.
          </p>
        </div>
      </div>

      <div class="crit-item">
        <div class="crit-sev yel"><span class="dot"></span>Medium risk</div>
        <div class="crit-body">
          <div class="t"><span class="tag">Verdicts</span> Four-surface + overflow is the right shape, but <em>which four</em> should depend on kind.</div>
          <p>
            For <code>text_diff</code>, &ldquo;Request changes&rdquo; is the dominant verb. For <code>action_summary</code> mid-deploy, &ldquo;Rollback&rdquo; is critical but currently lives in the overflow. For <code>content_preview</code>, a &ldquo;Suggest edit&rdquo; verdict could be a first-class action instead of a composer affordance.
          </p>
          <p>
            <strong>Tradeoff:</strong> per-kind toolbars break the muscle-memory argument I made earlier. Muscle memory wins for now; revisit once we have real frequency data.
          </p>
        </div>
      </div>

      <div class="crit-item">
        <div class="crit-sev yel"><span class="dot"></span>Medium risk</div>
        <div class="crit-body">
          <div class="t"><span class="tag">Chat</span> The Chief-of-Staff &ldquo;embedded artifact&rdquo; card duplicates the submenu.</div>
          <p>
            The Fleet-status card in the CoS chat shows the same 5 threads the submenu does, with slightly different framing. That's fine when CoS is pinned and the user is actively chatting — it's confusing when a user lands on the CoS thread via a notification and sees two lists of the same items.
          </p>
          <p>
            <strong>Fix:</strong> the embedded card should show <em>only what CoS is recommending you do next</em>, not a full fleet dump. Max 3 items. A &ldquo;view all&rdquo; link goes to the submenu.
          </p>
        </div>
      </div>

      <div class="crit-item">
        <div class="crit-sev grn"><span class="dot"></span>Low risk · for later</div>
        <div class="crit-body">
          <div class="t"><span class="tag">Accessibility</span> Keyboard shortcuts need a discovery surface.</div>
          <p>
            A, R, X, J, K, ⌘K, L — they're all on the screen as affordance chips, but there's no <code>?</code> help overlay. First-time users will miss most of them. Not blocking; add in the next pass.
          </p>
        </div>
      </div>

      <div class="crit-item">
        <div class="crit-sev grn"><span class="dot"></span>Low risk · for later</div>
        <div class="crit-body">
          <div class="t"><span class="tag">Type</span> Two heading fonts is one too many.</div>
          <p>
            This doc uses Space Grotesk for both headings and mono. In the real app, Space Grotesk for mono / metadata and Inter for everything else is enough — drop the heading weight of Space Grotesk and use Inter 600. Reduces font payload and sharpens the visual hierarchy.
          </p>
        </div>
      </div>

    </div>

    <h3>Open questions for you</h3>
    <div class="oq">
      <div class="oq-item">
        <div class="num">Q1</div>
        <div class="t">Is <code>Message.reasoning</code> always trustworthy enough to surface above the fold?</div>
        <div class="body">If an agent hallucinates its reasoning, reviewers will develop bad intuitions fast. Do we gate the Reasoning block behind a confidence signal?</div>
      </div>
      <div class="oq-item">
        <div class="num">Q2</div>
        <div class="t">Where does &ldquo;Escalate&rdquo; go in the verdict toolbar?</div>
        <div class="body">It's one of the ten defined actions. Is it a real verdict (primary button) or a routing concept (under a separate &ldquo;Reassign&rdquo; menu)?</div>
      </div>
      <div class="oq-item">
        <div class="num">Q3</div>
        <div class="t">Should the submenu show agents or threads as the primary row?</div>
        <div class="body">Today: one thread per row. Alternative: one agent per row, with threads nested. Matters at 20+ concurrent agents.</div>
      </div>
      <div class="oq-item">
        <div class="num">Q4</div>
        <div class="t">How do we handle an artifact with <em>no</em> reasoning?</div>
        <div class="body">Legacy threads from before the Reasoning API existed, or trivial artifacts (e.g. a one-line chat). Does the block collapse, stub, or disappear?</div>
      </div>
      <div class="oq-item">
        <div class="num">Q5</div>
        <div class="t">Can we ship the action_summary Rollback as a verdict?</div>
        <div class="body">&ldquo;Rollback&rdquo; is not in B's 10 verdicts today. It's a deploy-specific idea but critical enough to be a first-class primary button when an action is in-flight. Do we add it?</div>
      </div>
    </div>
  `;
})();

/* ══════════════ PANEL · Implementation Delta ══════════════ */
(function panelDelta(){
  const slot = document.getElementById('delta-slot');
  if (!slot) return;

  // A row in the delta table: { tag, title, what, where, verb }
  // tag: visual / structural / new / nochange
  // verb: edit / add / no-op
  const row = (tag, title, what, where, verb) => `
    <div class="delta-row">
      <span class="tag-d ${tag}">${tag}</span>
      <div class="what">
        <div class="t">${title}</div>
        <div class="w">${what}</div>
      </div>
      <div class="where">${where}</div>
      <div class="verb">${verb}</div>
    </div>
  `;

  const groups = [
    {
      title: 'Shell & navigation',
      rows: [
        row('nochange', 'Four-zone layout', 'IconRail · Submenu · Main · Rail. Keep as-is.',
          '<span class="path">packages/web/src/App.tsx</span>', 'no-op'),
        row('visual', 'Submenu section ordering', 'Re-group threads by <strong>attention priority</strong>: Pinned → Blocking (mixed kinds) → Reviews → Chats → Resolved. Currently grouped by status only.',
          '<span class="path">ConversationsSubmenu.tsx</span><br><span class="sel">→ buildSections()</span>', 'edit'),
        row('visual', 'Kind badge on every row', 'Render a <code>BLOCKING</code> / <code>REVIEW</code> / <code>CHAT</code> chip on every thread row regardless of section. Already exists as <code>Tag</code> — just promote it.',
          '<span class="path">ThreadRow.tsx</span><br><span class="sel">→ .tr-meta</span>', 'edit'),
        row('new', 'Rail collapsed-mode summary pills', 'When Rail is collapsed, show 3 count pills: BLK · REV · PSD with color coding. Currently the collapsed rail is just an icon column.',
          '<span class="path">Rail.tsx</span><br><span class="sel">→ CollapsedRail()</span>', 'add'),
      ],
    },
    {
      title: 'Review header',
      rows: [
        row('structural', 'Proposer-led identity row', 'Swap title-led header for proposer-led. Left: agent avatar + name + role. Right: verdict toolbar. Artifact title moves into the body.',
          '<span class="path">ReviewHeader.tsx</span>', 'edit'),
        row('visual', 'Meta strip below identity', 'Second row: KIND · PRODUCT · STATUS · THREAD · (AGENT PAUSED if blocking). Mono type, low contrast.',
          '<span class="path">ReviewHeader.tsx</span><br><span class="sel">→ MetaStrip()</span>', 'add'),
        row('structural', 'Verdict toolbar: 4 surfaced + overflow', 'Show Reject / Request changes / Pause (when blocking) / Approve + <code>…</code> More. Keybind chips inline. Other 6 actions go in overflow menu.',
          '<span class="path">VerdictToolbar.tsx</span>', 'edit'),
        row('visual', 'Keybind chips on buttons', 'Render <code>&lt;kbd&gt;</code> chips inside each verdict button (A · R · X · P). Already exists on Request / Approve — extend to all.',
          '<span class="path">VerdictToolbar.tsx</span>', 'edit'),
      ],
    },
    {
      title: 'Status & chip semantics',
      rows: [
        row('nochange', 'StatusChip color map', '<strong>blocked = warning (amber)</strong>, <strong>error = error (red)</strong>. Do NOT override these in the thread-row renderer.',
          '<span class="path">StatusChip.tsx</span>', 'no-op'),
        row('visual', 'Thread-row "blocking you" styling', 'When <code>thread.blocking = true</code>, paint the <em>row</em> red-tinted with a 2px error-color accent on the left edge. This is the human-attention signal, distinct from the artifact <code>status</code>.',
          '<span class="path">ThreadRow.tsx</span><br><span class="sel">→ .tr.blocking</span>', 'edit'),
      ],
    },
    {
      title: 'Reasoning block · NEW',
      rows: [
        row('new', 'Render <code>Message.reasoning[]</code> as a collapsible block', 'Above every artifact, before the ArtifactView. Header: "Reasoning · N steps · X min of thinking" + collapse toggle. Numbered steps, mono-serif list.',
          '<span class="path">ConversationsReview.tsx</span><br><span class="sel">→ &lt;ReasoningBlock /&gt;</span>', 'add'),
        row('new', 'New component: <code>ReasoningBlock</code>', 'Props: <code>{ steps: string[], thinkingMs: number, defaultOpen: boolean }</code>. Renders steps with numbered dots, allows HTML in step strings (for inline <code>&lt;code&gt;</code>, <code>&lt;strong&gt;</code>). Persists open/closed in localStorage per thread.',
          '<span class="path">components/ReasoningBlock.tsx</span><br><span class="sel">(new file)</span>', 'add'),
        row('new', 'Data contract: <code>reasoning_format</code> hint', 'Add optional <code>Message.reasoning_format: "steps" | "prose"</code>. If prose, render as a single paragraph instead of a numbered list. Default: steps.',
          '<span class="path">types/messages.ts</span>', 'add'),
      ],
    },
    {
      title: 'ArtifactView · text_diff',
      rows: [
        row('structural', 'GitHub-style diff lines', 'Replace the plain-text diff output with line-numbered addition/deletion rows. Hover reveals an inline comment button (<code>+</code>) at line-number position.',
          '<span class="path">ArtifactView.tsx</span><br><span class="sel">→ case "text_diff"</span>', 'edit'),
        row('new', 'Inline comment threads anchored to lines', 'Comments render between diff lines, indented under the line they anchor to. Support a "resolve" state with a visual affordance.',
          '<span class="path">components/InlineComment.tsx</span><br><span class="sel">(new file)</span>', 'add'),
        row('new', 'File stats strip above diff', '<code>path · +N / −M · K files changed</code>. Monospace. Above the first hunk.',
          '<span class="path">ArtifactView.tsx</span>', 'add'),
      ],
    },
    {
      title: 'ArtifactView · content_preview',
      rows: [
        row('structural', '8-cell metadata strip', 'Render 4-column grid above content: title, target, word count, flagged facts, channel, embargo, reading level, tone score. All values from <code>artifact.metadata</code>.',
          '<span class="path">ArtifactView.tsx</span><br><span class="sel">→ case "content_preview"</span>', 'edit'),
        row('visual', 'Typography-first body rendering', 'Render content at production fidelity: Space Grotesk headings, Inter body, blockquote with accent border, inline code styling. 760px max width centered.',
          '<span class="path">components/ContentBody.tsx</span>', 'edit'),
        row('new', 'Flagged-fact inline markers', 'Agent can flag specific spans as <code>unverified</code>. Render with an amber underline + small badge; click scrolls to the flag list.',
          '<span class="path">components/ContentBody.tsx</span><br><span class="sel">→ &lt;FlaggedFact /&gt;</span>', 'add'),
      ],
    },
    {
      title: 'ArtifactView · data_metrics',
      rows: [
        row('structural', '3-up headline strip + detailed rows', 'Top: 3 headline metrics, each with value + QoQ delta. Below: N detailed rows, each with name + sparkline + current + delta.',
          '<span class="path">ArtifactView.tsx</span><br><span class="sel">→ case "data_metrics"</span>', 'edit'),
        row('new', 'Inline SVG sparklines', 'Render each metric\'s time-series as a filled-gradient sparkline. Color by trend direction (success/error/mid). No charting library — ~40 lines of SVG.',
          '<span class="path">components/Sparkline.tsx</span><br><span class="sel">(new file)</span>', 'add'),
        row('visual', 'Flagged metric styling', 'When <code>metric.flagged = true</code>, render value in error color (headline) and row background in subtle error tint.',
          '<span class="path">components/MetricRow.tsx</span>', 'edit'),
      ],
    },
    {
      title: 'ArtifactView · action_summary',
      rows: [
        row('structural', 'Meta strip · 4 cells', 'Top row: command, dry-run result, estimated duration, blast radius. Read directly from <code>artifact.meta</code>.',
          '<span class="path">ArtifactView.tsx</span><br><span class="sel">→ case "action_summary"</span>', 'edit'),
        row('structural', 'Step list with status chip + duration', 'Each step: circle-number (status-colored), title + description, right-side duration + chip. Separator lines between steps.',
          '<span class="path">components/ActionSteps.tsx</span>', 'edit'),
        row('visual', 'Current-step affordance', 'When a step is <code>blocked</code> mid-flow, emphasize it: primary-color number, "AWAITING APPROVAL" chip inline in the title, tinted background.',
          '<span class="path">components/ActionSteps.tsx</span><br><span class="sel">→ .action-step.current</span>', 'edit'),
        row('new', '<code>Rollback</code> verdict (conditional)', 'When any step is blocked or failed, surface a <code>Rollback</code> button next to Approve in the verdict toolbar. Open question — see Critique Q5.',
          '<span class="path">VerdictToolbar.tsx</span>', 'add'),
      ],
    },
    {
      title: 'ArtifactView · visual_comparison',
      rows: [
        row('structural', 'Before/After panels with metadata', 'Two 4:3 frames side-by-side. Each frame has a label, a content area, and a metadata row (CTR / copy / weight / CTAs).',
          '<span class="path">ArtifactView.tsx</span><br><span class="sel">→ case "visual_comparison"</span>', 'edit'),
        row('new', 'View-mode toggle', '4 modes: side-by-side (default), overlay with opacity slider, before-only, after-only. Segmented control in header row of the comparison block.',
          '<span class="path">components/VisualCompare.tsx</span><br><span class="sel">→ useCompareMode()</span>', 'add'),
      ],
    },
    {
      title: 'Chat (Chief of Staff) variant',
      rows: [
        row('structural', 'Chat header instead of ReviewHeader', 'Different component entirely: agent avatar (larger), name + pin/mute status, no verdict toolbar. Actions are <code>Mute</code> + <code>⋯</code>.',
          '<span class="path">components/ChatHeader.tsx</span><br><span class="sel">(new file)</span>', 'add'),
        row('visual', 'Grouped message threading', 'Consecutive messages from same author within 2min collapse: avatar + header only on the first, subsequent messages indent under it with hidden chrome.',
          '<span class="path">components/MessageBubble.tsx</span><br><span class="sel">→ isGroupedWithPrevious()</span>', 'edit'),
        row('new', 'Inline artifact cards in chat', 'Messages can embed structured previews (fleet status, plan, metric snapshot). Card shows 3 items max + "view all" link — not a full dump.',
          '<span class="path">components/InlineArtifactCard.tsx</span><br><span class="sel">(new file)</span>', 'add'),
        row('new', 'Section-break timeline', 'Render day/time-section headers ("Today · Oct 24") as centered labels with hairlines on either side. Replaces implicit grouping.',
          '<span class="path">components/MessageBubble.tsx</span><br><span class="sel">→ &lt;SectionBreak /&gt;</span>', 'add'),
      ],
    },
    {
      title: 'Composer',
      rows: [
        row('visual', 'Two-row composer with tools', 'Top row: placeholder/text. Bottom row: attach / mention (left) + send hint + Send button (right). Focus state: surface-3 bg, primary-hover outline.',
          '<span class="path">components/Composer.tsx</span>', 'edit'),
        row('nochange', 'Keyboard shortcut: ⌘↵ to send', 'Already implemented. Surface the hint next to the Send button.',
          '<span class="path">components/Composer.tsx</span>', 'no-op'),
      ],
    },
    {
      title: 'Tokens & theme',
      rows: [
        row('nochange', 'Color palette (factory-dark)', 'All colors come from <code>tailwind.config.ts</code> + <code>index.css</code>. No new colors introduced in this synthesis.',
          '<span class="path">tailwind.config.ts</span><br><span class="path">src/index.css</span>', 'no-op'),
        row('visual', 'Radii (rounded-btn 2 / rounded-box 4)', 'Keep as-is. The synthesis respects these values throughout.',
          '<span class="path">tailwind.config.ts</span>', 'no-op'),
        row('visual', 'Font payload', 'Drop Space Grotesk 500/600 — use it only for mono contexts. Use Inter 600 for headings. Reduces load and sharpens hierarchy.',
          '<span class="path">index.html</span><br><span class="sel">&lt;link rel="stylesheet"&gt;</span>', 'edit'),
      ],
    },
  ];

  const totals = groups.reduce((acc, g) => {
    g.rows.forEach(r => {
      if (/tag-d new/.test(r)) acc.add++;
      else if (/tag-d (visual|structural)/.test(r)) acc.edit++;
      else acc.nop++;
    });
    return acc;
  }, { add: 0, edit: 0, nop: 0 });

  slot.innerHTML = `
    <div class="eyebrow">Section 09 · Implementation Delta</div>
    <h1>Every change, mapped to a file.</h1>
    <p class="lede">
      <strong>${totals.add} new</strong> components or fields, <strong>${totals.edit} edits</strong> to existing files, <strong>${totals.nop} no-ops</strong>. Grouped by surface. Each row names the file in Version B that would change and (where useful) the selector / function inside it.
    </p>

    <h3>Summary</h3>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:18px;">
      <div style="background:var(--surface-1);padding:18px 20px;border-radius:var(--r-box);">
        <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-lo);margin-bottom:6px;">ADD</div>
        <div style="font-family:var(--font-heading);font-size:28px;color:var(--success);font-weight:600;">${totals.add}</div>
        <div style="font-size:12px;color:var(--text-mid);margin-top:4px;">new components, new files, new fields</div>
      </div>
      <div style="background:var(--surface-1);padding:18px 20px;border-radius:var(--r-box);">
        <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-lo);margin-bottom:6px;">EDIT</div>
        <div style="font-family:var(--font-heading);font-size:28px;color:var(--primary);font-weight:600;">${totals.edit}</div>
        <div style="font-size:12px;color:var(--text-mid);margin-top:4px;">changes to existing components</div>
      </div>
      <div style="background:var(--surface-1);padding:18px 20px;border-radius:var(--r-box);">
        <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-lo);margin-bottom:6px;">NO-OP</div>
        <div style="font-family:var(--font-heading);font-size:28px;color:var(--text-hi);font-weight:600;">${totals.nop}</div>
        <div style="font-size:12px;color:var(--text-mid);margin-top:4px;">keep Version B as-is</div>
      </div>
    </div>

    <h3>Delta by surface</h3>
    <div class="delta">
      ${groups.map(g => `
        <div class="delta-group">
          <div class="delta-group-head">
            <h3>${g.title}</h3>
            <span class="c">${g.rows.length} rows</span>
          </div>
          ${g.rows.join('')}
        </div>
      `).join('')}
    </div>

    <h3>Handoff notes</h3>
    <ul>
      <li><strong>Start with ReasoningBlock.</strong> It's the single largest leverage point and the lowest-risk addition — new component, no existing behavior to preserve, visible on every review.</li>
      <li><strong>Then ship the 5 ArtifactView refactors in parallel.</strong> Each is scoped to one <code>case</code> in the switch and doesn't touch the shell or the header.</li>
      <li><strong>Ship the header + submenu changes last.</strong> They're the most visible and most muscle-memory-breaking. Do them behind a feature flag and A/B for a week.</li>
      <li><strong>Resolve the 5 open questions in the Critique before any of this lands.</strong> Especially Q2 (Escalate) and Q5 (Rollback) — they affect the verdict toolbar spec.</li>
    </ul>
  `;
})();
