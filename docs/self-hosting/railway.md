# Railway

[`railway.toml`](../../railway.toml) at the repository root tells Railway to build the root `Dockerfile`:

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"
```

Railway's config-as-code reference (https://docs.railway.com/config-as-code , https://docs.railway.com/config-as-code/reference) says `railway.toml` is deprecated. Existing files keep working for services that already use them until 2026-12-01, and a new service cannot opt into config-as-code. The file is here because the build spec asks for `railway.toml`. Railway also builds a root `Dockerfile` when it finds one (https://docs.railway.com/builds/dockerfiles), which is the path this file selects.

`deploy.healthcheckPath` is `/health`. The server answers `GET /health` and `GET /api/health` with `200` and `{ "ok": true }`. `deploy.startCommand` is omitted, so the image `CMD` starts the app: `node apps/server/dist/index.js`.

## Services

Compose on a single machine runs `app`, `worker`, and `postgres` together. On Railway those are separate services.

1. Create a project and add a PostgreSQL database. Railway exposes its connection string as `DATABASE_URL`. Use that as `DATABASE_URL` for the app and the worker.
2. Create a service from this GitHub repository for the app. The Dockerfile build is the app process.
3. Create a second service from the same repository and the same Dockerfile for the worker. Set its start command to `node apps/worker/dist/index.js` (the `worker` service command in `docker-compose.yml`). On a Dockerfile service, a start command overrides the image `CMD` (https://docs.railway.com/deployments/start-command).
4. Set `ENCRYPTION_KEY`, `SESSION_SECRET`, and `PUBLIC_URL` on both services. `PUBLIC_URL` is the public `https` origin of the app service, with no trailing slash. The image sets `NODE_ENV=production`, and the server refuses the development secrets from `docker-compose.yml` in production. Generate the two secrets the way `.env.example` describes. Optional Microsoft variables are in [the self-hosting table](README.md).

The server reads `PORT` (default 3000) and `HOST` (default `0.0.0.0`). Railway injects `PORT` and expects the process to listen on `0.0.0.0` and that port (https://docs.railway.com/networking/troubleshooting/application-failed-to-respond). Set `PUBLIC_URL` to the public origin Railway gives the app.

After deploy, `GET /health` on the public origin should return `{ "ok": true }`. `docker compose run app doctor` and `pnpm doctor` are the build spec's deeper check. The foundation image has no `doctor` command yet. The mailbox task adds it.

Microsoft redirect registration uses `${PUBLIC_URL}/api/oauth/microsoft/callback`. See [MICROSOFT-APP.md](../MICROSOFT-APP.md).
