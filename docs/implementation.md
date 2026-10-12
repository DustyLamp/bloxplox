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
- The Things merge (`713aea3`) deployed successfully through pipeline execution `9b67fcc1-f744-4181-a9f6-576bbca6d354` and Amplify job 3.
- A live timing check exposed stale values in an editor opened before a remote update arrived. The correction refreshes untouched fields while preserving local edits; 27 desktop/mobile browser checks passed, including concurrent deletion protection.
- After publishing that correction (Amplify job 4), all ten live check groups passed through normal production DNS. This includes Things attached to a real block: two disconnected devices independently edited the task's name/notes and completion, an offline reload retained changes, and both devices converged on the combined result. A second account could not see those tasks. Temporary accounts and their application partitions were removed.

The live test creates two disposable accounts and cleans their application partitions and users in `finally`. It never uses or deletes the owner's account. Run explicitly against the deployed application with an AWS profile authorized to create/remove test users and read/delete their DynamoDB partitions:

```sh
AWS_PROFILE=bloxplox yarn test:live
```

It writes the check results and desktop/mobile screenshots to ignored `test-results/live/`. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an existing Chromium binary. `BLOXPLOX_TEST_IP` is an optional temporary DNS override for initial DNS propagation checks; normal verification uses the production hostname without it.

## Operational limits

- Web reminders run while the app is open. Native local notifications are implemented but still need physical-device permission/delivery checks. Server push and email reminders are not implemented.
- Simultaneous edits to the same field converge to a deterministic winner. Independent fields merge. A block's Things selection is one field; task completions are separate documents and merge independently.
- Habit records retain completed history; unrecorded past dates follow current weekday settings. Things retain a single completion date, cleared when reopened.
- Mobile gestures have been exercised with Chromium touch input. Physical iOS/Safari testing remains outstanding.
- Changes and tombstones are retained indefinitely for reliable catch-up. Review DynamoDB growth before adding retention. Monitor the notification dead-letter queue alarm; no external alert destination has been configured.

## Creating blocks from available space

Clicking or tapping Available opens a new block at the selected fifteen-minute position with a one-hour duration. Grid uses the horizontal position and List uses the vertical position. Keyboard activation starts at the beginning of the gap; the duration shortens at midnight. Existing overlap confirmation applies before a new block can move another block. Cancelling writes nothing. Web and React Native share the start-time calculation. Six desktop/mobile browser checks cover both axes, persistence, gap boundaries, overlap cancellation, keyboard activation and midnight; native TypeScript passes, with native coordinate gestures still awaiting runtime verification.


### Habits, prerequisites and native applications — 12 October 2026

PRs #5–#7 delivered the expansion, navigation correction, native graph layout and deployment packaging fix. AWS CodePipeline execution `371189a7-a90f-4607-ac41-fb1c616aad1b` succeeded through every stage; Amplify job 8 published revision `9194d24287cac35ddb2bafcaa90db5fd129f98ea`. The public runtime configuration now uses `https://api.bloxplox.com`. The existing Cognito pool and DynamoDB tables were preserved. All features remain free for every account; there is no payment gate, active-habit limit or special demo email allowlist.

Implemented shared prerequisites, templates, native screens/storage/authentication, calendar import services and overlap layouts, split-Thing sessions, Habits naming, and verified-email account linking. The native graph uses the shared React Flow canvas inside a bundled Expo DOM component. Explicit native and DOM dimensions prevent an empty canvas. Switching the global Grid/List setting resets native scroll position to keep the first block visible.

GitHub checks on the final application revision passed: 65 unit/backend/storage tests, web/native TypeScript checks, native bundle exports, production web build, validated CDK synthesis, and 43 browser checks with one intentional mobile keyboard-only skip. The tests cover calendar/DST/month-end boundaries, prerequisite cycles and soft completion, overlap layouts, imported-event overrides, split sessions, offline storage, gestures, account linking safeguards and social callback validation. Live Google/Apple flows remain unverified until their providers are configured.

CodeBuild installs only the web/backend workspace dependency graph for production, without the native toolchain. The Amplify publisher now writes its archive to an absolute path: CodePipeline mounts the web build artifact through a symlink, which previously caused the upload to look in the wrong directory. A regression test reproduces that artifact layout. The failed publish left the previous frontend serving; its unused pending Amplify job 7 was cancelled.

