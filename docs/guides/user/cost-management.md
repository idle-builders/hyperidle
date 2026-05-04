## Cost Management

Costs are tracked at three levels, strictly nested:

```
Factory budget
  └── Team budget
       └── Agent budget
```

### How Limits Work

- **Agent cap hit**: Agent stops accepting new sessions
- **Team cap hit**: Team finishes in-progress work, takes no new tasks
- **Factory cap hit**: All teams stop

Hitting a limit always produces a conversation thread — it's never silent.

### What You See

- **Rail**: Daily and weekly burn rate
- **Work > Bet Detail**: Cost actual vs. cost cap per bet
- **Settings > Products**: Configure budgets per agent, team, or factory
