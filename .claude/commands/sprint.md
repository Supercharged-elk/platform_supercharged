# Sprint — pick up next pending items

Read `PLAN.md` and identify all items still in the `🔴 PENDING` / `🟡 PENDING` / `🟠 PENDING` sections (not struck-through).

For each item, in priority order:
1. Read every file listed in the item's **File:** field before writing anything.
2. Apply the fix described in the **Fix:** field.
3. Mark the item as `✅ DONE (Session N)` in PLAN.md and move it to the COMPLETED section under a new "Session N" heading.
4. Update the score in the tracker table.
5. Proceed to the next item unless the user stops you.

After all items in a session are done, update the `> Current score` line at the top of PLAN.md.

Always run a TypeScript check (`cd frontend && npx tsc --noEmit`) after frontend changes and verify Python syntax (`cd backend && python -c "import main"`) after backend changes before declaring done.
