"""
KeyMatch Fetcher — Worker Zendriver pour bypass DataDome.

Endpoints :
  GET  /health  → status pool + uptime
  POST /fetch   → scrape une URL (Bearer auth required)

Architecture :
  - FastAPI + Uvicorn (worker single, asyncio)
  - Zendriver pool 3 contextes warm
  - Bearer token auth (constant-time)
  - SSRF guard (host allowlist + private IP block)
  - Rate-limit 60 req/h par IP source
  - Soft-challenge detection (DataDome / Cloudflare patterns)
  - Optionnel : callback vers Vercel pour pattern async

Conformément au plan : nestmatch/docs/MIGRATION_OVH_COMPLETE_PLAN.md Phase 1.
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
MAX_HTML_BYTES = 5_000_000  # 5 MB cap, comme fetcher.ts côté Vercel

# Soft-challenge patterns identiques à fetcher.ts:detectBotProtection
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
# Rate-limit : { ip: deque[timestamp] }, sliding 1h window
rl_store: dict[str, deque[float]] = {}
rl_lock = asyncio.Lock()


# ─── Lifespan ──────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup : crée le pool. Shutdown : ferme proprement."""
    global pool, startup_ts
    LOG.info("Starting Zendriver pool (size=%d)...", POOL_SIZE)
    pool = await BrowserPool.create(POOL_SIZE)
    startup_ts = time.time()
    LOG.info("Worker ready. Allow hosts: %s", ALLOW_HOSTS)
    yield
    LOG.info("Shutting down pool...")
    if pool:
        await pool.close()


app = FastAPI(title="KeyMatch Fetcher", lifespan=lifespan)


# ─── Models ────────────────────────────────────────────────────────────────
class FetchBody(BaseModel):
    """Body POST /fetch."""
    url: str
    job_id: str | None = None  # optionnel, utilisé pour async callback
    wait_selector: str | None = None
    max_wait_ms: int = Field(default=DEFAULT_MAX_WAIT_MS, ge=1000, le=30000)


class FetchSuccess(BaseModel):
    ok: bool = True
    html: str
    final_url: str
    status: int
    duration_ms: int
    fetcher: str = "zendriver-worker"


class ErrorResp(BaseModel):
    ok: bool = False
    code: str
    error: str


# ─── Auth ──────────────────────────────────────────────────────────────────
def authorize(req: Request) -> None:
    """Vérifie Bearer token en constant-time."""
    h = req.headers.get("authorization", "")
    if not h.startswith("Bearer "):
        raise HTTPException(401, {"code": "UNAUTHORIZED", "error": "Missing bearer"})
    presented = h[7:]
    if not secrets.compare_digest(presented, TOKEN):
        raise HTTPException(401, {"code": "UNAUTHORIZED", "error": "Bad token"})


# ─── Rate-limit ────────────────────────────────────────────────────────────
async def rate_limit(ip: str) -> None:
    """Sliding window 1h par IP. Raise 429 si dépassé."""
    now = time.time()
    async with rl_lock:
        bucket = rl_store.get(ip, deque())
        # Purge entries > 1h
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
    """Vraie IP source : header Cloudflare > X-Forwarded-For > req.client."""
    cf = req.headers.get("cf-connecting-ip")
    if cf:
        return cf
    xff = req.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return req.client.host if req.client else "unknown"


# ─── Soft-challenge detection ──────────────────────────────────────────────
def is_soft_challenge(html: str) -> bool:
    """True si le HTML ressemble à un challenge non-résolu (DataDome/CF)."""
    if len(html) < 20000:
        # Pages courtes = suspect, check patterns
        low = html.lower()
        for p in SOFT_CHALLENGE_PATTERNS:
            if p.lower() in low:
                return True
    return False


