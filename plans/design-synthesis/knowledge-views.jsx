// knowledge-views.jsx — Knowledge view components

// ═════════ Kind + Status tag helpers ═════════

const KindTag = ({ kind }) => {
  const labels = {
    pattern: 'Pattern', anti_pattern: 'Anti-pattern', decision: 'Decision',
    failure: 'Failure', brief: 'Brief', principle: 'Principle',
    reflection: 'Reflection', focus: 'Focus', constitution: 'Constitution',
  };
  return <span className={`ktag ${kind}`}>{labels[kind] || kind}</span>;
};

const StatusTag = ({ status }) => {
  const labels = {
    captured: 'Captured', provisional: 'Provisional', active: 'Active',
    stale: 'Stale', archived: 'Archived',
  };
  return (
    <span className={`stag ${status}`}>
      <span className="stag-dot" />
      {labels[status] || status}
    </span>
  );
};

// ═════════ Submenu — scope + topic browser ═════════

const KnowledgeSubmenuV2 = ({ scope, setScope, selectedTopic, setSelectedTopic, quickFilter, setQuickFilter }) => {
  const topics = KB_SCOPES[scope].topics;
  return (
    <>
      <div className="submenu-header">
        <div className="submenu-title">
          <span>Knowledge</span>
          <button className="btn-ghost" style={{ height: 20, padding: '2px 4px' }}><Icon name="plus" size={14} /></button>
        </div>
        <SearchField placeholder="Search knowledge" shortcut="⌘K" />
      </div>

      <div className="scope-seg">
        {Object.entries(KB_SCOPES).map(([k, v]) => (
          <button key={k} className={scope === k ? 'active' : ''} onClick={() => setScope(k)}>
            {v.label}
          </button>
        ))}
      </div>

      <div className="submenu-subhead">
        <span className="submenu-subhead-label">{scope === 'practice' ? 'Practices' : scope === 'product' ? 'Products' : 'Sections'}</span>
        <span className="mono-sm">{topics.length}</span>
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: '0 0 8px 0' }}>
        {topics.map(t => (
          <div
            key={t.id}
            className={`topic-item ${selectedTopic === t.id ? 'selected' : ''}`}
            onClick={() => { setSelectedTopic(t.id); setQuickFilter(null); }}
          >
            <span className={`topic-dot ${t.health}`} />
            <span className="topic-item-name">{t.name}</span>
            {t.stale > 0 && <span className="topic-item-stale">{t.stale} stale</span>}
            <span className="topic-item-count">{t.items}</span>
          </div>
        ))}

        {scope === 'practice' && selectedTopic === 'building' && (
          <>
            <div className="submenu-subhead" style={{ marginTop: 8 }}>
              <span className="submenu-subhead-label">Building · Topics</span>
              <span className="mono-sm">{KB_SCOPES.practice.topics[0].subtopics.length}</span>
            </div>
            {KB_SCOPES.practice.topics[0].subtopics.map(s => (
              <div
                key={s.id}
                className={`topic-item ${selectedTopic === s.id ? 'selected' : ''}`}
                style={{ marginLeft: 10 }}
                onClick={() => setSelectedTopic(s.id)}
              >
                <span className={`topic-dot ${s.health}`} />
                <span className="topic-item-name">{s.name}</span>
                {s.stale > 0 && <span className="topic-item-stale">{s.stale}</span>}
                <span className="topic-item-count">{s.items}</span>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="quick-filters">
        <div className="submenu-subhead">
          <span className="submenu-subhead-label">Quick filters</span>
        </div>
        {[
          { k: 'drafts', label: 'Drafts',  count: 4 },
          { k: 'curated',label: 'Curated', count: 134 },
          { k: 'stale',  label: 'Stale',   count: 10 },
          { k: 'archive',label: 'Archive', count: 82 },
        ].map(f => (
          <div
            key={f.k}
            className={`quick-filter-item ${quickFilter === f.k ? 'selected' : ''}`}
            style={quickFilter === f.k ? { background: 'var(--s4)', color: 'var(--t-high)' } : {}}
            onClick={() => { setQuickFilter(f.k); }}
          >
            <span>{f.label}</span>
            <span className="quick-filter-count">{f.count}</span>
          </div>
        ))}
      </div>
    </>
  );
};

// ═════════ Topbar + subbar ═════════

const KnowledgeTopbar = ({ title, subtitle, view, setView, curatedCount, triageCount, rightChildren }) => (
  <>
    <div className="kb-topbar">
      <div className="kb-topbar-left">
        <Breadcrumb items={['Knowledge', 'Practice', 'Building']} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 4 }}>
          <span className="kb-topbar-title">{title}</span>
          {subtitle && <span className="kb-topbar-sub">{subtitle}</span>}
        </div>
      </div>
      {rightChildren || (
        <div className="kb-view-seg">
          <button className={view === 'curated' ? 'active' : ''} onClick={() => setView('curated')}>
            Curated <span className="count-inline">{curatedCount}</span>
          </button>
          <button className={view === 'triage' ? 'active' : ''} onClick={() => setView('triage')}>
            Triage <span className="count-inline">{triageCount}</span>
          </button>
        </div>
      )}
    </div>
  </>
);

const KnowledgeSubbar = ({ sort, setSort }) => (
  <div className="kb-subbar">
    <div className="kb-search-large">
      <Icon name="search" size={14} />
      <input placeholder="Search within Building — full-text + kind + status filters…" />
      <span className="kbd" style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t-low)', letterSpacing: '0.05em', background: 'var(--ghost)', padding: '1px 5px', borderRadius: 2 }}>⌘K</span>
    </div>
    <div className="kb-sort">
      {[
        ['date', 'Last edited'],
        ['access', 'Most accessed'],
        ['score', 'Attention score'],
      ].map(([k, label]) => (
        <button key={k} className={sort === k ? 'active' : ''} onClick={() => setSort(k)}>{label}</button>
      ))}
    </div>
    <button className="btn-primary"><Icon name="plus" size={14} /> New</button>
  </div>
);

