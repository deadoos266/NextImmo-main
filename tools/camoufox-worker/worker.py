"""
KeyMatch Fetcher Camoufox — Worker bypass DataDome via Camoufox (Firefox stealth).

Endpoints :
  GET  /health  → status pool + uptime (Bearer required)
  POST /fetch   → scrape une URL (Bearer required)

Architecture (cf nestmatch/docs/MIGRATION_OVH_COMPLETE_PLAN.md + plan P3-7) :
  - FastAPI + Uvicorn (worker single, asyncio)
  - Camoufox pool 3 contextes warm
  - Bearer token auth (constant-time)
  - SSRF guard (host allowlist + private IP block)
  - Rate-limit 60 req/h par IP source
  - Soft-challenge detection (DataDome/CF patterns)
  - Optionnel : callback HTTPS vers KeyMatch (mode async)

Différence vs Zendriver worker :
  - Camoufox = Firefox stealth (meilleur taux 2025-2026 sur DataDome vs Chromium)
  - Tourne sur Oracle Cloud Always Free ARM Ampere 24GB (gratuit à vie)
  - Pas sur le même VPS que keymatch-fetcher (Zendriver, OVH), pour avoir
    un ASN différent. DataDome bloque les IPs OVH même avec Zendriver.

Variables d'env requises (.env) :
  FETCHER_TOKEN              → Bearer token unique (openssl rand -hex 32)
  ALLOW_HOSTS                → "leboncoin.fr,seloger.com,logic-immo.com"
  POOL_SIZE                  → 3 (sur 24 GB Ampere, marge confortable)
  DEFAULT_MAX_WAIT_MS        → 25000 (DataDome challenge prend 3-10s)
  RATE_LIMIT_PER_HOUR        → 60 (suffit pour ~10 imports/h × 6 sites)
  CALLBACK_URL               → "https://keymatch-immo.fr/api/proprio/annonce/import/callback"
  CALLBACK_TOKEN             → token séparé pour le callback (Worker → KeyMatch)
  WORKER_PROXY_URL           → (optionnel) proxy résidentiel pour booster bypass
  LOG_LEVEL                  → INFO
"""

import asyncio
import logging
import os
import secrets
import time
from collections import deque
from contextlib import asynccontextmanager
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field

from pool import BrowserPool
from ssrf import SSRFError, assert_url_allowed

load_dotenv()

# ─── Config ────────────────────────────────────────────────────────────────
TOKEN = os.environ.get("FETCHER_TOKEN", "")
if not TOKEN:
    raise RuntimeError("FETCHER_TOKEN missing in environment (.env)")

ALLOW_HOSTS = set(
    h.strip() for h in os.environ.get(
        "ALLOW_HOSTS", "leboncoin.fr,seloger.com,logic-immo.com",
    ).split(",") if h.strip()
)
POOL_SIZE = int(os.environ.get("POOL_SIZE", "3"))
DEFAULT_MAX_WAIT_MS = int(os.environ.get("DEFAULT_MAX_WAIT_MS", "25000"))
RATE_LIMIT_PER_HOUR = int(os.environ.get("RATE_LIMIT_PER_HOUR", "60"))
CALLBACK_URL = os.environ.get("CALLBACK_URL", "").strip() or None
CALLBACK_TOKEN = os.environ.get("CALLBACK_TOKEN", "").strip() or None
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
MAX_HTML_BYTES = 5_000_000  # 5 MB cap

# Soft-challenge patterns identiques fetcher.ts:detectBotProtection
SOFT_CHALLENGE_PATTERNS = (
    "captcha-delivery.com",
    "datadome",
    "Just a moment",
    "cf-challenge",
    "geo.captcha-delivery",
    "ddv1-captcha",
)

# ─── Logging ───────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
LOG = logging.getLogger("worker")

