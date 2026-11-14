# Parsec Admin Tool

A standalone, optional Docker service for human-facing operations visibility and test searches. It is not part of the Parsec runtime dependency chain: Gateway, Search, and workers continue to work when it is stopped or removed.

## First local vertical slice

- Live library inventory and total bytes.
- Analysis queue counters: queued, leased, completed, and dead-lettered jobs.
- Worker cards with CPU/GPU type, lifecycle state (`STARTING`, `READY`, `OFFLINE`), capabilities, model, capacity, active jobs, and heartbeat status.
- Latest 20 jobs with path, status, worker, attempts, timestamps, and visible failure reason.
- Latest library scan and Search ingestion/deletion outbox counters.
- Search test form via Gateway and playback via short-lived stream tickets.
- Dashboard refreshes every four seconds.
- Read-only: no job mutation, worker shutdown, or reindex controls.

## Architecture and security

- Browser talks only to the Admin backend (same-origin API).
- Backend talks to Gateway over the private Docker network.
- Gateway is the source of truth for inventory, workers, jobs, and outbox state.
- Search remains API-only; its embedded browser UI is removed.
- Gateway exposes `GET /internal/v1/admin/overview`, protected by a dedicated `PARSEC_ADMIN_INTERNAL_TOKEN`.
- The Admin token is held server-side and is never sent to browser JavaScript.
- Search and playback use Gateway public API routes; the browser never contacts Search directly.
- Audio streaming is proxied without a short request timeout and supports byte-range playback.
- Optional Compose profile `admin`; core Parsec services do not depend on this container.
- Local E2E port is bound to `127.0.0.1:18767` only.
- Containers use `Europe/Berlin`.

## Run locally

From `C:\parsec\e2e`, with the E2E stack running:

```powershell
docker compose --env-file .env -f compose.yaml --profile admin up -d admin
```

Open [http://localhost:18767](http://localhost:18767).

Stop only the optional Admin container:

```powershell
docker compose --env-file .env -f compose.yaml --profile admin stop admin
```

The local token is stored in the ignored E2E `.env` file. Do not copy it into source control.

## Backend API

- `GET /api/overview` - authenticated Gateway overview, proxied server-side.
- `GET /api/health` - sanitized Gateway readiness and Search health.
- `POST /api/search` - Gateway search proxy.
- `POST /api/tracks/:trackId/stream-ticket` - Gateway short-lived stream ticket.
- `GET /api/stream/:ticketId` - streamed audio proxy, including byte-range requests.

## Production

Not wired into production Compose, Nginx, release workflows, or deployments. Production integration remains an explicit later decision.
