"""
Tests unitaires camoufox-worker. Pas de Camoufox spawn réel (mock).
"""

import os

os.environ.setdefault("FETCHER_TOKEN", "test-token-1234567890abcdef")
os.environ.setdefault("ALLOW_HOSTS", "leboncoin.fr,seloger.com")

import pytest
from fastapi.testclient import TestClient

# Import après set env
from worker import app, is_soft_challenge, client_ip  # noqa: E402
from ssrf import SSRFError, assert_url_allowed  # noqa: E402


@pytest.fixture
def client():
    return TestClient(app)


def test_health_requires_bearer(client):
    r = client.get("/health")
    assert r.status_code == 401


def test_health_wrong_bearer(client):
    r = client.get("/health", headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 401


def test_fetch_requires_bearer(client):
    r = client.post("/fetch", json={"url": "https://leboncoin.fr/x"})
    assert r.status_code == 401


def test_fetch_bad_url_ssrf(client):
    """URL non https rejetée avant même le pool."""
    r = client.post(
        "/fetch",
        json={"url": "http://leboncoin.fr/x"},
        headers={"Authorization": "Bearer test-token-1234567890abcdef"},
    )
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "INVALID_URL"


def test_fetch_host_not_allowlisted(client):
    r = client.post(
        "/fetch",
        json={"url": "https://google.com/"},
        headers={"Authorization": "Bearer test-token-1234567890abcdef"},
    )
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "BLOCKED_HOST"


def test_fetch_private_ip_blocked(client):
    """SSRF guard : host qui résout vers une IP privée rejetée."""
    # localhost résout 127.0.0.1 → BLOCKED_HOST puisque dans BLOCKED_HOSTNAMES
    r = client.post(
        "/fetch",
        json={"url": "https://localhost/x"},
        headers={"Authorization": "Bearer test-token-1234567890abcdef"},
    )
    assert r.status_code == 400


def test_ssrf_assert_url_allowed_ok():
    """URL valide passée."""
    host = assert_url_allowed("https://www.leboncoin.fr/ad/x", {"leboncoin.fr"})
    assert host == "www.leboncoin.fr"


def test_ssrf_assert_url_allowed_subdomain():
    host = assert_url_allowed("https://api.leboncoin.fr/", {"leboncoin.fr"})
    assert host == "api.leboncoin.fr"


def test_ssrf_spoofing_rejected():
    """fake-leboncoin.fr ne match PAS leboncoin.fr."""
    with pytest.raises(SSRFError) as exc:
        assert_url_allowed("https://fake-leboncoin.fr/", {"leboncoin.fr"})
    assert exc.value.code == "BLOCKED_HOST"


def test_ssrf_metadata_endpoint():
    with pytest.raises(SSRFError) as exc:
        assert_url_allowed(
            "https://169.254.169.254/latest/meta-data/",
            {"169.254.169.254"},
        )
    assert exc.value.code == "BLOCKED_HOST"


def test_is_soft_challenge_short_with_datadome():
    html = "<html><body>captcha-delivery.com</body></html>"
    assert is_soft_challenge(html) is True


def test_is_soft_challenge_long_html_passes():
    """HTML long = considéré comme contenu réel même si contient patterns."""
    html = "x" * 30000 + "captcha-delivery.com"
    assert is_soft_challenge(html) is False


def test_is_soft_challenge_short_no_pattern():
    html = "<html><body>normal short page</body></html>"
    assert is_soft_challenge(html) is False
