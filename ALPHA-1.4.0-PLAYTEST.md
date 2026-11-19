# UrbanFlow ALPHA 1.4.0: private playtest

This file points to the current hardened instructions. Do not run the old direct Compose commands from previous copies of this guide: they tagged an arbitrary build context with a caller-supplied SHA without first verifying the checkout.

The game release tag `v1.4.0-alpha` points to base SHA `346bcbe9880d8719d4c8cf8a3d8b26a6e89b2491`. The private-test configuration was added later on `feature/alpha-1.4.0-private-playtest`; use an explicitly reviewed full SHA from that branch. The private test keeps package version `1.4.0-alpha`, while image metadata and `/health.commit` identify that later configuration commit.

Use [`ALPHA-1.4.0-PRIVATE-PLAYTEST-KIT.md`](ALPHA-1.4.0-PRIVATE-PLAYTEST-KIT.md) for the Windows/Docker Desktop and Linux/Docker Engine procedures, SHA guard, restricted tester tunnel, scenarios, JSON feedback, and rollback. Run `npm run alpha-test -- verify` before `start`; never run raw `docker compose up` for this profile.

The app port remains bound to `127.0.0.1:3101`. No production origin, saves, secrets, Raspberry Pi, public endpoint, or GitHub Release is part of this setup.
