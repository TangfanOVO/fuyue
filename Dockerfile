FROM node:22.12.0-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/relay ./apps/relay
COPY packages/core ./packages/core
RUN npm ci && npm run build -w @fuyue/core && npm run build -w @fuyue/relay

FROM node:22.12.0-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/relay/package.json ./apps/relay/package.json
COPY --from=build /app/apps/relay/dist ./apps/relay/dist
COPY --from=build /app/packages/core/package.json ./packages/core/package.json
COPY --from=build /app/packages/core/dist ./packages/core/dist
EXPOSE 10000
CMD ["node", "apps/relay/dist/index.js"]