// ═════════ DELIVERABLE 1 — Curated list, Building practice ═════════

const KnowledgeListCurated = ({ onOpenDetail }) => {
  const [sort, setSort] = React.useState('date');
  const [collapsed, setCollapsed] = React.useState({});
  const topics = [
    { id: 'auth', ...KB_BUILDING.auth },
    { id: 'caching', ...KB_BUILDING.caching },
    { id: 'testing', ...KB_BUILDING.testing },
  ];

  return (
    <>
      <KnowledgeTopbar
        title="Building"
        subtitle="42 items · 8 topics · 3 stale"
        view="curated"
        setView={() => {}}
        curatedCount={42}
        triageCount={6}
      />
      <KnowledgeSubbar sort={sort} setSort={setSort} />
      <div className="kb-body">
        {topics.map(t => {
          const open = !collapsed[t.id];
          return (
            <div key={t.id} className={`topic-section ${open ? '' : 'collapsed'}`}>
              <div className="topic-section-head" onClick={() => setCollapsed(c => ({ ...c, [t.id]: open }))}>
                <div className="topic-section-head-left">
                  <Icon name="chevronDown" size={14} className="topic-section-chevron" />
                  <span className="topic-section-title">{t.name}</span>
                  <span className="topic-section-count">{t.count} items</span>
                </div>
                <div className="topic-section-meta">
                  {t.stale > 0 && <span className="stale">{t.stale} stale</span>}
                  <span>4 active · 1 provisional</span>
                </div>
              </div>
              {open && (
                <div className="topic-section-body">
                  {t.items.map(it => (
                    <div
                      key={it.id}
                      className={`kbrow-v2 status-${it.status} ${it.id === 'kb-c1' ? 'selected' : ''}`}
                      onClick={() => onOpenDetail(it.id)}
                    >
                      <div className="kbrow-v2-main">
                        <div className="kbrow-v2-title">{it.title}</div>
                        <div className="kbrow-v2-preview">{it.preview}</div>
                      </div>
                      <KindTag kind={it.kind} />
                      <StatusTag status={it.status} />
                      <span className="kbrow-v2-time">{it.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Knowledge gap indicator */}
        <div className="gap-card">
          <div className="gap-card-icon">
            <Icon name="alert" size={18} />
          </div>
          <div className="gap-card-body">
            <div className="gap-card-label">KNOWLEDGE GAP</div>
            <div className="gap-card-title">No active items in <em style={{ fontStyle: 'normal', color: 'var(--primary)' }}>API shape</em></div>
            <div className="gap-card-text">This topic has zero items yet 3 agent proposals reference it this cycle. Capture a pattern or decision to anchor future work.</div>
          </div>
          <button className="btn-sec">Start a note</button>
        </div>
      </div>
    </>
  );
};

// ═════════ DELIVERABLE 2 — Triage view ═════════

const KnowledgeListTriage = ({ onOpenDetail }) => {
  const [sort, setSort] = React.useState('score');
  return (
    <>
      <KnowledgeTopbar
        title="Building · Triage"
        subtitle="6 items need attention · weekly curation"
        view="triage"
        setView={() => {}}
        curatedCount={42}
        triageCount={6}
      />
      <KnowledgeSubbar sort={sort} setSort={setSort} />
      <div className="kb-body">
        {/* Suggestion card */}
        <div className="suggestion-card">
          <div className="suggestion-icon"><Icon name="sparkle" size={16} /></div>
          <div className="suggestion-body">
            <div className="suggestion-head">
              <span className="suggestion-label">✧ CURATION SUGGESTION</span>
              <span className="mono-sm">from FN · 6h ago</span>
            </div>
            <div className="suggestion-title">{KB_SUGGESTION.title}</div>
            <div className="suggestion-text">
              {KB_SUGGESTION.text}
              <span style={{ display: 'inline-block', marginTop: 8, marginLeft: 0 }}>
                {KB_SUGGESTION.refs.map(r => <span key={r} className="suggestion-ref">{r}</span>)}
              </span>
            </div>
          </div>
          <div className="suggestion-actions">
            <button className="btn-ghost">Dismiss</button>
            <button className="btn-primary">Execute merge →</button>
          </div>
        </div>

        {/* Triage list */}
        <div className="topic-section">
          <div className="topic-section-head" style={{ cursor: 'default' }}>
            <div className="topic-section-head-left">
              <span className="topic-section-title">Needs attention</span>
              <span className="topic-section-count">{KB_TRIAGE.length} items · sorted by score</span>
            </div>
            <div className="topic-section-meta">
              <span className="mono-sm">WEEKLY CURATION</span>
            </div>
          </div>
          <div className="topic-section-body">
            {KB_TRIAGE.map(it => (
              <div
                key={it.id}
                className={`kbrow-v2 status-${it.status}`}
                style={{ gridTemplateColumns: '48px 1fr 130px 120px 80px' }}
                onClick={() => onOpenDetail(it.id)}
              >
                <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: it.score > 80 ? 'var(--danger)' : it.score > 70 ? 'var(--warn)' : 'var(--t-mid)', textAlign: 'left' }}>{it.score}</span>
                <div className="kbrow-v2-main">
                  <div className="kbrow-v2-title">{it.title}</div>
                  <div className="kbrow-v2-preview">
                    <span className="mono-sm" style={{ marginRight: 8, color: 'var(--t-low)' }}>{it.topic.toUpperCase()}</span>
                    {it.reason}
                  </div>
                </div>
                <KindTag kind={it.kind} />
                <StatusTag status={it.status} />
                <span className="kbrow-v2-time">{it.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

// ═════════ Markdown-ish renderer ═════════

const MarkdownBody = ({ body, className = '' }) => (
  <div className={`kb-body-mdx ${className}`}>
    {body.map((b, i) => {
      if (b.type === 'h2') return <h2 key={i}>{b.text}</h2>;
      if (b.type === 'h3') return <h3 key={i}>{b.text}</h3>;
      if (b.type === 'p') return <p key={i}>{b.text}</p>;
      if (b.type === 'ul') return <ul key={i}>{b.items.map((x, j) => <li key={j}>{x}</li>)}</ul>;
      if (b.type === 'ol') return <ol key={i}>{b.items.map((x, j) => <li key={j}>{x}</li>)}</ol>;
      if (b.type === 'pre') return <pre key={i}><code>{b.code}</code></pre>;
      if (b.type === 'blockquote') return <blockquote key={i}>{b.text}</blockquote>;
      return null;
    })}
  </div>
);

// ═════════ DELIVERABLE 3 — Knowledge detail (view mode) ═════════

const KnowledgeDetail = ({ item, editMode = false, onBack, onToggleEdit, onOpenMerge }) => {
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [obsOpen, setObsOpen] = React.useState(true);
  return (
    <div className="kb-detail">
      <div className="kb-detail-main">
        {editMode && (
          <div className="edit-toolbar">
            <button title="Heading"><span style={{ fontSize: 13, fontWeight: 700 }}>H</span></button>
            <button title="Bold"><span style={{ fontSize: 13, fontWeight: 700 }}>B</span></button>
            <button title="Italic"><span style={{ fontSize: 13, fontStyle: 'italic' }}>I</span></button>
            <div className="tool-divider" />
            <button title="Unordered list"><span style={{ fontSize: 13 }}>•</span></button>
            <button title="Ordered list"><span style={{ fontSize: 13 }}>1.</span></button>
            <button title="Quote"><span style={{ fontSize: 13 }}>&ldquo;</span></button>
            <div className="tool-divider" />
            <button title="Code"><span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>&lt;/&gt;</span></button>
            <button title="Link"><Icon name="paperclip" size={13} /></button>
            <span className="save-state">● SAVED 2s AGO</span>
            <button className="btn-sec" onClick={onToggleEdit}>Done editing</button>
          </div>
        )}

        <div className="kb-detail-header">
          <Breadcrumb items={['Knowledge', item.scope, item.topic, item.title]} />
          <h1
            className={`kb-detail-title ${editMode ? 'editing' : ''}`}
            contentEditable={editMode}
            suppressContentEditableWarning
          >{item.title}</h1>
        </div>

        <div className="kb-meta-bar">
          <div className="meta-group">
            <span className="meta-label">Kind</span>
            <KindTag kind={item.kind} />
          </div>
          <div className="meta-group">
            <span className="meta-label">Status</span>
            <StatusTag status={item.status} />
          </div>
          <div className="meta-group">
            <span className="meta-label">Topic</span>
            <span className="meta-value" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {item.topic} <Icon name="chevronDown" size={12} />
            </span>
          </div>
          <div className="meta-group">
            <span className="meta-label">Confidence · {Math.round(item.confidence * 100)}%</span>
            <div className="confidence-bar">
              <div className="confidence-bar-fill" style={{ width: `${item.confidence * 100}%` }} />
            </div>
          </div>
          <div className="meta-group">
            <span className="meta-label">Last edited</span>
            <span className="meta-value">{item.lastEdited} · {item.editor}</span>
          </div>
          <div className="meta-group">
            <span className="meta-label">Access</span>
            <span className="meta-value">{item.access} reads · {item.origin}</span>
          </div>
        </div>

        <div className="kb-action-bar">
          {!editMode && <button className="btn-sec" onClick={onToggleEdit}>Edit</button>}
          <button className="btn-ghost">Flag</button>
          <button className="btn-ghost" onClick={onOpenMerge}>Merge</button>
          <button className="btn-ghost">Split</button>
          <button className="btn-ghost">Move</button>
          <div className="spacer" />
          <button className="btn-ghost" onClick={onBack}>← Back to list</button>
          <button className="btn-ghost" style={{ color: 'var(--danger)' }}>Archive</button>
        </div>

        <MarkdownBody body={item.body} className={editMode ? 'editing' : ''} />

        {/* Observation logs */}
        <div className="obs-logs">
          <div className="obs-logs-head" onClick={() => setObsOpen(o => !o)}>
            <span className="obs-logs-title">Observation logs · {item.observations.length} · facilitator agent FN</span>
            <Icon name={obsOpen ? 'chevronDown' : 'chevronRight'} size={14} />
          </div>
          {obsOpen && (
            <div className="obs-logs-body">
              {item.observations.map((o, i) => (
                <div key={i} className="obs-log-entry">
                  <div className="obs-avatar">{o.agent}</div>
                  <div>{o.text}</div>
                  <span className="mono-sm">{o.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Edit history */}
        <div className="history-card">
          <div className="history-head" onClick={() => setHistoryOpen(h => !h)}>
            <span className="history-title">Edit history · {item.history.length} changes</span>
            <Icon name={historyOpen ? 'chevronDown' : 'chevronRight'} size={14} />
          </div>
          {historyOpen && (
            <div className="history-list">
              {item.history.map((h, i) => (
                <div key={i} className="history-row">
                  <span className="history-time">{h.time}</span>
                  <div className="history-avatar">{h.who.replace('Agent ', '')}</div>
                  <span className="history-body">{h.change}</span>
                  <span className="history-diff">{h.diff}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Related sidebar */}
      <aside className="kb-detail-aside">
        <div>
          <div className="aside-section-head">
            <span>Related · auto-suggested</span>
            <span className="mono-sm">{item.related.length}</span>
          </div>
          <div className="aside-list">
            {item.related.map(r => (
              <div key={r.id} className="aside-item">
                <span className="aside-item-title">{r.title}</span>
                <div className="aside-item-meta">
                  <KindTag kind={r.kind} />
                  <span className="aside-item-score">{Math.round(r.score * 100)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="aside-section-head">
            <span>Linked · manual</span>
            <button className="btn-ghost" style={{ padding: '2px 6px' }}><Icon name="plus" size={12} /> Link</button>
          </div>
          <div className="aside-list">
            {item.linked.map(l => (
              <div key={l.id} className="aside-item">
                <span className="aside-item-title">{l.title}</span>
                <div className="aside-item-meta">
                  <span className="mono-sm">{l.kind}</span>
                  <span style={{ color: 'var(--t-low)' }}>{l.id}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 'auto', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--t-low)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Confidence model · FN-v3 · updated {item.lastEdited}
        </div>
      </aside>
    </div>
  );
};

// ═════════ DELIVERABLE 5 — Merge modal ═════════

const MergeModal = ({ item, onClose }) => {
  const [selectedSourceId, setSelectedSourceId] = React.useState('kb-a2');
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">Merge into &ldquo;{item.title}&rdquo;</div>
            <div className="modal-sub">Select a source — contents merge into this item; the source becomes an archived redirect.</div>
          </div>
          <button className="btn-ghost" onClick={onClose}><Icon name="close" size={14} /></button>
        </div>

        <div className="modal-body">
          <div className="modal-source-list">
            <div className="aside-section-head" style={{ padding: '0 4px 8px' }}>
              <span>Same-topic candidates</span>
              <span className="mono-sm">{KB_MERGE_SOURCES.length}</span>
            </div>
            {KB_MERGE_SOURCES.map(s => (
              <div
                key={s.id}
                className={`modal-source-item ${selectedSourceId === s.id ? 'selected' : ''}`}
                onClick={() => setSelectedSourceId(s.id)}
              >
                <div className="modal-source-title">{s.title}</div>
                <div className="modal-source-meta">
                  <KindTag kind={s.kind} />
                  <span>· {s.time}</span>
                  <span>· {s.access} reads</span>
                </div>
              </div>
            ))}
          </div>

          <div className="modal-preview">
            <div className="diff-head">
              <span style={{ color: 'var(--primary)' }}>A · current</span>
              <span>+</span>
              <span style={{ color: 'var(--ok)' }}>B · selected</span>
              <span>→</span>
              <span style={{ color: 'var(--t-high)' }}>PREVIEW</span>
            </div>

            <div style={{ background: 'var(--s3)', borderRadius: 'var(--r2)', padding: '14px 16px' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t-high)', marginBottom: 10 }}>{KB_MERGE_PREVIEW.title}</div>
              {KB_MERGE_PREVIEW.lines.map((ln, i) => (
                <div key={i} className={`diff-merge-line from-${ln.side.toLowerCase()}`}>
                  <span className="side">{ln.side}</span>
                  <span className="content">{ln.content}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12, color: 'var(--t-mid)', lineHeight: 1.55 }}>
              <strong style={{ color: 'var(--t-high)' }}>After merge:</strong> &ldquo;Never store refresh tokens in localStorage&rdquo; archives with a redirect to &ldquo;Cache at the edge…&rdquo;. All 4 inbound references rewrite automatically. Edit history is concatenated.
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <span className="mono-sm">2 ITEMS · 1 REDIRECT CREATED</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn-sec">Save as draft</button>
            <button className="btn-primary"><Icon name="check" size={14} /> Confirm merge</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═════════ DELIVERABLE 6 — Factory scope ═════════

const FactoryScope = ({ onOpenDetail }) => (
  <>
    <div className="kb-topbar">
      <div className="kb-topbar-left">
        <Breadcrumb items={['Knowledge', 'Factory', 'First principles']} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 4 }}>
          <span className="kb-topbar-title">Factory</span>
          <span className="kb-topbar-sub">The constitution · 12 items total · changes reshape every agent</span>
        </div>
      </div>
      <button className="btn-sec">Request amendment</button>
    </div>

    <div className="kb-body" style={{ gap: 20 }}>
      <div className="constitution-intro">
        <span className="constitution-intro-label">§ FIRST PRINCIPLES · 6 ARTICLES</span>
        <span className="constitution-intro-title">How this factory makes decisions.</span>
        <span className="constitution-intro-text">
          These are the rules every agent checks against before proposing work. Amendments pass only by unanimous founder approval. Any item here outweighs practice-level patterns it contradicts.
        </span>
        <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
          <KeyValue label="Ratified" value="Feb 04, 2025" />
          <KeyValue label="Last amended" value="Mar 03, 2025" />
          <KeyValue label="Amendments / year" value="< 4 target" />
        </div>
      </div>

      <div className="constitution-list">
        {FACTORY_CONSTITUTION.map((c, i) => (
          <div key={i} className="constitution-row" onClick={onOpenDetail}>
            <span className="constitution-number">{c.number}</span>
            <div>
              <div className="constitution-title">{c.title}</div>
              <div className="constitution-preview">{c.preview}</div>
              <div className="constitution-meta">
                <KindTag kind={c.kind} />
                <StatusTag status="active" />
                <span className="dot-sep">·</span>
                <span>RATIFIED {c.time.toUpperCase()}</span>
                <span className="dot-sep">·</span>
                <span>UNANIMOUS · 3/3 FOUNDERS</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </>
);

// ═════════ DELIVERABLE 7 — Empty state ═════════

const EmptyTopic = ({ topic = 'API shape' }) => (
  <>
    <div className="kb-topbar">
      <div className="kb-topbar-left">
        <Breadcrumb items={['Knowledge', 'Practice', 'Building', topic]} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 4 }}>
          <span className="kb-topbar-title">{topic}</span>
          <span className="kb-topbar-sub" style={{ color: 'var(--danger)' }}>KNOWLEDGE GAP · 0 active items</span>
        </div>
      </div>
      <button className="btn-primary"><Icon name="plus" size={14} /> New item</button>
    </div>
    <div className="kb-body">
      <div className="gap-card" style={{ padding: '22px 24px' }}>
        <div className="gap-card-icon"><Icon name="alert" size={20} /></div>
        <div className="gap-card-body">
          <div className="gap-card-label">KNOWLEDGE GAP</div>
          <div className="gap-card-title" style={{ fontSize: 15 }}>No items in {topic}</div>
          <div className="gap-card-text">
            3 agent proposals this cycle reference &ldquo;API shape&rdquo; without a canonical item. Capture the first pattern or decision to anchor future work. The gap indicator clears when at least one item reaches <em style={{ fontStyle: 'normal', color: 'var(--ok)' }}>active</em>.
          </div>
        </div>
      </div>

      <div className="empty-topic-card">
        <div className="empty-topic-icon" style={{ background: 'var(--primary-dim)', color: 'var(--primary)' }}>
          <Icon name="book" size={22} />
        </div>
        <div className="empty-topic-title">Start the {topic} topic</div>
        <div className="empty-topic-text">
          Most topics start as a decision — a choice the team has already made, written down. From there, patterns, anti-patterns, and reflections accumulate over cycles.
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn-sec">Import from agent proposal</button>
          <button className="btn-primary"><Icon name="plus" size={14} /> Write a decision</button>
        </div>
        <div className="mono-sm" style={{ marginTop: 8 }}>OR CAPTURE A PATTERN · ANTI-PATTERN · BRIEF</div>
      </div>
    </div>
  </>
);

Object.assign(window, {
  KindTag, StatusTag, KnowledgeSubmenuV2,
  KnowledgeListCurated, KnowledgeListTriage, KnowledgeDetail, MergeModal,
  FactoryScope, EmptyTopic,
});
