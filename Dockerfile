FROM node:24-bookworm-slim AS build
ENV WRANGLER_SEND_METRICS=false
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production WRANGLER_SEND_METRICS=false SRL_HOST=0.0.0.0 PORT=3000 SRL_STATE_DIR=/app/data
WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/data && chown node:node /app /app/data
USER node
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=4 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/local.mjs"]
