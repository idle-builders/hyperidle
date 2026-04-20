/* synthesis-panels-2.js — Deliverables 02-06: the five ArtifactView kinds. */

/* All helpers (iconRail, submenu, reviewHeader, reasoning, composer, ICON, THREADS, railCollapsed, railExpanded)
   come from synthesis-panels.js — loaded first. */

/* ══════════════ PANEL 2 — text_diff ══════════════ */
(function panel2(){
  const slot = document.getElementById('d2-slot');
  if (!slot) return;

  const header = reviewHeader({
    agent: 'Forge',
    role: 'eng',
    avatarInitials: 'FG',
    routing: 'MA · Growth',
    sla: { text: '5h 42m', warn: false },
    blocking: false,
    status: 'healthy',
    product: 'Forge',
    artifactKind: 'text_diff',
  });

  const reasoningSteps = [
    'Read the <code>RateLimiter</code> class and its 4 call-sites. Current impl holds per-key state in a single <code>Map</code> with no eviction — grows unbounded.',
    'Considered three approaches: (a) LRU cap, (b) time-bucket sweep on write, (c) background reaper. Chose <strong>(b)</strong>: simplest, no new dependencies, O(1) per call when below cap.',
    'Identified a race in the refill logic when two concurrent calls observe the same <code>lastRefill</code>. Fixed with a compare-and-swap pattern using <code>atomic.load</code>.',
    'Added 6 unit tests covering: eviction, concurrent refill, burst allowance, window boundary, cap enforcement, and fallback when clock skews backward.',
    'Benchmarked against prod traffic shape (8k req/s, 1200 unique keys): p99 latency <strong>−38%</strong> (0.42ms → 0.26ms), memory <strong>−71%</strong>.',
  ];

  const diff = `
    <div class="diff">
      <div class="diff-file">
        <span class="path">src/middleware/rate-limiter.ts</span>
        <div class="stats">
          <span class="add">+34</span>
          <span class="del">−22</span>
          <span>· 4 files changed</span>
        </div>
      </div>
      <div class="diff-hunk">@@ -18,28 +18,32 @@ export class RateLimiter {</div>

      <div class="diff-line context"><span class="ln">18</span><span class="code">  private readonly window: number;</span></div>
      <div class="diff-line deletion"><span class="ln">19</span><span class="code">private buckets = new Map&lt;string, Bucket&gt;();</span></div>
      <div class="diff-line addition"><span class="ln">19</span><span class="code">private buckets = new LruMap&lt;string, Bucket&gt;(this.capacity);</span></div>
      <div class="diff-line addition"><span class="ln">20</span><span class="code">private lastSweep = Date.now();</span></div>
      <div class="diff-line context"><span class="ln">21</span><span class="code"></span></div>
      <div class="diff-line context"><span class="ln">22</span><span class="code">  constructor(opts: RateLimiterOpts) {</span></div>
      <div class="diff-line deletion"><span class="ln">23</span><span class="code">    this.window = opts.windowMs;</span></div>
      <div class="diff-line addition"><span class="ln">24</span><span class="code">    this.window = opts.windowMs;</span></div>
      <div class="diff-line addition"><span class="ln">25</span><span class="code">    this.capacity = opts.capacity ?? 10_000;</span></div>
      <div class="diff-line addition has-comment-btn"><span class="ln">26</span><span class="code">    this.sweepInterval = opts.sweepMs ?? this.window * 4;</span><button class="comment-btn" title="Comment on this line">+</button></div>
      <div class="diff-line context"><span class="ln">27</span><span class="code">  }</span></div>

      <div class="inline-comment">
        <div class="ic-head">
          <div class="ic-avatar">MA</div>
          <span class="ic-name">Max Alvarez</span>
          <span class="ic-time">2 min ago</span>
        </div>
        <div class="ic-body">
          Why <strong>4× the window</strong> as the default sweep interval? Seems arbitrary. If the window is 60s this means we can hold stale buckets for 4 min — is that intentional for burst tolerance, or just a guess?
        </div>
        <div class="ic-actions">
          <button>Reply</button>
          <button>Request change</button>
          <span>·</span>
          <span>1 reply</span>
        </div>
      </div>

      <div class="inline-comment" style="background:var(--surface-2); border-left-color: var(--success);">
        <div class="ic-head">
          <div class="ic-avatar" style="background:linear-gradient(135deg,#2e3a4d,#1a2030);color:var(--primary)">FG</div>
          <span class="ic-name">Forge · eng</span>
          <span class="ic-time">1 min ago</span>
        </div>
        <div class="ic-body">
          Intentional — burst tolerance. A client hitting the limit should see its bucket persist for several windows so repeated 429s cost nothing. The cap at 10k keys still bounds memory. Happy to make it a named constant if you prefer.
        </div>
        <div class="ic-actions">
          <span class="resolved">${ICON.check} Resolution proposed</span>
          <span>·</span>
          <button>Accept & resolve</button>
        </div>
      </div>

      <div class="diff-line context"><span class="ln">28</span><span class="code"></span></div>
      <div class="diff-line context"><span class="ln">29</span><span class="code">  check(key: string): boolean {</span></div>
      <div class="diff-line addition"><span class="ln">30</span><span class="code">    this.maybeSweep();</span></div>
      <div class="diff-line context"><span class="ln">31</span><span class="code">    const now = Date.now();</span></div>
      <div class="diff-line deletion"><span class="ln">32</span><span class="code">    const bucket = this.buckets.get(key) ?? this.create(key);</span></div>
      <div class="diff-line addition"><span class="ln">33</span><span class="code">    const bucket = this.buckets.get(key) ?? this.create(key, now);</span></div>
      <div class="diff-line context"><span class="ln">34</span><span class="code">    if (bucket.tokens &gt;= 1) {</span></div>
      <div class="diff-line context"><span class="ln">35</span><span class="code">      bucket.tokens -= 1;</span></div>
    </div>`;

  const history = `
    <section class="history">
      <div class="history-head">
        <span class="lbl">Thread <span class="c">4 messages</span></span>
        <button class="reasoning-toggle">Expand all ${ICON.chevD}</button>
      </div>
      <div class="history-list">
        <div class="history-msg">
          <div class="avatar bot">FG</div>
          <div class="body">
            <div class="head"><span class="n">Forge</span><span class="role">proposes PR</span><span class="t">1h ago</span></div>
            <div class="text">Replacing the unbounded Map with an LRU + lazy sweep. Benchmarks show <strong>−38% p99 latency</strong>, <strong>−71% memory</strong> at prod traffic shape. All 47 tests pass; 6 added.</div>
          </div>
        </div>
        <div class="history-msg">
          <div class="avatar bot">FG</div>
          <div class="body">
            <div class="head"><span class="n">Forge</span><span class="role">attached artifact</span><span class="t">1h ago</span></div>
            <div class="text">Diff ready. Linked the benchmark run: <code>run_4e8a2c</code>. Want me to fork a version that uses a background reaper instead, for comparison?</div>
          </div>
        </div>
      </div>
    </section>`;

  slot.innerHTML = `
    <div class="eyebrow">Deliverable 02 · ArtifactKind · text_diff</div>
    <h1>A code review, the way they should be.</h1>
    <p class="lede">
      Forge proposed a PR. Before you look at a single line of code, you see <strong>why Forge made each decision</strong>. If the reasoning holds, you can hit <code>A</code> and move on. If it doesn't, you scroll down and comment inline — right on the suspect line.
    </p>
    <h3>Final mockup</h3>
    <div class="dlv-frame-scroll"><div class="dlv-frame shell-4">
      ${iconRail('conv')}
      ${submenu('r5')}
      <main class="main">
        ${header}
        <div class="rbody">
          <div class="artifact-title">PR #2041 · Refactor RateLimiter to bounded LRU</div>
          ${reasoning(reasoningSteps, 6)}
          ${diff}
          ${history}
        </div>
        ${composer('Request a change, comment on a line (L), or approve (A)…')}
      </main>
      ${railCollapsed()}
    </div></div>

    <div class="dlv-caption from">
      <span class="src">New</span>
      <div class="txt">
        <strong>Reasoning block precedes the diff.</strong> For <code>text_diff</code> specifically, this is the difference between a code review and a code <em>audit</em>: you can read 5 numbered steps in 20 seconds and decide whether to read the diff carefully, skim it, or reject the premise outright. The numbered format maps directly to <code>Message.reasoning: string[]</code>.
        <strong>Inline comments anchor to specific lines</strong> and support a "resolve" state — Forge has already proposed a resolution on Max's first comment.
      </div>
    </div>
    <div class="dlv-caption keep">
      <span class="src">From B</span>
      <div class="txt">
        <strong>Verdict toolbar surface is constant across all 5 artifact kinds.</strong> Approve/Request changes/Reject with keybinds A/R/X stay in the same position regardless of whether you're looking at a diff, a blog post, or a deploy plan. Muscle memory matters more than per-kind optimization. The 7 less-frequent actions (pause, fork, delegate, etc.) live under <code>…</code>.
      </div>
    </div>`;
})();

