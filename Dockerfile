# Build frontend
FROM node:20-alpine AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Production image
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg gifsicle \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY --from=frontend /build/dist ./static

RUN mkdir -p /data/output /data/work /data/cache/frames /data/cache/previews /data/cache/thumbnails /data/cache/subtitles

ENV DATA_DIR=/data

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
