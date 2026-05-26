# Klaro daemon — multi-stage build for Railway.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/daemon/package.json apps/daemon/tsconfig.json apps/daemon/
COPY apps/daemon/src apps/daemon/src
RUN pnpm install --frozen-lockfile --filter @klaro/daemon...
RUN pnpm --filter @klaro/daemon build

FROM node:22-alpine AS runtime
WORKDIR /app
COPY --from=build /app/apps/daemon/dist        ./dist
COPY --from=build /app/apps/daemon/node_modules ./node_modules
COPY --from=build /app/apps/daemon/package.json ./
ENV NODE_ENV=production
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:8787/healthz || exit 1
EXPOSE 8787
CMD ["node", "--enable-source-maps", "dist/index.js"]
