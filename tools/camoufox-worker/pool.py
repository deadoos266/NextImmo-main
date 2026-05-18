"""
Pool de browsers Camoufox tenus warm.

Camoufox = fork de Firefox avec patches stealth poussés (humanize, geoip,
anti-fingerprint via firmware-level webgl, audiocontext, canvas, fonts).
Cold-start ~6-9s, warm ~3-5s.

Différence vs Zendriver :
- Zendriver = Chromium + CDP, fork de nodriver
- Camoufox = Firefox + Playwright, fork de Playwright
Camoufox bypasse mieux DataDome car DataDome a affiné ses détections sur
Chromium en 2025-2026 et n'a pas le même niveau sur Firefox.

Architecture pool :
- N contextes Camoufox (browser instances) gardés ouverts en parallèle
- Semaphore pour contrôler la concurrence
- Rotation user_data_dir tous les N fetches pour éviter session fingerprinting
- Si le browser crash : on respawn le slot
"""

import asyncio
import logging
import os
import shutil
import tempfile
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any

# Camoufox async API. Repo: https://github.com/daijro/camoufox
# Fournit AsyncCamoufox context manager qui retourne une Playwright Browser.
from camoufox.async_api import AsyncCamoufox

LOG = logging.getLogger("worker.pool")

ROTATION_AFTER_FETCHES = 50


@dataclass
class BrowserSlot:
    """Un slot du pool : un Camoufox + son context manager + métadonnées.

    Note : avec persistent_context=True, AsyncCamoufox.__aenter__() retourne
    un `playwright.async_api.BrowserContext` (pas un `Browser`). On nomme la
    variable `browser` quand même pour rester cohérent avec le worker
    Zendriver, mais `BrowserContext` a la méthode `new_page()` qu'on utilise.
    """
    browser: Any  # playwright.async_api.BrowserContext (persistent)
    camoufox_cm: Any  # AsyncCamoufox context manager, gardé pour __aexit__
    user_data_dir: str
    fetches_done: int = 0
    busy: bool = False


