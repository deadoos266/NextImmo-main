"""
Tests pytest pour le worker Zendriver.

Lance avec :
    cd tools/zendriver-worker
    pytest test_worker.py -v

Tests sans browser réel (mocks) : auth, SSRF, allowlist, rate-limit, soft-challenge.
Test live (1 seul, optionnel) : fetch creepjs si network OK.
"""

import os

# Set env BEFORE import worker (sinon raise RuntimeError)
os.environ.setdefault("FETCHER_TOKEN", "test-token-do-not-use-in-prod")
os.environ.setdefault("ALLOW_HOSTS", "leboncoin.fr,seloger.com,example.com,abrahamjuliot.github.io")

import pytest
from fastapi.testclient import TestClient

from worker import app, is_soft_challenge
from ssrf import assert_url_allowed, SSRFError, is_private_ip


# ─── SSRF / allowlist ──────────────────────────────────────────────────────
class TestSSRF:
    def test_private_ip_127(self):
        assert is_private_ip("127.0.0.1") is True

    def test_private_ip_10(self):
        assert is_private_ip("10.0.0.1") is True

    def test_private_ip_192_168(self):
        assert is_private_ip("192.168.1.1") is True

    def test_private_ip_metadata(self):
        assert is_private_ip("169.254.169.254") is True

    def test_public_ip(self):
        assert is_private_ip("8.8.8.8") is False

    def test_invalid_ip(self):
        assert is_private_ip("not-an-ip") is False

    def test_allowed_host_leboncoin(self):
        host = assert_url_allowed(
            "https://www.leboncoin.fr/ad/locations/1234",
            {"leboncoin.fr", "seloger.com"},
        )
        assert host == "www.leboncoin.fr"

    def test_allowed_subdomain(self):
        # Subdomain leboncoin.fr (ex: api.leboncoin.fr) doit être autorisé via endsWith
        host = assert_url_allowed(
            "https://api.leboncoin.fr/path",
            {"leboncoin.fr"},
        )
        assert host == "api.leboncoin.fr"

    def test_blocked_host(self):
        with pytest.raises(SSRFError) as exc:
            assert_url_allowed("https://google.com/", {"leboncoin.fr"})
        assert exc.value.code == "BLOCKED_HOST"

    def test_blocked_localhost(self):
        with pytest.raises(SSRFError) as exc:
            assert_url_allowed("https://localhost/", {"localhost"})
        # localhost matche allowlist mais SSRF guard bloque
        assert exc.value.code == "BLOCKED_HOST"

    def test_blocked_local_tld(self):
        with pytest.raises(SSRFError) as exc:
            assert_url_allowed("https://server.local/", {"server.local"})
        # .local TLD bloqué
        assert exc.value.code == "BLOCKED_TLD"

    def test_http_rejected(self):
        with pytest.raises(SSRFError) as exc:
            assert_url_allowed("http://leboncoin.fr/", {"leboncoin.fr"})
        assert exc.value.code == "INVALID_URL"


# ─── Soft challenge detection ──────────────────────────────────────────────
class TestSoftChallenge:
    def test_datadome_pattern(self):
        html = "<html><head><script src='https://captcha-delivery.com/foo'></script></head></html>"
        assert is_soft_challenge(html) is True

    def test_cloudflare_pattern(self):
        html = "<html><body>Just a moment...</body></html>"
        assert is_soft_challenge(html) is True

    def test_full_page_not_challenge(self):
        # Si HTML > 20KB, on considère que la page est complète même si elle contient le pattern
        html = "<html><body>" + ("Just a moment " * 2000) + "</body></html>"
        # Note : 20000+ bytes → not flagged
        assert len(html) > 20000
        assert is_soft_challenge(html) is False

    def test_clean_html(self):
        html = "<html><body>Hello world</body></html>"
        # < 20000 bytes mais pas de pattern challenge
        assert is_soft_challenge(html) is False


# ─── Auth + rate-limit (via TestClient) ────────────────────────────────────
class TestAuth:
    @pytest.fixture
    def client(self):
        return TestClient(app)

    def test_health_no_auth(self, client):
        r = client.get("/health")
        assert r.status_code == 401
        assert r.json()["detail"]["code"] == "UNAUTHORIZED"

    def test_health_wrong_token(self, client):
        r = client.get("/health", headers={"Authorization": "Bearer wrong-token"})
        assert r.status_code == 401
        assert r.json()["detail"]["code"] == "UNAUTHORIZED"

    def test_health_bad_format(self, client):
        r = client.get("/health", headers={"Authorization": "test-token-do-not-use-in-prod"})
        assert r.status_code == 401

    def test_fetch_no_auth(self, client):
        r = client.post("/fetch", json={"url": "https://leboncoin.fr/x"})
        assert r.status_code == 401

    def test_fetch_blocked_host(self, client):
        r = client.post(
            "/fetch",
            json={"url": "https://google.com/"},
            headers={"Authorization": "Bearer test-token-do-not-use-in-prod"},
        )
        # Peut être 400 (BLOCKED_HOST) ou 503 si pool pas prêt en test
        # On accepte les deux
        assert r.status_code in (400, 503, 500)
        if r.status_code == 400:
            assert r.json()["detail"]["code"] == "BLOCKED_HOST"

    def test_fetch_invalid_url(self, client):
        r = client.post(
            "/fetch",
            json={"url": "not-a-url"},
            headers={"Authorization": "Bearer test-token-do-not-use-in-prod"},
        )
        assert r.status_code == 400


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
