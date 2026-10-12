import { Logo } from './components/common';

export function PublicPage({ page }: { page: 'about' | 'privacy' }) {
  return <div id="bloxplox-v2"><main className="public-page">
    <header><a href="/about" aria-label="About BloxPlox"><Logo/></a><a className="bp2-button" href="/blocks">Open BloxPlox</a></header>
    {page === 'about' ? <>
      <h1>A day with room for things.</h1>
      <p className="public-lead">Plan your time, keep your routines, and get one-off tasks done.</p>
      <div className="public-features">
        <section><h2>Blocks</h2><p>A schedule sized by time. Resize and move blocks, repeat a routine, or set aside a session for several Things.</p></section>
        <section><h2>Habits</h2><p>Track the things you do regularly. Swipe right for done, left for not done, and repeat to clear.</p></section>
        <section><h2>Things</h2><p>One-off tasks with prerequisites. See what comes first in a graph and choose what to work on next.</p></section>
      </div>
      <h2>Your schedule, on your devices</h2><p>Changes save on your device and synchronize with your account when you are online. Grid and List are two views of the same day.</p>
      <h2>Optional Google connections</h2><p>Google sign-in identifies your account. Connecting Google Calendar is a separate choice: BloxPlox reads your calendar list and events from calendars you select. Hiding or merging an event changes only BloxPlox.</p>
      <p>All features are free during the preview. No card required.</p>
    </> : <>
      <h1>Privacy</h1><p className="bp2-muted">Updated 12 October 2026</p>
      <p>This policy covers BloxPlox at bloxplox.com and the BloxPlox mobile app. Contact BloxPlox at <a href="mailto:iamjeza@gmail.com">iamjeza@gmail.com</a> about support, privacy, access or deletion.</p>
      <h2>What we keep and why</h2>
      <p>We keep your account identifier and verified email to sign you in, recover access and keep your data separate from other accounts. We store the Blocks, Habits, Things, prerequisites, notes, categories, completion history, templates and settings you enter to provide the planner and synchronize your devices.</p>
      <p>Authentication is handled by Amazon Cognito. BloxPlox does not store a readable copy of your password. Service providers may process request information such as IP addresses and error metadata to deliver and protect the service.</p>
      <h2>Google sign-in and calendars</h2>
      <p>Google sign-in uses your Google account identifier and verified email to identify or link your BloxPlox account. It does not grant calendar access.</p>
      <p>If you separately connect Google Calendar, we request permission to read your calendar list and events. You choose which calendars to import. We store their names, colours and timezones, and the selected events’ titles, descriptions, locations, start/end times, all-day and busy status, recurrence identifiers and Google event links. We use this information to show your schedule, overlaps and event details across your devices.</p>
      <p>Calendar access is read-only. BloxPlox does not create, change or delete Google calendar events. We keep connection tokens on our servers to refresh selected calendars; those tokens are not sent to the BloxPlox apps. We do not request access to your Gmail messages, contacts or Google Drive files.</p>
      <p>Google data is used for the features you authorize, following the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a> and its Limited Use requirements. We do not sell it, use it for advertising, or use it to train general-purpose AI models. Human access is limited to your express permission, necessary security investigation or legal obligations.</p>
      <h2>Storage and sharing</h2>
      <p>Your signed-in devices keep a local copy so the planner works offline. Server data and authentication are hosted by Amazon Web Services in Stockholm, Sweden; website delivery uses a global content delivery network. Server data is encrypted at rest and network connections use HTTPS. Local copies rely on your device’s security. This is not end-to-end encryption.</p>
      <p>We use AWS to operate the application and Google to provide the connections you authorize. We do not sell your personal information or share it for advertising. We may disclose information when required by law or necessary to protect the service. BloxPlox has no advertising or third-party analytics trackers.</p>
      <h2>Your choices and retention</h2>
      <p>You can export your planner records from Settings. Editing or deleting records synchronizes to your other devices. We retain account data and synchronization history while your account remains open, including older revisions needed for reliable offline catch-up.</p>
      <p>Disconnecting a Google account in Calendars removes its active connection tokens, attempts to revoke Google access, and stops its calendars appearing. Previously imported records, synchronization history and device copies can remain; disconnecting is not an account deletion. You can also revoke access in your <a href="https://myaccount.google.com/connections">Google Account connections</a>.</p>
      <p>To request deletion of your account or imported calendar data, email <a href="mailto:iamjeza@gmail.com">iamjeza@gmail.com</a> from your account email. We verify ownership before removing account data. Copies in rotating backups may remain until those backups expire. Clear BloxPlox’s browser storage or remove its mobile app to remove local planner copies from a device; signing out alone keeps them for your next sign-in.</p>
      <h2>Updates</h2><p>We update this page when data handling changes. A new use of Google data requires an updated disclosure and your consent before that new use begins.</p>
    </>}
    <footer><a href="/about">About</a><a href="/privacy">Privacy</a><a href="mailto:iamjeza@gmail.com">Contact</a></footer>
  </main></div>;
}
