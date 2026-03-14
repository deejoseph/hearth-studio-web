# Bugfix Prompt

Goal: Fix a specific bug with minimal, safe changes.

Rules:
- Do not refactor broadly or change architecture.
- Preserve behavior outside the reported bug.
- Always use `src/api/client.js` for API calls.
- API responses include `meta` and must be parsed/kept.

Process:
1. Locate the failing behavior and the smallest change to fix it.
2. Check call sites and side effects.
3. Implement a minimal patch and keep existing patterns.
4. Mention any risks or follow-up tests.
