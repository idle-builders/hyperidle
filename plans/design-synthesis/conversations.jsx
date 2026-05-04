// conversations.jsx — Conversations v2: thread list, review thread, chat thread, empty state

// ═════════ Sample threads ═════════
const V2_THREADS = [
  // Pinned
  { id: 'cos', kind: 'chat', pinned: true, agent: 'Chief of Staff', role: 'Advisor', initials: 'CS', bot: true, subject: 'Weekly priorities — Q2 focus', time: 'now', status: null, product: null, blocking: false },
  // Blocking reviews
  { id: 'r1', kind: 'review', blocking: true, agent: 'Agent AR', role: 'Growth', initials: 'AR', bot: true, subject: 'Pricing experiment variant B — 100% rollout', time: '4m', status: 'blocked', product: 'Orbit', artifact: 'data_metrics' },
  { id: 'r2', kind: 'review', blocking: true, agent: 'Agent KM', role: 'Infra', initials: 'KM', bot: true, subject: 'Deploy orbit-api v2.15.0 to production', time: '18m', status: 'blocked', product: 'Orbit', artifact: 'action_summary' },
  // Non-blocking reviews
  { id: 'r3', kind: 'review', blocking: false, agent: 'Agent RN', role: 'Product', initials: 'RN', bot: true, subject: 'Onboarding copy v3 — three variants', time: '22m', status: 'behind', product: 'Tessera', artifact: 'content_preview' },
  { id: 'r4', kind: 'review', blocking: false, agent: 'Agent RN', role: 'Product', initials: 'RN', bot: true, subject: 'Inbox empty-state illustration revision', time: '1h', status: 'healthy', product: 'Tessera', artifact: 'visual_comparison' },
  { id: 'r5', kind: 'review', blocking: false, agent: 'Agent KM', role: 'Infra', initials: 'KM', bot: true, subject: 'Webhook retry — switch to queue', time: '2h', status: 'healthy', product: 'Orbit', artifact: 'text_diff' },
  // Chats
  { id: 'c1', kind: 'chat', agent: 'Rishi', role: 'Founder', initials: 'RN', bot: false, subject: 'Should we ship the granular perms bet?', time: '3h', status: null, product: null },
  { id: 'c2', kind: 'chat', agent: 'Agent SV', role: 'Analytics', initials: 'SV', bot: true, subject: 'Re: churn cohort hypothesis', time: '5h', status: null, product: 'Loom' },
  // Resolved
  { id: 'r6', kind: 'review', blocking: false, agent: 'Agent KM', role: 'Infra', initials: 'KM', bot: true, subject: 'Post-mortem — us-east rollback', time: '1d', status: 'done', product: 'Orbit' },
];

// ═════════ Thread list ═════════
const ThreadListItem = ({ t, selected, onClick, onContext }) => {
  const handleContext = (e) => {
    e.preventDefault();
    onContext(e.clientX, e.clientY, t);
  };
  return (
    <div
      className={`threadrow-v2 ${selected ? 'selected' : ''} ${t.blocking ? 'blocking' : ''} ${t.pinned ? 'pinned' : ''}`}
      onClick={() => onClick(t.id)}
      onContextMenu={handleContext}
    >
      <div className={`avatar ${t.bot ? 'bot' : ''} ${t.pinned ? 'pinned' : ''}`}>{t.initials}</div>
      <div className="tr-body">
        <div className="tr-top">
          <span className="tr-name">
            {t.agent}
            <span className="tr-role">· {t.role}</span>
          </span>
          <span className="tr-time">{t.time}</span>
        </div>
        <div className="tr-subject">{t.subject}</div>
        <div className="tr-meta">
          {t.blocking && <span className="kind-badge blocking"><Icon name="block" size={10} /> BLOCKING</span>}
          {t.kind === 'review' && !t.blocking && <span className="kind-badge review">REVIEW</span>}
          {t.kind === 'chat' && <span className="kind-badge chat">CHAT</span>}
          {t.status && <StatusChip status={t.status} />}
          {t.product && <Tag variant="product">{t.product}</Tag>}
        </div>
      </div>
    </div>
  );
};

