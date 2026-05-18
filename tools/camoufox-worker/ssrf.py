"""
SSRF guard — port Python de nestmatch/lib/import/fetcher.ts.

Identique à tools/zendriver-worker/ssrf.py. Dupliqué ici car les workers
sont des projets autonomes déployés sur des VPS différents (Camoufox sur
Oracle Cloud, Zendriver sur OVH).

Bloque les URLs qui résolvent vers des IPs privées ou des hosts internes
(localhost, metadata cloud, .local TLDs). Évite que le worker serve de
proxy SSRF même si un attaquant connaît le bearer token.
"""

import ipaddress
import socket
from urllib.parse import urlparse

BLOCKED_HOSTNAMES = {
    "localhost",
    "metadata.google.internal",
    "169.254.169.254",  # AWS/GCP/Azure/Oracle metadata
    "fd00:ec2::254",     # AWS IPv6 metadata
}

BLOCKED_TLDS = {
    ".local",
    ".internal",
    ".localhost",
}


def is_private_ip(ip_str: str) -> bool:
    """True si l'IP est privée, loopback, link-local, multicast ou metadata."""
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


class SSRFError(Exception):
    """Levée quand un host est interdit pour SSRF."""
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def assert_safe_host(host: str) -> None:
    """Vérifie qu'un hostname est safe (pas IP privée, pas TLD interdit).

    Raises:
        SSRFError: si l'host doit être bloqué.
    """
    if not host:
        raise SSRFError("BLOCKED_HOST", "Host vide")

    host_lower = host.lower()

    if host_lower in BLOCKED_HOSTNAMES:
        raise SSRFError("BLOCKED_HOST", f"Host interdit : {host}")

    for tld in BLOCKED_TLDS:
        if host_lower.endswith(tld):
            raise SSRFError("BLOCKED_TLD", f"TLD interdit : {host}")

    try:
        ip = ipaddress.ip_address(host_lower)
        if is_private_ip(str(ip)):
            raise SSRFError("PRIVATE_IP", f"IP privée : {host}")
        return
    except ValueError:
        pass

    try:
        results = socket.getaddrinfo(host_lower, None)
    except socket.gaierror:
        raise SSRFError("DNS_FAILED", f"Résolution DNS impossible : {host}")

    for family, _, _, _, sockaddr in results:
        ip_str = sockaddr[0]
        if is_private_ip(ip_str):
            raise SSRFError(
                "PRIVATE_IP",
                f"Host {host} résout vers IP privée {ip_str}",
            )


def assert_url_allowed(url: str, allow_hosts: set[str]) -> str:
    """Vérifie qu'une URL est valide, HTTPS, host autorisé et safe SSRF.

    Args:
        url: URL complète à valider.
        allow_hosts: ensemble d'hosts autorisés (sans www., sans port).

    Returns:
        Le hostname normalisé (sans www.).

    Raises:
        SSRFError: si l'URL n'est pas acceptable.
    """
    try:
        parsed = urlparse(url)
    except Exception:
        raise SSRFError("INVALID_URL", "URL malformée")

    if parsed.scheme != "https":
        raise SSRFError("INVALID_URL", "HTTPS obligatoire (worker prod-only)")

    if not parsed.hostname:
        raise SSRFError("INVALID_URL", "Hostname manquant")

    host = parsed.hostname.lower()
    bare = host[4:] if host.startswith("www.") else host

    if not any(bare == a or bare.endswith("." + a) for a in allow_hosts):
        raise SSRFError("BLOCKED_HOST", f"Host {host} non autorisé (allowlist)")

    assert_safe_host(host)
    return host
