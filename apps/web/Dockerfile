# Atlas web (Next.js standalone). Build context: apps/web
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Public URLs are inlined at build time, so build after the infrastructure exists.
ARG ATLAS_RELEASES_BASE_URL=
ARG ATLAS_API_URL=
ARG NEXT_PUBLIC_SITE_URL=
ARG NEXT_PUBLIC_GA_ID=
ENV NEXT_TELEMETRY_DISABLED=1 ATLAS_RELEASES_BASE_URL=$ATLAS_RELEASES_BASE_URL \
    ATLAS_API_URL=$ATLAS_API_URL NEXT_PUBLIC_ATLAS_API_URL=$ATLAS_API_URL NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID
RUN pnpm build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN adduser -D -u 10001 atlas
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER atlas
EXPOSE 3000
CMD ["node", "server.js"]
