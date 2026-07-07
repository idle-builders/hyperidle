# Canonical shapes — Knowledge

## Kernel schema signature (knowledge_items)

```
{
  id: string,
  scope_kind: 'factory' | 'product' | 'practice' | 'team' | 'bet' | 'task' | 'user',
  scope_id: string | null,
  topic: string | null,
  title: string,
  body: string,
  format: 'markdown' | 'toon',
  status: 'captured' | 'provisional' | 'validated' | 'active' | 'stale' | 'archived',
  version: number,
  updated_by: string,
  created_at: string,
  updated_at: string
}
```

## Strategy extension signature (knowledge_strategy_fabric)

```
{
  knowledge_item_id: string,
  layer: 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | null,
  kind: string,
  attention_score: number,
  relevance_score: number,
  citation_count: number,
  confidence: number,
  meta: Record<string, unknown>
}
```

`scope_kind` is a closed enum (concept-doc update required to add). `layer` is nullable — items with scope kinds `bet`, `team`, and `user` may have no layer assignment. Strategy fields are computed by the Knowledge Fabric, not set by the creator.
