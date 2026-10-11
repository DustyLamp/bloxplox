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

Implementation and deployment checks will be recorded here as they complete.