/* ══════════════ PANEL 3 — content_preview ══════════════ */
(function panel3(){
  const slot = document.getElementById('d3-slot');
  if (!slot) return;

  const header = reviewHeader({
    agent: 'Lumen',
    role: 'docs',
    avatarInitials: 'LM',
    routing: 'MA · Growth',
    sla: { text: '1h 18m', warn: true },
    blocking: false,
    status: 'behind',
    product: 'Lumen',
    artifactKind: 'content_preview',
  });

  const reasoningSteps = [
    'Pulled the <code>structured-outputs</code> RFC (v2.3, approved Oct 18) and the related launch checklist. Target audience is <strong>existing API customers</strong> already shipping.',
    'Drafted three opening hooks. Tested each against the launch brief\'s &ldquo;stop-scroll in 5 seconds&rdquo; rule. The &ldquo;JSON, but guaranteed&rdquo; hook scored highest on specificity.',
    'Followed the house style guide: no first-person plural, no em-dash abuse, examples before concepts, concrete numbers whenever possible. Flagged 2 numbers that need verification from <code>Atlas</code>.',
    'Generated 3 code samples (Python / TS / curl). Ran each against staging to verify they actually work — shipped with outputs inlined.',
  ];

  const body = `
    <div class="content-preview">
      <div class="cp-meta">
        <div class="cp-kv"><span class="l">Title</span><span class="v">Announcing structured outputs</span></div>
        <div class="cp-kv"><span class="l">Target</span><span class="v">Existing API customers</span></div>
        <div class="cp-kv"><span class="l">Word count</span><span class="v">842 words · 3.5 min read</span></div>
        <div class="cp-kv"><span class="l">Flagged</span><span class="v warn">2 facts pending</span></div>
        <div class="cp-kv"><span class="l">Channel</span><span class="v">blog.factory.ai</span></div>
        <div class="cp-kv"><span class="l">Embargo</span><span class="v">Oct 28 · 09:00 PT</span></div>
        <div class="cp-kv"><span class="l">Reading level</span><span class="v">Grade 11</span></div>
        <div class="cp-kv"><span class="l">Tone score</span><span class="v ok">On brand · 94%</span></div>
      </div>
      <div class="cp-body">
        <div class="cp-byline">
          <span>LUMEN · DOCS AGENT</span>
          <span class="dot">·</span>
          <span>DRAFT v3</span>
          <span class="dot">·</span>
          <span>FOR REVIEW BY MA</span>
        </div>
        <h2>JSON, but guaranteed.</h2>
        <p class="cp-dek">
          Your tool-calling code almost works. <strong>Structured outputs</strong> make it actually work — every time, for every model, with the schema you wrote.
        </p>

        <p>
          If you've shipped an agent in production, you know the feeling: the model returns JSON 98% of the time. The other 2% is a markdown fence, a trailing comma, a missing field, or a confidently-hallucinated enum value. You wrote a retry loop. You wrote a <code>repair_json</code> helper. You wrote prose in your system prompt begging the model to please, please emit valid JSON.
        </p>

        <p>
          Today we're rolling out <strong>structured outputs</strong> across the Factory API. Pass a JSON Schema with your request, and the response is <em>guaranteed</em> to conform to it. Not &ldquo;usually.&rdquo; Not &ldquo;statistically.&rdquo; <strong>Every single token is constrained against your schema at generation time.</strong>
        </p>

        <h3>How it works</h3>
        <p>
          We compile your schema into a constrained-decoding grammar. At each step the model sees only the tokens that could still produce a valid instance. Invalid continuations are masked out before sampling, not filtered after. The result: zero retry logic, zero parse errors, zero &ldquo;sometimes it adds explanation before the JSON.&rdquo;
        </p>

        <blockquote>
          In internal testing across <strong>18,500 requests</strong> against nested schemas (depth ≥ 4), we saw a <strong>100% conformance rate</strong> and a median latency increase of <strong>under 40ms</strong>.
        </blockquote>

        <h3>Three lines to adopt it</h3>
        <p>Add <code>response_format</code> to any request, pass your schema, and parse with confidence:</p>
      </div>
    </div>
  `;

  slot.innerHTML = `
    <div class="eyebrow">Deliverable 03 · ArtifactKind · content_preview</div>
    <h1>A blog post, review-ready.</h1>
    <p class="lede">
      Marketing copy is judged on three axes: does the hook land, is the message on-brand, and are the facts defensible. The preview surfaces all three above the fold — <strong>word count, tone score, and pending-fact flags</strong> are metadata the reviewer scans before reading a single paragraph.
    </p>
    <h3>Final mockup</h3>
    <div class="dlv-frame-scroll"><div class="dlv-frame shell-4">
      ${iconRail('conv')}
      ${submenu('r3')}
      <main class="main">
        ${header}
        <div class="rbody">
          <div class="artifact-title">Blog post · Announcing structured outputs</div>
          ${reasoning(reasoningSteps, 8)}
          ${body}
        </div>
        ${composer('Suggest a revision, flag a fact, or approve for publish…')}
      </main>
      ${railCollapsed()}
    </div></div>
    <div class="dlv-caption from">
      <span class="src">New</span>
      <div class="txt">
        <strong>Metadata strip above the content.</strong> Eight key-values in a 4-column grid: title, target audience, word count, flagged facts, channel, embargo, reading level, tone score. This is the &ldquo;editor's cheat sheet&rdquo; — everything you'd want to know before reading. The <span class="vs-badge NEW">NEW</span> &ldquo;flagged facts&rdquo; count is a Lumen-specific field that signals the agent isn't fully confident in 2 of its numbers. Reviewer can click to jump.
        <strong>The content itself is rendered at production fidelity</strong> — real typography, real rhythm — so you're reviewing the artifact, not a preview of the artifact.
      </div>
    </div>
    <div class="dlv-caption keep">
      <span class="src">From B</span>
      <div class="txt">
        The <code>content_preview</code> shape in <code>ArtifactView.tsx</code> already carries <code>title</code>, <code>body</code>, and arbitrary <code>metadata</code>. No new fields required for the strip — the UI just chooses which 4–8 metadata keys to surface based on <code>kind</code>.
      </div>
    </div>`;
})();

