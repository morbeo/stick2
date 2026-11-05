# stick2 dedicated server: build from the repository root
#   docker build -f server/Dockerfile -t stick2-server .
#   docker run -p 8080:8080 -v stick2:/data stick2-server
FROM node:22-alpine AS deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22-alpine
ARG COMMIT=dev
ENV NODE_ENV=production PORT=8080 COMMIT=${COMMIT} DB_PATH=/data
WORKDIR /app
# the game's static files (served at /), then the server
COPY index.html docs.html gallery.html gallery-demo.html random.html kitchen-sink.html embed.html stick2-embed.js LICENSE ./
COPY src ./src
RUN printf '// generated in the image\nconst BUILD = {"commit":"%s","branch":"","date":"","subject":"server image","dirty":false,"built":"%s"};\n' "$COMMIT" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > src/build.js
COPY fonts ./fonts
COPY profiles ./profiles
COPY docs ./docs
COPY server/*.js server/package.json ./server/
COPY --from=deps /app/server/node_modules ./server/node_modules
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 CMD wget -qO- http://127.0.0.1:${PORT}/healthz || exit 1
CMD ["node", "server/server.js"]