A disposable QA account signed in to the normally signed standalone iOS simulator build and pulled the same records created in Expo Go. Expo Go runtime checks verified block and Thing creation, persisted global layout, a left-to-right prerequisite graph, creation of a prerequisite from the graph, and completion while that prerequisite remained unfinished. A separate authenticated pull from the production API confirmed the block, both Things, completion and prerequisite edge. Final artifact checks are recorded below.

Native preview builds are manually dispatched with a `platform` choice (`both`, `android`, `ios`); pull requests no longer trigger expensive duplicate native compilations. Standard public-repository runners retain artifacts for one day. Android previews use development signing; iOS artifacts are Release simulator applications. Xcode's normal simulator signing must stay enabled because it embeds the application identity needed by Keychain. Disabling signing produced a SecureStore startup failure; normal signing was verified by launching and signing in to the standalone app.

Google Cloud project **BloxPlox**, ID `bloxplox-production`, number `574465139761`, exists under the user-confirmed personal Google account with no billing linked. After explicit approval, the sign-in and read-only calendar OAuth clients were created, their credentials verified in AWS Secrets Manager, and Calendar API enabled under its terms. Downloaded plaintext credentials were removed. Google consent configuration and real-provider verification remain pending; provider activation is controlled by `infrastructure/config.ts`.

The public product and privacy pages are `/about` and `/privacy`; they load independently of authentication and runtime configuration. Web and native entry points link to privacy, and calendar connection UI explains its separate read-only access. The user approved `iamjeza@gmail.com` as the public support address. Google consent uses that address and is now External / In production, with billing unlinked. Google verified and published the BloxPlox brand. Sensitive Calendar scope verification remains pending; until approval, unverified Calendar access is subject to Google's warning and 100-user lifetime cap. The Google sign-in provider and calendar backend are enabled in deployment configuration. Secrets stay in AWS Secrets Manager. No new Google Account, Workspace licence or domain conversion is needed. Calendar discovery preserves existing selection during metadata refresh and conflicting first imports. Google API field masks request only data used by the application. Local verification passed web/native TypeScript, 67 unit/backend/storage tests and 45 desktop/mobile browser tests with one intentional mobile keyboard-only skip.

The user has an Apple Developer membership; team details and signing credentials remain pending. Apple sign-in, TestFlight and App Store distribution are not active. Verified matching provider email addresses can link to the same Cognito profile; an Apple private relay address is not assumed to match a different address. Stripe onboarding is pending and dormant pricing cannot activate checkout while the paid-plans switch is disabled.

Native touch swipe/drag/resize, native offline cold start and physical-device delivery still need runtime verification. The simulator's accessibility controls work, but coordinate-based gesture automation does not currently bind to its window. Browser touch gestures and offline reload/reconnect have separate automated coverage; compilation or simulator button interactions do not establish physical-device parity.

The expanded live suite passed all 12 check groups against normal production DNS after publication. It verified Cognito SRP, account/owner isolation, concurrent conditional writes, idempotent retries, checkpoint pagination/tombstones, owner-only Streams notifications, WebSocket ticket replay rejection and reconnect, two browser databases in Zurich/Los Angeles timezones, offline reload and merge, linked Things, prerequisite replication/soft completion, sign-out/account switching, more than five active habits, and rejection of forged calendar imports. No browser runtime errors occurred. Both disposable live-test accounts and their DynamoDB partitions were removed.

Native workflow run `38240608542` succeeded for both platforms on revision `9194d24287cac35ddb2bafcaa90db5fd129f98ea`. The final APK and iOS simulator archive were downloaded to ignored `test-results/native/build-9194d24/`. The APK installed in a read-only Android API 34 arm64 emulator and cold-launched successfully; its process remained alive and the React Native/Android runtime error log was empty. Android interactive authentication and gestures still need device testing.

The final iOS artifact was installed over the earlier simulator build and cold-launched. SecureStore restored its signed-in account and SQLite restored the saved global layout and records. The bundled React Flow graph rendered both Things and their left-to-right edge. Reopening the dependent displayed “Waiting on Get documents”; completing it remained allowed. An authenticated production pull confirmed the resulting completion and edge. Native sign-out returned to the sign-in screen. Screenshots and the verification report are in the ignored native results directory. The native QA account and its 27 DynamoDB records were removed, its local setup credentials deleted, Metro stopped and both QA emulators shut down.
