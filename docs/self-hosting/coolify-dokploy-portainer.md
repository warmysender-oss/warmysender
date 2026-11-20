# Coolify, Dokploy, and Portainer

These panels run the repository Compose file unchanged. The `app` and `worker` services use `ghcr.io/warmysender-oss/warmysender`. Leave that image in place so the panel pulls the published image.

## Deploy

1. Create a new resource from this Git repository: https://github.com/warmysender-oss/warmysender
2. Choose the Compose file at the repository root (`docker-compose.yml`).
3. Set the environment variables from [the self-hosting table](README.md). Copy the names and comments from `.env.example`.
4. Set `PUBLIC_URL` to the public `https` origin of the `app` service (for example `https://mail.example.com`). Unsubscribe links and the Microsoft redirect are built from it.
5. Attach your domain to the `app` service. On a laptop the Compose file serves that service at http://localhost:3000.
6. Deploy, then run the doctor command from the panel's shell for the project:

```bash
docker compose run app doctor
```

Postgres and the worker are already in the Compose file. The queue is pg-boss in that same Postgres service.

Microsoft 365 / Outlook still needs the Entra app in [MICROSOFT-APP.md](../MICROSOFT-APP.md). The redirect you register is `${PUBLIC_URL}/api/oauth/microsoft/callback` using the same `PUBLIC_URL` as the running site.

## Updating

Pull the repository (so Compose still points at the published image) and redeploy. Image tags are described in [Docker Compose](docker.md#update).
