# ---- stage 1: build the React + Mantine frontend ----
FROM node:20-alpine AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# Build only the production bundle. We deliberately skip the `tsc --noEmit`
# type-check that `npm run build` runs first — it's a separate memory-heavy pass
# that OOM-kills on small (1 GB) VPSes and isn't needed to produce the bundle
# (run type-checking in CI/locally instead). Cap Node's heap so it GCs under
# memory pressure rather than getting killed by the OOM killer.
RUN NODE_OPTIONS=--max-old-space-size=768 npx vite build

# ---- stage 2: backend ----
FROM python:3.11-slim

WORKDIR /srv

# install deps first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

# overlay the built SPA into the static dir FastAPI serves on :8090
COPY --from=frontend /fe/dist/ ./app/static/

EXPOSE 8090

# DATABASE_URL / JWT_SECRET / ADMIN_* are provided at runtime, never baked in.
# entrypoint runs `alembic upgrade head`, bootstraps the admin, then uvicorn.
CMD ["./entrypoint.sh"]