# ─── Endpoints ─────────────────────────────────────────────────────────────
@app.get("/health")
async def health(req: Request):
    """Status worker + pool. Bearer required (pas public)."""
    authorize(req)
    return {
        "ok": True,
        "uptime_s": int(time.time() - startup_ts),
        "pool": pool.stats() if pool else None,
        "allow_hosts": sorted(ALLOW_HOSTS),
        "rate_limit_per_hour": RATE_LIMIT_PER_HOUR,
        "callback_configured": bool(CALLBACK_URL),
    }


@app.post("/fetch")
async def fetch_endpoint(body: FetchBody, req: Request):
    """Scrape une URL via Zendriver. Retourne le HTML.

    Si CALLBACK_URL configuré ET body.job_id fourni → mode async :
      retourne 202 immédiatement, POSTe le résultat au callback plus tard.
    Sinon : mode sync, retourne le HTML directement.
    """
    authorize(req)
    ip = client_ip(req)
    await rate_limit(ip)

    # Validation URL + SSRF
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
        # Erreur : raise HTTPException avec mapping
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
    """Exécute le fetch Zendriver. Retourne dict (success ou erreur)."""
    t0 = time.time()
    if not pool:
        return {"ok": False, "code": "INTERNAL", "error": "Pool not ready"}

    try:
        async with pool.acquire() as browser:
            page = await browser.get(url)
            # Attendre que la page soit substantielle (challenge résolu)
            try:
                await asyncio.wait_for(
                    _wait_html_growth(page),
                    timeout=max_wait_ms / 1000,
                )
            except asyncio.TimeoutError:
                LOG.warning("Timeout waiting for HTML growth on %s", url)

            html = await page.get_content()
            final_url = page.url

            if len(html) > MAX_HTML_BYTES:
                return {
                    "ok": False,
                    "code": "TOO_LARGE",
                    "error": f"HTML > {MAX_HTML_BYTES} bytes",
                }

            if is_soft_challenge(html):
                LOG.warning("Soft challenge detected on %s (html_len=%d)", url, len(html))
                return {
                    "ok": False,
                    "code": "BOT_PROTECTION",
                    "error": "Challenge non résolu (DataDome/Cloudflare)",
                }

            duration_ms = int((time.time() - t0) * 1000)
            LOG.info("Fetch OK %s (status=200, len=%d, dur=%dms)", url, len(html), duration_ms)
            return {
                "ok": True,
                "html": html,
                "final_url": final_url,
                "status": 200,
                "duration_ms": duration_ms,
                "fetcher": "zendriver-worker",
            }

    except asyncio.TimeoutError:
        return {"ok": False, "code": "TIMEOUT", "error": "Zendriver timeout"}
    except Exception as e:
        LOG.exception("Fetch failed for %s", url)
        return {
            "ok": False,
            "code": "FETCH_ERROR",
            "error": str(e)[:200],
        }


async def _wait_html_growth(page: Any, threshold: int = 50000) -> None:
    """Poll jusqu'à ce que document.documentElement.outerHTML > threshold.

    V97.39.3 : ajout d'un délai initial pour laisser DataDome démarrer son
    challenge JS + simulation de scroll pour activité humaine.
    """
    # Laisse le temps au challenge de démarrer
    await asyncio.sleep(2.0)

    # Simulate human-like scroll/mouse activity (best effort, sans crasher si l'API change)
    try:
        await page.evaluate("window.scrollTo({top: 200, behavior: 'smooth'})")
        await asyncio.sleep(0.5)
        await page.evaluate("window.scrollTo({top: 0, behavior: 'smooth'})")
    except Exception:
        pass

    while True:
        try:
            length = await page.evaluate(
                "document.documentElement.outerHTML.length",
            )
            if isinstance(length, int) and length > threshold:
                return
        except Exception:
            pass
        await asyncio.sleep(0.5)


async def _async_fetch_and_callback(url: str, job_id: str, max_wait_ms: int) -> None:
    """Async : fait le fetch, puis POSTe le résultat au callback Vercel."""
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
