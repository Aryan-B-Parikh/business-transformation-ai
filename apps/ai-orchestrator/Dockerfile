FROM node:20-alpine3.18 AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/ai-orchestrator/package.json apps/ai-orchestrator/
COPY packages/shared/package.json packages/shared/
RUN npm install --include=workspace-root --workspaces=false || npm install
COPY tsconfig.base.json ./
COPY apps/ai-orchestrator apps/ai-orchestrator
COPY packages/shared packages/shared
RUN npx tsc -p apps/ai-orchestrator/tsconfig.json || true

FROM node:20-alpine3.18 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/ai-orchestrator/dist /app/dist
COPY --from=builder /app/apps/ai-orchestrator/package.json /app/package.json
COPY --from=builder /app/node_modules /app/node_modules
EXPOSE 7070
CMD ["node", "dist/server.js"]
