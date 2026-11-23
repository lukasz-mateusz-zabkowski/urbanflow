# UrbanFlow ALPHA 1.4.1 — Final Integration

**Decision: GO**  
**Initial `main`:** `346bcbe9880d8719d4c8cf8a3d8b26a6e89b2491`  
**Expected candidate at review start:** `1c193389f528019a71b1aa942585e5d9d866e88a`  
**Final `main`:** `ba9b26bde56a51ac299eb74126e7b910fe1de2ea`  
**Release tag:** `v1.4.1-alpha` (annotated; peels to final `main`)

This report documents the integration. The report itself is stored on the feature branch as a documentation-only commit; it does not change the release commit or tag.

## Scope and review

The candidate includes the earlier private playtest package and the 1.4.1 hardening changes. The package adds an isolated Compose profile, source-SHA guard and playtest lifecycle script, private tester kit/readiness documentation, and CI coverage for SHA mismatch, startup, restart, status, stop, rollback and container health. The 1.4.1 changes update the app version, make the tram browser scenario unlock trams through real campaign progression, add manual-track save/reload coverage, and use deterministic local SVG tiles in the test fixture while keeping live OSM verification separate.

Final review found that feedback UI already received the app version from `/health`, but `feedback.js` still contained a manually maintained `FEEDBACK_VERSION` fallback. The fallback was removed. `main.js` reads `/health` once during startup and passes that version to the feedback form; submission performs no additional network request. A static preview without `/health` labels the version `unknown`. The new Node regression test exercises the real health endpoint and checks the JSON report version.

No save format, campaign, passenger, route, tram, investment, or economy rules were changed in the final-review fix. Save schema 11 and the existing migration chain remain unchanged.

## Version and private-test safety

- `package.json` and `package-lock.json`: `1.4.1-alpha`.
- `server.js` reads the version from `package.json`; `/health` includes only a valid commit SHA when supplied.
- The UI build badge and feedback JSON use the version already read from `/health`.
- Docker image build metadata, OCI revision label, container environment and `/health` are pinned to the configured full SHA and checked by the playtest script and CI.
- `compose.alpha-test.yml` binds the host port only to `127.0.0.1`, runs as `node`, uses a read-only root filesystem, mounts no host volumes, drops all capabilities, sets `no-new-privileges`, and disables automatic restart. The tester guide requires an already-approved private tunnel and gives testers no repository or admin access.
- GitHub reported `main` as unprotected and no repository or inherited rulesets. The detailed branch-protection endpoint returned 403 to the connected integration; this was not treated as evidence of a PR requirement. The ordinary fast-forward push succeeded.

The Compose profile was not run against the active Surface Book instances. CI's isolated container-health job ran it, checked the loopback binding and image SHA, and exercised start, restart, status, stop and rollback. No Docker operation was performed against the local `3101` or `3102` instances.

## Functional and save coverage

The passing suite covers the 12-step tutorial and resume, bus routing over the local directed road graph, tram unlock through gameplay, street/manual/existing-track modes, shared and partially shared track cost, geometry-only edits, cancel-without-charge, touch editing, investment lifecycle, feedback JSON, private-playtest SHA/config checks and mobile layouts. Browser tests save and reload campaign state and verify schema 11. Node tests cover schema 11 migration/persistence, saved tram geometry and idempotent infrastructure/cost behavior.

The passing browser run includes desktop resolutions 1920×1080, 1366×768 and 1280×720, plus mobile emulations 390×844 and 360×800. Touch results are browser emulation, not a physical-phone test.

## Test results

| Check on candidate `ba9b26b` | Result |
|---|---|
| `npm ci` | Pass; 72 packages installed |
| `npm test` | Pass; 238/238 tests |
| `npm run test:browser` | Pass; 26/26 tests |
| `npm run audit:all` | Pass; 0 vulnerabilities |
| `npm run audit:production` | Pass; 0 vulnerabilities |
| `git diff --check` | Pass |

The final `main` workflow is [GitHub Actions run 45186724660](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/45186724660) on `ba9b26bde56a51ac299eb74126e7b910fe1de2ea`. All six jobs succeeded: Node 18, Node 20, Node 22, browser test, security audit and container health.

## Integration and tag evidence

`main` was unchanged at the expected initial SHA before integration. `git merge --ff-only origin/feature/alpha-1.4.1-playtest-hardening` advanced it directly to `ba9b26b…`; no merge commit, rebase, squash or force push was used. The standard push succeeded, and local `main`, remote `main`, the candidate code commit and the dereferenced release tag all resolve to `ba9b26bde56a51ac299eb74126e7b910fe1de2ea`.

The annotated tag was created only after the successful main workflow. Its tag object is `c2a3e8195b407083f96541922340886c6d8cbd41`; the peeled commit is `ba9b26bde56a51ac299eb74126e7b910fe1de2ea`. No GitHub Release was published.

## Preserved local state and limits

- Production/Raspberry Pi and production data were not accessed.
- The existing `127.0.0.1:3101` stable instance was left running at version `1.4.0-alpha`, commit `346bcbe…`.
- The existing `127.0.0.1:3102` instance was left running and not restarted; it still reports its previously launched commit `1c193389…`. It was not used as evidence for final code `ba9b26b…`.
- Tester feedback and physical-device usability were not collected in this automated integration. Mixed OSM and player-built tram routes remain a known limitation.
- A separate live OSM check during hardening loaded 16 tiles with HTTP 200 and no JavaScript errors. This is an observation at that time, not a guarantee of external tile-service availability.

**Final recommendation: GO.** ALPHA 1.4.1 is integrated on `main`, all six main CI jobs passed on the final code SHA, and the annotated tag points to that exact commit. No production deployment was performed.
