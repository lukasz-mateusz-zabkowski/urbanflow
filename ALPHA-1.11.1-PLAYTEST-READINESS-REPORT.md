# UrbanFlow Atlas 1.11.1 — Playtest readiness report

Date: 2026-11-25

## Status

**Package: GO for review and local, owner-operated playtesting. External invited-player access: NO GO for now.** No external host, authentication gateway, private tunnel, or tester accounts were configured. This report does not authorize a public or production deployment.

## Source and delivery

- Base: `e98f3f4908a1b3a4fe3201d5a5e1c6007834aa10` (1.11.0).
- Implementation commit: `462686c7d0c18105944283b95a04a8bb2a1edfe2`.
- Branch: `feature/alpha-1.11.1-playtest-readiness`.
- Candidate worktree: `C:\Users\Łukasz\.codex\.chatgpt-projects\g-p-676e828ccbf48191b81036b85a826958\urbanflow-alpha-1.11.1-playtest-readiness`.
- Feature branch was pushed; local and remote HEAD matched the implementation SHA before this report was added. No main merge, tag, release, production change, Raspberry Pi operation, or tester invitation was performed.

## What changed

The branch adds a self-guided playtest guide with three test paths, version/commit visibility, a voluntary post-session survey, safe local JSON exports, and privacy copy explaining that reports are not sent automatically and free text should be reviewed before sharing. The survey accepts only allowlisted fields and bounded free text; tester/device identifiers and browser storage are not included in its report. Save export remains a separate local action. Failed downloads show a recoverable error rather than throwing an uncaught browser exception.

The automated tests exercise the guide and feedback flow, report privacy/allowlisting, exports, no network submission, and failure cases. They also preserve the existing tutorial, transport, investment, save/resume, and responsive browser coverage.

## Validation

| Check | Result |
|---|---|
| `npm ci` | PASS; 72 packages installed |
| `npm test` | PASS; 307/307 tests |
| `npm run test:browser` | PASS; 52/52 tests |
| `npm run audit:all` | PASS; 0 vulnerabilities |
| `npm run audit:production` | PASS; 0 vulnerabilities |
| `git diff --check` | PASS before implementation commit |
| Live OSM tile check | PASS; 16/16 unique tile responses successful, 0 page errors |

Live OSM screenshot: `%TEMP%\urbanflow-alpha-1.11.1-qa\desktop-live-osm-1366x768.png` (outside the repository). Browser tile outage and local fixture cases are separate from this live tile check.

### UI performance sample

Compared exact base 1.11.0 (`127.0.0.1:3114`) against candidate 1.11.1 (`127.0.0.1:3113`) at 1366×768. The existing benchmark alternated four fresh-session rounds and gathered 60 warmed samples per version for Passenger Flow layer selection through two paint frames:

- 1.11.0: median 31.0 ms, p95 46.8 ms.
- 1.11.1: median 30.6 ms, p95 46.6 ms.
- Median delta: −1.3%.

This is a narrow local UI interaction measurement, not a full simulation, memory, startup, or save benchmark and not a guarantee for other hardware.

## Local candidate

The candidate server is running at **http://127.0.0.1:3113/** and is bound only to `127.0.0.1`. `/health` returned version `1.11.1-alpha`, commit `462686c7d0c18105944283b95a04a8bb2a1edfe2`, and environment `alpha-test`. The page and local assets were reachable. Port 3114 was used only for the baseline benchmark and has been stopped. Existing ports 3101–3113 were otherwise left alone.

Start on Windows from the candidate worktree:

```powershell
npm.cmd ci
$env:HOST='127.0.0.1'
$env:PORT='3113'
$env:URBANFLOW_ALPHA_TEST='1'
$env:URBANFLOW_COMMIT_SHA=(git rev-parse HEAD)
node server.js
```

Open `http://127.0.0.1:3113/`. Stop only this server with Ctrl+C in its own console.

## Tester kit and privacy process

1. Owner shares the local guide and only the scenario relevant to the session.
2. Tester can run: first campaign/tutorial (about 15 min), transport and decisions (about 45–60 min), or longer save/resume exploration.
3. Tester may submit feedback using the existing form or export a JSON report locally. There is no automatic upload.
4. Review free text and remove names, email addresses, or other personal data before sharing.
5. Track reports by optional anonymous session code, version, device category, scenario, rating, issue, priority/frequency, and repair status. Do not record IPs or unnecessary identifiers.

For 3–5 remote testers, use an independently hosted instance on a separate origin behind authenticated, individually revocable access. Do not expose the development workstation or its other services. No access method was enabled here; a local loopback server is not reachable by remote testers.

## Isolation and rollback limits

No Docker Compose runtime was exercised locally; GitHub Actions did exercise the isolated alpha Compose profile. Do not claim that CI proves an independent host launch. No public ports, external tunnel, DNS, or accounts were configured. Use a fixed reviewed SHA and separate origin/browser profile for any future host. Roll back by switching the isolated host to the previous immutable image/checkout; browser saves migrated by a newer game may not be readable by an older build, so retain exports and test rollback against copies first.

## GitHub Actions

Implementation commit workflow: [run 45610461658](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/45610461658) — **6/6 SUCCESS**: Node 18, 20, 22, browser-test, security-audit, and container-health (including isolated alpha Compose profile).

This report is a documentation-only addition. Its commit triggers a fresh workflow; verify that run against the final branch HEAD before treating the report commit itself as CI-verified.

## Known limits and decision

- Four requested scenarios (new campaign/tutorial, bus line/passengers, financial review, investments/city development) were completed by the owner earlier; the remaining tramway and save/resume paths were exercised automatically in isolated Playwright contexts. This report does not claim new manual user testing or UX ratings.
- No physical-phone test was performed; mobile checks are browser emulation.
- No external private beta host was started, no testers were invited, and no real remote access/revocation exercise was performed.
- The local candidate is a developer test instance, not a private hosted beta.

**GO:** code/test package is ready for owner review and local playtest. **NO GO:** remote closed beta until an independent host and authenticated private access are separately approved and verified.
