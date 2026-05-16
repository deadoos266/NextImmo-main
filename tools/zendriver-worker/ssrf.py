"""
SSRF guard — port Python de nestmatch/lib/import/fetcher.ts.

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
    "169.254.169.254",  # AWS/GCP/Azure metadata
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

    Args:
        host: hostname extrait d'une URL (sans port, sans path).

    Raises:
        SSRFError: si l'host doit être bloqué.
    """
    if not host:
        raise SSRFError("BLOCKED_HOST", "Host vide")

    host_lower = host.lower()

    # 1. Hostname littéralement interdit
    if host_lower in BLOCKED_HOSTNAMES:
        raise SSRFError("BLOCKED_HOST", f"Host interdit : {host}")

    # 2. TLD interdit
    for tld in BLOCKED_TLDS:
        if host_lower.endswith(tld):
            raise SSRFError("BLOCKED_TLD", f"TLD interdit : {host}")

    # 3. Si c'est déjà une IP, check privée
    try:
        ip = ipaddress.ip_address(host_lower)
        if is_private_ip(str(ip)):
            raise SSRFError("PRIVATE_IP", f"IP privée : {host}")
        return
    except ValueError:
        pass  # Pas une IP, c'est un hostname, on continue

    # 4. Résolution DNS : check qu'aucune IP retournée n'est privée
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
    bare = host.lstrip("www.").lstrip(".")
    if bare.startswith("www."):
        bare = bare[4:]

    # Check allowlist
    if not any(bare == a or bare.endswith("." + a) for a in allow_hosts):
        raise SSRFError("BLOCKED_HOST", f"Host {host} non autorisé (allowlist)")

    # Check SSRF (private IPs, internal TLDs)
    assert_safe_host(host)

    return host