@dataclass
class BrowserPool:
    """Pool de browsers Camoufox gérés par semaphore."""
    size: int
    slots: list[BrowserSlot] = field(default_factory=list)
    semaphore: asyncio.Semaphore = field(default=None)  # type: ignore
    total_fetches: int = 0
    spawn_lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    @classmethod
    async def create(cls, size: int) -> "BrowserPool":
        pool = cls(size=size, semaphore=asyncio.Semaphore(size))
        # Spawn séquentiel pour ne pas saturer la RAM au boot (chaque
        # Camoufox = ~600 MB en cold start).
        for i in range(size):
            slot = await pool._spawn_slot(i)
            pool.slots.append(slot)
        LOG.info("Pool ready with %d slots", size)
        return pool

    async def _spawn_slot(self, idx: int) -> BrowserSlot:
        """Spawn un nouveau browser Camoufox avec user_data_dir frais.

        Args Camoufox importants :
        - humanize=True : ajoute des delays/mouvements humains aux clicks
          (utile pour DataDome behavior analysis)
        - geoip=True : tente d'adapter timezone/locale/geo en fonction de l'IP
        - locale=["fr-FR"] : force la langue côté navigator
        - os=["linux", "windows"] : randomise la signature OS (Camoufox
          gère le firmware fingerprinting)
        - headless=True : pas d'X server requis (Oracle Cloud Ubuntu sans GUI)
        """
        user_data_dir = tempfile.mkdtemp(prefix=f"camoufox-slot-{idx}-")

        # Proxy optionnel (mêmes env vars que Zendriver pour cohérence)
        proxy = None
        proxy_url = os.environ.get("WORKER_PROXY_URL", "").strip()
        if proxy_url:
            proxy = {"server": proxy_url}
            user = os.environ.get("WORKER_PROXY_USERNAME", "").strip()
            pwd = os.environ.get("WORKER_PROXY_PASSWORD", "").strip()
            if user and pwd:
                proxy["username"] = user
                proxy["password"] = pwd
            LOG.info("Proxy configured (auth=%s)", bool(user))

        try:
            camoufox_cm = AsyncCamoufox(
                headless=True,
                humanize=True,
                geoip=True,
                locale=["fr-FR"],
                os=["linux", "windows"],
                proxy=proxy,
                # Persistent context via user_data_dir → cookies/cache gardés
                # entre fetches pour ressembler à un user normal qui revient.
                persistent_context=True,
                user_data_dir=user_data_dir,
                # Pas de `block_images=True` : Camoufox warning verbose au
                # boot (`i_know_what_im_doing`) ET ça duplique le pref
                # `permissions.default.image` qu'on set explicitement ci-dessous.
                # Pour désactiver les images, le firefox_user_prefs suffit.
                # Si DataDome inspecte les image loads (signal anti-bot),
                # passer `permissions.default.image` à `1` (= load images).
                firefox_user_prefs={
                    "permissions.default.image": 2,  # 2 = block images
                    "media.peerconnection.enabled": False,  # disable WebRTC leaks
                    "dom.webdriver.enabled": False,
                },
            )
            browser = await camoufox_cm.__aenter__()
        except Exception:
            LOG.exception("Failed to spawn Camoufox slot %d", idx)
            shutil.rmtree(user_data_dir, ignore_errors=True)
            raise

        LOG.debug(
            "Spawned slot %d (user_data_dir=%s, proxy=%s)",
            idx, user_data_dir, bool(proxy),
        )
        return BrowserSlot(
            browser=browser,
            camoufox_cm=camoufox_cm,
            user_data_dir=user_data_dir,
        )

    async def _rotate_slot(self, slot_idx: int) -> None:
        """Recycle un slot : ferme + supprime user_data_dir + respawn."""
        old = self.slots[slot_idx]
        LOG.info(
            "Rotating slot %d after %d fetches (cleaning %s)",
            slot_idx, old.fetches_done, old.user_data_dir,
        )
        try:
            await old.camoufox_cm.__aexit__(None, None, None)
        except Exception as e:
            LOG.warning("Error stopping camoufox: %s", e)
        try:
            shutil.rmtree(old.user_data_dir, ignore_errors=True)
        except Exception as e:
            LOG.warning("Error rmtree user_data_dir: %s", e)
        # Spawn nouveau slot dans le lock pour éviter race
        async with self.spawn_lock:
            self.slots[slot_idx] = await self._spawn_slot(slot_idx)

    @asynccontextmanager
    async def acquire(self):
        """Réserve un slot du pool, le libère à la sortie."""
        async with self.semaphore:
            slot_idx = None
            for i, s in enumerate(self.slots):
                if not s.busy:
                    s.busy = True
                    slot_idx = i
                    break
            if slot_idx is None:
                raise RuntimeError("No free slot despite semaphore acquired")

            try:
                yield self.slots[slot_idx].browser
            finally:
                slot = self.slots[slot_idx]
                slot.busy = False
                slot.fetches_done += 1
                self.total_fetches += 1
                if slot.fetches_done >= ROTATION_AFTER_FETCHES:
                    try:
                        await self._rotate_slot(slot_idx)
                    except Exception as e:
                        LOG.exception("Rotation failed for slot %d: %s", slot_idx, e)

    def stats(self) -> dict:
        return {
            "size": self.size,
            "in_flight": sum(1 for s in self.slots if s.busy),
            "total_fetches": self.total_fetches,
            "fetches_per_slot": [s.fetches_done for s in self.slots],
        }

    async def close(self) -> None:
        """Ferme tous les browsers et nettoie les profils."""
        for slot in self.slots:
            try:
                await slot.camoufox_cm.__aexit__(None, None, None)
            except Exception as e:
                LOG.warning("Error stopping browser at shutdown: %s", e)
            try:
                shutil.rmtree(slot.user_data_dir, ignore_errors=True)
            except Exception:
                pass
        LOG.info("Pool closed")
