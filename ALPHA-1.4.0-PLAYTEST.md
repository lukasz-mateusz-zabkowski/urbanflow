# UrbanFlow Alpha 1.4.0: isolated playtest

This setup is for local or explicitly access-controlled alpha testing. It does not publish a test service and is not used by `main` deployments.

## Run an isolated copy

1. Copy `.env.alpha-test.example` to `.env.alpha-test` and set `URBANFLOW_COMMIT_SHA` to the 40-character SHA being tested.
2. Run `docker compose --env-file .env.alpha-test -f compose.alpha-test.yml up --build`.
3. Open `http://127.0.0.1:3101/`. The service binds only to loopback, uses no persistent volume, reports `environment: alpha-test`, and sends `X-Robots-Tag: noindex, nofollow, noarchive`.
4. Check `/health`: its version must equal `package.json`, and its `commit` must equal the chosen SHA. The container healthcheck checks both values.
5. Stop the test copy with `docker compose --env-file .env.alpha-test -f compose.alpha-test.yml down`.

The separate port/origin keeps browser local storage isolated from the usual game origin. Do not place this service behind a public proxy without invite-only access control. The Compose file has no shared save volume and does not alter production compose configuration.

## Playtest scenarios

- **A · First campaign:** Start a fresh campaign, use the 12-step guide, skip it, resume it, and inspect the next campaign objective. Confirm no reward or campaign state changes when toggling the guide.
- **B · Decisions and constraints:** Preview a starter line and its cost, inspect fleet and investment decisions, and cancel before approval. Verify that only an explicit confirmation changes budget or starts a project.
- **C · Learn from the network:** Let a real line operate, inspect passenger and network diagnostics, change service, and compare the observed network after that change. Record whether the hint matches visible queue or line data.

For each scenario, note device/viewport, steps, expected and observed result, severity, and an optional screenshot. Use the in-game feedback form; context and diagnostics are optional and require separate explicit consent. Reports are generated locally as JSON and are not uploaded. Avoid names, contact details, save files, or other personal information in the description.

## Rollback

For a local alpha image, stop the container and run the previously reviewed commit's image by its exact SHA tag. Browser data is separated by origin; any deliberate shared-origin test must use a disposable browser profile and a backup export first. Do not test schema migrations against the production origin or production saves. Production release and rollback require a separate reviewed release process.
