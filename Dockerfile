# Dependencies. Install scripts stay off: nothing here needs them, and they are
# how a compromised package would run code during the build.
FROM node:24-alpine3.23 AS deps
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --ignore-scripts

# Build. The standalone output holds only the files the server actually loads.
FROM node:24-alpine3.23 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_OUTPUT=standalone
ENV NEXT_TELEMETRY_DISABLED=1
RUN yarn build

# Runtime. Needs DATABASE_URL, with migrations already applied (yarn db:migrate),
# or ALDER_EMBEDDED_DB=1 PGLITE_DIR=memory:// for a throwaway demo database.
FROM node:24-alpine3.23 AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# The embedded database applies these itself when it starts.
COPY --from=build --chown=node:node /app/drizzle ./drizzle
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/robots.txt').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "server.js"]
