// views.jsx — The four main views + the Rail

// ═════════ Conversations View ═════════

const ConversationsSubmenu = ({ selectedId, onSelect, filter, setFilter }) => {
  const filters = ['All', 'Needs review', 'Mentions', 'Following'];
  const filtered = filter === 'Needs review'
    ? THREADS.filter(t => t.needsReview)
    : filter === 'Mentions'
      ? THREADS.filter(t => !t.bot)
      : THREADS;
  const reviewCount = THREADS.filter(t => t.needsReview).length;
  return (
    <>
      <div className="submenu-header">
        <div className="submenu-title">
          <span>Conversations</span>
          <span className="count">{filtered.length}</span>
        </div>
        <SearchField placeholder="Search threads" shortcut="⌘K" />
      </div>
      <div className="submenu-filters">
        {filters.map(f => (
          <button
            key={f}
            className="tag"
            onClick={() => setFilter(f)}
            style={filter === f ? { background: 'var(--primary-dim)', color: 'var(--primary)' } : {}}
          >
            {f}{f === 'Needs review' ? ` · ${reviewCount}` : ''}
          </button>
        ))}
      </div>
      <div className="submenu-list">
        <div className="submenu-list-group"><span>Routed to you</span><span>3</span></div>
        {filtered.slice(0, 3).map(t => (
          <ThreadRow key={t.id} {...t} selected={selectedId === t.id} onClick={() => onSelect(t.id)} />
        ))}
        <div className="submenu-list-group"><span>Team</span><span>{filtered.length - 3}</span></div>
        {filtered.slice(3).map(t => (
          <ThreadRow key={t.id} {...t} selected={selectedId === t.id} onClick={() => onSelect(t.id)} />
        ))}
      </div>
    </>
  );
};

