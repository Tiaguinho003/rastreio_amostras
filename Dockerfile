FROM node:22-alpine AS base

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder

COPY . .
RUN npm run prisma:generate && npm run build

FROM base AS runner

ENV NODE_ENV=production
ENV PORT=3000
ENV APP_UID=1001
ENV APP_GID=1001

RUN addgroup -g "${APP_GID}" -S nodejs \
  && adduser -S -D -H -u "${APP_UID}" -G nodejs nextjs

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/docs/schemas ./docs/schemas
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./next.config.mjs

RUN mkdir -p /app/.next/cache/images /mnt/runtime/uploads /mnt/runtime/email-outbox \
  && chown -R nextjs:nodejs /app/.next /mnt/runtime

USER nextjs
EXPOSE 3000

CMD ["npm", "run", "start"]
