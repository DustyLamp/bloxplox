# Production implementation

## Confirmed destination

- AWS profile `bloxplox`, account `807550663091`.
- Production hostname `bloxplox.com`.
- Region `eu-north-1` (Stockholm), confirmed after the organization policy rejected Ireland.
- Public signup with verified email.
- A self-updating CDK CodePipeline deploys `main`; no separate manual production gate.

## Reference patterns, expressed independently

Use React, TypeScript, Vite, TanStack Router, Tailwind, Lucide, schema validation,
and a provider that owns the authenticated local database and replication lifecycle.
Separate UI, shared domain rules, client persistence, Lambda entry points, and CDK
constructs. Keep business logic independent of browser and AWS runtimes.

Local writes feed RxDB's replication protocol. HTTP pull uses persisted checkpoints;
push carries both proposed and assumed server states. Conflicts return the actual
server state. A WebSocket is only a signal to pull durable changes. Refresh tokens
on reconnect and on HTTP authentication failure, retry with bounded backoff, and
catch up on focus, online, and periodic intervals. Sign-out closes all subscriptions
before another user's database is opened.

Infrastructure follows the service-stack / deployment-stage / self-mutating pipeline
pattern. Source credentials belong in Secrets Manager. Build and test before synthesis;
deploy backend before publishing the matching frontend runtime configuration.

## Data decisions

- Each authenticated Cognito subject owns a DynamoDB partition and a separate local
  database. Client requests cannot select an owner.
- A conditional transaction commits the document, a monotonically increasing user
  sequence, and an immutable change record together. Strongly consistent pulls read
  that sequence; notification loss cannot lose data. Tombstones are retained.
- Independent fields merge using logical counters with a stable device tie-breaker.
  Fields that must remain coherent (timing, recurrence, completion) are single values.
  Concurrent edits to the same field converge deterministically; deleted records stay
  deleted unless explicitly restored by a later edit.
- Recurrences are calendar-date rules in a stored IANA timezone, with deterministic
  occurrence IDs. Merely viewing a date never writes generated blocks. Exceptions
  preserve moved/deleted occurrences. Monthly dates clamp to month end.
- Linked blocks and habits share one result record, including numeric value and skip.
  Reporting derives from stored records, never sample chart values.
- Schedules support the full local day. Blocks may end at midnight. Overnight work is
  represented as a block on each date, keeping completion and reporting unambiguous.

## Verification log

Production checks on 2026-10-12 (Europe/Zurich):

- Cognito SRP authentication and real public-signup email delivery/code confirmation succeeded. No credentials or personal email addresses are stored in this repository.
- Live HTTP checks rejected unauthenticated calls and owner injection; two accounts using identical document IDs remained isolated.
- Concurrent conditional writes returned one conflict. Independent edits merged, retrying an accepted write did not advance the checkpoint, and small-page catch-up retained every document and tombstone.
- Streams notified only the owning account. Heartbeat responses and single-use ticket rejection passed.
- Independent desktop (Zurich) and mobile (Los Angeles) browser databases synchronized through AWS. An isolated account saw no private records.
- Both devices edited offline; reloading the cached shell preserved the edit. Reconnection merged a name change with the other device's note. Forced WebSocket closure recovered with a fresh ticket and resumed completion synchronization.
- Sign-out/account switching isolated browser data. No browser runtime errors were observed.
- The original prototype's seven interaction suites passed. Production domain tests cover calendar/DST/month-end rules, occurrence identity, shared results, conflict resolution, scheduling and Things. Production browser tests exercise desktop and touch layouts, swipes, resize, rearrangement, history, numeric results, offline persistence and one-off task sessions.
- Amplify's custom-domain association is available. Both the root hostname and `www` return HTTPS 200 with the application and configured security headers.
- The merge of PR #2 (`307c1a0`) triggered CodePipeline execution `a5ac4c80-8887-4a22-831c-ad9e44f30228`, which succeeded through source, tests/synthesis, self-mutation, backend deployment and Amplify job 2. The initially missing deployment-resource permission is now expressed in CDK and verified through automatic deployment.
- With Things added: 18 domain tests and 25 production browser checks passed; the mobile-only skip is the desktop keyboard-grip check, with touch rearrangement covered separately. The 352 px navigation was inspected in the browser and adjusted to keep all three tabs, the menu, date and layout controls visible.

The live test creates two disposable accounts and cleans their application partitions and users in `finally`. It never uses or deletes the owner's account. Run explicitly against the deployed application with an AWS profile authorized to create/remove test users and read/delete their DynamoDB partitions:

```sh
AWS_PROFILE=bloxplox yarn test:live
```

It writes the check results and desktop/mobile screenshots to ignored `test-results/live/`. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an existing Chromium binary. `BLOXPLOX_TEST_IP` is an optional temporary DNS override for initial DNS propagation checks; normal verification uses the production hostname without it.

## Operational limits

- Reminders run while the app is open; closed-app push and email reminders are not implemented.
- Simultaneous edits to the same field converge to a deterministic winner. Independent fields merge. A block's Things selection is one field; task completions are separate documents and merge independently.
- Habit records retain completed history; unrecorded past dates follow current weekday settings. Things retain a single completion date, cleared when reopened.
- Mobile gestures have been exercised with Chromium touch input. Physical iOS/Safari testing remains outstanding.
- Changes and tombstones are retained indefinitely for reliable catch-up. Review DynamoDB growth before adding retention. Monitor the notification dead-letter queue alarm; no external alert destination has been configured.
