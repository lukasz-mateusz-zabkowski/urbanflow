# UrbanFlow operations

## Development and release boundaries

- Develop and review changes on a developer workstation and a feature branch.
- Raspberry Pi 5 hosts approved releases only. Do not edit game source on that host.
- Never deploy the newest `main` branch automatically. A release must identify an approved commit SHA.
- Keep the previous known-good release artifact and its SHA available before replacing a release, so rollback can restore that exact version.
- Do not change production saves or restart production containers as part of local development.
- Alpha builds are for local acceptance. This document does not prescribe a host-specific deploy command because the repository does not contain the production release automation or container procedure.

## Local development

Requirements: Node.js 18 or newer.

```bash
npm ci
npm test
npm start
```

The game is served at `http://localhost:3000`; `GET /health` reports the app version. Set `HOST` or `PORT` to change the bind address or port. Leaflet assets are served from the local npm dependency. OpenStreetMap tiles require internet access; the game simulation and its routing data do not.

## Rollback record

For every approved production release, record the full commit SHA, release artifact/image identifier, deployment time, and previous known-good SHA/artifact. Roll back by restoring the previous immutable artifact and verifying `/health`. Never use a moving branch name as a rollback target.
