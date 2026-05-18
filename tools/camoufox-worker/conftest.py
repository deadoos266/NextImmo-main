"""
Pytest conftest — mock Camoufox pour permettre les tests sur des
machines sans `camoufox[geoip]` installé (PC dev de Paul sans browser pool).

Les tests fonctionnels (auth, SSRF, rate-limit, soft-challenge) n'ont
PAS besoin d'un vrai browser. On mock juste les imports.

Les tests E2E (fetch live LBC/SeLoger) doivent tourner sur la VM Oracle
avec Camoufox installé. Ces tests sont marqués `@pytest.mark.live` et
skippés par défaut.
"""

import sys
from unittest.mock import MagicMock


# Mock camoufox.async_api avant que worker.py / pool.py n'importent
class FakeAsyncCamoufox:
    def __init__(self, *args, **kwargs):
        self._kwargs = kwargs

    async def __aenter__(self):
        # Retourne un fake BrowserContext avec les méthodes utilisées
        ctx = MagicMock()

        async def fake_new_page():
            page = MagicMock()
            async def fake_goto(url, **kw):
                resp = MagicMock()
                resp.status = 200
                return resp
            page.goto = fake_goto
            page.content = lambda: "<html>mock</html>"
            page.url = "https://mock"
            page.close = lambda: None
            page.evaluate = lambda *a, **kw: 60000
            return page

        ctx.new_page = fake_new_page
        return ctx

    async def __aexit__(self, *args):
        pass


_mock = MagicMock()
_mock.AsyncCamoufox = FakeAsyncCamoufox
sys.modules.setdefault("camoufox", MagicMock())
sys.modules.setdefault("camoufox.async_api", _mock)


# Mock BrowserPool.create pour éviter de spawn 3 browsers réels au
# démarrage du lifespan FastAPI.
import pytest

@pytest.fixture(autouse=True)
def _patch_pool(monkeypatch):
    """Skip le browser spawn pendant tous les tests."""
    from pool import BrowserPool

    async def fake_create(size: int):
        pool = BrowserPool(size=size)
        import asyncio
        pool.semaphore = asyncio.Semaphore(size)
        return pool

    monkeypatch.setattr(BrowserPool, "create", classmethod(lambda cls, size: fake_create(size)))