/* ══════════════ PANEL 4 — data_metrics ══════════════ */
(function panel4(){
  const slot = document.getElementById('d4-slot');
  if (!slot) return;

  const header = reviewHeader({
    agent: 'Orbit',
    role: 'growth',
    avatarInitials: 'OR',
    routing: 'MA · Growth',
    sla: { text: '22m', warn: true },
    blocking: true,
    status: 'blocked',
    product: 'Orbit',
    artifactKind: 'data_metrics',
  });

  const reasoningSteps = [
    'Pulled 24 KPIs from the Q3 dashboard (Jul 1 – Sep 30). Cross-referenced with Q2 baselines and the annual plan targets.',
    'Noticed <strong>activation rate dropped 12%</strong>. This is <em>outside the 95% confidence interval</em> from the last 8 quarters. Paused to avoid publishing a potentially misleading narrative.',
    'Ran 3 independent explanations through <code>Atlas</code>: (a) the Aug 14 pricing change, (b) the mobile sign-up flow regression caught on Sep 9, (c) a cohort mix shift from the Brazil launch.',
    '<strong>Best fit is (b) — the mobile regression accounts for ~78% of the drop.</strong> If I publish without pinning this, stakeholders will conclude the pricing change hurt activation. That would be wrong.',
    'Awaiting human call on how to frame the narrative. Draft report is ready in either direction.',
  ];

  // Build sparklines inline (static SVG paths)
  const spark = (d, cls) => `
    <div class="spark-wrap">
      <svg viewBox="0 0 200 48" preserveAspectRatio="none">
        <defs>
          <linearGradient id="g-${cls}" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="var(--${cls==='up'?'success':cls==='down'?'error':'primary'})" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="var(--${cls==='up'?'success':cls==='down'?'error':'primary'})" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d="${d} L200,48 L0,48 Z" fill="url(#g-${cls})"/>
        <path d="${d}" fill="none" stroke="var(--${cls==='up'?'success':cls==='down'?'error':'primary'})" stroke-width="1.5"/>
      </svg>
    </div>`;

  const metrics = `
    <div class="metrics">
      <div class="metrics-headlines">
        <div class="metric-hl">
          <span class="lbl">Revenue · Q3</span>
          <span class="v">$4.82M</span>
          <span class="delta up">▲ 18.4% QoQ · on plan</span>
        </div>
        <div class="metric-hl">
          <span class="lbl">Activation rate</span>
          <span class="v" style="color:var(--error)">41.2%</span>
          <span class="delta down">▼ 12.1% QoQ · flagged</span>
        </div>
        <div class="metric-hl">
          <span class="lbl">NRR · 90d trailing</span>
          <span class="v">112%</span>
          <span class="delta flat">▬ ±0.8% QoQ · stable</span>
        </div>
      </div>
      <div class="metrics-charts">
        <div class="chart-row">
          <div class="name">Weekly sign-ups<span class="unit">count · last 13 weeks</span></div>
          ${spark('M0,34 L17,30 L33,28 L50,24 L67,26 L83,22 L100,19 L117,16 L133,12 L150,14 L167,10 L183,8 L200,6', 'up')}
          <div class="readout"><div class="current">14,820</div><div class="delta up">+22% QoQ</div></div>
        </div>
        <div class="chart-row">
          <div class="name">Activation rate<span class="unit">% · last 13 weeks</span></div>
          ${spark('M0,12 L17,14 L33,12 L50,16 L67,18 L83,20 L100,22 L117,28 L133,32 L150,36 L167,34 L183,38 L200,40', 'down')}
          <div class="readout"><div class="current">41.2%</div><div class="delta down">−12.1% QoQ</div></div>
        </div>
        <div class="chart-row">
          <div class="name">Tokens processed<span class="unit">B/week</span></div>
          ${spark('M0,30 L17,28 L33,26 L50,24 L67,22 L83,18 L100,16 L117,14 L133,12 L150,10 L167,9 L183,8 L200,7', 'up')}
          <div class="readout"><div class="current">3.2B</div><div class="delta up">+34%</div></div>
        </div>
        <div class="chart-row">
          <div class="name">Agent-hours delivered<span class="unit">k/week</span></div>
          ${spark('M0,32 L17,30 L33,28 L50,22 L67,20 L83,18 L100,20 L117,16 L133,14 L150,12 L167,10 L183,12 L200,9', 'up')}
          <div class="readout"><div class="current">48.1k</div><div class="delta up">+29%</div></div>
        </div>
        <div class="chart-row">
          <div class="name">NRR · net-retained<span class="unit">% trailing 90d</span></div>
          ${spark('M0,22 L17,20 L33,22 L50,20 L67,22 L83,21 L100,20 L117,22 L133,21 L150,20 L167,22 L183,21 L200,20', 'flat')}
          <div class="readout"><div class="current">112%</div><div class="delta up" style="color:var(--text-lo)">±0.8%</div></div>
        </div>
        <div class="chart-row">
          <div class="name">Paid conversion<span class="unit">% · weekly cohort</span></div>
          ${spark('M0,24 L17,22 L33,24 L50,22 L67,20 L83,22 L100,20 L117,18 L133,20 L150,18 L167,16 L183,18 L200,14', 'up')}
          <div class="readout"><div class="current">8.4%</div><div class="delta up">+1.2pp</div></div>
        </div>
      </div>
    </div>`;

  slot.innerHTML = `
    <div class="eyebrow">Deliverable 04 · ArtifactKind · data_metrics</div>
    <h1>The agent paused, and it was right to.</h1>
    <p class="lede">
      Orbit built a 24-metric Q3 report, noticed one number was <em>outside its confidence interval</em>, and stopped before publishing. The reasoning block above the charts tells you exactly why — and what it thinks the narrative should be. Your job now is to confirm the framing, not audit the data.
    </p>
    <h3>Final mockup</h3>
    <div class="dlv-frame-scroll"><div class="dlv-frame shell-4">
      ${iconRail('conv')}
      ${submenu('r1')}
      <main class="main">
        ${header}
        <div class="rbody">
          <div class="artifact-title">Q3 · Performance report</div>
          ${reasoning(reasoningSteps, 12)}
          ${metrics}
        </div>
        ${composer('Confirm framing, request alternate explanation, or approve…')}
      </main>
      ${railCollapsed()}
    </div></div>
    <div class="dlv-caption from">
      <span class="src">New</span>
      <div class="txt">
        <strong>Three headline metrics on top, six detailed rows below.</strong> The top strip answers &ldquo;is everything OK?&rdquo; in 2 seconds. The rows give the shape of each trend — sparkline + current value + QoQ delta — without ever opening a dashboard. The flagged metric (activation) is colored red in the headline <em>and</em> highlights in the chart row, so it's impossible to miss.
        <strong>Agent-status = blocked</strong> is rendered amber (not red) per the <code>StatusChip</code> contract — because the artifact is stuck, not broken. The <em>thread-level</em> &ldquo;blocking you&rdquo; pill in the submenu is still red, because <em>that</em> is an attention-event.
      </div>
    </div>
    <div class="dlv-caption keep">
      <span class="src">From B</span>
      <div class="txt">
        Headlines, rows, and deltas all read straight off <code>artifact.metrics[]</code>. The sparkline data is already in the shape Orbit returns — no transform required.
      </div>
    </div>`;
})();

