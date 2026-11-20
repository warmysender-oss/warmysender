FROM node:26-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/server/package.json apps/server/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:26-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
RUN chmod +x /app/scripts/docker-entrypoint.sh
USER node
EXPOSE 3000
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["node", "apps/server/dist/index.js"]
