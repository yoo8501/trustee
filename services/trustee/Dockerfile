FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# 의존성 설치
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/config/package.json ./packages/config/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/common/package.json ./packages/common/package.json
COPY packages/proto/package.json ./packages/proto/package.json
COPY services/trustee/package.json ./services/trustee/package.json
RUN pnpm install --frozen-lockfile

# 빌드
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/config/node_modules ./packages/config/node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=deps /app/packages/common/node_modules ./packages/common/node_modules
COPY --from=deps /app/packages/proto/node_modules ./packages/proto/node_modules
COPY --from=deps /app/services/trustee/node_modules ./services/trustee/node_modules
COPY packages/config ./packages/config
COPY packages/types ./packages/types
COPY packages/common ./packages/common
COPY packages/proto ./packages/proto
COPY services/trustee ./services/trustee
RUN pnpm --filter @trustee/trustee-service exec prisma generate
RUN pnpm --filter @trustee/trustee-service build

# 실행
FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/packages/config ./packages/config
COPY --from=builder /app/packages/types ./packages/types
COPY --from=builder /app/packages/common ./packages/common
COPY --from=builder /app/packages/proto ./packages/proto
COPY --from=builder /app/services/trustee/dist ./services/trustee/dist
COPY --from=builder /app/services/trustee/node_modules ./services/trustee/node_modules
COPY --from=builder /app/services/trustee/package.json ./services/trustee/package.json
COPY --from=builder /app/services/trustee/prisma ./services/trustee/prisma
WORKDIR /app/services/trustee
EXPOSE 4001 5001
CMD ["node", "dist/index.js"]