/* ══════════════ PANEL 5 — action_summary ══════════════ */
(function panel5(){
  const slot = document.getElementById('d5-slot');
  if (!slot) return;

  const header = reviewHeader({
    agent: 'Tessera',
    role: 'infra',
    avatarInitials: 'TS',
    routing: 'MA · Growth',
    sla: { text: '36m', warn: true },
    blocking: true,
    status: 'blocked',
    product: 'Tessera',
    artifactKind: 'action_summary',
  });

  const reasoningSteps = [
    'Parsed the deploy request for <code>api-gateway v2.4.1</code>. Confirmed the image digest matches the PR that was approved in thread <code>r_2038</code>.',
    'Generated a 6-step plan: pre-flight checks → canary 5% → bake 20min → 50% → bake 10min → 100%. Rollback plan inlined at each step.',
    'Steps 1–3 passed on staging without intervention. Error rate on canary: 0.02% (baseline 0.03%). Latency p99: unchanged within noise.',
    'Paused at step 4 (50% rollout) because <strong>MA did not auto-approve progressive rollouts after 18:00</strong> per the safety policy. Awaiting explicit go-ahead.',
  ];

  const body = `
    <div class="actions">
      <div class="actions-meta">
        <div class="cp-kv"><span class="l">Command</span><span class="v" style="font-family:var(--font-mono);font-size:12px">tessera deploy api-gateway:v2.4.1 --env=prod</span></div>
        <div class="cp-kv"><span class="l">Dry-run</span><span class="v ok">Passed · staging</span></div>
        <div class="cp-kv"><span class="l">Est. duration</span><span class="v">42 min total</span></div>
        <div class="cp-kv"><span class="l">Blast radius</span><span class="v warn">All prod traffic</span></div>
      </div>
      <div class="actions-list">
        <div class="action-step ok">
          <div class="n-wrap"><div class="n">${ICON.check}</div></div>
          <div class="body">
            <div class="t">Pre-flight checks</div>
            <div class="d">Image signature verified (digest <code>sha256:8f2a…c341</code>). Manifest lint passed. Dependency versions match staging. Canary node selected: <code>prod-ap-1.c</code>.</div>
          </div>
          <div class="right">
            <span class="chip done"><span class="dot"></span>DONE</span>
            <span class="v">0:00 → 0:04 · 4m</span>
          </div>
        </div>

        <div class="action-step ok">
          <div class="n-wrap"><div class="n">${ICON.check}</div></div>
          <div class="body">
            <div class="t">Canary rollout · 5%</div>
            <div class="d">Routed 5% of traffic to new build for 20 minutes. Error rate <strong>0.02%</strong> vs baseline 0.03%; p99 latency <strong>+1.2ms</strong> (within noise). Zero 5xx spikes.</div>
          </div>
          <div class="right">
            <span class="chip done"><span class="dot"></span>DONE</span>
            <span class="v">0:04 → 0:24 · 20m</span>
          </div>
        </div>

        <div class="action-step ok">
          <div class="n-wrap"><div class="n">${ICON.check}</div></div>
          <div class="body">
            <div class="t">Bake window · metrics converged</div>
            <div class="d">All SLOs green for 20 consecutive minutes. Rolling-window error budget consumption: 0.1% of daily budget.</div>
          </div>
          <div class="right">
            <span class="chip done"><span class="dot"></span>DONE</span>
            <span class="v">0:24 → 0:44 · 20m</span>
          </div>
        </div>

        <div class="action-step current">
          <div class="n-wrap"><div class="n">4</div></div>
          <div class="body">
            <div class="t">Progressive rollout · 50% <span class="kind blocking" style="margin-left:8px;">${ICON.block} AWAITING APPROVAL</span></div>
            <div class="d">Paused at 18:42 local. Safety policy <code>no-auto-ramp-after-18:00</code> triggered. Click <strong>Approve</strong> to resume, or <strong>Rollback</strong> to revert canary and retry tomorrow.</div>
          </div>
          <div class="right">
            <span class="chip blocked"><span class="dot"></span>BLOCKED</span>
            <span class="v">paused · 36m ago</span>
          </div>
        </div>

        <div class="action-step">
          <div class="n-wrap"><div class="n">5</div></div>
          <div class="body">
            <div class="t">Bake window · 10 min at 50%</div>
            <div class="d">Standard 10-minute bake before final cutover. Auto-rollback if error rate exceeds 0.5% or p99 latency exceeds +10ms from baseline.</div>
          </div>
          <div class="right">
            <span class="chip unknown"><span class="dot"></span>PENDING</span>
            <span class="v">est. 10m</span>
          </div>
        </div>

        <div class="action-step">
          <div class="n-wrap"><div class="n">6</div></div>
          <div class="body">
            <div class="t">Final cutover · 100%</div>
            <div class="d">Shift remaining traffic. Post-deploy verification: <code>probe --suite=post-deploy --exit-on-fail</code>. Retain rollback window for 24h.</div>
          </div>
          <div class="right">
            <span class="chip unknown"><span class="dot"></span>PENDING</span>
            <span class="v">est. 4m</span>
          </div>
        </div>
      </div>
    </div>
  `;

  slot.innerHTML = `
    <div class="eyebrow">Deliverable 05 · ArtifactKind · action_summary</div>
    <h1>The agent got 3 steps in. Then it asked.</h1>
    <p class="lede">
      Tessera is halfway through a production deploy. It executed <strong>three steps autonomously</strong>, paused the fourth because of a timing policy, and is waiting for you. The action_summary shows exactly where it is, what it did, and what happens next — no log-diving required.
    </p>
    <h3>Final mockup</h3>
    <div class="dlv-frame-scroll"><div class="dlv-frame shell-4">
      ${iconRail('conv')}
      ${submenu('r2')}
      <main class="main">
        ${header}
        <div class="rbody">
          <div class="artifact-title">Deploy · api-gateway v2.4.1 → prod</div>
          ${reasoning(reasoningSteps, 3)}
          ${body}
        </div>
        ${composer('Approve to resume rollout, rollback to step 2, or request changes…')}
      </main>
      ${railCollapsed()}
    </div></div>
    <div class="dlv-caption from">
      <span class="src">New</span>
      <div class="txt">
        <strong>Steps are first-class objects, not log lines.</strong> Each has a status chip (done/blocked/pending), a duration, and a description of what it actually did. The &ldquo;current&rdquo; step is visually anchored with a primary-color number and an AWAITING APPROVAL chip — you see it the instant you open the thread.
        <strong>Meta-strip at the top</strong> gives you command, dry-run result, estimated duration, and blast radius before any step details. These are the four questions you'd ask first; they're answered first.
      </div>
    </div>
    <div class="dlv-caption keep">
      <span class="src">From B</span>
      <div class="txt">
        The <code>action_summary</code> shape supports an ordered <code>steps[]</code> array with <code>{ title, description, status, duration, timestamps }</code>. This view reads it verbatim; no schema changes needed.
      </div>
    </div>`;
})();

