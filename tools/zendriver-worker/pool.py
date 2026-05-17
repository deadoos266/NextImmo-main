"""
Pool de browsers Zendriver tenus warm.

Zendriver (fork de nodriver) lance un Chromium CDP avec patches stealth.
Cold-start ~6-9s, donc on garde un pool ouvert.

Rotation du profil utilisateur tous les N fetches pour éviter que DataDome
finger-print l'instance par session persistante.

V97.39.10 — Support proxy résidentiel optionnel via WORKER_PROXY_URL.
Sans proxy : bypass DataDome ~0% sur ASN OVH.
Avec proxy résidentiel (Webshare 1$/GB) : ~70-90% attendu.
"""

import asyncio
import logging
import os
import shutil
import tempfile
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any

import zendriver as zd

LOG = logging.getLogger("worker.pool")

ROTATION_AFTER_FETCHES = 50


def _proxy_browser_arg() -> str | None:
    """Construit le browser_arg --proxy-server à partir des env vars.

    Format Chromium attendu : --proxy-server=protocol://host:port
    Auth si nécessaire : géré par WORKER_PROXY_USERNAME/PASSWORD via
    page.authenticate côté Zendriver (CDP), pas dans l'URL.

    Retourne None si proxy non configuré (mode normal sans proxy).
    """
    proxy_url = os.environ.get("WORKER_PROXY_URL", "").strip()
    if not proxy_url:
        return None
    LOG.info("Proxy configured: %s (auth credentials hidden)", proxy_url.split("@")[-1] if "@" in proxy_url else proxy_url)
    return f"--proxy-server={proxy_url}"


@dataclass
class BrowserSlot:
    """Un slot du pool : un Chromium Zendriver + métadonnées."""
    browser: Any  # zd.Browser, typé Any pour éviter import cycle
    user_data_dir: str
    fetches_done: int = 0
    busy: bool = False


@dataclass
class BrowserPool:
    """Pool de browsers Zendriver gérés par semaphore."""
    size: int
    slots: list[BrowserSlot] = field(default_factory=list)
    semaphore: asyncio.Semaphore = field(default=None)  # type: ignore
    total_fetches: int = 0

    @classmethod
    async def create(cls, size: int) -> "BrowserPool":
        """Crée le pool, spawn `size` browsers warm."""
        pool = cls(size=size, semaphore=asyncio.Semaphore(size))
        for i in range(size):
            slot = await pool._spawn_slot(i)
            pool.slots.append(slot)
        LOG.info("Pool ready with %d slots", size)
        return pool

    async def _spawn_slot(self, idx: int) -> BrowserSlot:
        """Spawn un nouveau browser Zendriver avec user_data_dir frais.

        V97.39.3 : ajout de browser_args anti-detection plus agressifs pour
        augmenter le taux de bypass DataDome (baseline OVH ASN catastrophique
        sans proxy résidentiel). Sans garantie, mais ça ne coûte rien.

        V97.39.10 : support proxy résidentiel optionnel via WORKER_PROXY_URL.
        """
        user_data_dir = tempfile.mkdtemp(prefix=f"zd-slot-{idx}-")
        browser_args = [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--lang=fr-FR,fr",
            "--accept-lang=fr-FR,fr;q=0.9,en;q=0.8",
            # V97.39.3 — anti-detection supplémentaires
            "--disable-blink-features=AutomationControlled",
            "--disable-features=IsolateOrigins,site-per-process",
            "--disable-site-isolation-trials",
            "--disable-web-security",
            "--no-first-run",
            "--no-default-browser-check",
            "--password-store=basic",
            "--use-mock-keychain",
            "--window-size=1920,1080",
            # User-Agent fixe à la mode Chromium stable
            "--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        ]

        # V97.39.10 — Proxy résidentiel optionnel
        proxy_arg = _proxy_browser_arg()
        if proxy_arg:
            browser_args.append(proxy_arg)

        browser = await zd.start(
            headless=True,
            user_data_dir=user_data_dir,
            browser_args=browser_args,
        )

        # Auth proxy si username/password fournis (Chromium ne supporte pas user:pass@ dans URL,
        # il faut utiliser CDP Network.setExtraHTTPHeaders ou Fetch.authRequired)
        proxy_user = os.environ.get("WORKER_PROXY_USERNAME", "").strip()
        proxy_pass = os.environ.get("WORKER_PROXY_PASSWORD", "").strip()
        if proxy_arg and proxy_user and proxy_pass:
            # Note : Zendriver expose CDP, mais l'auth proxy est tricky en headless.
            # La pratique recommandée : embedder user:pass dans WORKER_PROXY_URL directement.
            # Si Paul utilise un format auth séparé, on documente la limite ici.
            LOG.warning(
                "WORKER_PROXY_USERNAME/PASSWORD défini séparément — "
                "Zendriver headless ne gère pas l'auth proxy. "
                "Préfère embed dans l'URL : http://user:pass@host:port",
            )

        LOG.debug("Spawned slot %d (user_data_dir=%s, proxy=%s)", idx, user_data_dir, bool(proxy_arg))
        return BrowserSlot(browser=browser, user_data_dir=user_data_dir)

    async def _rotate_slot(self, slot_idx: int) -> None:
        """Recycle un slot : ferme + supprime user_data_dir + respawn."""
        old = self.slots[slot_idx]
        LOG.info(
            "Rotating slot %d after %d fetches (cleaning %s)",
            slot_idx, old.fetches_done, old.user_data_dir,
        )
        try:
            await old.browser.stop()
        except Exception as e:
            LOG.warning("Error stopping browser: %s", e)
        try:
            shutil.rmtree(old.user_data_dir, ignore_errors=True)
        except Exception as e:
            LOG.warning("Error rmtree user_data_dir: %s", e)
        self.slots[slot_idx] = await self._spawn_slot(slot_idx)

    @asynccontextmanager
    async def acquire(self):
        """Réserve un slot du pool, le libère à la sortie du `async with`."""
        async with self.semaphore:
            # Trouve le premier slot disponible (semaphore garantit qu'il y en a au moins 1)
            slot_idx = None
            for i, s in enumerate(self.slots):
                if not s.busy:
                    s.busy = True
                    slot_idx = i
                    break
            if slot_idx is None:
                # Ne devrait jamais arriver avec un semaphore, mais sécurité
                raise RuntimeError("No free slot despite semaphore acquired")

            try:
                yield self.slots[slot_idx].browser
            finally:
                slot = self.slots[slot_idx]
                slot.busy = False
                slot.fetches_done += 1
                self.total_fetches += 1
                # Rotation après N fetches
                if slot.fetches_done >= ROTATION_AFTER_FETCHES:
                    try:
                        await self._rotate_slot(slot_idx)
                    except Exception as e:
                        LOG.exception("Rotation failed for slot %d: %s", slot_idx, e)

    def stats(self) -> dict:
        """Retourne stats du pool pour /health."""
        return {
            "size": self.size,
            "in_flight": sum(1 for s in self.slots if s.busy),
            "total_fetches": self.total_fetches,
            "fetches_per_slot": [s.fetches_done for s in self.slots],
        }

    async def close(self) -> None:
        """Ferme tous les browsers et nettoie les profils. Appelé au shutdown."""
        for slot in self.slots:
            try:
                await slot.browser.stop()
            except Exception as e:
                LOG.warning("Error stopping browser at shutdown: %s", e)
            try:
                shutil.rmtree(slot.user_data_dir, ignore_errors=True)
            except Exception:
                pass
        LOG.info("Pool closed")
