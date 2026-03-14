# Refactor Prompt

Goal: Perform a safe, minimal refactor.

Rules:
- Avoid large-scale renames or structural changes.
- Confirm before any architecture-level change.
- Keep diffs small and readable.
- Always use `src/api/client.js` for API calls.
- API responses include `meta` and must be parsed/kept.

Process:
1. Identify the smallest refactor that improves clarity.
2. Verify no behavior change is required.
3. Update related references carefully.
4. Call out any potential risks.
