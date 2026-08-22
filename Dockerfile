# Two stages: build the Vite bundle on Node, then serve the resulting `dist/`
# as static files. Nothing from the build stage ships — the runtime image holds
# the bundle, the bundled guide audio, and nginx, with no Node, no npm, and no
# `node_modules`.
#
# The game is entirely client-side: Phaser runs in the visitor's browser and the
# selected guide voice lives in that browser's localStorage, so this container
# holds no player state, needs no volume, and reads no environment at run time.
# The Supabase adapter `.env.example` was written for now exists, and Vite
# compiles its two `VITE_*` values into the bundle, so they arrive as
# `--build-arg` below rather than as variables on the running container.

# 22 to match `engines.node` in package.json and the Node CI builds on. Kept in
# step by `src/docs.test.ts`, which fails if this line and those two disagree.
FROM node:22-alpine AS build

WORKDIR /app

# Dependencies first, so an edit to a source file does not re-resolve the tree.
# `npm ci` — the same command CI runs — installs devDependencies too, because
# `npm run build` *is* `tsc && vite build` and both live there. That pulls
# kokoro-js and its pinned sharp with it, which is the bulk of the install time;
# they are dev-only, are never invoked here, and never reach the final image.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite substitutes every `import.meta.env.VITE_*` reference into the files it
# emits, so Supabase is configured for `npm run build` and not for the running
# container. Declared in this stage only: the values reach the bundle, never the
# nginx image's environment.
#
# Both are public by design. The URL and the *publishable* key are served to
# every visitor inside the bundle; what protects the data is the row-level
# security in `supabase/migrations/`, not these being unguessable. Never pass a
# secret or service-role key here -- `VITE_` means "compiled into a public file".
#
# Empty is a supported build, and is what every image before this one produced:
# `isMultiplayerConfigured()` sees two blank strings and the menu keeps offering
# the simulated race in place of online rooms.
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_PUBLISHABLE_KEY=""
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

# `tsc && vite build`: the type-check fails the image build the same way it
# fails CI, so an image cannot be built from a tree that does not compile.
RUN npm run build

# nginx-unprivileged rather than stock nginx: it already runs as uid 101 and
# already listens on 8080, so the runtime needs no root and no capability to
# bind a low port. Traefik reaches it on 8080 over the compose network.
FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

# /healthz is a fixed 200 from nginx; fetching / instead would pull the whole
# index document every 30 seconds to learn the same thing. The timeout is loose
# because it competes with whatever else the host is doing — a busy box briefly
# starving one wget is not the container being unwell.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
