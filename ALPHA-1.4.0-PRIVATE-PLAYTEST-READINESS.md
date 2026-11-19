# UrbanFlow ALPHA 1.4.0 — private playtest readiness

## Status

- **GO for the package** after the current branch commit passes its GitHub Actions workflow.
- **NO GO for starting a real tester session from this Surface Book:** Docker Desktop's Linux engine is unavailable and there is no independent host or authorized private access path available in this environment. CI results are not represented as testing on that host.
- No public endpoint, external access service, tester account, production system, or Raspberry Pi was configured or contacted.
- Nie przeprowadzono sesji ani nie zaproszono testerów.

## Version and commit identities

- Game version: `1.4.0-alpha` (`package.json`).
- Release tag `v1.4.0-alpha` and base game code: `346bcbe9880d8719d4c8cf8a3d8b26a6e89b2491`.
- The first private Compose profile was added later at `c2b0ea1a7241fd4bb4f545405e6547c8d4aac4fb`; this work adds a guard and operator wrapper so a value passed through the environment cannot impersonate different source code.
- **Build SHA rule:** use one full, reviewed SHA from `feature/alpha-1.4.0-private-playtest`; the checked-out `HEAD`, `.env.alpha-test` `URBANFLOW_COMMIT_SHA`, Compose image tag and image revision label, container environment, and `/health.commit` must all equal that SHA. Do not use the old release tag as the hardened profile source.
- Current implementation SHA, final branch HEAD, and Actions link will be inserted after push/verification.

## Guard and isolation

`npm run alpha-test -- verify` checks the real `git rev-parse HEAD` against `.env.alpha-test`, requires a 40-character SHA, and rejects modified tracked files or untracked build inputs. Only `.env.alpha-test` is allowed to be untracked. The guard's tests use temporary Git repositories and demonstrate that it accepts a matching checkout and rejects a mismatched SHA, dirty source, unexpected untracked inputs, and malformed SHA values.

The cross-platform Node wrapper offers `verify`, `start`, `restart`, `status`, `stop`, and `rollback`. Before starting or restarting, it checks the SHA; after launch/restart/status it checks app version, exact commit, alpha environment, image revision, `/health`, page and Leaflet asset, loopback binding, `node` user, read-only root, zero mounts, dropped capabilities, `no-new-privileges`, no automatic restart, `/tmp` tmpfs and exactly one Docker internal network. Compose binds only `127.0.0.1:3101`; its internal network has no external egress. No production mounts, secrets, or saves are configured.

For a small invited group, the kit documents a non-administrative tunnel-only OS account and per-person SSH keys through an already authorized private path. Each tester uses a local SSH tunnel to reach `127.0.0.1:3101`; they receive no repository, Docker, production, or admin access. The host owner must create/restrict these accounts under their approved access process; none were created here.

The application browser requests existing OpenStreetMap tiles directly. Game saves and feedback are not sent there. If policy prohibits all external browser requests, stop before playtesting until approved offline tiles are provided.

## Host procedures and tester material

[ALPHA-1.4.0-PRIVATE-PLAYTEST-KIT.md](ALPHA-1.4.0-PRIVATE-PLAYTEST-KIT.md) contains separate Windows/Docker Desktop and Linux/Docker Engine instructions using the source guard, private tunnel steps, the three sessions (first campaign, bus/tram construction, economy/investment), a manual feedback JSON export process, issue-register template, and rollback steps.

The old [ALPHA-1.4.0-PLAYTEST.md](ALPHA-1.4.0-PLAYTEST.md) now directs operators to the hardened procedure and explicitly rejects direct Compose startup that could mismatch source and metadata.

## Local validation on Surface Book

- `npm ci`: **pass**, 0 vulnerabilities.
- `npm test`: **236/236 pass** before final docs-only cleanup; source-guard and alpha-config tests pass independently on the current edits.
- `npm run test:browser`: **25/25 pass** on the existing app UI, including full tutorial, feedback JSON and desktop/mobile paths. No playtest container was started locally.
- Browser viewport coverage includes 360×800 and 390×844 touch layouts plus desktop 1920×1080, 1366×768, and 1280×720.
- Additional 360×800 mobile repeat: **3/3 pass**.
- `npm run audit:all`: **0 vulnerabilities**.
- `npm run audit:production`: **0 vulnerabilities**.
- `docker compose -f compose.alpha-test.yml config` with explicit SHA: **pass**; rendered config confirms `127.0.0.1:3101`, internal network, no volumes, read-only, dropped capabilities, `no-new-privileges`, tmpfs and `restart: no`.
- `git diff --check`: pass.
- Docker Engine check failed because `dockerDesktopLinuxEngine` named pipe is absent. Therefore host-side startup, restart, invitee tunnel, stop and rollback are **not locally verified**.

## GitHub Actions

The previous workflow runs #81 and #82 predate the SHA-guard and internal-network changes, so they are not evidence for this revision. The current branch push must pass six jobs: Node 18, Node 20, Node 22, Playwright, security audit, and container health. The updated container-health job verifies checkout SHA, deliberately tests a mismatched SHA rejection, then runs the wrapper through start, health/config inspection, restart, status and stop. Its result will be recorded after it runs on the current commit.

## Actual-run decision and risks

- **Package: GO** once the current revision's six Actions jobs are green.
- **Actual playtest session: NO GO until** a separate non-Raspberry-Pi host is chosen, its network is isolated from production, its exact SHA is checked with the wrapper, and the owner provisions the already approved private invite path. No public exposure is authorized by this report.
- No local Docker runtime or tester SSH path was available, so CI's ephemeral runner is the only possible runtime evidence here; it must not be described as a real-host or real-tester test.
- Browser `localStorage` survives a container rollback. Use separate browser profiles/origins for each version; rollback does not reverse schema migrations.
- No merge, tag, GitHub Release, production change, or Raspberry Pi operation was performed.
