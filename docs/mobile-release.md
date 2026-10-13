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

The release manifest excludes overlay, shared-storage and install-referrer
permissions brought in by development dependencies. The workflow checks the
packaged APK and includes `permissions.txt` with the artifacts.

The APK is for direct installation. The AAB is for Google Play after account
verification, app setup and Play App Signing enrollment. Google Play may sign
distributed APKs with a different app-signing key: direct-install testers might
need to uninstall before moving to Play. Do not claim this has shipped to Play
until the release is uploaded and available to the intended testing track.

## iOS

The existing **Build native previews** workflow produces a signed simulator app
on the public macOS runner. A simulator app cannot be installed on an iPhone.
The selected Xube team and BloxPlox app record are documented below. TestFlight
still requires distribution signing, upload and successful Apple processing. Never
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
devices erase cached records on reconnect while their access token is valid.
Devices returning after their credentials expire may retain a local
cache until browser/app storage is cleared or the app is uninstalled. RxDB's
browser adapter retains empty IndexedDB containers after removing the records.

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

Run `yarn test:live:deletion` with the deployment profile to exercise this flow
using two disposable accounts. It checks two tabs, an independently cached
offline browser on reconnect, local records and replication metadata, API access
denial, server cleanup and isolation of the second account. Allow several minutes
for the delayed worker. Never substitute a real user's credentials or subject.

## Cost controls

Native compilation is manually dispatched on standard runners in this public
repository. There is no scheduled native build, paid build service or automatic
store submission. AWS CodePipeline remains responsible for backend/web releases
when `main` changes. Deletion adds pay-per-request SQS/Lambda/DynamoDB operations
and one CloudWatch alarm; it adds no always-running server.

## Xube iOS release setup (13 October 2026)

The user selected the existing **XUBE PTY LTD** membership, team `7H234Q95ZH`.
BloxPlox's App Store Connect record is `6822319641`, bundle `com.bloxplox.app`.
The defunct DUSTY LAMP LIMITED team is not used. This choice requires no additional
Apple membership. Apple transfers require at least one App Store release; a
TestFlight-only app cannot use the standard transfer process. A future transfer
also needs new distribution signing and migration of Sign in with Apple users.
See [Apple's transfer criteria](https://developer.apple.com/help/app-store-connect/transfer-an-app/app-transfer-criteria/).

**Build and upload iOS beta** is a manual, `main`-only workflow on the standard
public-repository macOS runner. It uses `native-beta` environment secrets:

- `IOS_DISTRIBUTION_P12_BASE64`, `IOS_DISTRIBUTION_PASSWORD`
- `IOS_PROVISIONING_PROFILE_BASE64`
- `APP_STORE_CONNECT_PRIVATE_KEY`, `APP_STORE_CONNECT_KEY_ID`,
  `APP_STORE_CONNECT_ISSUER_ID`

The dedicated BloxPlox upload key has the Developer role. Apple team API keys
cover all team apps; the user explicitly approved that scope. The workflow is
restricted to BloxPlox's bundle, team and App Store record. Never use this key to
operate on other apps. Signing secrets have a separate owner-only local backup
outside the repository. The runner removes private keys, profiles and its
throwaway keychain after success or failure. Never include them in artifacts.

The profile validator rejects development, enterprise, ad-hoc, expired,
wrong-team, wrong-app and mismatched-certificate profiles. Release signing is
applied only to the app target. Local reminders do not need APNs, so an Expo
plugin removes the unused push entitlement; Sign in with Apple is enabled in
the native identifier. Build numbers begin at 1001 and increase per workflow run.
Re-running an uploaded run reuses its number: dispatch a new run for a new upload.

The optional `upload` input defaults to true. A successful upload still needs
Apple processing and verification in TestFlight before a beta is available.
This workflow does not submit the app for public App Store review or release it.

Setup status: the app record, Services ID `com.bloxplox.signin`, and approved
Developer upload key exist. Distribution certificate/profile and the Apple
login key are awaiting the separate credential-creation approval. No signed
iPhone build has been uploaded yet. Apple login remains disabled in production.
