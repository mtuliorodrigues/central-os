FROM node:22-bookworm-slim AS frontend-build

WORKDIR /workspace/apps/central-os/frontend
COPY apps/central-os/frontend/package*.json ./
RUN npm ci
COPY apps/central-os/frontend/ ./
RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    CENTRAL_OS_HOST=0.0.0.0 \
    CENTRAL_OS_PORT=8788

WORKDIR /app
COPY apps/central-os/package*.json ./apps/central-os/
RUN cd apps/central-os && npm ci --omit=dev && npm cache clean --force
COPY apps/central-os/src ./apps/central-os/src
COPY apps/central-os/assets ./apps/central-os/assets
COPY --from=frontend-build /workspace/apps/central-os/frontend/dist ./apps/central-os/frontend/dist

RUN mkdir -p /srv/central-os/data /srv/central-os/logs \
    && chown -R node:node /app /srv/central-os

USER node
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8788/api/health').then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["node", "apps/central-os/src/server.js"]
