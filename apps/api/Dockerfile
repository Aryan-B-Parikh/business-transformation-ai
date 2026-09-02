FROM node:20-alpine3.18 AS builder

# Set working directory
WORKDIR /app

# Copy root configurations and workspaces
COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json

# Install dependencies (ignoring scripts to avoid prisma generate failing before schema is copied)
RUN npm install --ignore-scripts

# Copy the rest of the application
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY apps/web ./apps/web
COPY apps/mobile ./apps/mobile

# Generate Prisma client (npm install used --ignore-scripts)
RUN cd apps/api && npx prisma generate

# Build TypeScript (compiles to dist/)
RUN npm run build

# Production stage
FROM node:20-alpine3.18 AS runner

WORKDIR /app

# Copy built artifacts and dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/apps/web ./apps/web
COPY --from=builder /app/apps/mobile ./apps/mobile

# Expose API port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# The CMD will be overridden in docker-compose for worker vs api
CMD ["node", "apps/api/dist/index.js"]