const ReviewThread = ({ thread }) => (
  <>
    <div className="thread-header">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Tag variant="product">Orbit</Tag>
        <StatusChip status="healthy" />
        <span className="mono-sm">APPROVAL NEEDED</span>
      </div>
      <h1 className="thread-title">{thread.title}</h1>
      <div className="thread-subtitle">{thread.subtitle}</div>
    </div>
    <div className="thread-meta-grid">
      {thread.meta.map(m => <KeyValue key={m.label} label={m.label} value={m.value} />)}
    </div>
    <div className="messages">
      {thread.messages.map(m => (
        <div key={m.id} className="msg">
          <Avatar initials={m.initials} bot={m.bot} size="md" />
          <div className="msg-body">
            <div className="msg-head">
              <span className={`msg-name ${m.bot ? 'bot' : ''}`}>{m.author}</span>
              <span className="msg-time">{m.time}</span>
            </div>
            <div className="msg-text">
              {m.body.map((b, i) => <p key={i}>{b.text}</p>)}
            </div>
            {m.proposal && (
              <div className="proposal">
                <div className="proposal-head">
                  <span className="proposal-title">{m.proposal.title}</span>
                  <Tag variant="kind">PROPOSAL</Tag>
                </div>
                <div className="proposal-grid">
                  {m.proposal.grid.map(g => <KeyValue key={g.label} label={g.label} value={g.value} />)}
                </div>
                <div className="diff-block">
                  {m.proposal.diff.map((d, i) => <div key={i} className={d.kind}>{d.text}</div>)}
                </div>
                <div className="proposal-actions">
                  <button className="btn-ghost">Request changes</button>
                  <button className="btn-ghost">Comment</button>
                  <button className="btn-primary">Approve &amp; roll out</button>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
    <div className="composer">
      <textarea placeholder="Reply, or type / for commands…" />
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
  </>
);

// ═════════ Work view ═════════

const WorkSubmenu = ({ subview, setSubview }) => (
  <>
    <div className="submenu-header">
      <div className="submenu-title">
        <span>Work</span>
        <button className="btn-ghost" style={{ height: 20, padding: '2px 4px' }}><Icon name="plus" size={14} /></button>
      </div>
      <SearchField placeholder="Search bets, tasks" shortcut="⌘K" />
    </div>
    <div className="submenu-list">
      <div className="submenu-list-group"><span>Views</span></div>
      <NavItem icon="layers" label="Bets canvas" selected={subview === 'bets'} onClick={() => setSubview('bets')} />
      <NavItem icon="panel" label="Task kanban" selected={subview === 'tasks'} onClick={() => setSubview('tasks')} count={TASKS.todo.length + TASKS.doing.length + TASKS.review.length} />
      <NavItem icon="sparkle" label="Pitches" selected={subview === 'pitches'} onClick={() => setSubview('pitches')} count={PITCHES.length} />
      <div className="submenu-list-group"><span>Products</span></div>
      <NavItem label="Orbit" count="12" />
      <NavItem label="Tessera" count="8" />
      <NavItem label="Loom" count="5" />
      <NavItem label="Portfolio" count="3" />
    </div>
  </>
);

const WorkMain = ({ subview }) => {
  if (subview === 'tasks') {
    const columns = [
      { key: 'todo', label: 'Backlog', status: 'paused', items: TASKS.todo },
      { key: 'doing', label: 'In progress', status: 'healthy', items: TASKS.doing },
      { key: 'review', label: 'Review', status: 'behind', items: TASKS.review },
      { key: 'done', label: 'Done', status: 'done', items: TASKS.done },
    ];
    return (
      <div style={{ padding: '20px 20px 24px 20px', height: '100%' }}>
        <div className="kanban">
          {columns.map(col => (
            <div className="kanban-col" key={col.key}>
              <div className="kanban-col-head">
                <div className="kanban-col-title">
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{col.label}</span>
                  <span className="mono-sm">{col.items.length}</span>
                </div>
                <button className="btn-ghost"><Icon name="plus" size={14} /></button>
              </div>
              <div className="kanban-col-list">
                {col.items.map(t => <TaskCard key={t.id} {...t} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (subview === 'pitches') {
    return (
      <div style={{ padding: '20px 20px 40px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Pitch selector — Q2 cycle</h2>
          <button className="btn-primary"><Icon name="plus" size={14} /> New pitch</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {PITCHES.map(p => <PitchCard key={p.id} {...p} />)}
        </div>
      </div>
    );
  }
  // bets canvas
  return (
    <div style={{ padding: '20px 20px 40px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Bets — 6W cycle, week 4 of 6</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-sec"><Icon name="filter" size={14} /> Filter</button>
          <button className="btn-primary"><Icon name="plus" size={14} /> New bet</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {BETS.map(b => <BetCard key={b.id} {...b} progressTone={b.tone} />)}
      </div>
    </div>
  );
};

// ═════════ Knowledge view ═════════

const KnowledgeSubmenu = ({ selectedId, onSelect }) => (
  <>
    <div className="submenu-header">
      <div className="submenu-title">
        <span>Knowledge</span>
        <button className="btn-ghost" style={{ height: 20, padding: '2px 4px' }}><Icon name="plus" size={14} /></button>
      </div>
      <SearchField placeholder="Search knowledge" shortcut="⌘K" />
    </div>
    <div className="submenu-filters">
      {['All', 'Principles', 'Process', 'Product', 'Strategy'].map((c, i) => (
        <button key={c} className="tag" style={i === 0 ? { background: 'var(--primary-dim)', color: 'var(--primary)' } : {}}>{c}</button>
      ))}
    </div>
    <div className="submenu-list">
      {KNOWLEDGE.map(k => (
        <div key={k.id} className={`navitem ${selectedId === k.id ? 'selected' : ''}`} onClick={() => onSelect(k.id)}>
          <span className="navitem-label">{k.title}</span>
        </div>
      ))}
    </div>
  </>
);

const KnowledgeMain = ({ selectedId, onSelect }) => (
  <div style={{ padding: '20px 20px 40px 20px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>Knowledge · Principles</h2>
      <button className="btn-primary"><Icon name="plus" size={14} /> New article</button>
    </div>
    <div style={{ background: 'var(--s2)', borderRadius: 'var(--r2)', padding: 4 }}>
      {KNOWLEDGE.map(k => (
        <KnowledgeRow key={k.id} {...k} selected={selectedId === k.id} onClick={() => onSelect(k.id)} />
      ))}
    </div>
  </div>
);

// ═════════ Settings view ═════════

const SettingsSubmenu = ({ section, setSection }) => (
  <>
    <div className="submenu-header">
      <div className="submenu-title"><span>Settings</span></div>
    </div>
    <div className="submenu-list">
      <div className="submenu-list-group"><span>Workspace</span></div>
      <NavItem icon="user" label="Team" selected={section === 'team'} onClick={() => setSection('team')} />
      <NavItem icon="lock" label="Security" selected={section === 'security'} onClick={() => setSection('security')} />
      <NavItem icon="dollar" label="Billing" selected={section === 'billing'} onClick={() => setSection('billing')} />
      <div className="submenu-list-group"><span>Factory</span></div>
      <NavItem icon="sparkle" label="Agents" selected={section === 'agents'} onClick={() => setSection('agents')} count="6" />
      <NavItem icon="layers" label="Products" selected={section === 'products'} onClick={() => setSection('products')} count="4" />
      <NavItem icon="book" label="Routing rules" selected={section === 'routing'} onClick={() => setSection('routing')} />
    </div>
  </>
);

const SettingsMain = ({ section }) => (
  <div style={{ padding: '20px 20px 40px 20px' }}>
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, textTransform: 'capitalize' }}>{section}</h2>
      <div style={{ fontSize: 13, color: 'var(--t-mid)', marginTop: 4 }}>Configure how the factory routes work to founders.</div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
      {[
        { label: 'Active agents', value: '6' },
        { label: 'Founders', value: '3' },
        { label: 'Products', value: '4' },
        { label: 'Reviews routed / week', value: '142' },
      ].map(x => (
        <div key={x.label} style={{ background: 'var(--s2)', borderRadius: 4, padding: 16 }}>
          <KeyValue label={x.label} value={x.value} />
        </div>
      ))}
    </div>
  </div>
);

// ═════════ Rail (right) ═════════

const Rail = ({ expanded, setExpanded }) => {
  if (!expanded) {
    const blockedCount = NOTIFICATIONS.blocked.length;
    const costCount = NOTIFICATIONS.cost.length;
    const unreadCount = NOTIFICATIONS.unread.length;
    return (
      <aside className="rail collapsed">
        <div className="rail-collapsed-inner">
          <button className="rail-icon-btn" title="Blocked" onClick={() => setExpanded(true)}>
            <Icon name="block" />
            <span className="count-badge">{blockedCount}</span>
          </button>
          <button className="rail-icon-btn" title="Cost" onClick={() => setExpanded(true)}>
            <Icon name="cost" />
            <span className="count-badge warn">{costCount}</span>
          </button>
          <button className="rail-icon-btn" title="Unread" onClick={() => setExpanded(true)}>
            <Icon name="unread" />
            <span className="count-badge primary">{unreadCount}</span>
          </button>
        </div>
      </aside>
    );
  }
  return (
    <aside className="rail expanded">
      <div className="rail-expanded-inner">
        <div className="rail-expanded-header">
          <span className="rail-expanded-title">Rail</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn-ghost" title="Mark all read"><Icon name="check" size={14} /></button>
            <button className="btn-ghost" onClick={() => setExpanded(false)} title="Collapse"><Icon name="close" size={14} /></button>
          </div>
        </div>
        <div className="rail-search-wrap">
          <SearchField placeholder="Filter notifications" shortcut="⌘J" />
        </div>
        <div className="rail-groups">
          <div className="rail-group-label">
            <span className="mono"><span style={{ color: 'var(--danger)' }}>●</span>&nbsp;&nbsp;BLOCKED · {NOTIFICATIONS.blocked.length}</span>
            <span className="mono-sm">SLA</span>
          </div>
          {NOTIFICATIONS.blocked.map(n => <NotificationRow key={n.id} {...n} />)}
          <div className="rail-group-label">
            <span className="mono"><span style={{ color: 'var(--warn)' }}>●</span>&nbsp;&nbsp;COST · {NOTIFICATIONS.cost.length}</span>
            <span className="mono-sm">CYCLE</span>
          </div>
          {NOTIFICATIONS.cost.map(n => <NotificationRow key={n.id} {...n} />)}
          <div className="rail-group-label">
            <span className="mono"><span style={{ color: 'var(--primary)' }}>●</span>&nbsp;&nbsp;UNREAD · {NOTIFICATIONS.unread.length}</span>
            <span className="mono-sm">24H</span>
          </div>
          {NOTIFICATIONS.unread.map(n => <NotificationRow key={n.id} {...n} />)}
        </div>
      </div>
    </aside>
  );
};

Object.assign(window, {
  ConversationsSubmenu, ReviewThread,
  WorkSubmenu, WorkMain,
  KnowledgeSubmenu, KnowledgeMain,
  SettingsSubmenu, SettingsMain,
  Rail,
});
