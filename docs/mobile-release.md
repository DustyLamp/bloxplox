# Native beta distribution

## Current authorization — 14 October 2026

The owner authorized proceeding toward public release with **zero administrative
disruption to existing entities**. Prepare new individual Apple and personal
Google Play accounts. The owner selected **jez@bloxplox.com** on 14 October 2026,
then confirmed it is already used in Mylk Me's Google Workspace after Google
rejected new-account signup. Keep that email for Apple; a separate personal
Google identity remains to be selected. Neither developer account has been
enrolled or paid for.
The existing internal TestFlight setup and beta
artifacts remain available while this preparation happens.

The old Xube Google Play registration remains stopped. Do not change Xube,
Dusty Lamp or Mylk Me company records, D-U-N-S details, addresses, memberships,
agreements, payments profiles, permissions or existing app credentials. Do not
submit administrative support requests on their behalf. The unconfirmed Google
profile was cancelled; no profile was linked and no fee paid. Historical setup
notes below do not authorize resuming those steps.

## Personal publisher release path

Use the existing **jez@bloxplox.com** email for the personal Apple account. For
Google, prepare a separate free personal Gmail account without changing the
existing Workspace identity. The final Gmail address has not been selected.
Keep **hello@bloxplox.com** as the app's public support address. Do not create a
paid Workspace mailbox or alter aliases, groups or an existing organization.
Passwords, two-factor authentication and identity verification need the account holder.
Do not convert or close an existing membership. Store registration and payment
must be visibly for the new personal account before continuing.

### Account setup checkpoint — 14 October 2026

| Item | Selected identity | Verified status |
| --- | --- | --- |
| New individual Apple developer membership | `jez@bloxplox.com` | Apple sign-in is at the password step; successful sign-in and membership enrollment are not yet verified |
| New personal Google Play developer account | Separate personal Google/Gmail identity pending | Google sign-in did not find `jez@bloxplox.com`, but signup reported the username is taken. The owner confirmed it is already used in Mylk Me Workspace. Do not alter that Workspace setup to free it |
| Public app support | `hello@bloxplox.com` | Approved for app/store support; support-link correction is in PR #21 |
| Existing Google OAuth consent support | `iamjeza@gmail.com` | Previously approved exception; unchanged by the new store-account setup |

The owner was handed both account pages in the approved personal Chrome profile,
under the “BloxPlox personal accounts” session. The earlier instruction to use
the Workspace email for a separate Google account is superseded: choose “Get
a Gmail address instead” for a free, independent personal identity. Do not
remove aliases, change domain types, reset Workspace credentials or submit an
administrative request. The screenshot's signup error is not evidence that an
unrelated person owns the address. Google's [alias documentation](https://support.google.com/a/answer/33327?hl=en-sg)
explains that Workspace email aliases are not separate Google Accounts and
cannot be used to sign in; the precise Workspace address configuration has not
been re-investigated and is not necessary to this separate-account path.
The owner completes passwords, verification and account terms directly. Do not
record successful creation or enrollment until the result is visibly verified.
No membership terms, registration fee or payment has been submitted in this step.
Private handoff screenshots are ignored under `test-results/`; no passwords,
identity documents or verification codes belong in this repository.

