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
# Audit 2026-05-30: the previous runtime stage copied ONLY
# apps/daemon/node_modules, which in a pnpm workspace is a tree of RELATIVE
# symlinks (../../node_modules/.pnpm/...) into the root virtual store. The store
# was never copied, so every dependency resolved to a dangling symlink → the
# daemon crash-looped on boot. Preserve the full workspace layout — root
# node_modules (the .pnpm store) AND apps/daemon/node_modules (the symlinks) —
# so the relative links resolve, then run from apps/daemon.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/daemon/node_modules ./apps/daemon/node_modules
COPY --from=build /app/apps/daemon/dist ./apps/daemon/dist
COPY --from=build /app/apps/daemon/package.json ./apps/daemon/package.json
ENV NODE_ENV=production
WORKDIR /app/apps/daemon
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:8787/healthz || exit 1
EXPOSE 8787
CMD ["node", "--enable-source-maps", "dist/index.js"]