const ContextMenu = ({ x, y, onClose }) => {
  const [snoozeOpen, setSnoozeOpen] = React.useState(false);
  React.useEffect(() => {
    const h = () => onClose();
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [onClose]);
  return (
    <div className="ctx-menu" style={{ top: y, left: x }} onClick={e => e.stopPropagation()}>
      <div className="ctx-item" onMouseEnter={() => setSnoozeOpen(true)} onMouseLeave={() => setSnoozeOpen(false)} style={{ position: 'relative' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="paused" size={14} />Snooze</span>
        <Icon name="chevronRight" size={14} />
        {snoozeOpen && (
          <div className="ctx-submenu">
            {['Until tomorrow', 'Until Monday', '1 hour', '4 hours', 'Pick time…'].map(x => (
              <div key={x} className="ctx-item" onClick={onClose}><span>{x}</span></div>
            ))}
          </div>
        )}
      </div>
      <div className="ctx-item" onClick={onClose}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Archive</span>
        <span className="kbd">E</span>
      </div>
      <div className="ctx-item" onClick={onClose}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Mute agent</span>
      </div>
      <div className="ctx-divider" />
      <div className="ctx-item" onClick={onClose}>
        <span>Mark read</span>
        <span className="kbd">⇧U</span>
      </div>
      <div className="ctx-item" onClick={onClose}>
        <span>Copy link</span>
        <span className="kbd">⌘L</span>
      </div>
    </div>
  );
};

const ConversationsSubmenuV2 = ({ selectedId, onSelect }) => {
  const [filter, setFilter] = React.useState('Blocking');
  const [ctx, setCtx] = React.useState(null);
  const openCtx = (x, y, t) => setCtx({ x, y, t });

  const pinned = V2_THREADS.filter(t => t.pinned);
  const blocking = V2_THREADS.filter(t => !t.pinned && t.blocking);
  const reviews = V2_THREADS.filter(t => !t.pinned && t.kind === 'review' && !t.blocking && t.status !== 'done');
  const chats = V2_THREADS.filter(t => !t.pinned && t.kind === 'chat');
  const resolved = V2_THREADS.filter(t => t.status === 'done');

  return (
    <>
      <div className="submenu-header">
        <div className="submenu-title">
          <span>Conversations</span>
          <span className="count">{V2_THREADS.length}</span>
        </div>
        <SearchField placeholder="Jump to…" shortcut="⌘K" />
      </div>
      <div className="submenu-filters">
        {['All', 'Blocking', 'Reviews', 'Chats', 'Orbit', 'Tessera', 'Snoozed'].map(f => (
          <button
            key={f}
            className="tag"
            onClick={() => setFilter(f)}
            style={filter === f ? { background: 'var(--primary-dim)', color: 'var(--primary)' } : {}}
          >
            {f === 'Blocking' ? `${f} · ${blocking.length}` : f}
          </button>
        ))}
      </div>
      <div className="submenu-list">
        <div className="tl-section-label"><span>Pinned</span><span className="count">1</span></div>
        {pinned.map(t => <ThreadListItem key={t.id} t={t} selected={selectedId === t.id} onClick={onSelect} onContext={openCtx} />)}

        <div className="tl-section-label"><span style={{ color: 'var(--danger)' }}>● Blocking you</span><span className="count">{blocking.length}</span></div>
        {blocking.map(t => <ThreadListItem key={t.id} t={t} selected={selectedId === t.id} onClick={onSelect} onContext={openCtx} />)}

        <div className="tl-section-label"><span>Reviews</span><span className="count">{reviews.length}</span></div>
        {reviews.map(t => <ThreadListItem key={t.id} t={t} selected={selectedId === t.id} onClick={onSelect} onContext={openCtx} />)}

        <div className="tl-section-label"><span>Chats</span><span className="count">{chats.length}</span></div>
        {chats.map(t => <ThreadListItem key={t.id} t={t} selected={selectedId === t.id} onClick={onSelect} onContext={openCtx} />)}

        <div className="tl-section-label"><span>Resolved · 24h</span><span className="count">{resolved.length}</span></div>
        {resolved.map(t => <ThreadListItem key={t.id} t={t} selected={selectedId === t.id} onClick={onSelect} onContext={openCtx} />)}
      </div>
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} onClose={() => setCtx(null)} />}
    </>
  );
};

// ═════════ Review header ═════════
const ReviewHeader = ({ title, product, status, blocking }) => {
  const [overflowOpen, setOverflowOpen] = React.useState(false);
  return (
    <div className="review-header">
      <div className="rh-top">
        <Tag variant="product">{product}</Tag>
        <StatusChip status={status} />
        {blocking && <span className="kind-badge blocking"><Icon name="block" size={10} /> AGENT PAUSED</span>}
        <span className="rh-title">{title}</span>
      </div>
      <div className="rh-actions" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="mono-sm">ROUTED TO MA · GROWTH</span>
          <span style={{ color: 'var(--t-low)' }}>·</span>
          <span className="mono-sm" style={{ color: 'var(--warn)' }}>SLA 3H 42M</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', position: 'relative' }}>
          <button className="verdict-btn reject" title="Reject (X)">
            <Icon name="close" size={14} /> Reject <span className="kbd">X</span>
          </button>
          <button className="verdict-btn request" title="Request changes (R)">
            Request changes <span className="kbd">R</span>
          </button>
          <button className="verdict-btn approve" title="Approve (A)">
            <Icon name="check" size={14} /> Approve <span className="kbd">A</span>
          </button>
          <button className="icon-btn" onClick={() => setOverflowOpen(o => !o)}><Icon name="more" /></button>
          {overflowOpen && (
            <div className="overflow-menu" onMouseLeave={() => setOverflowOpen(false)}>
              {[
                ['Approve with comments', 'A C'],
                ['Comment only', 'C'],
                ['Inline comment', 'I'],
                ['Edit proposal', 'E'],
                ['Escalate to team', '⇧E'],
                ['Snooze', 'S'],
              ].map(([l, k]) => (
                <div key={l} className="ctx-item"><span>{l}</span><span className="kbd">{k}</span></div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ═════════ Reasoning block ═════════
const Reasoning = ({ confidence = 97, children, expanded: expandedProp = true }) => {
  const [expanded, setExpanded] = React.useState(expandedProp);
  const conf = confidence >= 85 ? 'high' : confidence >= 65 ? 'mid' : 'low';
  return (
    <div className="block-card">
      <div className="block-head" onClick={() => setExpanded(e => !e)}>
        <div className="block-head-left">
          <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={14} />
          <span className="block-title">Agent reasoning</span>
          <span className="block-subtitle">why this proposal</span>
        </div>
        <span className="confidence">
          <span>CONFIDENCE {confidence}%</span>
          <span className="confidence-bar">
            <span className={`confidence-bar-fill ${conf === 'mid' ? 'mid' : conf === 'low' ? 'low' : ''}`} style={{ width: `${confidence}%` }} />
          </span>
        </span>
      </div>
      {expanded && <div className="block-body"><div className="reasoning-body">{children}</div></div>}
    </div>
  );
};

// ═════════ Artifact: text_diff ═════════
const DiffLine = ({ kind = 'ctx', ln, rn, code, canComment = true, showInlineForm, onAdd }) => (
  <div className={`diff-line ${kind}`}>
    <span className="diff-ln">{ln || ''}</span>
    <span className="diff-ln">{rn || ''}</span>
    <span className="diff-code">{code}</span>
    {canComment && kind !== 'hunk' && <span className="diff-add-comment" onClick={onAdd}>+</span>}
  </div>
);

const TextDiffArtifact = () => (
  <div className="block-card">
    <div className="block-head">
      <div className="block-head-left">
        <Icon name="panel" size={14} />
        <span className="block-title">Artifact · text_diff</span>
        <span className="block-subtitle">2 files · +18 / −12</span>
      </div>
      <div className="companion-toggle">
        <button className="active">Inline</button>
        <button>Split</button>
      </div>
    </div>
    <div className="diff">
      <div className="diff-file">
        <span className="diff-file-path">services/webhooks/retry.ts</span>
        <div className="diff-stats"><span className="add">+14</span><span className="rem">−9</span></div>
      </div>
      <div className="diff-lines">
        <DiffLine kind="hunk" code="@@ -42,9 +42,14 @@ export async function handleStripeWebhook(req) {" />
        <DiffLine kind="ctx" ln="42" rn="42" code="  const evt = req.body;" />
        <DiffLine kind="ctx" ln="43" rn="43" code="  try {" />
        <DiffLine kind="rem" ln="44" code="    await processInline(evt);" />
        <DiffLine kind="rem" ln="45" code="    return res.json({ ok: true });" />
        <DiffLine kind="add" rn="44" code="    const job = await queue.enqueue('webhook.process', evt, {" />
        <DiffLine kind="add" rn="45" code="      attempts: 5," />
        <DiffLine kind="add" rn="46" code="      backoff: { type: 'exponential', delay: 2000 }," />
        <DiffLine kind="add" rn="47" code="    });" />
        <DiffLine kind="add" rn="48" code="    return res.json({ ok: true, jobId: job.id });" />
        <DiffLine kind="ctx" ln="46" rn="49" code="  } catch (err) {" />
      </div>
      <div className="inline-comment">
        <div className="inline-comment-head">
          <span className="inline-comment-author">Max</span>
          <span className="inline-comment-time">on line 44 · 2m ago</span>
        </div>
        <div className="inline-comment-body">Are we sure 5 attempts is enough for the outage window we saw last month? Doc had us at 8.</div>
      </div>
      <div className="diff-lines">
        <DiffLine kind="ctx" ln="47" rn="50" code="    logger.error(err);" />
        <DiffLine kind="ctx" ln="48" rn="51" code="    return res.status(500).json({ ok: false });" />
        <DiffLine kind="ctx" ln="49" rn="52" code="  }" />
        <DiffLine kind="ctx" ln="50" rn="53" code="}" />
      </div>
      <div className="diff-file" style={{ borderTop: '1px solid var(--s3)' }}>
        <span className="diff-file-path">services/webhooks/queue.ts</span>
        <div className="diff-stats"><span className="add">+4</span><span className="rem">−3</span></div>
      </div>
      <div className="diff-lines">
        <DiffLine kind="hunk" code="@@ -12,3 +12,4 @@ export const queue = new Queue('webhook', {" />
        <DiffLine kind="rem" ln="12" code="  connection: { host: 'localhost' }," />
        <DiffLine kind="add" rn="12" code="  connection: { host: process.env.REDIS_HOST }," />
        <DiffLine kind="add" rn="13" code="  defaultJobOptions: { removeOnComplete: 500 }," />
        <DiffLine kind="ctx" ln="13" rn="14" code="});" />
      </div>
    </div>
    <div className="checks">
      <div className="check-row pass"><span className="check-dot" /><span className="check-name">Unit tests</span><span className="check-dur">412 passed · 3.4s</span></div>
      <div className="check-row pass"><span className="check-dot" /><span className="check-name">Integration tests</span><span className="check-dur">48 passed · 1m 12s</span></div>
      <div className="check-row pass"><span className="check-dot" /><span className="check-name">Typecheck</span><span className="check-dur">0 errors · 8.1s</span></div>
      <div className="check-row pass"><span className="check-dot" /><span className="check-name">Lint</span><span className="check-dur">clean · 2.2s</span></div>
      <div className="check-row pending"><span className="check-dot" /><span className="check-name">Staging smoke</span><span className="check-dur">running · 0:42</span></div>
    </div>
  </div>
);

// ═════════ Artifact: content_preview ═════════
const ContentPreviewArtifact = () => (
  <div className="block-card">
    <div className="block-head">
      <div className="block-head-left">
        <Icon name="book" size={14} />
        <span className="block-title">Artifact · content_preview</span>
        <span className="block-subtitle">Tessera onboarding — /welcome</span>
      </div>
      <div className="companion-toggle">
        <button className="active">Preview</button>
        <button>Source</button>
      </div>
    </div>
    <div className="content-preview-wrap">
      <div className="content-preview">
        <div className="byline">DRAFT · v3 · Rishi for Tessera</div>
        <h1>Start quiet. Stay precise.</h1>
        <p>Tessera is a collaborative inbox for teams that take their own words seriously. You can set it up in about three minutes, and it will outlast every other tool you tried this quarter.</p>
        <p className="has-comment">
          We built Tessera because the tools we had were loud. They pinged us constantly, buried decisions in threads, and made us feel like we were always behind. We wanted something that respected focus the way a good library respects silence.
          <span className="comment-marker">2</span>
        </p>
        <h2>What you'll do first</h2>
        <p>Connect your team's shared email. Tessera will read the last 30 days of conversations and suggest a handful of routing rules — who picks up billing, who handles bug reports, which threads are safe to auto-close.</p>
        <p className="has-comment">
          You review the suggestions, approve the ones that look right, and Tessera gets to work. You don't train it. You don't prompt it. You just accept or decline, and it learns your team's shape.
          <span className="comment-marker">1</span>
        </p>
        <p>That's the whole onboarding. No tutorial video, no sample workspace, no friendly chatbot explaining the product. We think you'll figure it out.</p>
      </div>
      <div className="content-meta">
        <KeyValue label="Word count" value="184" />
        <KeyValue label="Read time" value="~45 sec" />
        <KeyValue label="Audience" value="Trial signup" />
        <KeyValue label="Publish date" value="Apr 22, 2026" />
        <KeyValue label="Tone" value="Precise, quiet" />
        <KeyValue label="Variants" value="3 of 3" />
        <div style={{ paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="mono-sm">INLINE COMMENTS · 3</span>
          <button className="btn-ghost" style={{ justifyContent: 'flex-start' }}><span className="conv-msg-anchor">#1</span>&nbsp;&nbsp;on paragraph 4</button>
          <button className="btn-ghost" style={{ justifyContent: 'flex-start' }}><span className="conv-msg-anchor">#2</span>&nbsp;&nbsp;on paragraph 2</button>
        </div>
      </div>
    </div>
  </div>
);

// ═════════ Artifact: visual_comparison ═════════
const MockRevB = () => (
  <>
    <div className="mock-line w40 primary" />
    <div className="mock-card" style={{ flex: 1 }}>
      <div className="mock-line w60" />
      <div className="mock-line w100" />
      <div className="mock-line w80" />
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div className="mock-btn" />
        <div className="mock-line w40" />
      </div>
    </div>
  </>
);
const MockRevC = () => (
  <>
    <div className="mock-line w60 primary" style={{ height: 12 }} />
    <div className="mock-line w80" />
    <div className="mock-card" style={{ flex: 1, background: 'var(--s2)' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ width: 32, height: 32, borderRadius: 4, background: 'var(--s5)' }} />
        <div style={{ flex: 1 }}>
          <div className="mock-line w80" style={{ marginBottom: 6 }} />
          <div className="mock-line w60" />
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div className="mock-line w100" />
      <div style={{ display: 'flex', gap: 6 }}>
        <div className="mock-btn" style={{ width: 80, background: 'var(--ok)' }} />
        <div className="mock-btn" style={{ width: 80, background: 'var(--s5)' }} />
      </div>
    </div>
  </>
);

const VisualComparisonArtifact = () => (
  <div className="block-card">
    <div className="block-head">
      <div className="block-head-left">
        <Icon name="layers" size={14} />
        <span className="block-title">Artifact · visual_comparison</span>
        <span className="block-subtitle">Inbox empty state — Rev B vs Rev C</span>
      </div>
      <div className="companion-toggle">
        <button className="active">Side by side</button>
        <button>Overlay</button>
      </div>
    </div>
    <div className="vcompare">
      <div className="vcompare-grid">
        <div className="vcompare-pane">
          <div className="vcompare-label"><span>Rev B · current</span><span>1440×900</span></div>
          <div className="vcompare-frame"><MockRevB /></div>
        </div>
        <div className="vcompare-pane">
          <div className="vcompare-label"><span className="rev">Rev C · proposed</span><span>1440×900</span></div>
          <div className="vcompare-frame" style={{ boxShadow: 'inset 0 0 0 1px var(--primary-hover)' }}><MockRevC /></div>
        </div>
      </div>
      <div className="vcompare-controls">
        <span className="mono-sm">OVERLAY</span>
        <div className="vcompare-slider">
          <div className="vcompare-slider-fill" style={{ width: '50%' }} />
          <div className="vcompare-slider-thumb" />
        </div>
        <span className="mono-sm">50 / 50</span>
      </div>
    </div>
  </div>
);

// ═════════ Artifact: action_summary ═════════
const ActionSummaryArtifact = () => (
  <div className="block-card">
    <div className="block-head">
      <div className="block-head-left">
        <Icon name="sparkle" size={14} />
        <span className="block-title">Artifact · action_summary</span>
        <span className="block-subtitle">Deploy orbit-api v2.15.0 to production</span>
      </div>
    </div>
    <div className="action-summary">
      <div className="action-change">
        <span className="action-change-label">What changes</span>
        <span className="action-change-value">Deploy <code>orbit-api@v2.15.0</code> to <code>prod-us-east</code> and <code>prod-eu-west</code>. Canary 10% → 50% → 100% over 40 minutes.</span>
      </div>
      <div className="action-change">
        <span className="action-change-label">Why</span>
        <span className="action-change-value">Ships the new webhook retry queue (approved thread #r5) and a hotfix for the rate-limit header bug surfaced by customer #1142.</span>
      </div>
      <div className="action-change">
        <span className="action-change-label">Expected impact</span>
        <span className="action-change-value">Webhook delivery p99 drops from 4.2s to ~0.8s. No user-visible behavior change on happy path.</span>
      </div>
      <div className="action-change">
        <span className="action-change-label">Rollback</span>
        <span className="action-change-value">Auto-rollback on 3× baseline error rate for 2 minutes. Manual rollback: <code>hyperctl deploy rollback orbit-api</code>, ~90s.</span>
      </div>
      <div className="action-change">
        <span className="action-change-label">Checks passed</span>
        <span className="action-change-value">
          <div className="checks" style={{ padding: 0, background: 'transparent' }}>
            <div className="check-row pass" style={{ padding: '4px 0' }}><span className="check-dot" /><span className="check-name">CI green</span><span className="check-dur">12m 08s</span></div>
            <div className="check-row pass" style={{ padding: '4px 0' }}><span className="check-dot" /><span className="check-name">Staging smoke</span><span className="check-dur">clean · 6m</span></div>
            <div className="check-row pass" style={{ padding: '4px 0' }}><span className="check-dot" /><span className="check-name">Security scan</span><span className="check-dur">0 findings</span></div>
            <div className="check-row pass" style={{ padding: '4px 0' }}><span className="check-dot" /><span className="check-name">Migration dry-run</span><span className="check-dur">0 schema changes</span></div>
          </div>
        </span>
      </div>
      <div className="action-change">
        <span className="action-change-label">Timeline</span>
        <span className="action-change-value">
          <div className="timeline">
            <div className="timeline-step"><span className="timeline-dot done" /><span className="timeline-label">Build &amp; tag v2.15.0</span><span className="timeline-time">14:02</span></div>
            <div className="timeline-step"><span className="timeline-dot done" /><span className="timeline-label">Deploy to staging</span><span className="timeline-time">14:18</span></div>
            <div className="timeline-step"><span className="timeline-dot now" /><span className="timeline-label">Awaiting founder approval</span><span className="timeline-time">now</span></div>
            <div className="timeline-step"><span className="timeline-dot" /><span className="timeline-label">Canary 10% · prod</span><span className="timeline-time">+0m</span></div>
            <div className="timeline-step"><span className="timeline-dot" /><span className="timeline-label">Ramp 50% → 100%</span><span className="timeline-time">+20m</span></div>
          </div>
        </span>
      </div>
      <div className="action-change">
        <span className="action-change-label">Cost</span>
        <span className="action-change-value">Incremental runtime: +$0 (same instance class). Agent time spent: <code>$4.18</code>.</span>
      </div>
    </div>
  </div>
);

// ═════════ Artifact: data_metrics ═════════
const MiniChart = ({ color = 'var(--primary)', trend = 'up' }) => {
  const points = trend === 'up'
    ? [32, 36, 34, 40, 38, 44, 48, 52, 56, 58, 62, 68]
    : trend === 'down'
      ? [60, 58, 55, 52, 48, 44, 40, 36, 34, 30, 28, 24]
      : [40, 44, 42, 48, 45, 50, 46, 52, 49, 54, 50, 55];
  const w = 520, h = 140, pad = 8;
  const maxV = Math.max(...points);
  const minV = Math.min(...points);
  const stepX = (w - pad * 2) / (points.length - 1);
  const path = points.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + ((maxV - v) / (maxV - minV || 1)) * (h - pad * 2);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  const area = path + ` L${pad + (points.length - 1) * stepX} ${h - pad} L${pad} ${h - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: h }}>
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.3" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#g1)" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
};

const BarChart = () => {
  const bars = [
    { label: 'Control', value: 8.1, color: 'var(--t-low)' },
    { label: 'Var A', value: 8.9, color: 'var(--t-mid)' },
    { label: 'Var B', value: 12.4, color: 'var(--primary)' },
    { label: 'Var C', value: 7.2, color: 'var(--t-low)' },
  ];
  const max = 14;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, height: 140, alignItems: 'end' }}>
      {bars.map(b => (
        <div key={b.label} style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: 100 }}>
            <div style={{ width: '100%', height: `${(b.value / max) * 100}%`, background: b.color, borderRadius: '2px 2px 0 0' }} />
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t-mid)', letterSpacing: '0.05em', textTransform: 'uppercase', textAlign: 'center' }}>{b.label}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--t-high)', textAlign: 'center' }}>{b.value}%</div>
        </div>
      ))}
    </div>
  );
};

const DataMetricsArtifact = () => (
  <div className="block-card">
    <div className="block-head">
      <div className="block-head-left">
        <Icon name="sparkle" size={14} />
        <span className="block-title">Artifact · data_metrics</span>
        <span className="block-subtitle">Pricing experiment — 14-day result</span>
      </div>
    </div>
    <div className="metrics-grid">
      <div className="metric-card">
        <span className="metric-label">Conversion</span>
        <span className="metric-value">12.4%</span>
        <span className="metric-trend up">▲ +3.1 pp vs control</span>
      </div>
      <div className="metric-card">
        <span className="metric-label">ARPU</span>
        <span className="metric-value">$34.20</span>
        <span className="metric-trend up">▲ +$7.10</span>
      </div>
      <div className="metric-card">
        <span className="metric-label">14d churn</span>
        <span className="metric-value">4.1%</span>
        <span className="metric-trend">— flat</span>
      </div>
      <div className="metric-card">
        <span className="metric-label">Confidence</span>
        <span className="metric-value">97%</span>
        <span className="metric-trend up">p &lt; 0.01</span>
      </div>
    </div>
    <div className="chart">
      <div className="chart-head">
        <span className="chart-title">Daily conversion — 14 days</span>
        <span className="mono-sm">% OF VISITORS</span>
      </div>
      <MiniChart color="var(--primary)" trend="up" />
    </div>
    <div className="chart">
      <div className="chart-head">
        <span className="chart-title">Conversion by variant</span>
        <span className="mono-sm">N = 48,210</span>
      </div>
      <BarChart />
    </div>
    <div className="insight-block">
      <span className="insight-label">KEY INSIGHT</span>
      <div className="insight-body">Variant B's lift concentrates in the <strong>new self-serve segment</strong> (source=web, no prior account). Enterprise funnel is untouched — they never see this price point. Recommended: ship B to 100% of new self-serve, preserve grandfathered pricing, keep sales-assisted quote flow intact.</div>
    </div>
    <div className="insight-block" style={{ marginBottom: 0 }}>
      <span className="insight-label">RECOMMENDED ACTIONS</span>
      <div className="insight-body">
        <ul style={{ paddingLeft: 18, margin: 0 }}>
          <li style={{ listStyle: 'disc' }}>Promote Variant B to 100% rollout (this proposal).</li>
          <li style={{ listStyle: 'disc' }}>Update pricing page copy — Rishi has v1 drafted in thread #r3.</li>
          <li style={{ listStyle: 'disc' }}>Monitor grandfathered-upgrade rate for 30 days; flag if &gt;20% drop.</li>
        </ul>
      </div>
    </div>
  </div>
);

// ═════════ Composer ═════════
const Composer = ({ placeholder = 'Reply, or type / for commands…' }) => (
  <div className="composer" style={{ margin: '8px 20px 16px 20px' }}>
    <textarea placeholder={placeholder} />
    <div className="composer-foot">
      <div className="composer-tools">
        <button className="btn-ghost"><Icon name="paperclip" /></button>
        <button className="btn-ghost"><Icon name="sparkle" /></button>
        <button className="btn-ghost"><Icon name="mic" /></button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-sec">Save draft</button>
        <button className="btn-primary">Send <Icon name="arrowUp" size={14} /></button>
      </div>
    </div>
  </div>
);

// ═════════ Conversation history ═════════
const ConvMsg = ({ name, bot, initials, time, anchor, children }) => (
  <div className="conv-msg">
    <Avatar initials={initials} bot={bot} size="md" />
    <div className="conv-msg-body">
      <div className="conv-msg-head">
        <span className={`conv-msg-name ${bot ? 'bot' : ''}`}>{name}</span>
        <span className="conv-msg-time">{time}</span>
        {anchor && <span className="conv-msg-anchor">{anchor}</span>}
      </div>
      <div className="conv-msg-text">{children}</div>
    </div>
  </div>
);

// ═════════ Review thread detail ═════════
const ReviewThreadDetail = ({ variant }) => {
  const data = {
    text_diff: {
      title: 'Webhook retry — switch to queue',
      product: 'Orbit',
      status: 'healthy',
      blocking: false,
      artifact: <TextDiffArtifact />,
      reasoning: (
        <>
          <p><strong>Why this change:</strong> inline webhook processing caused three incidents this cycle when Stripe retried bursts during outages. Moving to a BullMQ queue gives us bounded concurrency, exponential backoff, and a dead-letter path.</p>
          <p>Picked queue over in-process because we already run BullMQ for billing jobs and ops has runbooks for it. Adds ~40ms p50 latency — acceptable given the reliability gain.</p>
          <ul>
            <li>Affects <code>services/webhooks/retry.ts</code> and <code>services/webhooks/queue.ts</code></li>
            <li>No migration required — existing in-flight requests drain on deploy</li>
            <li>Dashboards added; alerts wired to #orbit-ops</li>
          </ul>
        </>
      ),
      history: [
        { name: 'Max', bot: false, initials: 'MA', time: '10:41', anchor: 'retry.ts:44', text: <>Five retries with exponential feels low for the outage window we saw last month. Our runbook says eight.</> },
        { name: 'Agent KM', bot: true, initials: 'KM', time: '10:44', text: <>Checked — runbook was written before we moved to exponential. With base 2s and exponential, 5 attempts covers 62s total, matches the longest Stripe outage in the last 90 days (58s). Happy to bump to 8 if you want more headroom; adds 4 min max.</> },
        { name: 'Max', bot: false, initials: 'MA', time: '10:48', text: <>Fine, keep 5. Ship it.</> },
      ],
    },
    content_preview: {
      title: 'Onboarding copy v3 — three variants',
      product: 'Tessera',
      status: 'behind',
      blocking: false,
      artifact: <ContentPreviewArtifact />,
      reasoning: (
        <>
          <p><strong>Why v3:</strong> v2 tested at 31% "confused" on the post-signup survey. Feedback clustered around three things: the welcome illustration (too playful), the word "workspace" (no one knows what it means), and the length (too long).</p>
          <p>v3 drops the illustration entirely, replaces "workspace" with "shared email" in all instances, and cuts the page from 340 to 184 words. Tone matches the brand doc — precise, quiet, no exclamation points.</p>
        </>
      ),
      history: [
        { name: 'Rishi', bot: false, initials: 'RN', time: '11:02', anchor: '¶2', text: <>The "loud tools" line is good but it's implicitly negative. Wonder if we can make it more about what Tessera <em>is</em> than what competitors aren't.</> },
        { name: 'Agent RN', bot: true, initials: 'RN', time: '11:06', text: <>Fair. I'll draft a v3.1 with that paragraph reframed around focus and silence directly. Ready in 15 min.</> },
      ],
    },
    visual_comparison: {
      title: 'Inbox empty-state illustration revision',
      product: 'Tessera',
      status: 'healthy',
      blocking: false,
      artifact: <VisualComparisonArtifact />,
      reasoning: (
        <>
          <p><strong>Why revise:</strong> Rev B tested fine (current production) but pairs poorly with the new v3 onboarding copy — the illustration is visually loud right after we've told users Tessera is quiet.</p>
          <p>Rev C drops the illustration, replaces it with a small receipt-style card showing sample routed messages. Consistent with the rest of the inbox UI; reinforces "you don't set this up, you just watch it work."</p>
        </>
      ),
      history: [
        { name: 'Rishi', bot: false, initials: 'RN', time: '12:14', text: <>Prefer C. Matches the onboarding better and it's just more Tessera. Ship it.</> },
      ],
    },
    action_summary: {
      title: 'Deploy orbit-api v2.15.0 to production',
      product: 'Orbit',
      status: 'blocked',
      blocking: true,
      artifact: <ActionSummaryArtifact />,
      reasoning: (
        <>
          <p><strong>Why this deploy:</strong> bundles the approved webhook retry change (thread #r5) and a hotfix for a rate-limit header bug that's been generating one support ticket per day for three days.</p>
          <p>Canary gradient is 10 → 50 → 100 over 40 minutes with auto-rollback. Chose the 40-minute window based on our historical MTTD for this service (p95 = 11 min). Deploying outside business hours was considered and rejected — we want humans watching.</p>
          <p>Blocking on founder approval because this is a prod write to <code>orbit-api</code>, which our routing rules require a human for.</p>
        </>
      ),
      history: [
        { name: 'Agent KM', bot: true, initials: 'KM', time: '14:18', text: <>Staging smoke green. Ready when you are.</> },
      ],
    },
    data_metrics: {
      title: 'Pricing experiment variant B — 100% rollout',
      product: 'Orbit',
      status: 'blocked',
      blocking: true,
      artifact: <DataMetricsArtifact />,
      reasoning: (
        <>
          <p><strong>Why roll out now:</strong> 14 days of data, 48,210 visitors, Variant B wins by 3.1 pp on conversion and $7.10 on ARPU. Churn is flat. Confidence 97% with p &lt; 0.01.</p>
          <p>Lift concentrates in self-serve (source=web). Enterprise funnel is untouched — sales-assisted quotes continue on the existing flow. Existing paid plans are grandfathered; no customer sees a price increase.</p>
          <p>Recommending 100% rather than gradual ramp because the experiment is already at 50/50 — we have two weeks of prod data on the new price, not an unknown. Risk is upside not captured during a ramp.</p>
        </>
      ),
      history: [
        { name: 'Max', bot: false, initials: 'MA', time: '09:58', text: <>Did you segment by self-serve vs sales-assisted?</> },
        { name: 'Agent AR', bot: true, initials: 'AR', time: '10:02', text: <>Yes — enterprise funnel untouched. Variant B only applies to <code>source=web</code>. Split view attached to the artifact.</> },
        { name: 'Rishi', bot: false, initials: 'RN', time: '10:14', text: <>Copy on the pricing page needs a pass before we ship — current version says "unlimited workspaces" in three places. I'll take it.</> },
      ],
    },
  }[variant];

  return (
    <div className="main">
      <ReviewHeader title={data.title} product={data.product} status={data.status} blocking={data.blocking} />
      <div className="review-body">
        <Reasoning confidence={variant === 'data_metrics' ? 97 : variant === 'text_diff' ? 92 : variant === 'action_summary' ? 88 : 82}>
          {data.reasoning}
        </Reasoning>
        {data.artifact}
        {data.history.length > 0 && (
          <div>
            <div className="history-section-head">
              <span className="label">Conversation · {data.history.length}</span>
              <div className="line" />
            </div>
            {data.history.map((m, i) => (
              <ConvMsg key={i} name={m.name} bot={m.bot} initials={m.initials} time={m.time} anchor={m.anchor}>{m.text}</ConvMsg>
            ))}
          </div>
        )}
      </div>
      <Composer />
    </div>
  );
};

// ═════════ Chat thread ═════════
const ChatThreadDetail = () => (
  <div className="main">
    <div className="review-header" style={{ gap: 4 }}>
      <div className="rh-top">
        <StatusChip status="healthy" label="ADVISOR · ONLINE" />
        <span className="rh-title">Chief of Staff</span>
      </div>
      <div className="rh-actions" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="mono-sm">PERSISTENT THREAD · 142 MESSAGES · ALL FOUNDERS</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn-sec"><Icon name="plus" size={14} /> Start a task</button>
          <button className="btn-sec">Escalate</button>
          <button className="icon-btn"><Icon name="more" /></button>
        </div>
      </div>
    </div>
    <div className="review-body">
      <div className="history-section-head"><span className="label">Today · Thursday Apr 18</span><div className="line" /></div>
      <ConvMsg name="Chief of Staff" bot initials="CS" time="09:00">
        <p>Good morning. Three things routed to you overnight: the pricing rollout (AR, variant B, 14-day win at 97%), the orbit-api deploy (KM, canary ready), and the onboarding copy (RN, past SLA by 22m). All three have reasoning blocks up to date. Want me to draft quick summaries, or jump straight to the blocking items?</p>
      </ConvMsg>
      <ConvMsg name="Max" initials="MA" time="09:14">Jump to blocking. I'll pick up the copy thread after the standup.</ConvMsg>
      <div className="block-card" style={{ marginLeft: 44 }}>
        <div className="block-head" style={{ padding: '10px 14px' }}>
          <div className="block-head-left">
            <Icon name="chevronDown" size={14} />
            <span className="block-title" style={{ color: 'var(--primary)' }}>Chief of Staff · reasoning</span>
            <span className="block-subtitle">why these two were flagged blocking</span>
          </div>
        </div>
        <div className="block-body">
          <div className="reasoning-body">
            <p>Both trip the <code>prod-write-to-orbit-api</code> rule. Pricing change touches billing routes, deploy touches the service directly. Routing rule requires founder approval regardless of confidence. Agent AR sits at 97% confidence; Agent KM sits at 88% — the latter flagged a new migration path and dropped confidence deliberately.</p>
          </div>
        </div>
      </div>
      <ConvMsg name="Chief of Staff" bot initials="CS" time="09:15">
        <p>Got it. The pricing one is the clear-cut approval — strong data, small risk surface. The deploy has a wrinkle: KM added a schema dry-run last night that came back with zero changes, but they want you to eyeball the migration plan. I'd take pricing first, deploy second. Anything else?</p>
      </ConvMsg>
      <ConvMsg name="Max" initials="MA" time="09:18">Remind me what's on Q2 that we're deliberately not doing.</ConvMsg>
      <ConvMsg name="Chief of Staff" bot initials="CS" time="09:19">
        <p>Four things parked, per your own memo from Mar 14:</p>
        <p>(1) The Cursor-for-ourselves meta-tool idea. You wanted to see how the factory holds up for one more cycle before building <em>for</em> the factory.</p>
        <p>(2) Cross-product SSO. Loom doesn't have enough paid customers to make it worth the auth lift yet.</p>
        <p>(3) The mobile app for Tessera. Rishi's call — desktop-first until we hit $1M ARR on web.</p>
        <p>(4) Hiring a fifth founder. Explicitly no until end of Q2.</p>
        <p>Want me to pull any of these back into active discussion?</p>
      </ConvMsg>
    </div>
    <Composer placeholder="Ask Chief of Staff anything…" />
  </div>
);

// ═════════ Empty state ═════════
const EmptyConversationsMain = () => (
  <div className="main">
    <div className="empty-state">
      <div className="empty-state-glyph">
        <Icon name="check" size={32} />
      </div>
      <div className="empty-state-title">Inbox zero — nice work.</div>
      <div className="empty-state-body">
        Nothing is blocking you and every agent proposal has a decision. Take a walk, write a pitch, or open Chief of Staff for a strategic chat.
      </div>
      <div className="empty-state-meta">
        <KeyValue label="Reviews cleared today" value="14" />
        <KeyValue label="Avg review time" value="6m 20s" />
        <KeyValue label="Next SLA" value="none active" />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn-sec"><Icon name="sparkle" size={14} /> Open Chief of Staff</button>
        <button className="btn-sec"><Icon name="plus" size={14} /> Write a pitch</button>
      </div>
    </div>
  </div>
);

Object.assign(window, {
  V2_THREADS,
  ConversationsSubmenuV2,
  ReviewThreadDetail,
  ChatThreadDetail,
  EmptyConversationsMain,
});
