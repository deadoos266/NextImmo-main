# KeyMatch Camoufox Worker — V97.39.34 P3-7
#
# Multi-arch (ARM64 Oracle Ampere, x86_64 fallback E2.1.Micro).
# Image basée sur python:3.11-slim (Debian) car Camoufox nécessite des
# libs GTK qui ne sont pas dispos dans alpine.

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    # Camoufox download location
    CAMOUFOX_CACHE_DIR=/app/.camoufox

# Deps système Firefox + libs GTK pour rendering headless
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    wget \
    libgtk-3-0 \
    libdbus-glib-1-2 \
    libxt6 \
    libasound2 \
    libpci3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxss1 \
    libnss3 \
    libxshmfence1 \
    fonts-noto-color-emoji \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

# Télécharge le binaire Firefox stealth Camoufox (~250 MB).
# Sépare en couche pour cache Docker (réutilisable si requirements.txt ne change pas).
RUN camoufox fetch

COPY ssrf.py pool.py worker.py ./

# Healthcheck via /health (avec Bearer dummy — adapter si besoin)
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=60s \
    CMD curl -fsS -H "Authorization: Bearer ${FETCHER_TOKEN}" http://127.0.0.1:8080/health || exit 1

EXPOSE 8080

CMD ["uvicorn", "worker:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
