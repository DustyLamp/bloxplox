# Sample data

`initial-state.json` is exported from the literal fixtures in `apps/prototype/app.js` using `yarn samples:export`. It is a handoff fixture, not a production database schema.

- Dates are ISO calendar dates; the fixed sample “today” is 2026-10-11.
- Block `start` is minutes after midnight and `dur` is minutes.
- Habit `week` uses Monday=0 through Sunday=6.
- `done: true` is the older block representation; interactions use `status` values `done`, `missed`, and `none`.
- `cats` references categories by their display name in this prototype.
- There are initially no recurrence rules and no linked blocks. Add or link them using the UI.
- All records are synthetic examples created for the mockup.

Production schemas should use durable identifiers, an explicit timezone model, schema versions, authenticated ownership and sync metadata rather than treating this fixture format as the final contract.
