"""
Pool de browsers Zendriver tenus warm.

Zendriver (fork de nodriver) lance un Chromium CDP avec patches stealth.
Cold-start ~6-9s, donc on garde un pool ouvert.

Rotation du profil utilisateur tous les N fetches pour éviter que DataDome
finger-print l'instance par session persistante.
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
        """Spawn un nouveau browser Zendriver avec user_data_dir frais."""
        user_data_dir = tempfile.mkdtemp(prefix=f"zd-slot-{idx}-")
        browser = await zd.start(
            headless=True,
            user_data_dir=user_data_dir,
            browser_args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--lang=fr-FR,fr",
                "--accept-lang=fr-FR,fr;q=0.9,en;q=0.8",
            ],
        )
        LOG.debug("Spawned slot %d (user_data_dir=%s)", idx, user_data_dir)
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
