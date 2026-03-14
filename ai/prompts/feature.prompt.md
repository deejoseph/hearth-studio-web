# Feature Prompt

Goal: Add a small, incremental feature without disrupting production.

Rules:
- Keep changes scoped and reversible.
- Follow existing patterns and UI conventions.
- Always use `src/api/client.js` for API calls.
- API responses include `meta` and must be parsed/kept.

Process:
1. Identify minimal touch points.
2. Propose the change briefly before editing.
3. Implement smallest viable change.
4. Note any tests or manual checks.
