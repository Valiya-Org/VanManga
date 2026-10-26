# VanManga — NestJS backend + Python scraper + Vue3 SPA in one image.
#
# Build from the REPO ROOT (the image needs scrape_cli.py, modules/, utils/
# and frontend/ alongside backend/):
#
#   docker build -f backend/Dockerfile -t vanmanga .
#
# Debian slim rather than alpine: lxml / gevent ship manylinux wheels only,
# so alpine would compile them from source.

# --- Frontend build ---
FROM node:24.22.1-bookworm-slim AS frontend-build

WORKDIR /src/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# --- Backend build ---
FROM node:24.22.1-bookworm-slim AS backend-build

WORKDIR /src/backend

COPY backend/package*.json ./
RUN npm ci

COPY backend/tsconfig*.json backend/nest-cli.json ./
COPY backend/src ./src

RUN npm run build && npm prune --omit=dev

# --- Runtime ---
FROM node:24.22.1-bookworm-slim AS runner

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv tini \
    && rm -rf /var/lib/apt/lists/*

# Scraper deps in a venv (Debian's system Python is externally managed).
ENV VIRTUAL_ENV=/opt/venv \
    PATH=/opt/venv/bin:$PATH
COPY requirements-scraper.txt /tmp/
RUN python3 -m venv /opt/venv \
    && pip install --no-cache-dir -r /tmp/requirements-scraper.txt \
    && rm /tmp/requirements-scraper.txt

# Layout mirrors the repo, so the backend's relative defaults
# (../scrape_cli.py, ../../../../frontend/dist) resolve unchanged.
WORKDIR /app/backend

COPY --from=backend-build /src/backend/node_modules ./node_modules
COPY --from=backend-build /src/backend/dist ./dist
COPY backend/package.json ./
COPY --from=frontend-build /src/frontend/dist /app/frontend/dist
COPY scrape_cli.py /app/
COPY modules /app/modules
COPY utils /app/utils

# Data paths match the legacy Flask container, so its volumes mount as-is.
ENV NODE_ENV=production \
    PORT=5000 \
    PYTHON_EXECUTABLE=python \
    PYTHON_CLI_SCRIPT=/app/scrape_cli.py \
    PYTHON_WORKING_DIR=/app \
    LIBRARY_FILE=/vanmanga/eng_config/manga_library.json \
    THUMBNAILS_DIR=/vanmanga/thumbnails \
    DOWNLOAD_ROOT=/downloaded

RUN mkdir -p /vanmanga/eng_config /vanmanga/thumbnails /downloaded \
    && chown -R node:node /vanmanga /downloaded

USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/scraper/sources').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
