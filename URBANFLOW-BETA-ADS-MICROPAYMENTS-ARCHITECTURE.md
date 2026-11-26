# UrbanFlow — future closed beta and monetization architecture

**Status:** design proposal only. No account service, hosted beta, advertisement, payment processor, or external analytics has been configured or launched.

## Beta topology

For a small closed beta, use an isolated, non-production host with a pinned image built from an approved commit. Put the application behind an identity-aware access proxy (for example, Cloudflare Access) connected through a private tunnel; do not expose the application port directly. Keep production DNS, Raspberry Pi and production saves out of this environment. Give each invited tester an individually revocable identity. Test both unauthenticated denial and authorized access before invitations.

The application presently persists campaign data in browser storage, not in a shared account database. Separate browser profiles therefore provide separate saves, but this is not an account-level backup or cross-device sync system. If account-backed saves are later added, define a server-side owner key, explicit export/delete, migration backups and access checks before implementation.

Release procedure: pin exact SHA and image digest; verify `/health` version and commit; keep the previous image available; snapshot any beta server data before update; smoke-test login, game load, save/resume and static assets; roll back the image if checks fail. No auto-deploy from GitHub.

## Privacy and telemetry

Default to no telemetry. A future product analytics layer should use documented, minimized events, a separate consent state and retention limits. Do not send campaign saves, typed feedback, random generator state, IP logs or device identifiers as analytics. Provide a clear opt-out and a deletion path. The privacy notice and consent implementation require legal/privacy review before release.

## Advertisement proposal

If the game later qualifies for AdSense, confine ad slots to the game portal, library, title/menu and informational screens outside an active campaign. Never cover the map, route controls, cost confirmations or gameplay feedback. Reserve layout space so loading does not move controls. Load ads only after applicable consent; retain a no-ad experience when consent is declined. An ad slot is not an integration and must remain feature-flagged until policy, consent, accessibility, performance and eligibility reviews pass. Google says publishers need original content and compliance with program policies; review the current [AdSense eligibility guidance](https://support.google.com/adsense/answer/9724?hl=en) and [site readiness guidance](https://support.google.com/adsense/answer/7299563?hl=en-en) before applying.

## Optional cosmetic purchases proposal

Potential paid items: visual theme packs, map/UI cosmetics and extra scenarios that do not change transport balance. Do not sell capacity, income, service quality or campaign advantages. Use a payment provider's hosted checkout; the game must never receive or store card data. After a verified payment webhook, store an entitlement on the server keyed to the account and order reference. The server, not `localStorage`, is the authority. Provide restore-purchase, refunds/support handling, idempotent webhook processing and an audit trail. None of these components exists in this candidate.

## Infrastructure decision still required

Before a beta can start, choose a host and budget, verify domain/control of the identity provider, decide whether user accounts are truly needed, approve a privacy notice and incident contact, decide save retention/export, and test restore/rollback. Current work has not inspected or changed external infrastructure, DNS, Cloudflare or VPS configuration.
