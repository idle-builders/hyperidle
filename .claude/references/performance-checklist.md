# Performance Checklist Reference

Progressive disclosure checklist — load when reviewing performance-sensitive code.

## Database

- [ ] No N+1 queries (use Drizzle's `with` for relations)
- [ ] Indexes on columns used in WHERE, JOIN, ORDER BY
- [ ] Pagination on all list endpoints (no unbounded SELECT)
- [ ] Batch operations for bulk inserts/updates
- [ ] Connection pooling configured
- [ ] No SELECT * — select only needed columns

## API

- [ ] Response payloads are minimal (no over-fetching)
- [ ] List endpoints have limit/offset or cursor pagination
- [ ] Heavy operations are async (BullMQ jobs, not synchronous)
- [ ] No synchronous blocking in request handlers
- [ ] Appropriate caching headers (Cache-Control, ETag)

## Frontend

- [ ] No unnecessary re-renders (check React DevTools profiler)
- [ ] Large lists use virtualization (react-virtual)
- [ ] Images optimized (appropriate format, lazy loading, srcset)
- [ ] Bundle size checked (`npm run build` + inspect output)
- [ ] Code splitting on route boundaries
- [ ] No layout thrashing (batch DOM reads/writes)

## Agent Runtime

- [ ] Session cost budgets enforced before LLM calls
- [ ] Knowledge context window managed (don't load entire L2/L3 into every prompt)
- [ ] Workspace operations have timeouts
- [ ] Job queue concurrency limits configured
- [ ] No runaway agent loops (iteration limits on all agent loops)

## Measurement

Always measure before optimizing. Use:
- `npm run test -- --timeout` for slow test detection
- Browser DevTools Performance tab for frontend
- Drizzle query logging for database
- BullMQ dashboard for job throughput
