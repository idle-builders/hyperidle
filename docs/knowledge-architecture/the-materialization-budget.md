## 7. The Materialization Budget

Not all knowledge is equal. Loading everything into every session wastes tokens and context window. The Knowledge Fabric applies a **materialization budget** — a cap on how much knowledge gets loaded, enforced by relevance scoring.

### Scoring factors

| Factor | Weight | Example |
|--------|--------|---------|
| Task relevance | high | Practice tagged "file-handling" for a file-upload task |
| Role match | high | Builder practices for a Builder agent |
| Recency | medium | Recently updated practices score higher |
| Confidence | medium | VALIDATED items score higher than PROVISIONAL |
| Usage frequency | medium | Practices referenced in recent sessions score higher |
| Layer proximity | low | Same-product items score higher than cross-product |

### Budget enforcement

```
Given: a session with context window size W (e.g., 200K tokens)

Reserve:
  - 40% for task execution (tool calls, reasoning, code)
  - 30% for L0 session pack (task state, handoffs, bet context)
  - 20% for L2+L3 knowledge (practices, product docs)
  - 10% for L4 factory context

The 20% knowledge budget (~40K tokens) determines how many practices
and product docs get materialized. At ~200 tokens per TOON practice,
that's ~200 practices — far more than any session needs.
```

The budget is generous by design. The real filter is relevance, not size. But having a budget prevents degenerate cases (a practice community with 10,000 items) from blowing up session costs.

---
