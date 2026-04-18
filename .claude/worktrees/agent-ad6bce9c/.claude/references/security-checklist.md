# Security Checklist Reference

Progressive disclosure checklist — load when reviewing security-sensitive code.

## Pre-Commit Checks

- [ ] No secrets in code (API keys, tokens, passwords, connection strings)
- [ ] No secrets in config files committed to git
- [ ] `.env` files are in `.gitignore`
- [ ] No `console.log` of sensitive data

## Input Validation (API Boundaries)

- [ ] All user input validated with explicit schemas (Zod or TypeScript narrowing)
- [ ] String length limits on all text inputs
- [ ] Numeric range validation
- [ ] Enum values validated against allowed set
- [ ] File upload: type, size, and name validation
- [ ] No direct user input in SQL (Drizzle parameterizes — but check for raw SQL)

## Authorization

- [ ] Every endpoint checks authentication
- [ ] Every data access checks authorization (not just auth)
- [ ] No IDOR vulnerabilities (user A accessing user B's data via ID guessing)
- [ ] Role-based access enforced server-side, not client-side
- [ ] Agent operations scoped to their assigned product/workspace

## Headers & CORS

- [ ] CORS configured to specific origins (not `*` in production)
- [ ] Security headers set (CSP, X-Frame-Options, X-Content-Type-Options)
- [ ] CSRF protection on state-changing operations
- [ ] Rate limiting on authentication endpoints

## Agent-Specific

- [ ] Agent workspace isolation verified (no host filesystem access)
- [ ] Knowledge items sanitized before agent context injection
- [ ] Agent outputs validated before knowledge persistence
- [ ] Cost budgets enforced server-side
- [ ] Credential scoping: each agent only accesses what it needs
- [ ] Prompt injection resistance tested for knowledge-fed context

## Dependency Audit

- [ ] `bun audit` run with zero critical/high vulnerabilities
- [ ] Reachability analysis for medium vulnerabilities (is the vulnerable code path actually used?)
- [ ] No `npm:` imports from untrusted sources
