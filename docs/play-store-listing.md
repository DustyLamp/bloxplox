# Google Play listing preparation

Prepared 14 October 2026 for the existing signed Android beta, package
`com.bloxplox.app`, version 0.1.0 (1005), revision `f8d9195`. This is a repository
draft, not a published listing or a completed Play registration.

**Release scope: internal testing only.** The owner explicitly limited store
distribution on 14 October 2026. Use an allowlisted Play Internal testing track
and the existing internal TestFlight group. Do not start production, open testing,
pre-registration, public TestFlight links or external tester distribution without
new instructions. The copy below is preparation for the testing setup, not
authorization to publish a public listing.

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

The owner confirmed `hi@xube.io` for Xube's organization-level developer email
and `hello@bloxplox.com` for BloxPlox app support. The organization-level public
phone remains unconfirmed. Do not copy the private Apple review contact into
public developer fields. The app's support links use the BloxPlox address;
Google OAuth consent retains its separately approved support configuration.

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

The owner reconfirmed **XUBE PTY LTD** as publisher on 14 October 2026 after
reviewing the shared developer-account exposure. All actions remain specific
to BloxPlox. Keep existing Xube apps, credentials, billing, legal identity and
infrastructure unchanged. Do not reuse or modify the unrelated Mylk Me payments
profile. A separate profile does not guarantee isolation from related-account
enforcement.

Google successfully resolved the supplied existing D-U-N-S number to XUBE PTY
LTD, but returned a different address from the owner's D&B confirmation and the
Apple membership. The owner confirmed the D&B email's address is current. The
new profile has **not** been confirmed, no profile has been linked, and no
registration payment has been made. Do not confirm Google's stale address or
change Xube's existing company records to match it. Check when D&B's update was
completed and resolve its propagation to Google before proceeding. Google's
verification-issues link currently redirects the unregistered account to signup.
Keep the supplied email, full identity details and verification screenshots out
of the public repository.

## Submission state

The signed APK/AAB and checksums are available in the
[Android beta release](https://github.com/DustyLamp/bloxplox/releases/tag/android-beta-0.1.0-1005).
No rebuild is needed just to prepare a listing.

The next account steps are the stale-address resolution, public developer phone,
identity and website verification, registration terms and the one-time fee.
Then create only the BloxPlox app and prepare its internal testing track. Do not
upload a different Xube app or change an existing app-signing configuration.

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

## References

- [Google's listing fields and character limits](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en): name 30, short description 80, full description 4,000.
- [Developer identity verification](https://support.google.com/googleplay/android-developer/answer/10841920?hl=en).
- [Google Play enforcement](https://support.google.com/googleplay/android-developer/answer/9899234?hl=en).
- [D&B updates and verification issues](https://support.google.com/googleplay/android-developer/answer/13634888?hl=en).
- [Internal testing visibility](https://support.google.com/googleplay/android-developer/answer/9859751?hl=en_EN).
