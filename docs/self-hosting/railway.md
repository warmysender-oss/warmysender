# Railway

[`railway.toml`](../../railway.toml) at the repository root tells Railway to build the root `Dockerfile`:

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"
```

Railway's config-as-code reference (https://docs.railway.com/config-as-code , https://docs.railway.com/config-as-code/reference) says `railway.toml` is deprecated. Existing files keep working for services that already use them until 2026-12-01, and a new service cannot opt into config-as-code. The file is here because the build spec asks for `railway.toml`. Railway also builds a root `Dockerfile` when it finds one (https://docs.railway.com/builds/dockerfiles), which is the path this file selects.

`deploy.healthcheckPath` is omitted. The build spec requires a health endpoint and leaves the path unnamed. `deploy.startCommand` is omitted so the image `CMD` from the `Dockerfile` is what starts.

## Services

Compose on a single machine runs `app`, `worker`, and `postgres` together. On Railway those are separate services.

1. Create a project and add a PostgreSQL database. Railway exposes its connection string as `DATABASE_URL`. Use that as `DATABASE_URL` for the app and the worker.
2. Create a service from this GitHub repository for the app. The Dockerfile build is the app process.
3. Create a second service from the same repository for the worker. Use the worker command documented in the `Dockerfile` and `AGENTS.md` for `apps/worker`.
4. Set `ENCRYPTION_KEY`, `SESSION_SECRET`, and `PUBLIC_URL` on both services that run the app code. `PUBLIC_URL` is the public `https` origin Railway gives the app service. Optional Microsoft variables are in [the self-hosting table](README.md).

Railway injects `PORT` and expects the process to listen on `0.0.0.0` and that port (https://docs.railway.com/networking/troubleshooting/application-failed-to-respond). A Dockerfile service starts the image `CMD` when `startCommand` is unset (https://docs.railway.com/deployments/start-command). The Compose install in this repository is specified at http://localhost:3000, so the server needs to honor `PORT` on Railway for the generated domain to answer. That listen address is part of the server from the foundation task. Set `PUBLIC_URL` to the public origin.

Then, from a shell on the app service, the checks the spec names are the doctor command. On Compose that is `docker compose run app doctor`. On Railway, run `pnpm doctor` only when that service is a source checkout with pnpm installed. A Docker image should include the same `doctor` entrypoint the Compose service uses (`docker compose run app doctor`).

Microsoft redirect registration uses `${PUBLIC_URL}/api/oauth/microsoft/callback`. See [MICROSOFT-APP.md](../MICROSOFT-APP.md).
