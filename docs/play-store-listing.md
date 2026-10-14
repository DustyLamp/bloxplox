# Google Play listing preparation

**Personal-account preparation, 14 October 2026.** The owner authorized working
toward public release with no administrative changes to existing entities.
Prepare a new personal publisher with a separate Google/Gmail identity, still
pending selection. The owner's preferred **jez@bloxplox.com** is already used
in Mylk Me Workspace and Google rejects it for new independent-account signup.
Leave that setup unchanged. Account verification and developer enrollment are pending.
This does not restart the cancelled Xube registration. Do not change Xube's
D-U-N-S record, addresses, business identity, payments profiles, memberships or
agreements, or send administrative support requests. Existing entities and their
resources must remain unchanged. See [mobile release notes](mobile-release.md).

Prepared 14 October 2026 for the existing signed Android beta, package
`com.bloxplox.app`, version 0.1.0 (1005), revision `f8d9195`. This is a repository
draft, not a published listing or a completed Play registration.

**Current availability: existing TestFlight and beta artifacts.** The new
personal Play account needs verification, closed testing and production access
before public release. The copy below is prepared for that account. No app,
testing track, store listing or public TestFlight link has been created by this
preparation, and no tester invitations have been sent.

## Listing fields

| Field | Value |
| --- | --- |
| App name | BloxPlox |
| Default language | English (United States), `en-US` |
| App or game | App |
| Category | Productivity |
| Pricing | Free; paid plans remain disabled |
| Website | https://bloxplox.com/about |
| Privacy policy | https://bloxplox.com/privacy |
| Account deletion | https://bloxplox.com/delete-account |
| App support email | hello@bloxplox.com |

Use `hello@bloxplox.com` for BloxPlox app support. The new personal developer
account's separate Google/Gmail login is pending selection; the Workspace email
must not be converted or removed to free it. Publisher identity/contact fields
remain dependent on enrollment; do not reuse Xube's
organization contacts or the private Apple review contact. The app's support
links use the BloxPlox address. Google OAuth consent retains its separately
approved support configuration.

### Short description

Plan your day, track habits and make time for your to-dos.

### Full description

BloxPlox brings your daily schedule, recurring habits and one-off tasks together.

Blocks is your schedule. Add a block in an available space, adjust its duration
and rearrange your day. Keep unscheduled work in the backlog until it has a place.

Habits is for routines. Set a cadence, track a result or enter a number, and look
back through your completion history. Swipe right for done or left for not done.
Repeat the same swipe to clear the result. Link a habit to a block and its
completion is shared, with no duplicate count in your daily history.

Things is for one-off tasks. Add notes, estimates, due dates and categories.
Choose several Things to work on in one block, or schedule them separately.
Connect prerequisites in a graph to see what comes first. A task can show
“Waiting on…” without preventing you from completing it.

Switch between Grid and List with one setting across all three views. Your
planner is stored on your device, and changes synchronize with your account
when you are connected.

Optionally connect Google accounts and choose the calendars to show alongside
your blocks. Calendar access is read-only. Hide an imported event or merge it
with a block in BloxPlox without changing the original Google event.

Sign in with email, Google or Apple. Export your planner or delete your account
from Settings. BloxPlox has no advertising.

## Publisher boundary

The earlier Xube registration stopped before profile confirmation, linking or
payment. No address update, D-U-N-S change or administrative support request was
submitted. Do not resume it, confirm the mismatched address or reuse the unrelated
Mylk Me payments profile. New personal enrollment must not convert or modify
either existing entity. Keep personal identity documents, addresses, private
review contacts and verification screenshots out of the public repository.

## Submission state

