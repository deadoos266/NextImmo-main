# KeyMatch Fetcher — Worker Zendriver
#
# Image multi-arch (amd64 + arm64) basée sur Python 3.12 slim.
# Inclut Chromium et les dépendances système pour Zendriver headless.

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DEBIAN_FRONTEND=noninteractive

# Dépendances système pour Chromium headless
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    chromium-driver \
    fonts-liberation \
    fonts-noto-color-emoji \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    ca-certificates \
    curl \
 && rm -rf /var/lib/apt/lists/*

# Variables Chromium pour Zendriver
ENV CHROME_BIN=/usr/bin/chromium \
    CHROMEDRIVER_BIN=/usr/bin/chromedriver

WORKDIR /app

# Install Python deps en cache layer
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy code worker
COPY ssrf.py pool.py worker.py ./

# User non-root pour sécurité
RUN useradd -m -u 1000 worker && chown -R worker:worker /app
USER worker

EXPOSE 8080

# Healthcheck Docker
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS -H "Authorization: Bearer ${FETCHER_TOKEN}" http://localhost:8080/health || exit 1

CMD ["python", "worker.py"]