# ─── Globals ───────────────────────────────────────────────────────────────
pool: BrowserPool | None = None
startup_ts: float = 0.0
rl_store: dict[str, deque[float]] = {}
rl_lock = asyncio.Lock()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup : crée le pool. Shutdown : ferme proprement."""
    global pool, startup_ts
    LOG.info("Starting Camoufox pool (size=%d)...", POOL_SIZE)
    pool = await BrowserPool.create(POOL_SIZE)
    startup_ts = time.time()
    LOG.info(
        "Worker ready. Allow hosts: %s. Callback: %s",
        ALLOW_HOSTS, bool(CALLBACK_URL),
    )
    yield
    LOG.info("Shutting down pool...")
    if pool:
        await pool.close()


app = FastAPI(title="KeyMatch Fetcher Camoufox", lifespan=lifespan)


# ─── Models ────────────────────────────────────────────────────────────────
class FetchBody(BaseModel):
    url: str
    job_id: str | None = None  # active mode async si fourni + CALLBACK_URL set
    wait_selector: str | None = None
    max_wait_ms: int = Field(default=DEFAULT_MAX_WAIT_MS, ge=1000, le=30000)


# ─── Auth ──────────────────────────────────────────────────────────────────
def authorize(req: Request) -> None:
    h = req.headers.get("authorization", "")
    if not h.startswith("Bearer "):
        raise HTTPException(401, {"code": "UNAUTHORIZED", "error": "Missing bearer"})
    presented = h[7:]
    if not secrets.compare_digest(presented, TOKEN):
        raise HTTPException(401, {"code": "UNAUTHORIZED", "error": "Bad token"})


# ─── Rate-limit ────────────────────────────────────────────────────────────
async def rate_limit(ip: str) -> None:
    now = time.time()
    async with rl_lock:
        bucket = rl_store.get(ip, deque())
        while bucket and bucket[0] <= now - 3600:
            bucket.popleft()
        if len(bucket) >= RATE_LIMIT_PER_HOUR:
            raise HTTPException(429, {
                "code": "RATE_LIMITED",
                "error": f"Max {RATE_LIMIT_PER_HOUR}/h par IP",
            })
        bucket.append(now)
        rl_store[ip] = bucket


def client_ip(req: Request) -> str:
    """Vraie IP source : Cloudflare > X-Forwarded-For > client."""
    cf = req.headers.get("cf-connecting-ip")
    if cf:
        return cf
    xff = req.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return req.client.host if req.client else "unknown"


# ─── Soft-challenge detection ──────────────────────────────────────────────
def is_soft_challenge(html: str) -> bool:
    """True si le HTML ressemble à un challenge non-résolu."""
    if len(html) < 20000:
        low = html.lower()
        for p in SOFT_CHALLENGE_PATTERNS:
            if p.lower() in low:
                return True
    return False


# ─── Endpoints ─────────────────────────────────────────────────────────────
@app.get("/health")
async def health(req: Request):
    authorize(req)
    return {
        "ok": True,
        "fetcher": "camoufox-worker",
        "uptime_s": int(time.time() - startup_ts),
        "pool": pool.stats() if pool else None,
        "allow_hosts": sorted(ALLOW_HOSTS),
        "rate_limit_per_hour": RATE_LIMIT_PER_HOUR,
        "callback_configured": bool(CALLBACK_URL),
        "proxy_configured": bool(os.environ.get("WORKER_PROXY_URL", "").strip()),
    }


@app.post("/fetch")
async def fetch_endpoint(body: FetchBody, req: Request):
    """Scrape une URL via Camoufox. Sync ou async (callback) selon body.job_id."""
    authorize(req)
    ip = client_ip(req)
    await rate_limit(ip)

    try:
        assert_url_allowed(body.url, ALLOW_HOSTS)
    except SSRFError as e:
        raise HTTPException(400, {"code": e.code, "error": e.message})

    # Mode async si callback configuré + job_id fourni
    if CALLBACK_URL and body.job_id:
        asyncio.create_task(
            _async_fetch_and_callback(body.url, body.job_id, body.max_wait_ms),
        )
        return {"ok": True, "code": "ACCEPTED", "job_id": body.job_id}

    # Mode sync
    result = await _do_fetch(body.url, body.max_wait_ms)
    if isinstance(result, dict) and result.get("ok") is False:
        code = result.get("code", "INTERNAL")
        status = {
            "BOT_PROTECTION": 502,
            "TIMEOUT": 504,
            "TOO_LARGE": 413,
            "FETCH_ERROR": 502,
            "INTERNAL": 500,
        }.get(code, 500)
        raise HTTPException(status, result)
    return result


async def _do_fetch(url: str, max_wait_ms: int) -> dict:
    """Exécute le fetch Camoufox. Retourne dict (success ou erreur)."""
    t0 = time.time()
    if not pool:
        return {"ok": False, "code": "INTERNAL", "error": "Pool not ready"}

    try:
        async with pool.acquire() as browser:
            # Camoufox/Playwright API : on crée un context + page par fetch
            # (persistent_context=True donc les cookies sont préservés via
            # user_data_dir du slot).
            # NB : avec persistent_context, le browser EST le context. On
            # accède aux pages via browser.pages ou browser.new_page().
            page = await browser.new_page()
            try:
                # Navigate avec timeout dur côté Playwright
                response = await page.goto(
                    url,
                    wait_until="domcontentloaded",
                    timeout=max_wait_ms,
                )
                status = response.status if response else 0

                # Attendre que le contenu soit substantiel (challenge résolu)
                try:
                    await asyncio.wait_for(
                        _wait_html_growth(page),
                        timeout=max_wait_ms / 1000,
                    )
                except asyncio.TimeoutError:
                    LOG.warning("Timeout waiting for HTML growth on %s", url)

                html = await page.content()
                final_url = page.url

                if len(html) > MAX_HTML_BYTES:
                    return {
                        "ok": False,
                        "code": "TOO_LARGE",
                        "error": f"HTML > {MAX_HTML_BYTES} bytes",
                    }

                if is_soft_challenge(html):
                    LOG.warning(
                        "Soft challenge detected on %s (html_len=%d)",
                        url, len(html),
                    )
                    return {
                        "ok": False,
                        "code": "BOT_PROTECTION",
                        "error": "Challenge non résolu (DataDome/Cloudflare)",
                    }

                duration_ms = int((time.time() - t0) * 1000)
                LOG.info(
                    "Fetch OK %s (status=%d, len=%d, dur=%dms)",
                    url, status, len(html), duration_ms,
                )
                return {
                    "ok": True,
                    "html": html,
                    "final_url": final_url,
                    "status": status,
                    "duration_ms": duration_ms,
                    "fetcher": "camoufox-worker",
                }
            finally:
                await page.close()

    except asyncio.TimeoutError:
        return {"ok": False, "code": "TIMEOUT", "error": "Camoufox timeout"}
    except Exception as e:
        LOG.exception("Fetch failed for %s", url)
        return {
            "ok": False,
            "code": "FETCH_ERROR",
            "error": str(e)[:200],
        }


async def _wait_html_growth(page: Any, threshold: int = 50000) -> None:
    """Poll jusqu'à ce que document.documentElement.outerHTML > threshold.

    Avec Camoufox/Playwright, on utilise page.evaluate() qui retourne un
    awaitable. Pattern stop-on-stable : si HTML cesse de grandir pendant
    2s consécutives, on considère que c'est stable (challenge résolu).
    """
    # Laisse le temps au challenge JS DataDome de démarrer
    await asyncio.sleep(2.0)

    # Simulate human-like scroll
    try:
        await page.evaluate("window.scrollTo({top: 200, behavior: 'smooth'})")
        await asyncio.sleep(0.5)
        await page.evaluate("window.scrollTo({top: 0, behavior: 'smooth'})")
    except Exception as e:
        LOG.debug("Scroll simulation failed (non-blocking): %s", e)

    consecutive_errors = 0
    MAX_CONSECUTIVE = 20  # ~10s à 0.5s/iter
    last_len = 0
    stable_count = 0

    while True:
        try:
            length = await page.evaluate("document.documentElement.outerHTML.length")
            if isinstance(length, int):
                if length > threshold:
                    if length == last_len:
                        stable_count += 1
                        if stable_count >= 4:  # 2s de stabilité
                            return
                    else:
                        stable_count = 0
                    last_len = length
            consecutive_errors = 0
        except Exception as e:
            consecutive_errors += 1
            if consecutive_errors >= MAX_CONSECUTIVE:
                LOG.warning(
                    "evaluate() failed %d times consecutively (last: %s), bailing out",
                    consecutive_errors, e,
                )
                return
            if consecutive_errors == 1:
                LOG.debug("evaluate() failed (will retry): %s", e)
        await asyncio.sleep(0.5)


async def _async_fetch_and_callback(url: str, job_id: str, max_wait_ms: int) -> None:
    """Async : fetch puis POST résultat au callback KeyMatch."""
    result = await _do_fetch(url, max_wait_ms)
    if not CALLBACK_URL:
        return

    headers = {}
    if CALLBACK_TOKEN:
        headers["Authorization"] = f"Bearer {CALLBACK_TOKEN}"
    payload = {"job_id": job_id, **result}

    try:
        async with httpx.AsyncClient(timeout=15) as cli:
            r = await cli.post(CALLBACK_URL, json=payload, headers=headers)
            LOG.info(
                "Callback %s for job %s → HTTP %d",
                CALLBACK_URL, job_id, r.status_code,
            )
    except Exception as e:
        LOG.error("Callback failed for job %s: %s", job_id, e)


if __name__ == "__main__":
    import uvicorn
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8080"))
    uvicorn.run(app, host=host, port=port, log_level=LOG_LEVEL.lower())