/* ══════════════ PANEL 6 — visual_comparison ══════════════ */
(function panel6(){
  const slot = document.getElementById('d6-slot');
  if (!slot) return;

  const header = reviewHeader({
    agent: 'Prism',
    role: 'design',
    avatarInitials: 'PR',
    routing: 'MA · Growth',
    sla: { text: '4h 02m', warn: false },
    blocking: false,
    status: 'healthy',
    product: 'Prism',
    artifactKind: 'visual_comparison',
  });

  const reasoningSteps = [
    'Read the brief: &ldquo;the hero doesn\'t land — feels like a tools page, not a product page.&rdquo; Current hero has 3 equal-weight visual cells and a generic headline.',
    'Explored 4 directions (see <code>moodboard_3821</code>). Two scored well against the brief: <strong>(A) asymmetric hero with a single dominant image</strong>, <strong>(B) type-led with oversized headline, no images</strong>. Picked (A) — the product benefits from showing output.',
    'Re-wrote the headline to be specific about the outcome instead of describing the product. Reduced supporting copy by 40% — the image carries weight the paragraph was doing.',
    'Swapped the secondary CTA (&ldquo;Learn more&rdquo;) for a single path (&ldquo;See it in action&rdquo;). Two CTAs were splitting intent; one focused CTA raises landing-page conversion by 11–19% in our A/B history.',
  ];

  const body = `
    <div class="vc">
      <div class="vc-head">
        <div class="title">Landing page hero · comparison</div>
        <div class="controls">
          <button class="vbtn" title="Side-by-side view">Side-by-side</button>
          <button class="vbtn ghost" title="Overlay / slider">Overlay</button>
          <button class="vbtn ghost" title="Before only">Before</button>
          <button class="vbtn ghost" title="After only">After</button>
        </div>
      </div>
      <div class="vc-grid">
        <div class="vc-panel">
          <div class="lbl"><span>Before</span><span class="ver">v12 · current prod</span></div>
          <div class="frame">
            <div class="mock-page before">
              <div class="mock-nav">
                <span class="brand">FACTORY</span>
                <span>PRODUCT · PRICING · DOCS</span>
              </div>
              <div class="mock-hero-title">Build with AI agents.</div>
              <div class="mock-hero-sub">A platform for coordinating agents, humans, and code across your stack.</div>
              <div class="mock-hero-cta-row">
                <span class="mock-btn primary">Get started</span>
                <span class="mock-btn ghost">Learn more</span>
              </div>
              <div class="mock-visual">
                <div class="cell"></div><div class="cell"></div><div class="cell"></div>
              </div>
            </div>
          </div>
          <div class="meta">
            <div><span>CTR est.</span><div class="v">2.1%</div></div>
            <div><span>Copy</span><div class="v">42 words</div></div>
            <div><span>Visual weight</span><div class="v">Even · 3 cells</div></div>
            <div><span>CTAs</span><div class="v">2</div></div>
          </div>
        </div>
        <div class="vc-panel">
          <div class="lbl"><span>After</span><span class="ver after">v13 · proposed</span></div>
          <div class="frame">
            <div class="mock-page after">
              <div class="mock-nav">
                <span class="brand">FACTORY</span>
                <span>PRODUCT · PRICING · DOCS</span>
              </div>
              <div class="mock-hero-title">Ship production agents in a week.</div>
              <div class="mock-hero-sub">Not a chatbot framework. Not a prompt playground. A real platform for real agents in real production.</div>
              <div class="mock-hero-cta-row">
                <span class="mock-btn primary">See it in action</span>
              </div>
              <div class="mock-visual">
                <div class="cell"></div><div class="cell"></div><div class="cell"></div>
              </div>
            </div>
          </div>
          <div class="meta">
            <div><span>CTR est.</span><div class="v" style="color:var(--success)">3.4%</div></div>
            <div><span>Copy</span><div class="v">28 words</div></div>
            <div><span>Visual weight</span><div class="v">1 dominant</div></div>
            <div><span>CTAs</span><div class="v">1</div></div>
          </div>
        </div>
      </div>
    </div>
  `;

  slot.innerHTML = `
    <div class="eyebrow">Deliverable 06 · ArtifactKind · visual_comparison</div>
    <h1>A design revision, judged at a glance.</h1>
    <p class="lede">
      Prism shipped two versions. The reasoning block tells you what changed and why. The side-by-side shows the <em>result</em>. The metadata row under each frame lets you compare the specs that matter — copy length, CTA count, visual weight, projected CTR — without eyeballing.
    </p>
    <h3>Final mockup</h3>
    <div class="dlv-frame-scroll"><div class="dlv-frame shell-4">
      ${iconRail('conv')}
      ${submenu('r4')}
      <main class="main">
        ${header}
        <div class="rbody">
          <div class="artifact-title">Landing page · hero revision</div>
          ${reasoning(reasoningSteps, 5)}
          ${body}
        </div>
        ${composer('Request a tweak, fork an alternate direction, or approve v13…')}
      </main>
      ${railCollapsed()}
    </div></div>
    <div class="dlv-caption from">
      <span class="src">New</span>
      <div class="txt">
        <strong>View modes.</strong> Side-by-side is the default. Overlay (with an opacity slider), Before-only, and After-only are one click away — the reviewer picks the comparison mode that fits the question they're asking. For motion or interaction changes, the panels would swap to a looping clip; the frame shape stays constant.
        <strong>Metadata under each frame</strong> enables numeric comparison: 42 → 28 words, 2 → 1 CTAs, 3 even cells → 1 dominant. This turns &ldquo;does it feel better?&rdquo; into &ldquo;is this the right direction?&rdquo;
      </div>
    </div>
    <div class="dlv-caption keep">
      <span class="src">From B</span>
      <div class="txt">
        <code>visual_comparison</code> already carries <code>before</code> and <code>after</code> as structured variants. The comparison grid reads them directly. Frame contents here are placeholders — in production they'd be Prism's actual rendered output (iframes, images, or design tokens).
      </div>
    </div>`;
})();
