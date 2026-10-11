# Implementation handoff

## Current state

The latest approved prototype has been extracted into a standalone page with separate HTML, CSS and JavaScript. App logic and scoped design rules are preserved from the final v2 fragment, with one packaging-time fix: ignore queued history-scroll events after their view is detached or has zero width. Poppins fonts and the Lucide icon runtime are local assets, so Codex's preview environment is not required. The shell supplies the page metadata, colour scheme, margins and default icon dimensions that the original preview supplied.

The in-browser sample starts on 2026-10-11. Breakfast and German blocks are complete, as are German and Exercise habits: **4 / 17 done**. They are initially unlinked; linking a habit and block makes that pair count once. Reload restores the sample state.

## Implemented in the prototype

- Blocks and Tracker, with a shared Grid/List toggle.
- Proportional chronological grid, availability slots, list view, seam resizing.
- Mouse and touch swipes with done/not-done/clear transitions and animated underlays.
- Press-and-hold rearrangement, desktop grip, keyboard arrows, insertion cue, precise move picker, and Escape cancellation.
- Block editing, categories, moving to tomorrow/backlog, add/overlap dialogs, multiple activities.
- Binary and numeric habit interactions and management screens.
- Linked habits and recurring blocks: once, daily, weekdays, intervals, monthly dates and end dates.
- Shared aggregate completion history, horizontally extending date range, selected-day outline.
- Responsive layouts and light/dark presentation.

## Prototype limits

- All edits, recurrence state and layout preferences are in memory. There is no local database, server persistence, authentication, or multi-device sync.
- The sample schedule displays 08:00–24:00 and uses 15-minute steps. Full-day/overnight scheduling needs a production decision.
- History/reporting screens include sample/illustrative chart data. Production category totals must be calculated from persisted records.
- Habit reminder settings are UI values; no notifications are scheduled.
- Backlog dates/order and the roll-forward setting can be edited, but background scheduling/automatic rollover is not implemented.
- “Describe a day” is a static example preview; it does not parse entered text or call an AI service.
- Recurrence generation is a browser demonstration, with no durable occurrence exceptions or distributed concurrency protection.
- The design-tweak hook only appears if a host supplies `Tweak`. The standalone page does not include Codex's tweak UI.
- The abstract logo requested for the production application has not been designed yet. No final logo asset exists in this handoff.

## Reference material

### RealTracker

The user supplied `realtracker-master.zip`, dated July 2021, source revision `0559b80beb572aab55619d37d35103ff0088abc3`. It was inspected as a design reference. Useful original paths:

- `lib/widgets/result-list-item.dart`: authoritative right=done, left=not-done and repeat-to-clear semantics.
- `lib/widgets/historical-result-item.dart`: green history bars with top radius 7 and square bottoms.
- `lib/providers/style-provider.dart`: mint `#55e0a0`, pink `#ff8999`, grey `#505560`, background `#202025`, light `#fafaff`.
- `lib/pages/manage-trackable.dart`, `lib/widgets/set-result-dialog.dart`, `lib/widgets/result-chooser.dart`: habit management and numeric input.

The original app archive is not republished here. Its relevant behaviours are recorded in [product.md](product.md); the rebuilt prototype is included. User-requested differences include Poppins/normal casing, global Grid/List, shared Blocks/Tracker history, the full selected-day outline, and the Blocks-only embossed completion treatment.

### Omni

See [architecture.md](architecture.md) for the fetched replication revision and source entry points. `omni-studio` could not be located in the accessible `inside-labs` or `DustyLamp` repositories. Do not choose a substitute frontend stack until the correct reference is supplied.

## Assets and source provenance

- `design/archive/bloxplox-v1.fragment.html`: original concept; includes superseded copy and layouts. Historical reference only.
- `design/archive/bloxplox-v2.fragment.html`: exact final approved fragment, including embedded Poppins fonts.
- `design/screenshots/`: key captures made during iteration. Names ending `earlier` predate the final refinements. The recurring-habit screenshots also precede the last completion/reorder styling changes.
- `apps/prototype/`: active standalone version extracted from v2. This is the entry point for further work.
- `samples/initial-state.json`: JSON export of the synthetic demo categories, days, backlog, habits and results. Regenerate with `yarn samples:export` after changing the literals in `app.js`.
- `tests/`: previous interaction checks adapted from a Codex iframe to a normal page; outdated fixture counts/timing updated for the final design.

Scratch patch scripts, machine-specific rendered preview wrappers and intermediate duplicate HTML snapshots are superseded by the final source and are omitted. Screenshots generated by rerunning tests are written to `test-results/` and ignored.

## Resume implementation

1. Clone into `~/Orgs/BloxPlox` on the MacBook Pro and run the prototype checks.
2. Locate `omni-studio`; match its React build, styling, routing and component conventions.
3. Define shared schemas, occurrence identity/exception handling, timezone rules and completion aggregation.
4. Port the approved interactions without changing the visual language; add durable RxDB storage.
5. Implement Cognito-scoped pull/push APIs, DynamoDB data/checkpoints, Streams fan-out and reconnecting WebSocket sync.
6. Define the full AWS backend and Amplify Hosting in TypeScript CDK; resolve account, region, domain and sign-up policy.
7. Verify offline/reconnect, conflicting edits, account isolation, recurrence and deployment before launching.