Apple individual enrollment costs US$99/year or the local equivalent and uses
the individual's legal name as seller; it does not need an organization D-U-N-S
number. Google Play registration costs US$25 once. A new personal Play account
needs a closed test with at least 12 testers opted in continuously for 14 days,
followed by an application for production access. That is a minimum testing
period, not a guaranteed launch date. Keep the app free with paid plans disabled.
Sources: [Apple enrollment](https://developer.apple.com/programs/enroll/),
[Play registration](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en),
[Play testing](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).

### App identity and existing accounts

The current iOS app has only been distributed through TestFlight. Apple's
[standard transfer criteria](https://developer.apple.com/help/app-store-connect/transfer-an-app/app-transfer-criteria/)
require at least one public App Store version. Do not publish through Xube just
to make a transfer possible. Prepare a fresh app under the personal membership,
with its own bundle identifier, signing material and upload credentials.

The following are current beta targets, not defaults for the new publisher:

| Configuration | Current coupling | Required separation |
| --- | --- | --- |
| `apps/mobile/app.json` | Xube team, `com.bloxplox.app`, `bloxplox` URL scheme | A separate iOS target; avoid callback ambiguity if both apps are installed |
| `scripts/sign-ios.mjs`, `scripts/ios-profile.py` | Hard guards for the existing team and bundle | Keep the guards; introduce and validate the new target after real IDs exist |
| `.github/workflows/ios-beta.yml` | `native-beta` secrets and Xube app record | A distinct protected environment and explicitly checked personal target |
| `infrastructure/config.ts` and Apple secret | Existing Apple team and Service ID | Preserve live login until the new auth route and account continuity are verified |
| Android signed APK/AAB | `com.bloxplox.app`, not uploaded to Play | Register only under the new personal Play account; verify signing/upgrade behavior |

Do not copy Xube's private signing material into the new environment, revoke
existing credentials, or dispatch the current iOS workflow as a personal build.
Do not delete or rename the existing Xube app to free a store name. If Apple
does not permit the same name on the new record, use an available BloxPlox title.

Apple identifiers and private-relay email addresses can differ across teams.
The existing email-based account linker is not proof that this migration is
safe. Before any production auth change, verify old and new Apple login,
matching verified-email login, private-relay users, deletion/revocation and the
same existing Cognito subject/planner data. A different relay email must never
silently create a replacement for an existing planner. Keep a working old login
path until continuity is demonstrated. This work belongs to BloxPlox's backend;
it must not require changes to another Xube app or membership.

### Submission preparation

The [store listing draft](play-store-listing.md) contains listing copy, a data
inventory and reviewer steps. No store declarations have been submitted. Use
synthetic data and the retained native design for screenshots. Complete physical
device gestures, offline/reconnect, reminders, private-relay delivery and real
Apple revocation checks before claiming public readiness. Calendar verification
was still pending at the last check on 14 October.

New-account creation, signing and store submission remain dependent on the
account holder's enrollment. No membership purchase, build upload, transfer,
public release or new tester invitation was performed during this preparation.

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
The selected Xube team and BloxPlox app record are documented below. Signed iPhone
build 1004 is available to the invited internal TestFlight tester. Never
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
legally required retention. Apple token revocation is part of the Apple login release described below.

Run `yarn test:live:deletion` with the deployment profile to exercise this flow
using two disposable accounts. It checks two tabs, an independently cached
offline browser on reconnect, local records and replication metadata, API access
denial, server cleanup and isolation of the second account. With Apple enabled,
it also links a synthetic Apple identity only to the disposable account, verifies
server-side ownership/nonce binding, rejects an untrusted return URL, and checks
single-use cancellation without deleting the account. It removes that synthetic
link before testing deletion. This does not verify real Apple consent, token
exchange or upstream revocation. Allow several minutes
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

The approved distribution certificate and BloxPlox App Store profile expire on
13 October 2027. The BloxPlox-only Apple sign-in key is stored in AWS Secrets
Manager as `bloxplox/apple-signin`; no private credentials are in this repository.
Workflow run `38410573312` on revision `44b5fdb` successfully signed, validated and
uploaded version 0.1.0 (1001). Run `38414994767` uploaded build 1002 from `96ccb37`,
including Apple login and deletion confirmation. Apple finished processing both;
they are assigned to the **BloxPlox beta** internal group. The owner authorized
the tester invitation and it was sent. Automatic build distribution stays off.
The private review contact is saved only in App Store Connect. External beta
review and public App Store submission have not been requested. This establishes
signing, upload and internal distribution; it does not establish physical-device QA.

Android run `38414998396` produced signed build 1003 from the same revision. The
downloaded APK/AAB checksums match CI; upgrade installation and cold launch passed
on the API 34 arm64 emulator without React Native or Android runtime errors.
The [GitHub prerelease](https://github.com/DustyLamp/bloxplox/releases/tag/android-beta-0.1.0-1003)
retains the artifacts. Google Play developer-account verification remains pending.

## Apple sign-in and deletion

The Services ID is `com.bloxplox.signin`. Its Cognito callback is
`https://bloxplox-807550663091.auth.eu-north-1.amazoncognito.com/oauth2/idpresponse`;
its deletion confirmation callback is
`https://api.bloxplox.com/account/apple/callback`. Native login uses the same
Cognito PKCE flow through the system authentication browser, returning to
`bloxplox://auth`. The Apple button uses Apple's unmodified logo asset.
Verified matching email addresses link to the existing Cognito subject. Private
relay addresses are separate addresses, including Apple's newer
`private.icloud.com` domain; never infer their underlying personal email.

Cognito does not expose the upstream Apple refresh token. For an Apple-linked
account, deletion therefore asks for a fresh Apple confirmation. A short-lived,
one-use server state and nonce bind Apple's signed identity token to the linked
Apple subject. The resulting refresh token remains in a server-only encrypted
DynamoDB record. A separate client state binds the return URL and currently
signed-in BloxPlox subject; the callback cannot delete an account by itself.
Web and native then make the existing authenticated deletion request. Native
handles both an active authentication session and a cold-start deep link.
The cleanup worker revokes Apple access before removing the Cognito account and
records, retrying failures without discarding the token.

A user who cannot reauthenticate can still choose **Delete without Apple
confirmation**, with instructions to stop using Apple for BloxPlox in their
Apple Account settings. This fallback deletes BloxPlox data but requires that
manual Apple-side step when no provider token has been captured. The public
account-deletion page retains those instructions. See
[Apple's account-deletion guidance](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple).

Cognito’s default `no-reply@verificationemail.com` sender is registered in
Apple’s private-relay email sources and passed its SPF check. This adds no
mailbox subscription. CodePipeline execution
`35c2cb17-1be0-4dd2-bd74-bdc44eafeefa` deployed revision `96ccb37` successfully;
the production runtime advertises Google and Apple. The owner completed a fresh
Apple passkey/Touch ID login on the web. The matching verified email linked to
the original account alongside Google; its subject and planner were preserved.
The app displayed Synced, and the authenticated session survived reload.
The owner reported completing the TestFlight 1002 Apple-login check.
Private-relay mail delivery, upstream token revocation, native gestures, offline
recovery and reminders still need verification before claiming readiness for
public App Store review. Do not use the owner's real account for destructive deletion QA.


## Mobile spacing follow-up

The original native interface is retained. The only visual adjustment is to
Habits List rows: lower minimum height, tighter text spacing and the existing
status marker on the right. A broader design pass was reverted following the
owner's clarification and was not distributed in a signed beta. Grid, Blocks,
Things, history, navigation, colours and interactions retain their prior design.
See implementation.md for verification evidence and device checks still pending.

Xube Play signup is at the D-U-N-S identity form; the owner requested lookup of
the existing registration number. Two-step verification is enabled on the
approved Google account. Public developer contact details remain to be confirmed.
No registration payment has been made and the unrelated Mylk Me payments profile
has not been selected.


## Current beta: spacing refinement

PR #19 restored the pre-redesign native interface, with only Habits List row
height, text spacing and status alignment changed. Signed builds use revision
`f8d919566c873a301bc48429fe72a1b847b65bf5`:

- iOS 0.1.0 (1004), workflow `38440478964`: signed, validated, uploaded,
  processed and **IN_BETA_TESTING** in the existing BloxPlox beta internal group.
  TestFlight notes describe the limited spacing change and outstanding device checks.
- Android 0.1.0 (1005), workflow `38440483109`: release signature and downloaded
  checksums verified; upgrade and cold launch passed on the API 34 arm64 emulator
  without React Native/Android runtime errors. APK/AAB and checksums are retained
  in the [signed prerelease](https://github.com/DustyLamp/bloxplox/releases/tag/android-beta-0.1.0-1005).

The broader PR #18 redesign builds were cancelled before distribution. A fresh
local iOS simulator bundle verified the final List and unchanged Grid layouts,
opening the original habit action sheet, and numeric result 35 reaching the
backend with the global Grid preference. The disposable account and its records
were removed after testing. Physical-device gestures, native offline recovery,
reminders, private-relay delivery and real Apple revocation remain beta checks.

The earlier Xube Google Play registration was cancelled before confirming or
linking a payments profile or paying a fee. Google returned a different address
from the supplied D&B record; the owner stopped all address investigation and
administrative requests. No duplicate D-U-N-S registration, company-record
change or support case was submitted. Do not resume that path. The current
personal-account preparation at the top of this document supersedes the earlier
publisher selection; it does not change existing TestFlight, web or APK access.
