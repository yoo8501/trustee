FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# 의존성 설치
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY backend/packages/config/package.json ./backend/packages/config/package.json
COPY backend/packages/types/package.json ./backend/packages/types/package.json
COPY backend/packages/common/package.json ./backend/packages/common/package.json
COPY backend/packages/proto/package.json ./backend/packages/proto/package.json
COPY backend/services/inspection/package.json ./backend/services/inspection/package.json
RUN pnpm install --frozen-lockfile

# 빌드
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/packages/config/node_modules ./backend/packages/config/node_modules
COPY --from=deps /app/backend/packages/types/node_modules ./backend/packages/types/node_modules
COPY --from=deps /app/backend/packages/common/node_modules ./backend/packages/common/node_modules
COPY --from=deps /app/backend/packages/proto/node_modules ./backend/packages/proto/node_modules
COPY --from=deps /app/backend/services/inspection/node_modules ./backend/services/inspection/node_modules
COPY backend/packages/config ./backend/packages/config
COPY backend/packages/types ./backend/packages/types
COPY backend/packages/common ./backend/packages/common
COPY backend/packages/proto ./backend/packages/proto
COPY backend/services/inspection ./backend/services/inspection
RUN pnpm --filter @trustee/inspection-service exec prisma generate
RUN pnpm --filter @trustee/inspection-service build

# 실행
FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/backend/packages/config ./backend/packages/config
COPY --from=builder /app/backend/packages/types ./backend/packages/types
COPY --from=builder /app/backend/packages/common ./backend/packages/common
COPY --from=builder /app/backend/packages/proto ./backend/packages/proto
COPY --from=builder /app/backend/services/inspection/dist ./backend/services/inspection/dist
COPY --from=builder /app/backend/services/inspection/node_modules ./backend/services/inspection/node_modules
COPY --from=builder /app/backend/services/inspection/package.json ./backend/services/inspection/package.json
COPY --from=builder /app/backend/services/inspection/prisma ./backend/services/inspection/prisma
WORKDIR /app/backend/services/inspection
EXPOSE 4002 5002
CMD ["node", "dist/index.js"]
