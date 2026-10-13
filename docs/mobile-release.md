# Native beta distribution

BloxPlox uses React Native/Expo with shared domain, actions, authentication and
replication packages. Native persistence is SQLite; credentials use Keychain or
Android Keystore through SecureStore. The prerequisite graph uses the same
bundled React Flow component plus native controls. No paid EAS plan is required.

## Android

Run **Build signed Android beta** manually on `main`. The `native-beta` GitHub
environment is restricted to `main`. It contains `ANDROID_KEYSTORE_BASE64`,
`ANDROID_STORE_PASSWORD` and `ANDROID_KEY_PASSWORD`. The alias is `bloxplox`.
Keep a separate private backup of the signing keystore and password; losing the
key prevents upgrades to directly installed APKs. Never commit signing material.

The workflow uses the standard public-repository Ubuntu runner, generates native
source, injects environment-based release signing, builds an APK and AAB, and
checks the APK signature. The artifact contains source revision, version code,
certificate fingerprint and SHA-256 checksums. Artifacts expire after three days;
publish a tested beta to a GitHub prerelease for longer-lived downloads. Signing
keys are removed from the runner before artifact upload. Build codes start at
1001 and increase with each workflow run; preserve the counter if replacing the
workflow. Debug-signed preview APKs must be uninstalled before the first signed
beta. Export/sync any preview data first.

The APK is for direct installation. The AAB is for Google Play after account
verification, app setup and Play App Signing enrollment. Google Play may sign
distributed APKs with a different app-signing key: direct-install testers might
need to uninstall before moving to Play. Do not claim this has shipped to Play
until the release is uploaded and available to the intended testing track.

## iOS

The existing **Build native previews** workflow produces a signed simulator app
on the public macOS runner. A simulator app cannot be installed on an iPhone.
TestFlight requires the confirmed Apple team, app identifier `com.bloxplox.app`,
an App Store Connect app record, distribution signing and upload access. Never
reuse another product's private signing keys or credentials without authorization.
Complete native authentication, gestures, offline recovery and physical-device
checks before inviting external testers. Sign in with Apple and its revocation
flow must be completed before public App Store review with Google login enabled.

## Account deletion

Settings offers permanent account deletion on web and native. The public
`https://bloxplox.com/delete-account` page provides the web path required for Play.
Users type DELETE before submitting. The authenticated subject, never a submitted
user ID, owns the deletion request. Access is denied immediately via a durable
DynamoDB marker. Every replicated write checks this marker in its transaction,
including writes racing deletion. Calendar callbacks and queued imports also
check the marker. Connected clients that receive HTTP 410 erase their account's
local database; the requesting device erases it immediately. Other offline
devices may retain their cache until cleared or uninstalled.

The marker is an outbox: DynamoDB Streams sends a delayed SQS cleanup job. The
three-minute delay outlasts in-flight API/calendar executions. Cleanup revokes
Google Calendar tokens, removes the Cognito user, all planner records/revisions,
calendar tokens, OAuth states, watch registrations and socket/ticket records.
Google calendars are untouched. Key-only paginated scans cover legacy external
watch/state and connection records; long sweeps checkpoint onto the queue.
Throttled deletes and transient Google failures retry. A failed job reaches the
deletion dead-letter queue and raises `DeletionFailureAlarm`; fix the cause and
redrive it. The marker continues denying access throughout failure/retry.

Only a random subject identifier, state and deletion dates remain in a receipt.
Restore procedures must reapply these receipts before serving a restored table.
PITR backups expire within 35 days. Paid plans remain disabled; before enabling
subscriptions, extend deletion to cancel/reconcile billing and disclose any
legally required retention. Apple token revocation must be added with Apple login.

## Cost controls

Native compilation is manually dispatched on standard runners in this public
repository. There is no scheduled native build, paid build service or automatic
store submission. AWS CodePipeline remains responsible for backend/web releases
when `main` changes. Deletion adds pay-per-request SQS/Lambda/DynamoDB operations
and one CloudWatch alarm; it adds no always-running server.