The signed APK/AAB and checksums are available in the
[Android beta release](https://github.com/DustyLamp/bloxplox/releases/tag/android-beta-0.1.0-1005).
No rebuild is needed just to prepare a listing.

The old organization setup is cancelled. New personal enrollment still requires
the account holder's identity verification, terms and payment. Do not select an
existing organization's payments profile or change an existing app-signing
configuration. Inspect the final account and package identity before upload.

Store screenshots must show the final retained native design, with only the
Habits List spacing refinement. Do not use the reverted redesign or personal
planner data. Store assets and the Play Data safety, content-rating, app-access
and audience forms have not been submitted. Review those forms against the
actual release and privacy policy before submission; this copy is not a data
declaration.

Google Calendar's sensitive-scope review is still in progress as of 14 October.
Native physical-device gestures, offline recovery, reminders, Apple private-relay
delivery and real Apple token revocation retain the verification limits recorded
in [mobile-release.md](mobile-release.md). An internal beta does not establish
public-store readiness.

## Data disclosure preparation

This inventory is based on the current source and Android 1005 permission
report. It is preparation for the store forms, not a submitted declaration or
an assertion that no user data is collected. Check the final signed binaries,
SDK behavior and service-provider processing before submitting either store's
form. Optional calendar consent does not make imported data exempt from disclosure.

| Data | Actual use | Form preparation |
| --- | --- | --- |
| Verified email and Cognito/provider account identifiers | Authentication, account linking and separation of planners | Email address and user IDs; linked to the user; account management/app functionality |
| Blocks, Habits, Things, notes, categories, prerequisites, results and settings | Durable planner records, history and cross-device sync | User-generated content; linked to the user; app functionality |
| Random persistent installation actor | Stored with field clocks to resolve concurrent edits | Device/other IDs, including Apple's Device ID category; linked through planner records; app functionality, not advertising |
| Selected Google calendars and events | Optional read-only import of titles, notes, locations, times and recurrence | Calendar data in Play; user content in Apple; linked to the user; app functionality |
| Connection and Apple deletion-confirmation tokens | Refresh selected calendars or revoke Apple access on deletion | Authentication processing; server-side only; included in the privacy explanation |
| Server error name/request ID and AWS request metadata | Operating and protecting authentication and sync | Review diagnostics/service-provider processing for the final declarations; application Lambda logs retain 14 days |

Source locations: `packages/auth/src/index.ts`,
`services/functions/link-identity.ts`, `apps/mobile/src/storage.ts`,
`packages/sync/src/database.ts`, `services/functions/google.ts`,
`services/functions/google-store.ts`, `services/functions/apple-deletion.ts`
and `infrastructure/lib/application-stack.ts`.

The application does not map a social display name into Cognito. It does not
request phone contacts, photos, microphone, camera, HealthKit, Health Connect or
device location. The Android 1005 manifest has no camera, microphone, location,
contacts, calendar-storage or external-storage permissions. Imported calendar
location text is still stored as part of an event; absence of device-location
permission is not a claim that events contain no personal information.

Reminders are local notifications scheduled by `apps/mobile/src/reminders.ts`;
the app does not register an Expo/APNs/FCM push token. Android's notification
dependencies still contribute receiver and badge permissions to the manifest.
The SDK review must inspect these dependencies as well as application calls.
All paid features remain free and no purchase flow is exposed. There is no
application advertising or analytics SDK configured.

Data travels over HTTPS/WSS and is stored in AWS Stockholm, with local SQLite
copies for offline use. This is not end-to-end encryption. Account deletion is
available in Settings and through the public web path; the deletion receipt,
35-day backup expiry and remaining offline copies are disclosed in the privacy
page. Do not answer “no collection,” “anonymous,” or “immediate deletion
everywhere.” Evaluate service-provider sharing exceptions using the actual
relationships rather than treating all AWS processing as advertising sharing.

Use the current [Google Data safety definitions](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en-GB)
and [Apple privacy definitions](https://developer.apple.com/app-store/app-privacy-details/)
when mapping these facts to each store. The final identity of the personal
operator and any public trader/contact disclosures depend on enrollment; do not
publish a private address or phone copied from the earlier Xube setup.

## Reviewer access and test sequence

Provide a dedicated verified review account with synthetic planner records in
the store's private app-access fields. Keep its password out of this repository
and screenshots. Do not use the owner's account or require a reviewer to wait
for an email code. Test that login before every submission. A separate disposable
account is needed for deletion so the main review credentials remain valid.

1. Sign in with the review email/password. Open Blocks, Habits and Things; check
   that one Grid/List selection applies to all three.
2. Tap available time to create a one-hour block. Resize and rearrange it, then
   link a habit and several Things. Split a Thing out into its own time slot.
3. In Habits List, swipe right for done, right again to clear; swipe left for
   not done, then left again to clear. Check numeric results and shared history.
4. Open a Thing's graph, add prerequisites and confirm “Waiting on…” still
   allows completion. Verify the native controls and bundled graph on a phone.
5. Edit offline, restart the app, reconnect and compare the same account in a
   second client. Check concurrent edits and isolation from a second account.
6. Verify recurrence across day/timezone boundaries and local reminder delivery
   on physical devices. Simulator/build checks alone do not close these items.
7. Calendar connection is optional and separate from Google login. Test selection,
   hiding, overlap layout and merge without changing the source Google event.
   Record Google's verification status accurately in review notes.
8. Test email, Google and the new personal-team Apple flow, then deletion and
   upstream Apple revocation on a disposable identity. Preserve existing users'
   planner IDs through the Apple publisher transition.

Store screenshots must be captured from the final native release with synthetic
data. Content rating, audience selection, app access, privacy forms and release
notes must describe the final binary; none have been submitted by this preparation.

## References

- [Google's listing fields and character limits](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en): name 30, short description 80, full description 4,000.
- [Developer identity verification](https://support.google.com/googleplay/android-developer/answer/10841920?hl=en).
- [Google Play enforcement](https://support.google.com/googleplay/android-developer/answer/9899234?hl=en).
- [D&B updates and verification issues](https://support.google.com/googleplay/android-developer/answer/13634888?hl=en).
- [Internal testing visibility](https://support.google.com/googleplay/android-developer/answer/9859751?hl=en_EN).
