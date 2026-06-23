# ---- stage 1: build the React + Mantine frontend ----
FROM node:20-alpine AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

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
