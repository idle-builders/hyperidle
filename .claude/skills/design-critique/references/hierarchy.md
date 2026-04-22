# Visual Hierarchy

## The Three Levers

Every piece of UI text sits at one of three levels:

1. **Primary** — The thing the user is looking for. Titles, values, active states.
   - Full contrast (`--text-hi`), largest size in context, weight 500-600.
   
2. **Secondary** — Supporting information. Body text, descriptions, labels.
   - Reduced contrast (`--text-mid`), default size, weight 400.
   
3. **Tertiary** — Orientation data. Timestamps, IDs, metadata, inactive navigation.
   - Low contrast (`--text-lo`), smallest size, weight 400-500, often monospace.

## Rules

- **Never put two primary-level elements adjacent.** If everything is bold, nothing is bold.
- **Use size before weight before color.** Size differences are perceived fastest.
- **Limit emphasis to one element per row/card.** The eye needs one anchor point.
- **Labels should be quieter than values.** In a key-value pair, the value is primary, the label is tertiary.
- **Navigation items are secondary until active.** Active nav = primary. Inactive = tertiary.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| All text same size and weight | Create a 3-level scale: 14px body, 12px labels, 11px meta |
| Labels and values equal weight | Labels in `--text-lo` 11px uppercase mono; values in `--text-hi` 14px |
| Status chips competing with titles | Status chips are secondary. Titles are primary. |
| Navigation at full contrast | Inactive nav in `--text-lo`. Active nav in `--text-hi`. |
| Everything has a background color | Backgrounds are for grouping/elevation. Most text needs no background. |

## The Linear Principle

"In a product as information-dense as this, not every element should carry equal visual weight. Parts central to the user's task stay in focus; supporting elements for orientation and navigation should recede."

Apply this concretely: sidebar labels dimmer than main content titles. Card metadata dimmer than card titles. Timestamps dimmer than message content.

## Testing Hierarchy

Squint test: blur your vision and look at the component. Can you still tell what's most important? If everything blurs to the same gray mass, hierarchy is failing.
