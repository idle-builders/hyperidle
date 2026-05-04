# Canonical shapes — Knowledge

## KnowledgeMetadata schema signature

```
{
  layer: 'L0' | 'L1' | 'L2' | 'L3' | 'L4',
  scope_id: string | null,
  kind: string,
  topic: string | null,
  title: string,
  body: string,
  format: 'markdown' | 'toon',
  status: 'captured' | 'provisional' | 'validated' | 'active' | 'stale' | 'archived',
  version: number,
  updated_by: string,
  meta: Record<string, unknown>
}
```
