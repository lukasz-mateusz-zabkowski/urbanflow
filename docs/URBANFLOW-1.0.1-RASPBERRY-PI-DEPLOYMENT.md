# UrbanFlow 1.0.1-alpha — Raspberry Pi 5 deployment runbook

This is a gated runbook, not authorization to deploy. Do not run its change steps until the owner separately approves deployment of the exact SHA. The Pi controller was unavailable during release hardening, and the repository does not contain the active Compose project or USB mount configuration. Discover those values on the host before using this runbook; never assume Docker data is on the Samsung T5.

## Candidate identity

- Candidate: `1.0.1-alpha`
- Source: the reviewed full Git SHA recorded with the approved release candidate tag `v1.0.1-alpha`.
- Image: build and retain both a readable version tag and an immutable tag containing the full source SHA.
- Target architecture: verify the Pi OS/architecture first; use `linux/arm64` only if inventory confirms it.
- Dockerfile: uses Node 22 Alpine, installs production dependencies with `npm ci --omit=dev`, copies only the server and public assets, and runs as the non-root `node` user.

## 1. Read-only host inventory

Connect through the approved administrator path and record a timestamp. Do not restart services or run `docker compose down`.

1. Record OS, kernel, CPU architecture, Docker and Compose versions, uptime, memory, and filesystem usage.
2. List running and stopped containers. Identify the actual UrbanFlow container by labels, image, ports, and Compose project/service labels. Confirm whether it is the expected 0.4.0 container; do not rely solely on its name.
3. Record the current immutable image ID/digest, container health, restart policy, networks, published ports, bind mounts and named volumes.
4. Inspect Compose projects and the active Compose file path. Record dependencies and shared networks, but do not stop or recreate them.
5. Identify the Samsung T5 by device and filesystem UUID using `lsblk`, `findmnt`, and `df -h`. Compare its mount with Docker `Root Dir`, Compose bind mounts, and any volumes. If no mount relationship is confirmed, treat the T5 as unrelated to Docker storage.
6. Record available space on the actual image storage filesystem and on the confirmed backup destination. Allow room for the current image, candidate image, export archive, backups, and a safety margin. Stop if the relevant mount is missing or space is insufficient.
7. Test the existing local health endpoint and the known public game URL. Record status, reported version, timestamp and image ID. If no authoritative URL is available, mark public-path verification pending.
8. Identify independent recovery access and verify the previous image/archive and configuration backup can be read. A backup that has not been listed and checksum-verified is not a rollback plan.

Protect outputs from `docker inspect` and Compose configuration because environment variables can contain secrets. Store redacted inventory and full secret-bearing backups only in the approved restricted location.

## 2. Prepare and verify backups

Before changing the host, record and preserve:

- The current UrbanFlow image ID/digest and an immutable old-image tag; export the old image if it cannot be retrieved from a trusted registry.
- The exact Compose file, referenced override files, and a restricted backup of its environment/configuration files.
- The current UrbanFlow container inspection and its mounts/networks.
- Any app-owned persistent data discovered during inventory. The repository app itself is static and has no server-side game database, but do not infer that existing host mounts are disposable.
- A checksum for each image archive and configuration backup; test that archives can be listed/read.

Game campaigns are stored in browser `localStorage` under `urbanflow.krakow.v2`, not in the container. Before a browser first opens the new game, export a copy of this value from each browser profile containing progress and keep it with the owner's protected backup. Verify sample exports are valid JSON and retain the original untouched.

## 3. Build the exact image off the Pi

On the reviewed developer checkout, confirm `git rev-parse HEAD` equals the approved full release SHA and the tree contains only reviewed changes. Build for the architecture confirmed by inventory. Pass the full commit as build metadata:

```sh
docker build --platform linux/arm64 \
  --build-arg URBANFLOW_COMMIT_SHA=<full-approved-sha> \
  -t urbanflow:1.0.1-alpha -t urbanflow:<full-approved-sha> .
```

Do not build from a moving branch name. Verify the image revision label equals the full SHA. The container healthcheck must report healthy only when `/health` returns HTTP success and the version equals the image's `package.json`. The JSON response includes the commit only when it is a valid hexadecimal SHA. Confirm the health payload's version and commit before transfer.

Run `npm ci`, both audit scripts, Node tests, Playwright tests, and the container-health workflow before transferring the image. If using an archive, create it on the developer workstation, calculate a SHA-256 checksum, transfer it through the approved channel, and verify the checksum on the Pi before loading. Copy to the T5 only after mount identity and free space are confirmed.

## 4. Pre-cutover checks

1. Inspect the actual Compose service definition and confirm the image, ports, dependencies, healthcheck, mounts and restart policy. Do not replace the project with a guessed Compose file.
2. Validate Compose syntax without printing secret values to logs. Confirm the candidate service can be updated without stopping unrelated services; if not, stop and prepare a service-specific maintenance plan.
3. Confirm the new image is present locally, its full-SHA label matches the approved commit, and the old image is still available.
4. Confirm backups and recovery access again. Ensure browser save exports exist before the first public visit to the new code.
5. Confirm the health endpoint returns version `1.0.1-alpha` plus the expected commit, and Docker reports the container healthy. HTTP 200 by itself is insufficient.

## 5. Controlled cutover, only after separate approval

Use the discovered Compose project path and actual service key. Update only the UrbanFlow image reference to the immutable candidate tag, then recreate only that service using the reviewed service-specific command. Do not run `docker compose down`, prune images/volumes, or restart shared dependencies.

After the service is up, verify:

- Docker health state and `GET /health` version plus full commit SHA.
- Local and public HTTPS routes, HTML, JavaScript/CSS, `/vendor/leaflet/leaflet.js`, and map tiles.
- Browser console, desktop and mobile layout, and a new schema-7 save.
- A disposable copy of each legacy schema migrates to schema 7 with budget, fleet, lines, schedules, calendar, cohorts, mobility, campaign progress and analytics preserved.
- Other Pi containers, services, storage and public routes remain healthy.

Record the cutover time, old/new image IDs, source SHA, image digest, health payload and test results.

## 6. Rollback

Rollback only the UrbanFlow service to the exact old image ID/digest and restore its saved Compose/configuration reference. Recreate only that service; do not stop dependencies. Verify the old container's health/version, local and public route, and dependent services. Keep both image artifacts and backups until acceptance is complete.

Restoring the old container does **not** reverse browser storage migration. A schema-7 save may not be readable by the old 0.4.0 app. If users opened the new version, restore each browser's pre-upgrade `urbanflow.krakow.v2` copy before opening the old version, or keep a compatible newer app available. Do not tell users that a container rollback alone restores their saves.

## GO / NO GO gates

**GO** only after all inventory fields are known, the actual image/storage relationship and free space are confirmed, configuration and save backups are verified, the candidate SHA and image digest match, tests and health checks pass, no unrelated service restart is required, and recovery is available.

**NO GO** if the Pi tunnel/administrator access is unavailable, the active Compose service or dependencies are unknown, T5 identity or capacity is unverified, old artifacts/backups cannot be restored, health version/SHA differs, public checks fail, schema compatibility is uncertain, or any unrelated service would need an unapproved restart.

No deployment actions were performed while preparing this runbook.
